import { ContextAssemblyService } from '../../../dist/modules/memory/context-assembly.service.js';
import { SemanticSearchService } from '../../../dist/modules/memory/semantic-search.service.js';
import { EntityService } from '../../../dist/modules/entities/entity.service.js';

const mockSemanticSearch = { search: vi.fn() };
const mockEntityService = { getAllPeople: vi.fn() };

const makeMemory = (content: string, similarity: number) => ({
  id: `id-${content}`,
  content,
  similarity,
  source: 'message' as const,
  metadata: {},
});

const makePerson = (name: string, facts: string[]) => ({
  id: 'person-id',
  user_id: 'user-1',
  name,
  relationship: 'friend',
  facts,
  first_mentioned_at: new Date().toISOString(),
  last_mentioned_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

describe('ContextAssemblyService', () => {
  let service: ContextAssemblyService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ContextAssemblyService(
      mockSemanticSearch as unknown as SemanticSearchService,
      mockEntityService as unknown as EntityService,
    );
  });

  it('assembles context containing memory and people sections', async () => {
    mockSemanticSearch.search.mockResolvedValue([
      makeMemory('user likes jazz music', 0.92),
      makeMemory('user works at a startup', 0.85),
    ]);
    mockEntityService.getAllPeople.mockResolvedValue([
      makePerson('Sophie', ['partner', 'studies linguistics']),
    ]);

    const result = await service.assembleContext('user-1', 'tell me about Sophie and music');
    expect(result.memoryContext).toContain('jazz music');
    expect(result.memoryContext).toContain('Sophie');
    expect(result.memoryContext.length).toBeGreaterThan(0);
  });

  it('returns empty context when no memories and no people', async () => {
    mockSemanticSearch.search.mockResolvedValue([]);
    mockEntityService.getAllPeople.mockResolvedValue([]);

    const result = await service.assembleContext('user-1', 'hello');
    expect(result.memoryContext).toBe('');
  });

  it('filters out low similarity memories below threshold', async () => {
    mockSemanticSearch.search.mockResolvedValue([
      makeMemory('relevant memory', 0.85),
      makeMemory('irrelevant noise', 0.15),
    ]);
    mockEntityService.getAllPeople.mockResolvedValue([]);

    const result = await service.assembleContext('user-1', 'query');
    expect(result.memoryContext).toContain('relevant memory');
    expect(result.memoryContext).not.toContain('irrelevant noise');
  });

  it('runs semantic search and getAllPeople during assembly', async () => {
    const order: string[] = [];

    mockSemanticSearch.search.mockImplementation(async () => {
      order.push('search');
      return [];
    });
    mockEntityService.getAllPeople.mockImplementation(async () => {
      order.push('people');
      return [];
    });

    await service.assembleContext('user-1', 'query');
    expect(order).toContain('search');
    expect(order).toContain('people');
    expect(order).toHaveLength(2);
  });

  it('includes person facts when mentioned people exist', async () => {
    mockSemanticSearch.search.mockResolvedValue([]);
    mockEntityService.getAllPeople.mockResolvedValue([
      makePerson('Marcus', ['colleague', 'promoted user to senior engineer']),
    ]);

    const result = await service.assembleContext('user-1', 'tell me about Marcus at work');
    expect(result.memoryContext).toContain('Marcus');
    expect(result.memoryContext).toContain('senior engineer');
  });
});
