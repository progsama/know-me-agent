import { Module } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';
import { SemanticSearchService } from './semantic-search.service';
import { ContextAssemblyService } from './context-assembly.service';
import { DatabaseModule } from '../../database/database.module';
import { EntitiesModule } from '../entities/entities.module';

@Module({
  imports: [DatabaseModule, EntitiesModule],
  providers: [
    EmbeddingService,
    SemanticSearchService,
    ContextAssemblyService,
  ],
  exports: [
    EmbeddingService,
    SemanticSearchService,
    ContextAssemblyService,
  ],
})
export class MemoryModule {}
