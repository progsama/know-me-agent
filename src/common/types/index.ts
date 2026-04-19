export interface MessageRecord {
  id: string;
  conversation_id: string;
  user_id: string;
  role: 'user' | 'assistant';
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface ConversationRecord {
  id: string;
  user_id: string;
  status: 'active' | 'archived';
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedResult<T> {
  data: T[];
  count: number;
}

export interface ChatChunkEvent {
  requestId: string;
  chunk: string;
  messageId: string;
}

export interface ChatCompleteEvent {
  requestId: string;
  messageId: string;
  conversationId: string;
}

export interface ChatErrorEvent {
  message: string;
  requestId?: string;
}

export interface MemoryContext {
  relevantMemories: string[];
  peopleContext: string[];
}

export interface StreamContext {
  userId: string;
  conversationId: string;
  requestId: string;
  content: string;
  history: MessageRecord[];
  memoryContext: string;
}
