import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export const SUPABASE_CLIENT = 'SUPABASE_CLIENT';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: SUPABASE_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): SupabaseClient => {
        const url = configService.get<string>('supabase.url') ?? '';
        const anonKey = configService.get<string>('supabase.anonKey') ?? '';
        return createClient(url, anonKey) as SupabaseClient;
      },
    },
  ],
  exports: [SUPABASE_CLIENT],
})
export class DatabaseModule {}
