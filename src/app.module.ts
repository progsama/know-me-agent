import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { ChatModule } from './modules/chat/chat.module';
import { MemoryModule } from './modules/memory/memory.module';
import { EntitiesModule } from './modules/entities/entities.module';
import { ExtractionModule } from './modules/extraction/extraction.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    DatabaseModule,
    ConversationsModule,
    MemoryModule,
    EntitiesModule,
    ExtractionModule,
    ChatModule,
  ],
})
export class AppModule {}
