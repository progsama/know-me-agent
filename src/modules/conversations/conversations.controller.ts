import { Controller, Post, Body, Logger } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { CreateConversationDto } from '../../common/dto';
import { ConversationRecord } from '../../common/types';

@Controller('api/conversations')
export class ConversationsController {
  private readonly logger = new Logger(ConversationsController.name);

  constructor(private readonly conversationService: ConversationService) {}

  @Post()
  async createConversation(
    @Body() dto: CreateConversationDto,
  ): Promise<ConversationRecord> {
    this.logger.log(`Creating conversation for user: ${dto.userId}`);
    return this.conversationService.createConversation(dto.userId, dto.title);
  }
}
