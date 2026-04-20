import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

export const PG_POOL = 'PG_POOL';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Pool => {
        return new Pool({
          host: configService.get<string>('database.host') ?? 'localhost',
          port: configService.get<number>('database.port') ?? 5433,
          user: configService.get<string>('database.user') ?? 'postgres',
          password: configService.get<string>('database.password') ?? 'postgres',
          database: configService.get<string>('database.name') ?? 'know_me',
        });
      },
    },
  ],
  exports: [PG_POOL],
})
export class DatabaseModule {}
