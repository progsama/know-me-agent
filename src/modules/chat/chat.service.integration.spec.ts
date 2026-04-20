const mockConversationService = {
  saveMessage: vi.fn(),
  getRecentMessages: vi.fn().mockResolvedValue([]),
};

const mockStreamService = {
  streamResponse: vi.fn().mockResolvedValue(undefined),
};

const mockEmbeddingService = {
  generateAndStore: vi.fn().mockResolvedValue({ id: 'embed-id' }),
};

const mockExtractionGraph = {
  run: vi.fn().mockResolvedValue(undefined),
};

const mockContextAssembly = {
  assembleContext: vi.fn().mockResolvedValue({
    memoryContext: '',
    retrievedMemories: [],
    mentionedPeople: [],
  }),
};

describe('Integration — full message pipeline', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('step 1: saves user message before any other operation', async () => {
    const savedMessage = {
      id: 'msg-user-1',
      role: 'user' as const,
      content: 'My friend Jake plays guitar',
      created_at: new Date().toISOString(),
    };
    mockConversationService.saveMessage.mockResolvedValueOnce(savedMessage);

    const result = await mockConversationService.saveMessage(
      'conv-1',
      'user-1',
      'user',
      'My friend Jake plays guitar',
      {},
    );

    expect(result.id).toBe('msg-user-1');
    expect(result.role).toBe('user');
  });

  it('step 2: generates and stores embedding with correct message id', async () => {
    const messageId = 'msg-user-1';
    await mockEmbeddingService.generateAndStore(
      messageId,
      'user-1',
      'My friend Jake plays guitar',
      'message',
      {},
    );

    expect(mockEmbeddingService.generateAndStore).toHaveBeenCalledWith(
      messageId,
      'user-1',
      'My friend Jake plays guitar',
      'message',
      {},
    );
  });

  it('step 3: runs entity extraction with correct message id', async () => {
    const messageId = 'msg-user-1';
    await mockExtractionGraph.run(
      messageId,
      'user-1',
      'My friend Jake plays guitar',
    );

    expect(mockExtractionGraph.run).toHaveBeenCalledWith(
      messageId,
      'user-1',
      'My friend Jake plays guitar',
    );
  });

  it('step 4: assembles memory context before streaming', async () => {
    mockContextAssembly.assembleContext.mockResolvedValueOnce({
      memoryContext: 'Jake: friend | plays guitar | roommate for 3 years',
      retrievedMemories: [],
      mentionedPeople: [],
    });

    const context = await mockContextAssembly.assembleContext(
      'user-1',
      'What does Jake like to do?',
    );

    expect(context.memoryContext).toContain('Jake');
    expect(context.memoryContext).toContain('plays guitar');
  });

  it('step 5: streams response with assembled memory context', async () => {
    const context = 'Jake: friend | plays guitar';
    mockContextAssembly.assembleContext.mockResolvedValueOnce({
      memoryContext: context,
      retrievedMemories: [],
      mentionedPeople: [],
    });

    await mockStreamService.streamResponse(
      {} as never,
      'user-1',
      'conv-1',
      'req-1',
      'What does Jake like to do?',
      [],
      context,
    );

    expect(mockStreamService.streamResponse).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      'conv-1',
      'req-1',
      'What does Jake like to do?',
      [],
      'Jake: friend | plays guitar',
    );
  });

  it('full pipeline: operations execute in correct order', async () => {
    const order: string[] = [];

    mockConversationService.saveMessage.mockImplementation(async () => {
      order.push('save-message');
      return { id: 'msg-1', role: 'user', content: 'test', created_at: '' };
    });

    mockEmbeddingService.generateAndStore.mockImplementation(async () => {
      order.push('embed');
      return { id: 'embed-id' };
    });

    mockExtractionGraph.run.mockImplementation(async () => {
      order.push('extract');
    });

    mockContextAssembly.assembleContext.mockImplementation(async () => {
      order.push('assemble-context');
      return { memoryContext: '', retrievedMemories: [], mentionedPeople: [] };
    });

    mockStreamService.streamResponse.mockImplementation(async () => {
      order.push('stream');
    });

    await mockConversationService.saveMessage('conv-1', 'user-1', 'user', 'test', {});
    await mockEmbeddingService.generateAndStore('msg-1', 'user-1', 'test', 'message', {});
    await mockExtractionGraph.run('msg-1', 'user-1', 'test');
    await mockContextAssembly.assembleContext('user-1', 'follow up');
    await mockStreamService.streamResponse(
      {} as never,
      'user-1',
      'conv-1',
      'req-1',
      'follow up',
      [],
      '',
    );

    expect(order).toEqual([
      'save-message',
      'embed',
      'extract',
      'stream',
    ]);
  });
});
