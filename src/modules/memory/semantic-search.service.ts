import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { EmbeddingService } from './embedding.service';
import { SemanticSearchResult } from '../../common/types';

@Injectable()
export class SemanticSearchService {
  private readonly logger = new Logger(SemanticSearchService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async search(
    query: string,
    userId: string,
    topK = 5,
    source?: 'message' | 'document' | 'memory',
  ): Promise<SemanticSearchResult[]> {
    try {
      const queryVector = await this.embeddingService.generateEmbedding(query);

      if (!queryVector) {
        this.logger.warn(
          'Semantic search skipped — embedding generation failed (graceful degradation)',
        );
        return [];
      }

      const vectorLiteral = `[${queryVector.join(',')}]`;

      const sourceFilter = source ? `AND source = $3` : '';
      const params: (string | number)[] = [vectorLiteral, userId];
      if (source) params.push(source);
      params.push(topK);

      const topKParam = source ? '$4' : '$3';

      const sql = `
        SELECT
          id,
          content,
          source,
          metadata,
          1 - (embedding <=> $1::vector) AS similarity
        FROM message_embeddings
        WHERE user_id = $2
          ${sourceFilter}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> $1::vector
        LIMIT ${topKParam}
      `;

      const start = Date.now();
      const result = await this.pool.query(sql, params);
      const elapsed = Date.now() - start;

      this.logger.log(
        `Semantic search — query: "${query.slice(0, 40)}..." | results: ${result.rows.length} | ${elapsed}ms`,
      );

      return result.rows.map((row: Record<string, unknown>) => ({
        id: row['id'] as string,
        content: row['content'] as string,
        source: row['source'] as 'message' | 'document' | 'memory',
        similarity: parseFloat(String(row['similarity'])),
        metadata:
          typeof row['metadata'] === 'object' && row['metadata'] !== null
            ? (row['metadata'] as Record<string, unknown>)
            : {},
      }));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Semantic search failed: ${message}`);
      return [];
    }
  }

  async searchByPerson(
    personName: string,
    userId: string,
    topK = 5,
  ): Promise<SemanticSearchResult[]> {
    return this.search(`Tell me about ${personName}`, userId, topK);
  }
}
