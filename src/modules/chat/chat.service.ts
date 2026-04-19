import { Injectable, Logger } from '@nestjs/common';
import { Socket } from 'socket.io';
import { SendMessageDto } from '../../common/dto';
import { ConversationService } from '../conversations/conversation.service';
import { StreamService } from './stream.service';
import { EmbeddingService } from '../memory/embedding.service';
import { ExtractionGraph } from '../extraction/extraction.graph';
import { ChatErrorEvent } from '../../common/types';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly conversationService: ConversationService,
    private readonly streamService: StreamService,
    private readonly embeddingService: EmbeddingService,
    private readonly extractionGraph: ExtractionGraph,
  ) {}

  async handleIncomingMessage(
    client: Socket,
    userId: string,
    dto: SendMessageDto,
  ): Promise<void> {
    const { conversationId, content, requestId } = dto;

    try {
      // Verify conversation exists, create if not
      let conversation = await this.conversationService.getConversation(
        conversationId,
        userId,
      );

      if (!conversation) {
        this.logger.log(
          `Conversation ${conversationId} not found — creating new`,
        );
        conversation =
          await this.conversationService.createConversation(userId);
      }

      // Persist user message
      const userMessage = await this.conversationService.saveMessage(
        conversation.id,
        userId,
        'user',
        content,
      );

      this.logger.log(`Saved user message: ${userMessage.id}`);

      this.embeddingService
        .generateAndStore(
          userMessage.id,
          userId,
          content,
          'message',
          { conversationId: conversation.id, role: 'user' },
        )
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(
            `Background embedding failed — continuing without: ${message}`,
          );
        });

      this.extractionGraph
        .run(userMessage.id, userId, content)
        .catch((error: unknown) => {
          const message =
            error instanceof Error ? error.message : 'Unknown error';
          this.logger.warn(
            `Background extraction failed — continuing without: ${message}`,
          );
        });

      // Load recent history for prompt context
      const history = await this.conversationService.getRecentMessages(
        conversation.id,
        10,
      );

      // Memory context placeholder — populated in Phase 6
      const memoryContext = '';

      // Stream real Claude response
      await this.streamService.streamResponse(
        client,
        userId,
        conversation.id,
        requestId,
        content,
        history,
        memoryContext,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error handling message: ${message}`);

      const errorEvent: ChatErrorEvent = {
        message: 'Failed to process your message',
        requestId,
      };
      client.emit('chat:error', errorEvent);
    }
  }
}
