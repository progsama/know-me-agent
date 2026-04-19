import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentProcessorService } from './document-processor.service';
import { MemoryModule } from '../memory/memory.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { EntitiesModule } from '../entities/entities.module';
import { ChatModule } from '../chat/chat.module';

@Module({
  imports: [MemoryModule, ExtractionModule, EntitiesModule, ChatModule],
  controllers: [DocumentsController],
  providers: [DocumentProcessorService],
})
export class DocumentsModule {}
