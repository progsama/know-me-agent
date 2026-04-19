-- Enable pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- Conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  title TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Embeddings (1536 dims for text-embedding-3-small)
CREATE TABLE IF NOT EXISTS message_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES conversation_messages(id) ON DELETE SET NULL,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  source TEXT NOT NULL CHECK (source IN ('message', 'document', 'memory')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- People
CREATE TABLE IF NOT EXISTS people (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  relationship TEXT,
  facts JSONB DEFAULT '[]',
  first_mentioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_mentioned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, name)
);

-- Memory entries
CREATE TABLE IF NOT EXISTS memory_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('fact', 'preference', 'relationship', 'emotion')),
  entity_id UUID REFERENCES people(id) ON DELETE SET NULL,
  embedding_id UUID REFERENCES message_embeddings(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HNSW index for cosine similarity search
CREATE INDEX IF NOT EXISTS message_embeddings_hnsw_idx
  ON message_embeddings
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Enable Row Level Security
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE memory_entries ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY conversations_user_policy ON conversations
  USING (user_id = current_setting('app.user_id', true)::UUID);
CREATE POLICY messages_user_policy ON conversation_messages
  USING (user_id = current_setting('app.user_id', true)::UUID);
CREATE POLICY embeddings_user_policy ON message_embeddings
  USING (user_id = current_setting('app.user_id', true)::UUID);
CREATE POLICY people_user_policy ON people
  USING (user_id = current_setting('app.user_id', true)::UUID);
CREATE POLICY memory_user_policy ON memory_entries
  USING (user_id = current_setting('app.user_id', true)::UUID);
