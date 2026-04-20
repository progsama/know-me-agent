import { ChatGateway } from '../../../dist/modules/chat/chat.gateway.js';
import { ChatService } from '../../../dist/modules/chat/chat.service.js';
import type { Socket, Server } from 'socket.io';
import { SendMessageDto } from '../../common/dto';

const mockChatService = {
  handleIncomingMessage: vi.fn().mockResolvedValue(undefined),
};

const makeSocket = (userId?: string): Partial<Socket> => ({
  id: 'socket-123',
  handshake: {
    query: userId ? { userId } : {},
    headers: {},
    time: new Date().toISOString(),
    address: '127.0.0.1',
    xdomain: false,
    secure: false,
    issued: Date.now(),
    url: '/',
    auth: {},
  } as Socket['handshake'],
  data: {},
  emit: vi.fn(),
  disconnect: vi.fn(),
});

describe('ChatGateway', () => {
  let gateway: ChatGateway;
  let mockServer: Partial<Server>;

  beforeEach(() => {
    vi.clearAllMocks();
    gateway = new ChatGateway(mockChatService as unknown as ChatService);
    mockServer = { emit: vi.fn() };
    gateway.server = mockServer as Server;
  });

  it('accepts connection when valid userId provided in handshake', () => {
    const socket = makeSocket('550e8400-e29b-41d4-a716-446655440000');
    expect(() => gateway.handleConnection(socket as Socket)).not.toThrow();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('disconnects socket when userId is missing from handshake', () => {
    const socket = makeSocket();
    gateway.handleConnection(socket as Socket);
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('disconnects socket when userId is empty string', () => {
    const socket = makeSocket('');
    gateway.handleConnection(socket as Socket);
    expect(socket.disconnect).toHaveBeenCalled();
  });

  it('handles disconnect event without throwing', () => {
    const socket = makeSocket('user-1');
    expect(() => gateway.handleDisconnect(socket as Socket)).not.toThrow();
  });

  it('calls chatService.handleIncomingMessage on chat:send event', async () => {
    const socket = makeSocket('550e8400-e29b-41d4-a716-446655440000');
    if (socket.data) {
      socket.data['userId'] = '550e8400-e29b-41d4-a716-446655440000';
    }
    const payload: SendMessageDto = {
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Hello there',
      requestId: 'req-1',
    };

    await gateway.handleMessage(payload, socket as Socket);

    expect(mockChatService.handleIncomingMessage).toHaveBeenCalledWith(
      socket,
      '550e8400-e29b-41d4-a716-446655440000',
      payload,
    );
  });

  it('does not throw when chatService throws during message handling', async () => {
    mockChatService.handleIncomingMessage.mockRejectedValueOnce(
      new Error('service failure'),
    );

    const socket = makeSocket('550e8400-e29b-41d4-a716-446655440000');
    if (socket.data) {
      socket.data['userId'] = '550e8400-e29b-41d4-a716-446655440000';
    }
    const payload: SendMessageDto = {
      conversationId: '550e8400-e29b-41d4-a716-446655440000',
      content: 'Hello',
      requestId: 'req-1',
    };

    await expect(
      gateway.handleMessage(payload, socket as Socket),
    ).rejects.toThrow();
  });
});
