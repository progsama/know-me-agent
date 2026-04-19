import { Injectable, Logger, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../../database/database.module';
import { ConversationRecord, MessageRecord } from '../../common/types';

@Injectable()
export class ConversationService {
  private readonly logger = new Logger(ConversationService.name);

  constructor(
    @Inject(PG_POOL)
    private readonly pool: Pool,
  ) {}

  async createConversation(
    userId: string,
    title?: string,
  ): Promise<ConversationRecord> {
    const result = await this.pool.query<ConversationRecord>(
      `INSERT INTO conversations (user_id, title)
       VALUES ($1, $2)
       RETURNING *`,
      [userId, title ?? null],
    );
    this.logger.log(`Created conversation: ${result.rows[0].id}`);
    return result.rows[0];
  }

  async getConversation(
    conversationId: string,
    userId: string,
  ): Promise<ConversationRecord | null> {
    const result = await this.pool.query<ConversationRecord>(
      `SELECT * FROM conversations WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
    return result.rows[0] ?? null;
  }

  async saveMessage(
    conversationId: string,
    userId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata: Record<string, unknown> = {},
  ): Promise<MessageRecord> {
    const result = await this.pool.query<MessageRecord>(
      `INSERT INTO conversation_messages (conversation_id, user_id, role, content, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [conversationId, userId, role, content, JSON.stringify(metadata)],
    );
    return result.rows[0];
  }

  async getRecentMessages(
    conversationId: string,
    limit = 10,
  ): Promise<MessageRecord[]> {
    const result = await this.pool.query<MessageRecord>(
      `SELECT * FROM conversation_messages
       WHERE conversation_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [conversationId, limit],
    );
    return result.rows.reverse();
  }
}
