import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatService } from './chat.service';
import { StreamService } from './stream.service';
import { ConversationsModule } from '../conversations/conversations.module';
import { MemoryModule } from '../memory/memory.module';
import { ExtractionModule } from '../extraction/extraction.module';

@Module({
  imports: [ConversationsModule, MemoryModule, ExtractionModule],
  providers: [ChatGateway, ChatService, StreamService],
  exports: [StreamService, ChatGateway],
})
export class ChatModule {}
