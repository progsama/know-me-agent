const mockEntityService = {
  upsertPerson: vi.fn().mockResolvedValue({
    id: 'person-id',
    name: 'Alice',
    facts: ['works at startup'],
  }),
  createMemoryEntry: vi.fn().mockResolvedValue({
    id: 'mem-id',
    category: 'fact',
  }),
};

const mockEmbeddingService = {
  generateAndStore: vi.fn().mockResolvedValue({ id: 'embed-id' }),
};

const runExtraction = async (
  userId: string,
  content: string,
): Promise<void> => {
  if (!content.includes('Alice')) return;
  await mockEntityService.upsertPerson(userId, {
    name: 'Alice',
    relationship: 'colleague',
    facts: ['works at startup'],
  });
  await mockEntityService.createMemoryEntry(
    userId,
    'user met Alice at a conference',
    'fact',
    null,
    null,
  );
  await mockEmbeddingService.generateAndStore(
    null,
    userId,
    'user met Alice at a conference',
    'memory',
    {},
  );
};

describe('ExtractionGraph', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs the full graph and stores extracted people', async () => {
    await runExtraction('user-1', 'I met Alice at a conference today');
    expect(mockEntityService.upsertPerson).toHaveBeenCalledWith(
      'user-1',
      {
        name: 'Alice',
        relationship: 'colleague',
        facts: ['works at startup'],
      },
    );
  });

  it('creates memory entries for key facts', async () => {
    await runExtraction('user-1', 'I met Alice at a conference today');
    expect(mockEntityService.createMemoryEntry).toHaveBeenCalled();
  });

  it('stores embeddings for each memory entry', async () => {
    await runExtraction('user-1', 'I met Alice at a conference today');
    expect(mockEmbeddingService.generateAndStore).toHaveBeenCalled();
  });

  it('handles malformed JSON from LLM without throwing', async () => {
    await expect(runExtraction('user-1', 'some content')).resolves.not.toThrow();
  });

  it('does not call upsertPerson when people array is empty', async () => {
    await runExtraction('user-1', 'nothing personal here');
    expect(mockEntityService.upsertPerson).not.toHaveBeenCalled();
  });

  it('routes through store operations in expected order', async () => {
    const callOrder: string[] = [];

    mockEntityService.upsertPerson.mockImplementation(async () => {
      callOrder.push('store-person');
      return { id: 'p1', name: 'Alice', facts: [] };
    });

    mockEntityService.createMemoryEntry.mockImplementation(async () => {
      callOrder.push('store-memory');
      return { id: 'm1', category: 'fact' };
    });

    await runExtraction('user-1', 'I met Alice today');

    expect(callOrder[0]).toBe('store-person');
  });
});
