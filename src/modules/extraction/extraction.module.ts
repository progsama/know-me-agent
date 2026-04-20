import { Module } from '@nestjs/common';
import { ExtractionGraph } from './extraction.graph';
import { EntitiesModule } from '../entities/entities.module';
import { MemoryModule } from '../memory/memory.module';

@Module({
  imports: [EntitiesModule, MemoryModule],
  providers: [ExtractionGraph],
  exports: [ExtractionGraph],
})
export class ExtractionModule {}
