import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { SendMessageDto } from '../../common/dto';
import { ConversationService } from '../conversations/conversation.service';
import { ChatChunkEvent, ChatCompleteEvent, ChatErrorEvent } from '../../common/types';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly conversationService: ConversationService,
  ) {}

  async handleIncomingMessage(
    client: Socket,
    userId: string,
    dto: SendMessageDto,
  ): Promise<void> {
    const { conversationId, content, requestId } = dto;

    try {
      // Verify conversation exists for this user
      let conversation = await this.conversationService.getConversation(
        conversationId,
        userId,
      );

      if (!conversation) {
        this.logger.log(`Conversation ${conversationId} not found — creating new one`);
        conversation = await this.conversationService.createConversation(userId);
      }

      // Persist user message
      const userMessage = await this.conversationService.saveMessage(
        conversation.id,
        userId,
        'user',
        content,
      );

      this.logger.log(`Saved user message: ${userMessage.id}`);

      // Fetch recent history for context (AI will use this in Phase 3)
      const history = await this.conversationService.getRecentMessages(
        conversation.id,
        10,
      );

      this.logger.log(`Loaded ${history.length} recent messages for context`);

      // Placeholder response — real AI streaming wired in Phase 3
      const placeholderResponse = `[Phase 2 Echo] You said: "${content}". AI streaming will be connected in Phase 3.`;

      // Persist assistant placeholder message
      const assistantMessage = await this.conversationService.saveMessage(
        conversation.id,
        userId,
        'assistant',
        placeholderResponse,
        { requestId, phase: 'phase-2-placeholder' },
      );

      // Emit chunk event
      const chunkEvent: ChatChunkEvent = {
        requestId,
        chunk: placeholderResponse,
        messageId: assistantMessage.id,
      };
      client.emit('chat:chunk', chunkEvent);

      // Emit complete event
      const completeEvent: ChatCompleteEvent = {
        requestId,
        messageId: assistantMessage.id,
        conversationId: conversation.id,
      };
      client.emit('chat:complete', completeEvent);

      this.logger.log(`Response complete for requestId: ${requestId}`);

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error occurred';
      this.logger.error(`Error handling message: ${message}`);

      const errorEvent: ChatErrorEvent = {
        message: 'Failed to process message',
        requestId,
      };
      client.emit('chat:error', errorEvent);
    }
  }
}
