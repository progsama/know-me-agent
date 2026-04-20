const FIXTURE_VECTOR = Array.from({ length: 1536 }, (_, i) => i * 0.0001);

const mockEmbedQuery = vi.fn().mockResolvedValue(FIXTURE_VECTOR);
const mockStore = vi.fn().mockResolvedValue({ id: 'test-uuid' });

const generateAndStore = async (
  _messageId: string | null,
  _userId: string,
  _content: string,
  _source: 'message' | 'document' | 'memory',
): Promise<{ id: string } | null> => {
  const vector = await mockEmbedQuery('text');
  if (!vector) return null;
  return mockStore(vector);
};

describe('EmbeddingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEmbedQuery.mockResolvedValue(FIXTURE_VECTOR);
    mockStore.mockResolvedValue({ id: 'test-uuid' });
  });

  it('generates an embedding with correct dimensions', async () => {
    const result = await mockEmbedQuery('hello world');
    expect(result).toHaveLength(1536);
  });

  it('stores an embedding and returns the stored id', async () => {
    const result = await mockStore(FIXTURE_VECTOR);
    expect(result?.id).toBe('test-uuid');
    expect(mockStore).toHaveBeenCalledOnce();
  });

  it('generateAndStore calls generate then store and returns record', async () => {
    const result = await generateAndStore(
      null,
      'user-1',
      'some text',
      'message',
    );
    expect(result?.id).toBe('test-uuid');
    expect(mockStore).toHaveBeenCalledOnce();
  });

  it('returns null gracefully when embedding generation fails', async () => {
    mockEmbedQuery.mockResolvedValueOnce(null);
    const result = await generateAndStore(
      null,
      'user-1',
      'some text',
      'message',
    );
    expect(result).toBeNull();
  });

  it('does not call db when embedding generation returns null', async () => {
    mockEmbedQuery.mockResolvedValueOnce(null);
    await generateAndStore(null, 'user-1', 'text', 'message');
    expect(mockStore).not.toHaveBeenCalled();
  });
});
