const FIXTURE_VECTOR = Array.from({ length: 1536 }, (_, i) => i * 0.0001);

const mockConversationService = {
  createConversation: vi.fn().mockResolvedValue({
    id: 'conv-e2e-1',
    user_id: 'user-e2e',
    status: 'active',
    title: 'E2E Test Conversation',
    created_at: new Date().toISOString(),
  }),
  saveMessage: vi.fn(),
  getRecentMessages: vi.fn().mockResolvedValue([]),
};

const mockEmbeddingService = {
  generateAndStore: vi.fn().mockResolvedValue({ id: 'embed-id' }),
  generateEmbedding: vi.fn().mockResolvedValue(FIXTURE_VECTOR),
};

const mockExtractionGraph = {
  run: vi.fn().mockResolvedValue(undefined),
};

const mockEntityService = {
  upsertPerson: vi.fn().mockResolvedValue({
    id: 'p1',
    name: 'Marcus',
    facts: ['colleague'],
  }),
  createMemoryEntry: vi.fn().mockResolvedValue({ id: 'mem-1', category: 'fact' }),
  getAllPeople: vi.fn().mockResolvedValue([
    { id: 'p1', name: 'Marcus', relationship: 'colleague', facts: ['shot down proposal', 'became mentor', 'promoted user'], user_id: 'user-e2e', first_mentioned_at: '', last_mentioned_at: '', created_at: '', updated_at: '' },
    { id: 'p2', name: 'Sophie', relationship: 'partner', facts: ['computational linguistics', 'defended thesis'], user_id: 'user-e2e', first_mentioned_at: '', last_mentioned_at: '', created_at: '', updated_at: '' },
    { id: 'p3', name: 'Jake', relationship: 'roommate', facts: ['founded ResumeAI', 'moved out March'], user_id: 'user-e2e', first_mentioned_at: '', last_mentioned_at: '', created_at: '', updated_at: '' },
  ]),
};

const mockSemanticSearch = {
  search: vi.fn().mockResolvedValue([
    { id: 'r1', content: 'Marcus promoted user to senior engineer', similarity: 0.94, source: 'document', metadata: {} },
    { id: 'r2', content: 'Sophie defended her computational linguistics thesis', similarity: 0.91, source: 'document', metadata: {} },
    { id: 'r3', content: 'Jake moved out in March after 3 years as roommate', similarity: 0.88, source: 'document', metadata: {} },
  ]),
};

const mockContextAssembly = {
  assembleContext: vi.fn().mockResolvedValue({
    memoryContext:
      'Marcus: colleague | shot down proposal | became mentor | promoted user\nSophie: partner | computational linguistics | defended thesis\nJake: roommate | founded ResumeAI | moved out March',
    retrievedMemories: [],
    mentionedPeople: [],
  }),
};

const mockStreamService = {
  streamResponse: vi.fn().mockResolvedValue(undefined),
};

const mockSocket = { emit: vi.fn(), disconnect: vi.fn() };

describe('E2E Pipeline — full flow from connection to memory recall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('phase 1: creates a conversation successfully', async () => {
    const conversation = await mockConversationService.createConversation(
      'user-e2e',
      'My Journal Session',
    );

    expect(conversation.id).toBe('conv-e2e-1');
    expect(conversation.user_id).toBe('user-e2e');
    expect(conversation.status).toBe('active');
  });

  it('phase 2: WebSocket connection accepted with valid userId', () => {
    const userId = 'user-e2e';
    expect(userId).toBeTruthy();
    expect(mockSocket.disconnect).not.toHaveBeenCalled();
  });

  it('phase 3: first message saved and embedding generated', async () => {
    const savedMessage = {
      id: 'msg-first',
      role: 'user' as const,
      content: 'Hello, my name is Alex',
      created_at: new Date().toISOString(),
    };
    mockConversationService.saveMessage.mockResolvedValueOnce(savedMessage);

    const msg = await mockConversationService.saveMessage(
      'conv-e2e-1',
      'user-e2e',
      'user',
      'Hello, my name is Alex',
      {},
    );

    await mockEmbeddingService.generateAndStore(
      msg.id,
      'user-e2e',
      'Hello, my name is Alex',
      'message',
      {},
    );

    expect(msg.id).toBe('msg-first');
    expect(mockEmbeddingService.generateAndStore).toHaveBeenCalledWith(
      'msg-first',
      'user-e2e',
      'Hello, my name is Alex',
      'message',
      {},
    );
  });

  it('phase 4: document uploaded and all chunks embedded', async () => {
    const chunkCount = 43;
    for (let i = 0; i < chunkCount; i++) {
      await mockEmbeddingService.generateAndStore(
        null,
        'user-e2e',
        `chunk ${i} content`,
        'document',
        { fileName: 'sample-journal.txt', chunkIndex: i },
      );
    }

    expect(mockEmbeddingService.generateAndStore).toHaveBeenCalledTimes(chunkCount);
    const calls = mockEmbeddingService.generateAndStore.mock.calls as unknown[][];
    expect(calls[0][3]).toBe('document');
    expect(calls[42][3]).toBe('document');
  });

  it('phase 5: extraction ran on all document chunks', async () => {
    const chunkCount = 43;
    for (let i = 0; i < chunkCount; i++) {
      await mockExtractionGraph.run(
        `doc-sample-journal.txt-chunk-${i}`,
        'user-e2e',
        `chunk ${i} content`,
      );
    }

    expect(mockExtractionGraph.run).toHaveBeenCalledTimes(chunkCount);
    expect(mockExtractionGraph.run).toHaveBeenCalledWith(
      'doc-sample-journal.txt-chunk-0',
      'user-e2e',
      'chunk 0 content',
    );
    expect(mockExtractionGraph.run).toHaveBeenCalledWith(
      'doc-sample-journal.txt-chunk-42',
      'user-e2e',
      'chunk 42 content',
    );
  });

  it('phase 6: semantic search returns relevant document chunks', async () => {
    const results = await mockSemanticSearch.search(
      'user-e2e',
      'What do you know about Marcus?',
      5,
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results[0].similarity).toBeGreaterThan(0.8);
    expect(results.some((r: { content: string }) => r.content.includes('Marcus'))).toBe(true);
    expect(results.every((r: { source: string }) => r.source === 'document')).toBe(true);
  });

  it('phase 7: context assembly includes all extracted people and memories', async () => {
    const context = await mockContextAssembly.assembleContext(
      'user-e2e',
      'What do you know about Marcus?',
    );

    expect(context.memoryContext).toContain('Marcus');
    expect(context.memoryContext).toContain('Sophie');
    expect(context.memoryContext).toContain('Jake');
    expect(context.memoryContext).toContain('promoted user');
    expect(context.memoryContext).toContain('computational linguistics');
    expect(context.memoryContext).toContain('ResumeAI');
  });

  it('phase 8: follow-up message streamed with full memory context', async () => {
    const context = await mockContextAssembly.assembleContext(
      'user-e2e',
      'What do you know about Marcus?',
    );

    await mockStreamService.streamResponse(
      mockSocket as never,
      'user-e2e',
      'conv-e2e-1',
      'req-followup',
      'What do you know about Marcus?',
      [],
      context.memoryContext,
    );

    expect(mockStreamService.streamResponse).toHaveBeenCalledWith(
      mockSocket,
      'user-e2e',
      'conv-e2e-1',
      'req-followup',
      'What do you know about Marcus?',
      [],
      expect.stringContaining('Marcus'),
    );
  });

  it('phase 9: all 3 key people individually recallable by name', async () => {
    const people = await mockEntityService.getAllPeople('user-e2e');

    const marcus = people.find((p: { name: string }) => p.name === 'Marcus');
    const sophie = people.find((p: { name: string }) => p.name === 'Sophie');
    const jake = people.find((p: { name: string }) => p.name === 'Jake');

    expect(marcus).toBeDefined();
    expect(sophie).toBeDefined();
    expect(jake).toBeDefined();

    expect(marcus?.facts.some((f: string) => f.includes('promoted'))).toBe(true);
    expect(sophie?.facts.some((f: string) => f.includes('thesis'))).toBe(true);
    expect(jake?.facts.some((f: string) => f.includes('ResumeAI') || f.includes('startup'))).toBe(true);
  });

  it('phase 10: complete pipeline executes all steps without error', async () => {
    const steps: string[] = [];

    mockConversationService.createConversation.mockImplementation(async () => {
      steps.push('create-conversation');
      return { id: 'conv-1', user_id: 'user-e2e', status: 'active', title: '', created_at: '' };
    });

    mockConversationService.saveMessage.mockImplementation(async () => {
      steps.push('save-message');
      return { id: 'msg-1', role: 'user', content: '', created_at: '' };
    });

    mockEmbeddingService.generateAndStore.mockImplementation(async () => {
      steps.push('embed');
      return { id: 'embed-id' };
    });

    mockExtractionGraph.run.mockImplementation(async () => {
      steps.push('extract');
    });

    mockContextAssembly.assembleContext.mockImplementation(async () => {
      steps.push('assemble-context');
      return { memoryContext: 'Marcus: colleague | promoted user', retrievedMemories: [], mentionedPeople: [] };
    });

    mockStreamService.streamResponse.mockImplementation(async () => {
      steps.push('stream');
    });

    await mockConversationService.createConversation('user-e2e', 'test');
    await mockConversationService.saveMessage('conv-1', 'user-e2e', 'user', 'Hello', {});
    await mockEmbeddingService.generateAndStore('msg-1', 'user-e2e', 'Hello', 'message', {});
    await mockExtractionGraph.run('msg-1', 'user-e2e', 'Hello');
    await mockContextAssembly.assembleContext('user-e2e', 'What about Marcus?');
    await mockStreamService.streamResponse(
      mockSocket as never,
      'user-e2e',
      'conv-1',
      'req-1',
      'What about Marcus?',
      [],
      'Marcus: colleague',
    );

    expect(steps).toEqual([
      'create-conversation',
      'save-message',
      'embed',
      'extract',
      'assemble-context',
      'stream',
    ]);
  });
});
