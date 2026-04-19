import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { StreamService } from './stream.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [ConversationsModule, MemoryModule],
  providers: [ChatGateway, ChatService, StreamService],
  exports: [StreamService],
})
export class ChatModule {}
