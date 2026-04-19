import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import {
  PersonRecord,
  MemoryEntryRecord,
  ExtractedPerson,
} from '../../common/types';

@Injectable()
export class EntityService {
  private readonly logger = new Logger(EntityService.name);

  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async upsertPerson(
    userId: string,
    person: ExtractedPerson,
  ): Promise<PersonRecord | null> {
    try {
      const existing = await this.pool.query<PersonRecord>(
        `SELECT * FROM people WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
        [userId, person.name],
      );

      const existingRow = existing.rows[0];
      if (existingRow) {
        const rawFacts = existingRow.facts;
        const existingFacts: string[] = Array.isArray(rawFacts)
          ? (rawFacts as unknown[]).filter(
              (f): f is string => typeof f === 'string',
            )
          : [];
        const mergedFacts = Array.from(
          new Set([...existingFacts, ...person.facts]),
        );

        const result = await this.pool.query<PersonRecord>(
          `UPDATE people
           SET facts = $1,
               relationship = COALESCE($2, relationship),
               last_mentioned_at = NOW(),
               updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [
            JSON.stringify(mergedFacts),
            person.relationship || null,
            existingRow.id,
          ],
        );

        const updated = result.rows[0];
        if (!updated) {
          this.logger.error(`Update person returned no row: ${person.name}`);
          return null;
        }

        this.logger.log(
          `Updated person: ${person.name} | facts: ${mergedFacts.length}`,
        );
        return updated;
      }

      const result = await this.pool.query<PersonRecord>(
        `INSERT INTO people (user_id, name, relationship, facts)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [
          userId,
          person.name,
          person.relationship || null,
          JSON.stringify(person.facts),
        ],
      );

      const created = result.rows[0];
      if (!created) {
        this.logger.error(`Insert person returned no row: ${person.name}`);
        return null;
      }

      this.logger.log(
        `Created person: ${person.name} | relationship: ${person.relationship}`,
      );
      return created;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to upsert person ${person.name}: ${message}`);
      return null;
    }
  }

  async createMemoryEntry(
    userId: string,
    content: string,
    category: 'fact' | 'preference' | 'relationship' | 'emotion',
    entityId?: string | null,
    embeddingId?: string | null,
  ): Promise<MemoryEntryRecord | null> {
    try {
      const result = await this.pool.query<MemoryEntryRecord>(
        `INSERT INTO memory_entries (user_id, content, category, entity_id, embedding_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, content, category, entityId ?? null, embeddingId ?? null],
      );

      const row = result.rows[0];
      if (!row) {
        this.logger.error('Create memory entry returned no row');
        return null;
      }

      this.logger.log(
        `Created memory entry — category: ${category} | entity: ${entityId ?? 'none'}`,
      );
      return row;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to create memory entry: ${message}`);
      return null;
    }
  }

  async getPersonByName(
    userId: string,
    name: string,
  ): Promise<PersonRecord | null> {
    try {
      const result = await this.pool.query<PersonRecord>(
        `SELECT * FROM people WHERE user_id = $1 AND LOWER(name) = LOWER($2)`,
        [userId, name],
      );
      return result.rows[0] ?? null;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get person ${name}: ${message}`);
      return null;
    }
  }

  async getAllPeople(userId: string): Promise<PersonRecord[]> {
    try {
      const result = await this.pool.query<PersonRecord>(
        `SELECT * FROM people WHERE user_id = $1 ORDER BY last_mentioned_at DESC`,
        [userId],
      );
      return result.rows;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to get people: ${message}`);
      return [];
    }
  }
}
