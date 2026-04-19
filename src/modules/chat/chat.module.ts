import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { StreamService } from './stream.service';
import { ConversationsModule } from '../conversations/conversations.module';

@Module({
  imports: [ConversationsModule],
  providers: [ChatGateway, ChatService, StreamService],
  exports: [StreamService],
})
export class ChatModule {}
