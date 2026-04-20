# Know Me — Conversational Memory Agent

A NestJS backend application where an AI agent (Shirin) engages users in conversation, extracts and remembers key facts about them and the people in their life, processes uploaded documents, and uses semantic memory retrieval to demonstrate recall across sessions.

Built as a take-home assignment for Bridge — a company building AI companions that deeply understand people through conversation and document analysis.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 22, TypeScript (strict mode) |
| Framework | NestJS 11 |
| Database | PostgreSQL 16 + pgvector (Docker) |
| AI / LLM | Anthropic Claude via LangChain |
| Embeddings | OpenAI text-embedding-3-small via LangChain |
| Orchestration | LangGraph (entity extraction pipeline) |
| Real-time | WebSocket via Socket.IO |
| Validation | class-validator + class-transformer |
| Testing | Vitest |
| Package Manager | pnpm |

---

## Why This Stack

Every technology in this project was chosen deliberately.

### Anthropic Claude Sonnet — chat responses

Claude Sonnet has significantly better instruction-following than GPT-4o for persona-based prompts. The Shirin persona requires the model to stay in character, reference memory naturally without sounding clinical, and synthesize facts from multiple sources into a conversational response. Claude handles these constraints more reliably and consistently. Claude's context window (200k tokens) also means long conversation histories and large memory context strings never get truncated — important for a system that accumulates knowledge over time.

### Claude Haiku — entity extraction

Extraction runs on every single user message and every document chunk — potentially hundreds of LLM calls per document upload. Haiku is Anthropic's smallest and fastest model, costs roughly 25x less than Sonnet per token, and is fully capable of the structured JSON extraction task. The extraction prompt is deterministic and well-constrained — it does not need Sonnet's reasoning depth. Using Sonnet for extraction would add approximately 2 seconds per chunk and significantly increase API cost with no meaningful improvement in extraction quality.

### OpenAI text-embedding-3-small — vector embeddings

`text-embedding-3-small` produces 1536-dimension vectors — sufficient for the semantic similarity tasks in this project. `text-embedding-3-large` produces 3072 dimensions, doubles storage cost, increases HNSW index size, and adds latency to every embedding and search operation with no meaningful accuracy improvement at this scale. `text-embedding-3-small` is also 5x cheaper per token. The HNSW index performs well within the 200ms requirement — logs consistently show 43–63ms per search.

### LangGraph — extraction pipeline

The spec explicitly required LangGraph. But beyond compliance, LangGraph enforces clean separation of concerns that a direct service call cannot: the Extract node has no knowledge of the database, the Store node calls no LLMs. Each node does one focused job. This matters for extensibility — adding a Classification Node for thematic clustering requires inserting a node between Extract and Store with no changes to existing nodes.

### Socket.IO — real-time communication

Raw WebSocket has no event naming system — every message would require manually parsing a `type` field from raw JSON. Socket.IO provides named events (`chat:send`, `chat:chunk`, `chat:complete`), automatic reconnection with exponential backoff, fallback transports for restrictive networks, and a room and namespace system for future multi-user features.

### pgvector — vector storage and search

pgvector keeps the entire data model in one database. Entity data (`people`, `memory_entries`) and vector data (`message_embeddings`) live in the same PostgreSQL instance — joins, transactions, and foreign key relationships work naturally. A dedicated vector database like Pinecone would require a separate service and API client, and cross-referencing entity facts with embeddings would require a round trip between two services instead of a single SQL join.

### Plain pg Pool — database client

Raw SQL with parameterized queries gives precise control over the vector literal formatting pgvector requires (`[0.1, 0.2, ...]::vector`). ORMs like Prisma and TypeORM do not have native pgvector support — vector queries end up as raw SQL anyway, meaning the ORM adds an abstraction layer with no benefit.

### pnpm — package manager

pnpm's strict dependency isolation enforces honest dependency declarations. During development this caught a real issue: `@langchain/core` was not accessible as a transitive dependency through `@langchain/anthropic` and had to be declared explicitly — preventing a phantom dependency bug.

---

## Models Used

| Purpose | Model | Notes |
|---------|-------|-------|
| Chat / streaming responses | `claude-sonnet-4-20250514` | Best instruction-following for persona prompts |
| Entity extraction (background) | `claude-haiku-4-5-20251001` | Fast, cheap, sufficient for structured JSON tasks |
| Vector embeddings | `text-embedding-3-small` | 1536 dims, best cost/performance ratio at this scale |

All model IDs are configurable via environment variables — never hardcoded.

---

## Prerequisites

- Node.js 22+
- pnpm
- Docker Desktop
- Anthropic API key
- OpenAI API key

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/progsama/know-me-agent
cd know-me-agent
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Configure environment variables

```bash
cp .env.example .env
```

Open `.env` and fill in your API keys:

```dotenv
# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key
ANTHROPIC_CHAT_MODEL=claude-sonnet-4-20250514
ANTHROPIC_EXTRACTION_MODEL=claude-haiku-4-5-20251001

# OpenAI (embeddings only)
OPENAI_API_KEY=your_openai_api_key
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_EMBEDDING_DIMENSIONS=1536

# Database
DB_HOST=localhost
DB_PORT=5433
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=know_me

# App
PORT=3000
```

### 4. Start the database

```bash
docker-compose up -d
```

This starts PostgreSQL 16 with pgvector on port 5433. Port 5433 is used instead of the default 5432 to avoid conflicts with any existing local PostgreSQL installation.

Wait for the container to be healthy:

```bash
docker ps
# STATUS should show: Up X seconds (healthy)
```

### 5. Run the database migration

```bash
pnpm migrate
```

This creates all 5 tables, the HNSW vector index, and RLS policies.

### 6. Start the application

```bash
pnpm start:dev
```

The application runs on `http://localhost:3000`.

---

## Running Tests

```bash
pnpm test --run
```

Expected output: 10 test files, 66 tests, 0 failures.

---

## Using the Application

### Step 1 — Create a conversation

```bash
curl -s -X POST http://localhost:3000/api/conversations \
  -H "Content-Type: application/json" \
  -d '{"userId": "550e8400-e29b-41d4-a716-446655440000", "title": "My Session"}' \
  | python -m json.tool
```

Copy the `id` field from the response — this is your `conversationId`.

### Step 2 — Connect via WebSocket

Open `scripts/ws-test.html` in your browser. Paste the `conversationId` into the Conversation ID field and click **Connect**.

### Step 3 — Chat

Type a message and click **Send Message**. Responses stream token by token in the yellow streaming box.

### Step 4 — Upload a document

Click **Choose File**, select `sample-journal.txt` from the project root, then click **Upload Document**. Processing takes approximately 20–30 seconds. When complete, a WebSocket summary appears in the Events log listing all people extracted.

### Step 5 — Ask about the document

After the summary appears, ask questions about any person or event from the journal:

- "What do you know about Marcus?"
- "Tell me about my sister"
- "Who is Jake?"
- "What's going on with my dad's health?"
- "How is my relationship with Sophie?"

### Step 6 — Memory persistence across sessions

Disconnect and reconnect using the same `userId` and `conversationId`. The agent retains full memory of everything discussed and extracted — stored in PostgreSQL, not in application memory.

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                             │
│          Browser (ws-test.html) / Any WebSocket Client          │
│                                                                 │
│   HTTP: POST /api/conversations                                 │
│   HTTP: POST /api/conversations/:id/upload                      │
│   WS:   chat:send → chat:chunk → chat:complete → chat:error     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────┐
│                       NESTJS APPLICATION                      │
│                        localhost:3000                         │
│                                                               │
│  ┌──────────────────┐        ┌─────────────────────────────┐  │
│  │  ChatGateway     │        │   DocumentsController       │  │
│  │  (Socket.IO)     │        │   POST /upload              │  │
│  │                  │        │   ↓ returns instantly       │  │
│  │  handleConnect() │        │   processInBackground()     │  │
│  │  handleMessage() │        └──────────────┬──────────────┘  │
│  └────────┬─────────┘                       │                 │
│           │                                 │                 │
│           ▼                                 ▼                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                      ChatService                        │  │
│  │                                                         │  │
│  │  1. saveMessage()          → ConversationService (DB)   │  │
│  │  2. generateAndStore()     → EmbeddingService (async)   │  │
│  │  3. extractionGraph.run()  → ExtractionGraph  (async)   │  │
│  │  4. assembleContext()      → ContextAssembly  (sync)    │  │
│  │  5. streamResponse()       → StreamService              │  │
│  └─────────────────────────────────────────────────────────┘  │
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────┐  │
│  │  StreamService   │  │  ExtractionGraph │  │ContextAssem │  │
│  │                  │  │  (LangGraph)     │  │ blyService  │  │
│  │  ChatPrompt      │  │                  │  │             │  │
│  │  Template        │  │  ┌────────────┐  │  │ semantic    │  │
│  │  + history       │  │  │Extract Node│  │  │ search      │  │
│  │  + memoryContext │  │  │Claude Haiku│  │  │ +           │  │
│  │                  │  │  └─────┬──────┘  │  │ people      │  │
│  │  ChatAnthropic   │  │        ▼         │  │ lookup      │  │
│  │  streaming:true  │  │  ┌────────────┐  │  │             │  │
│  │                  │  │  │ Store Node │  │  │ Promise.all │  │
│  │  → chat:chunk    │  │  │ EntitySvc  │  │  │ parallel    │  │
│  │  → chat:complete │  │  └────────────┘  │  └─────────────┘  │
│  └──────────────────┘  └──────────────────┘                   │
└───────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌────────────────────────────────────────────────────────────────┐
│                     POSTGRESQL (Docker :5433)                  │
│                                                                │
│  ┌──────────────┐  ┌───────────────────┐  ┌─────────────────┐  │
│  │conversations │  │conversation_      │  │message_         │  │
│  │              │  │messages           │  │embeddings       │  │
│  │id (uuid)     │  │                   │  │                 │  │
│  │user_id       │  │id (uuid)          │  │id (uuid)        │  │
│  │status        │  │conversation_id FK │  │user_id          │  │
│  │title         │  │user_id            │  │content (text)   │  │
│  │created_at    │  │role               │  │embedding        │  │
│  │updated_at    │  │content            │  │  vector(1536)   │  │
│  └──────────────┘  │metadata (jsonb)   │  │source           │  │
│                    │created_at         │  │  message/       │  │
│  ┌──────────────┐  └───────────────────┘  │  document/      │  │
│  │people        │                         │  memory         │  │
│  │              │  ┌───────────────────┐  │metadata (jsonb) │  │
│  │id (uuid)     │  │memory_entries     │  │created_at       │  │
│  │user_id       │  │                   │  │                 │  │
│  │name          │  │id (uuid)          │  │HNSW Index:      │  │
│  │relationship  │  │user_id            │  │vector_cosine    │  │
│  │facts (jsonb) │  │content            │  │m=16             │  │
│  │UNIQUE        │  │category           │  │ef_construction  │  │
│  │(user_id,name)│  │  fact/preference  │  │=64              │  │
│  │created_at    │  │  /relationship    │  └─────────────────┘  │
│  │updated_at    │  │  /emotion         │                       │
│  └──────────────┘  │entity_id FK       │                       │
│                    │embedding_id FK    │                       │
│                    │created_at         │                       │
│                    └───────────────────┘                       │
└────────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXTERNAL AI SERVICES                       │
│                                                                 │
│   Anthropic API                    OpenAI API                   │
│   ┌─────────────────────┐         ┌──────────────────────────┐  │
│   │ claude-sonnet-...   │         │ text-embedding-3-small   │  │
│   │ Chat responses      │         │ 1536 dimensions          │  │
│   │ Streaming enabled   │         │ message + document +     │  │
│   │                     │         │ memory embeddings        │  │
│   │ claude-haiku-...    │         └──────────────────────────┘  │
│   │ Entity extraction   │                                       │
│   │ JSON output only    │                                       │
│   └─────────────────────┘                                       │
└─────────────────────────────────────────────────────────────────┘
```

### Message Flow — Single Chat Turn

```
User sends "What do you know about Marcus?"
                        │
                        ▼
            ChatGateway receives chat:send
            ValidationPipe checks DTO
                        │
                        ▼
            ChatService.handleIncomingMessage()
                        │
            ┌───────────┴───────────────────────────┐
            │ (sequential)                           │ (fire-and-forget)
            ▼                                       ▼
  saveMessage(user msg) → DB          generateAndStore() → pgvector
            │                         extractionGraph.run() → DB
            ▼
  getRecentMessages() → last 10
            │
            ▼
  assembleContext() ← SYNCHRONOUS — must complete before stream
    ├── semanticSearch("What do you know about Marcus?") → top 5 vectors
    └── getAllPeople() → filter by name match → Marcus record + facts
            │
            ▼ context string assembled (~3,228 chars for Marcus)
            │
            ▼
  StreamService.streamResponse()
    ├── ChatPromptTemplate + history + memoryContext
    ├── ChatAnthropic.stream()
    │     for each token:
    │       emit chat:chunk → client sees token appear
    │
    ├── after stream: saveMessage(assistant msg) → DB
    └── emit chat:complete → client logs messageId
```

### Document Upload Flow

```
User uploads sample-journal.txt (15KB)
                        │
                        ▼
         POST /api/conversations/:id/upload
         multer memoryStorage — file never touches disk
                        │
                        ▼
         DocumentsController returns immediately:
         { status: "processing", fileName }
                        │
                        ▼ (background — processInBackground())
         DocumentProcessorService.processDocument()
                        │
         for each of 43 chunks (sequential):
         ┌──────────────┴──────────────────────────┐
         │                                         │
         ▼                                         ▼
  EmbeddingService                      ExtractionGraph.run()
  generateAndStore()                      Extract Node (Haiku)
  source: 'document'                      → JSON entities
  → pgvector                              Store Node
                                          → people table
                                          → memory_entries
                        │
                        ▼
         createMemoryEntry("uploaded sample-journal.txt...")
                        │
                        ▼
         ChatGateway.server.emit('chat:complete', { summary })
         → client receives WebSocket notification
```

---

## Database Schema

| Table | Purpose |
|-------|---------|
| `conversations` | Chat sessions scoped to a user |
| `conversation_messages` | All user and assistant messages with metadata |
| `message_embeddings` | 1536-dim vectors (source: message/document/memory) |
| `people` | Named entities with facts as JSONB |
| `memory_entries` | Structured memories (fact/preference/relationship/emotion) |

All tables have Row-Level Security policies scoped to `user_id`. The `message_embeddings` table uses an HNSW index:

```sql
CREATE INDEX ON message_embeddings
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
```

---

## API Reference

### REST

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/conversations` | Create a new conversation |
| POST | `/api/conversations/:conversationId/upload` | Upload a `.txt` or `.md` file (max 50KB) |

### WebSocket Events

| Direction | Event | Payload |
|-----------|-------|---------|
| Client → Server | `chat:send` | `{ conversationId, content, requestId }` |
| Server → Client | `chat:chunk` | `{ requestId, chunk, messageId }` |
| Server → Client | `chat:complete` | `{ requestId, messageId, conversationId, summary? }` |
| Server → Client | `chat:error` | `{ message, requestId }` |

Connect with `userId` in the handshake query:
```
ws://localhost:3000?userId=550e8400-e29b-41d4-a716-446655440000
```

---

## Sample Journal

`sample-journal.txt` in the project root is a 6-month personal journal (~2,500 words) provided as test data. It contains 8+ named people with distinct relationships, evolving relationship arcs, emotional tone shifts, and specific testable facts.

After uploading, the agent can answer:

- "What do you know about Marcus?" → full arc from antagonist to mentor, architecture proposal rejection, senior engineer promotion
- "Tell me about my sister" → Lily, graphic designer, Vancouver, moving back to Toronto in May
- "Who is Jake?" → roommate of 3 years, ResumeAI startup founder, moved out in March
- "What's going on with my dad's health?" → blood pressure issues, cardiologist visit, improving with medication
- "How is my relationship with Sophie?" → together since February, defended thesis, met the parents, first fight

---

## Future Improvements

### Thematic Clustering

The current memory system categorises entries as `fact`, `preference`, `relationship`, or `emotion`. A meaningful next step would be adding thematic clustering — grouping memories and relationships under high-level themes (e.g. `family`, `romance`, `career`) with sub-themes (e.g. `concern`, `celebration`, `conflict`).

This is directly relevant to Bridge's core product vision. Bridge is building an AI companion that develops a deep, evolving understanding of a user's life — not just storing facts, but understanding the emotional and relational patterns that define who they are. In the sample journal, both Sophie (romantic partner) and the user's parents fall under a `love` theme; both Dad's health and Lily's unhappiness in Vancouver fall under `concern / family`; the user's promotion and Marcus's mentorship fall under `career growth`.

**Implementation path:**

1. New `themes` table: `id`, `user_id`, `name`, `sub_theme`, `created_at`
2. FK column `theme_id` on `memory_entries`
3. A **Classification Node** added to the LangGraph graph between Extract and Store — calls Claude Haiku to classify each extracted memory into a theme + sub-theme before storage
4. `ContextAssemblyService` updated to optionally filter assembled context by theme
5. BTREE index on `(user_id, theme)` in `memory_entries` for fast filtered retrieval

### Full Docker Compose

Containerise the NestJS application alongside PostgreSQL so the entire stack runs with a single `docker-compose up` command.

### Real Authentication

Replace the hardcoded `userId` with JWT-based authentication scoped per user session.

### Conversation Summarisation

For long-running conversations, periodically summarise older messages into compressed memory entries to keep context assembly fast and focused as history grows.

### Local Model Support

Replace Anthropic and OpenAI API calls with locally-hosted models via Ollama — eliminating API cost and latency for extraction and embedding tasks. The LangChain abstraction layer makes this a configuration change rather than a code change.
