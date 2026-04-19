import { Module } from '@nestjs/common';
import { EntityService } from './entity.service';
import { DatabaseModule } from '../../database/database.module';

@Module({
  imports: [DatabaseModule],
  providers: [EntityService],
  exports: [EntityService],
})
export class EntitiesModule {}
