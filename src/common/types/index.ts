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

export interface EmbeddingRecord {
  id: string;
  message_id: string | null;
  user_id: string;
  content: string;
  source: 'message' | 'document' | 'memory';
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface SemanticSearchResult {
  id: string;
  content: string;
  source: 'message' | 'document' | 'memory';
  similarity: number;
  metadata: Record<string, unknown>;
}

export interface EmbeddingStorageParams {
  messageId: string | null;
  userId: string;
  content: string;
  embedding: number[];
  source: 'message' | 'document' | 'memory';
  metadata?: Record<string, unknown>;
}

export interface ExtractedPerson {
  name: string;
  relationship: string;
  facts: string[];
}

export interface ExtractedEntities {
  people: ExtractedPerson[];
  keyFacts: string[];
  emotionalTone: string;
  topics: string[];
}

export interface PersonRecord {
  id: string;
  user_id: string;
  name: string;
  relationship: string | null;
  facts: string[];
  first_mentioned_at: string;
  last_mentioned_at: string;
  created_at: string;
  updated_at: string;
}

export interface MemoryEntryRecord {
  id: string;
  user_id: string;
  content: string;
  category: 'fact' | 'preference' | 'relationship' | 'emotion';
  entity_id: string | null;
  embedding_id: string | null;
  created_at: string;
}

export interface ExtractionGraphState {
  messageId: string;
  userId: string;
  content: string;
  extractedEntities: ExtractedEntities | null;
  errors: string[];
}

export interface AssembledContext {
  memoryContext: string;
  retrievedMemories: SemanticSearchResult[];
  mentionedPeople: PersonRecord[];
}
