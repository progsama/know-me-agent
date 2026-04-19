import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { SemanticSearchService } from './semantic-search.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [EmbeddingService, SemanticSearchService],
  exports: [EmbeddingService, SemanticSearchService],
})
export class MemoryModule {}
