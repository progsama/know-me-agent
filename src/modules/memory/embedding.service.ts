import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { EmbeddingStorageParams, EmbeddingRecord } from '../../common/types';

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly embeddings: OpenAIEmbeddings | null;
  private readonly dimensions: number;

  constructor(
    private readonly configService: ConfigService,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {
    const apiKey = this.configService.get<string>('openai.apiKey') ?? '';
    const model = this.configService.get<string>('openai.embeddingModel') ?? '';
    const dimensionsRaw = this.configService.get<number>(
      'openai.embeddingDimensions',
    );
    this.dimensions =
      typeof dimensionsRaw === 'number' &&
      Number.isFinite(dimensionsRaw) &&
      dimensionsRaw > 0
        ? dimensionsRaw
        : 0;

    if (!model || this.dimensions <= 0) {
      this.logger.warn(
        'OpenAI embedding model or dimensions missing from config — semantic features disabled until configuration is complete',
      );
      this.embeddings = null;
    } else {
      this.embeddings = new OpenAIEmbeddings({
        apiKey: apiKey || undefined,
        model,
        dimensions: this.dimensions,
      });
    }
  }

  async generateEmbedding(text: string): Promise<number[] | null> {
    if (!this.embeddings) {
      this.logger.warn(
        'Embedding generation skipped — OpenAI embedding client not configured',
      );
      return null;
    }

    try {
      const vector = await this.embeddings.embedQuery(text);
      this.logger.log(
        `Generated embedding — dims: ${vector.length} | preview: [${vector
          .slice(0, 3)
          .map((n) => n.toFixed(4))
          .join(', ')}...]`,
      );
      return vector;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(
        `Embedding generation failed — graceful degradation active: ${message}`,
      );
      return null;
    }
  }

  async storeEmbedding(
    params: EmbeddingStorageParams,
  ): Promise<EmbeddingRecord | null> {
    try {
      const {
        messageId,
        userId,
        content,
        embedding,
        source,
        metadata = {},
      } = params;

      const vectorLiteral = `[${embedding.join(',')}]`;

      const result = await this.pool.query<EmbeddingRecord>(
        `INSERT INTO message_embeddings
           (message_id, user_id, content, embedding, source, metadata)
         VALUES ($1, $2, $3, $4::vector, $5, $6)
         RETURNING id, message_id, user_id, content, source, metadata, created_at`,
        [
          messageId,
          userId,
          content,
          vectorLiteral,
          source,
          JSON.stringify(metadata),
        ],
      );

      const row = result.rows[0];
      if (!row) {
        this.logger.error('Store embedding returned no row');
        return null;
      }

      this.logger.log(
        `Stored embedding — id: ${row.id} | source: ${source}`,
      );
      return row;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Failed to store embedding: ${message}`);
      return null;
    }
  }

  async generateAndStore(
    messageId: string | null,
    userId: string,
    content: string,
    source: 'message' | 'document' | 'memory',
    metadata: Record<string, unknown> = {},
  ): Promise<EmbeddingRecord | null> {
    const vector = await this.generateEmbedding(content);

    if (!vector) {
      this.logger.warn(
        `Skipping embedding storage — generation failed for source: ${source}`,
      );
      return null;
    }

    return this.storeEmbedding({
      messageId,
      userId,
      content,
      embedding: vector,
      source,
      metadata,
    });
  }
}
