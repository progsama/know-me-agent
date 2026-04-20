import { DocumentProcessorService } from '../../../dist/modules/documents/document-processor.service.js';
import { EmbeddingService } from '../../../dist/modules/memory/embedding.service.js';
import { ExtractionGraph } from '../../../dist/modules/extraction/extraction.graph.js';
import { EntityService } from '../../../dist/modules/entities/entity.service.js';

const FIXTURE_VECTOR = Array.from({ length: 1536 }, (_, i) => i * 0.0001);

const mockEmbeddingService = {
  generateAndStore: vi.fn().mockResolvedValue({ id: 'embed-id' }),
  generateEmbedding: vi.fn().mockResolvedValue(FIXTURE_VECTOR),
};

const mockExtractionGraph = {
  run: vi.fn().mockResolvedValue(undefined),
};

const JOURNAL_PEOPLE = [
  { id: 'p1', name: 'Sophie', relationship: 'partner', facts: ['studies computational linguistics', 'defended thesis in December'], user_id: 'user-1', first_mentioned_at: '', last_mentioned_at: '', created_at: '', updated_at: '' },
  { id: 'p2', name: 'Marcus', relationship: 'colleague', facts: ['shot down architecture proposal', 'promoted user to senior engineer'], user_id: 'user-1', first_mentioned_at: '', last_mentioned_at: '', created_at: '', updated_at: '' },
  { id: 'p3', name: 'Jake', relationship: 'roommate', facts: ['founded ResumeAI startup', 'moved out in March'], user_id: 'user-1', first_mentioned_at: '', last_mentioned_at: '', created_at: '', updated_at: '' },
  { id: 'p4', name: 'Lily', relationship: 'sister', facts: ['designer', 'lived in Vancouver', 'moving back to Toronto'], user_id: 'user-1', first_mentioned_at: '', last_mentioned_at: '', created_at: '', updated_at: '' },
  { id: 'p5', name: 'Ethan', relationship: 'brother', facts: ['doing residency in emergency medicine', 'based in Montreal'], user_id: 'user-1', first_mentioned_at: '', last_mentioned_at: '', created_at: '', updated_at: '' },
  { id: 'p6', name: 'Dad', relationship: 'father', facts: ['blood pressure issues', 'seeing cardiologist', 'improving with medication'], user_id: 'user-1', first_mentioned_at: '', last_mentioned_at: '', created_at: '', updated_at: '' },
  { id: 'p7', name: 'Mom', relationship: 'mother', facts: ['bonded with Sophie over crime documentaries'], user_id: 'user-1', first_mentioned_at: '', last_mentioned_at: '', created_at: '', updated_at: '' },
  { id: 'p8', name: 'Darren', relationship: 'new roommate', facts: ['moved in after Jake left'], user_id: 'user-1', first_mentioned_at: '', last_mentioned_at: '', created_at: '', updated_at: '' },
];

const mockEntityService = {
  getAllPeople: vi.fn().mockResolvedValue(JOURNAL_PEOPLE),
  upsertPerson: vi.fn().mockImplementation(async (_userId: string, person: { name: string }) => ({
    id: `person-${person.name}`,
    user_id: 'user-1',
    name: person.name,
    relationship: null,
    facts: [],
    first_mentioned_at: '',
    last_mentioned_at: '',
    created_at: '',
    updated_at: '',
  })),
  createMemoryEntry: vi.fn().mockResolvedValue({ id: 'mem-id', category: 'fact' }),
};

const LARGE_DOCUMENT = Array.from({ length: 50 }, (_, i) =>
  `Entry ${i + 1}: Today I spoke with Sophie about her thesis. Marcus approved the new architecture. Jake called from his startup. Lily is moving back from Vancouver. Ethan texted from Montreal. Dad had his cardiologist appointment. Mom made dinner. Darren moved some boxes in. The team celebrated the deployment.`,
).join('\n\n');

const LARGE_50KB_DOCUMENT = 'A'.repeat(49 * 1024) + ' end of document';

describe('DocumentProcessor Integration — upload pipeline', () => {
  let service: DocumentProcessorService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new DocumentProcessorService(
      mockEmbeddingService as unknown as EmbeddingService,
      mockExtractionGraph as unknown as ExtractionGraph,
      mockEntityService as unknown as EntityService,
    );
  });

  it('creates at least 1 chunk per ~500 characters of content', async () => {
    const chunks = service.chunkText(LARGE_DOCUMENT, 'journal.txt');
    const expectedMinChunks = Math.floor(LARGE_DOCUMENT.length / 500);
    expect(chunks.length).toBeGreaterThanOrEqual(expectedMinChunks);
  });

  it('generates an embedding for every chunk produced', async () => {
    await service.processDocument('user-1', 'conv-1', 'journal.txt', LARGE_DOCUMENT);
    const chunks = service.chunkText(LARGE_DOCUMENT, 'journal.txt');
    expect(mockEmbeddingService.generateAndStore).toHaveBeenCalledTimes(chunks.length);
  });

  it('runs extraction on every chunk', async () => {
    await service.processDocument('user-1', 'conv-1', 'journal.txt', LARGE_DOCUMENT);
    const chunks = service.chunkText(LARGE_DOCUMENT, 'journal.txt');
    expect(mockExtractionGraph.run).toHaveBeenCalledTimes(chunks.length);
  });

  it('each chunk embedding is tagged with source document', async () => {
    await service.processDocument('user-1', 'conv-1', 'journal.txt', LARGE_DOCUMENT);
    const calls = mockEmbeddingService.generateAndStore.mock.calls as unknown[][];
    const allDocument = calls.every((call) => call[3] === 'document');
    expect(allDocument).toBe(true);
  });

  it('processes a ~50KB document without errors', async () => {
    await expect(
      service.processDocument('user-1', 'conv-1', 'large.txt', LARGE_50KB_DOCUMENT),
    ).resolves.not.toThrow();
  });

  it('returns correct chunk count in result for large document', async () => {
    const result = await service.processDocument(
      'user-1',
      'conv-1',
      'large.txt',
      LARGE_50KB_DOCUMENT,
    );
    expect(result.totalChunks).toBeGreaterThan(0);
    expect(result.embeddingsStored).toBe(result.totalChunks);
  });

  it('recalls all 8 named people from journal after processing', async () => {
    await service.processDocument('user-1', 'conv-1', 'journal.txt', LARGE_DOCUMENT);

    const people = await mockEntityService.getAllPeople('user-1');
    const names = people.map((p) => p.name);

    expect(names).toContain('Sophie');
    expect(names).toContain('Marcus');
    expect(names).toContain('Jake');
    expect(names).toContain('Lily');
    expect(names).toContain('Ethan');
    expect(names).toContain('Dad');
    expect(names).toContain('Mom');
    expect(names).toContain('Darren');
    expect(names).toHaveLength(8);
  });

  it('each person has at least one fact stored', async () => {
    const people = await mockEntityService.getAllPeople('user-1');
    people.forEach((person) => {
      expect(person.facts.length).toBeGreaterThan(0);
    });
  });

  it('can recall specific testable facts per person', async () => {
    const people = await mockEntityService.getAllPeople('user-1');

    const sophie = people.find((p) => p.name === 'Sophie');
    expect(sophie?.facts.some((f) => f.includes('thesis'))).toBe(true);

    const marcus = people.find((p) => p.name === 'Marcus');
    expect(marcus?.facts.some((f) => f.includes('senior engineer'))).toBe(true);

    const jake = people.find((p) => p.name === 'Jake');
    expect(jake?.facts.some((f) => f.includes('startup') || f.includes('ResumeAI'))).toBe(true);

    const lily = people.find((p) => p.name === 'Lily');
    expect(lily?.facts.some((f) => f.includes('Vancouver') || f.includes('designer'))).toBe(true);

    const dad = people.find((p) => p.name === 'Dad');
    expect(dad?.facts.some((f) => f.includes('blood pressure') || f.includes('cardiologist'))).toBe(true);
  });

  it('chunk extraction message ids follow naming convention', async () => {
    await service.processDocument('user-1', 'conv-1', 'journal.txt', LARGE_DOCUMENT);
    const calls = mockExtractionGraph.run.mock.calls as unknown[][];
    calls.forEach((call, index) => {
      const messageId = call[0] as string;
      expect(messageId).toBe(`doc-journal.txt-chunk-${index}`);
    });
  });

  it('gracefully continues processing when one chunk embedding fails', async () => {
    mockEmbeddingService.generateAndStore
      .mockResolvedValueOnce({ id: 'embed-0' })
      .mockRejectedValueOnce(new Error('API timeout'))
      .mockResolvedValue({ id: 'embed-n' });

    await expect(
      service.processDocument('user-1', 'conv-1', 'journal.txt', LARGE_DOCUMENT),
    ).resolves.not.toThrow();
  });
});
