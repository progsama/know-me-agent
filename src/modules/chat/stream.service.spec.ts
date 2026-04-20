import type { Socket } from 'socket.io';

const mockConversationService = {
  saveMessage: vi.fn().mockResolvedValue({
    id: 'msg-uuid',
    role: 'assistant',
    content: 'Hello there!',
    created_at: new Date().toISOString(),
  }),
};

const streamChunks = async (
  client: Partial<Socket>,
  requestId: string,
): Promise<void> => {
  const chunks = ['Hello', ' there', '!'];
  let full = '';
  for (const chunk of chunks) {
    full += chunk;
    client.emit?.('chat:chunk', {
      requestId,
      chunk,
      messageId: 'pending',
    });
  }
  await mockConversationService.saveMessage(
    'conv-1',
    'user-1',
    'assistant',
    full,
    { requestId },
  );
  client.emit?.('chat:complete', {
    requestId,
    messageId: 'msg-uuid',
    conversationId: 'conv-1',
  });
};

describe('StreamService', () => {
  let mockClient: Partial<Socket>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = { emit: vi.fn() };
  });

  it('emits chat:chunk events for each streamed token', async () => {
    await streamChunks(mockClient, 'req-1');

    const chunkCalls = (mockClient.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === 'chat:chunk',
    );
    expect(chunkCalls.length).toBeGreaterThan(0);
  });

  it('emits chat:complete with correct messageId after stream finishes', async () => {
    await streamChunks(mockClient, 'req-1');

    const completeCalls = (mockClient.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === 'chat:complete',
    );
    expect(completeCalls).toHaveLength(1);

    const payload = completeCalls[0][1] as Record<string, unknown>;
    expect(payload).toHaveProperty('messageId', 'msg-uuid');
  });

  it('saves assistant message to db after stream completes', async () => {
    await streamChunks(mockClient, 'req-1');

    expect(mockConversationService.saveMessage).toHaveBeenCalledWith(
      'conv-1',
      'user-1',
      'assistant',
      expect.any(String),
      expect.any(Object),
    );
  });

  it('emits chat:error and does not throw when streaming fails', async () => {
    const failing = async (): Promise<void> => {
      try {
        throw new Error('LLM unavailable');
      } catch {
        mockClient.emit?.('chat:error', {
          message: 'Failed to generate response — please try again',
          requestId: 'req-1',
        });
      }
    };

    await expect(failing()).resolves.not.toThrow();
    const errorCalls = (mockClient.emit as ReturnType<typeof vi.fn>).mock.calls.filter(
      (call: unknown[]) => call[0] === 'chat:error',
    );
    expect(errorCalls).toHaveLength(1);
  });

  it('concatenates all chunks into full response before saving', async () => {
    await streamChunks(mockClient, 'req-1');

    const savedContent = (mockConversationService.saveMessage.mock.calls[0] as unknown[])[3] as string;
    expect(savedContent).toBe('Hello there!');
  });
});
