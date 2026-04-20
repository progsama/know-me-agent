import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SendMessageDto } from '../../common/dto';
import { ChatService } from './chat.service';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(private readonly chatService: ChatService) {}

  handleConnection(client: Socket): void {
    const userId = client.handshake.query['userId'];

    if (!userId || typeof userId !== 'string') {
      this.logger.warn(
        `Client ${client.id} connected without valid userId — disconnecting`,
      );
      client.disconnect();
      return;
    }

    client.data['userId'] = userId;
    this.logger.log(`Client connected: ${client.id} | userId: ${userId}`);
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
  @SubscribeMessage('chat:send')
  async handleMessage(
    @MessageBody() dto: SendMessageDto,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    const userId = client.data['userId'] as string | undefined;

    if (!userId) {
      client.emit('chat:error', { message: 'Unauthorized — no userId provided' });
      return;
    }

    await this.chatService.handleIncomingMessage(client, userId, dto);
  }
}
