import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { Client } from 'pg';

const logger = new Logger('Migrate');

async function runMigration(): Promise<void> {
  const client = new Client({
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5433', 10),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    database: process.env.DB_NAME ?? 'know_me',
  });

  try {
    await client.connect();
    logger.log('Connected to database');

    const sqlPath = path.join(
      __dirname,
      'migrations',
      '001_initial_schema.sql',
    );
    const sql = fs.readFileSync(sqlPath, 'utf-8');

    await client.query(sql);
    logger.log('Migration completed successfully');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    logger.error(`Migration failed: ${message}`, stack);
    process.exit(1);
  } finally {
    await client.end();
  }
}

void runMigration();
