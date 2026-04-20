import { SemanticSearchService } from '../../../dist/modules/memory/semantic-search.service.js';
import { EmbeddingService } from '../../../dist/modules/memory/embedding.service.js';
import { Pool } from 'pg';

const FIXTURE_VECTOR = Array.from({ length: 1536 }, (_, i) => i * 0.0001);

const mockEmbeddingService = {
  generateEmbedding: vi.fn().mockResolvedValue(FIXTURE_VECTOR),
};

const mockPool = { query: vi.fn() };

const makeRow = (content: string, similarity: number, source = 'message') => ({
  id: `id-${content}`,
  content,
  similarity,
  source,
  metadata: {},
});

describe('SemanticSearchService', () => {
  let service: SemanticSearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SemanticSearchService(
      mockPool as unknown as Pool,
      mockEmbeddingService as unknown as EmbeddingService,
    );
  });

  it('returns top-k results ordered by similarity', async () => {
    mockPool.query.mockResolvedValue({
      rows: [
        makeRow('most relevant', 0.95),
        makeRow('somewhat relevant', 0.75),
        makeRow('less relevant', 0.55),
      ],
    });

    const results = await service.search('query text', 'user-1', 3);
    expect(results).toHaveLength(3);
    expect(results[0].similarity).toBe(0.95);
    expect(results[2].similarity).toBe(0.55);
  });

  it('returns empty array when no results found', async () => {
    mockPool.query.mockResolvedValue({ rows: [] });
    const results = await service.search('query text', 'user-1', 5);
    expect(results).toHaveLength(0);
  });

  it('filters by source when source parameter provided', async () => {
    mockPool.query.mockResolvedValue({
      rows: [makeRow('document chunk', 0.88, 'document')],
    });

    const results = await service.search('query', 'user-1', 5, 'document');
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe('document');
    const sql = (mockPool.query.mock.calls[0] as unknown[])[0] as string;
    expect(sql).toContain('source');
  });

  it('returns empty array when embedding generation fails', async () => {
    mockEmbeddingService.generateEmbedding.mockResolvedValueOnce(null);
    const results = await service.search('query text', 'user-1', 5);
    expect(results).toHaveLength(0);
  });

  it('respects top-k limit parameter binding', async () => {
    mockPool.query.mockResolvedValue({
      rows: [makeRow('result 1', 0.99), makeRow('result 2', 0.88)],
    });

    const results = await service.search('query', 'user-1', 2);
    expect(results.length).toBeLessThanOrEqual(2);
    const params = (mockPool.query.mock.calls[0] as unknown[])[1] as unknown[];
    expect(params[params.length - 1]).toBe(2);
  });
});
