import { Module } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { ConversationsController } from './conversations.controller';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [ConversationsController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationsModule {}
