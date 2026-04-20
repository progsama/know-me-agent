# AI Development Journal — Know Me Agent

This document describes how AI tools were used throughout the development of this project, what was generated vs. reviewed and modified, where AI-generated output was incorrect and how it was caught, and the reasoning behind key architectural decisions.

---

## Development Model

The project followed a three-layer collaboration model:

**Claude (Tech Lead)** — responsible for architectural planning, phase-by-phase prompting strategy, diagnosing failures, and generating the precise Cursor prompts used at each phase. Claude reviewed outputs, identified bugs, and produced corrected prompts when something failed.

**Cursor (Engineer)** — executed the prompts. Did the majority of the actual code writing across all phases using Claude's instructions.

**Me (Project Manager / QA)** — owned implementation oversight. Verified each phase worked correctly before moving to the next. Handled environment setup (Docker, API keys, port conflicts), caught real failures during testing, made architectural decisions, and identified product-level improvements.

The AI did not run autonomously. Every phase was reviewed, verified with actual server output and browser testing, and approved before proceeding.

---

## Project Timeline

### Day 1 — Understanding, Planning, Scaffold

The first day was spent entirely on understanding the assignment, researching the required technologies, and making architectural decisions before writing any code.

The assignment README was read carefully and broken down into functional requirements (FR1–FR5), non-functional requirements (NFR1–NFR6), and a database schema. Each requirement was mapped to a specific technology and a specific phase of development.

Key decisions made on Day 1:
- Which LLM to use for chat vs extraction (Anthropic Sonnet for chat, Haiku for extraction)
- Which embedding model and dimensions (OpenAI `text-embedding-3-small`, 1536 dims)
- Whether to use Supabase JS client or plain `pg.Pool` — plain Pool, because Supabase JS requires PostgREST which is unavailable in a plain Docker pgvector setup
- How to structure the LangGraph pipeline — 2-node extract + store
- How to handle document upload async processing — instant HTTP return + WebSocket summary
- Which pipeline steps are fire-and-forget vs synchronous

Once the architecture was clear, the project was scaffolded: NestJS 11, Docker PostgreSQL with pgvector, database migration with all 5 tables and HNSW index, RLS policies, and the module structure for all phases.

### Day 2 — Feature Implementation (Phase by Phase)

Every feature was built as a separate Git branch, verified to work correctly, then merged to `dev` before the next phase began. No phase started until the previous one passed all verification steps — build passing, server logs correct, browser test passing.

| Branch | Phase | What was built |
|--------|-------|----------------|
| `phase/1-scaffold` | Scaffold | NestJS setup, Docker, database schema, migration |
| `phase/2-websocket` | WebSocket + Persistence | ChatGateway, ConversationService, DTOs |
| `phase/3-langchain-streaming` | LangChain Streaming | StreamService, Shirin persona, token streaming |
| `phase/4-embeddings` | Embeddings | EmbeddingService, SemanticSearchService, MemoryModule |
| `phase/5-langgraph-extraction` | LangGraph Extraction | ExtractionGraph, EntityService, background pipeline |
| `phase/6-context-assembly` | Context Assembly (RAG) | ContextAssemblyService, full RAG pipeline wired |
| `phase/7-document-upload` | Document Upload | DocumentProcessorService, chunking, async processing |

All feature branches were merged to `dev`. `dev` was merged to `main` after Day 3.

### Day 3 — Testing, Documentation, Video

| Branch | Phase | What was built |
|--------|-------|----------------|
| `phase/8-tests` | Tests | 10 test files, 66 tests, 0 failures |
| `phase/9-docs` | Documentation | README, AI_DEV_JOURNAL, AI discourse log |

---

## Assumptions Made

- **Simple auth** — `userId` is passed as a WebSocket handshake query parameter. No JWT or session management. A hardcoded test UUID (`550e8400-e29b-41d4-a716-446655440000`) is used for document upload endpoints. The spec explicitly allowed this — focus was on the intelligence layer, not auth.
- **Plain pg Pool over Supabase JS** — Supabase's JS client requires a PostgREST API layer which does not exist in a plain Docker pgvector setup. Replaced with `pg.Pool` and raw parameterized SQL. This was the right call — full control over vector operations with no broken abstraction.
- **Port 5433** — PostgreSQL mapped to host port 5433 to avoid conflicts with an existing local PostgreSQL installation occupying the default port 5432.
- **Sequential chunk processing** — Document chunks are processed sequentially (embed then extract per chunk) so the WebSocket summary only fires after all extraction is fully complete, not midway through. This trades throughput for correctness of the completion signal.
- **Fixed userId on document upload** — The REST upload endpoint uses a hardcoded userId because the spec does not require real auth. In a production system this would come from a verified session token.

---

## Optimisation Notes

These observations came out of building and testing the system. They are documented here rather than the README because they represent reflective thinking on the architecture rather than usage instructions.

### Embedding model

`text-embedding-3-large` produces 3072 dimensions vs 1536 for `text-embedding-3-small`. At this project's scale the accuracy difference is negligible, but storage cost and HNSW index size would double. At very large scale (millions of embeddings), dimension reduction via Matryoshka Representation Learning could bring 1536 dims down to 512 or 256 while preserving ~95% of semantic quality — halving storage and search costs without retraining.

### Extraction model

Claude Haiku handles the structured JSON extraction task well. A fine-tuned local model via Ollama would eliminate API cost entirely and reduce per-chunk extraction latency to near-zero. This is viable once extraction quality baselines are established — the LangChain abstraction makes swapping the model a config change.

### LangGraph pipeline

The current graph is linear (extract → store). A parallel graph with a deduplication node before storage would improve throughput when processing documents with many overlapping entities across chunks — currently the Set-based dedup happens in memory per call, not as a dedicated pipeline stage.

### pgvector at scale

pgvector with HNSW performs well within the 200ms requirement at this scale (43–63ms observed). At tens of millions of embeddings, a dedicated vector database with horizontal sharding would outperform it. The migration path is clean — only `EmbeddingService` and `SemanticSearchService` would need to change.

### Chat model

Sonnet is the right balance of quality and reliability for a persona-based companion. At scale, a fine-tuned smaller model for the chat layer would reduce cost and latency significantly while preserving the persona consistency that matters most for Bridge's product.

---

## Phase-by-Phase Breakdown

### Phase 1 — Scaffold

**What AI generated:** Full project scaffold — NestJS 11 setup, tsconfig, database module, migration SQL, Docker compose, `.env.example`, app module, vitest config.

**What I contributed:** Identified that the default Docker postgres port (5432) conflicted with an existing local PostgreSQL installation on my machine. Resolved by mapping the container to port 5433. Also had to disconnect other Docker services running on my machine to stabilise the environment for this project.

**Prompting approach:** Claude divided the project into phases based on the assignment README, wrote a detailed 14-step scaffold prompt, and handed it to Cursor. I verified each step — build, Docker health, migration, app start — before signing off.

---

### Phase 2 — WebSocket + Persistence

**What AI generated:** `ConversationService`, `ConversationsController`, `ChatGateway`, `ChatService`, DTOs, common types.

**Critical architectural decision — Supabase JS → pg Pool**
The original scaffold used `@supabase/supabase-js`. During Phase 2 testing, database calls were silently failing. The diagnosis: Supabase's JS client requires a PostgREST API layer that does not exist in a plain Docker pgvector setup. The decision to replace it with a plain `pg.Pool` was made jointly — Claude identified the root cause, I confirmed the fix made sense for our setup.

**What I contributed:** Identified that the WebSocket test via `wscat` wasn't working as expected for Socket.IO (wscat is for raw WebSocket, not Socket.IO protocol). Claude produced `scripts/ws-test.html` as a browser-based test client instead.

---

### Phase 3 — LangChain Streaming

**What AI generated:** `StreamService` with `ChatAnthropic`, `ChatPromptTemplate`, history conversion, streaming loop, error handling.

**What I contributed:** Sourced and configured the Anthropic API key. Identified that the placeholder value in `.env` was causing a 401 on first run. Confirmed streaming was working by watching token-by-token output in the browser test page.

---

### Phase 4 — Embeddings

**What AI generated:** `EmbeddingService`, `SemanticSearchService`, `MemoryModule`, fire-and-forget wiring in `ChatService`.

**Architectural decision — fire-and-forget for embeddings**
I decided the embedding pipeline should be fire-and-forget — it runs in the background after a message is saved and never blocks the streaming response. The reasoning: embedding failure should never degrade the user's chat experience. The spec explicitly requires graceful degradation (NFR3), and this implementation satisfies it cleanly.

**What I contributed:** Verified that embeddings were being stored correctly (1536 dims, correct source tag) by reading the server logs across multiple messages. Confirmed the response stream was not delayed by the background embedding work.

---

### Phase 5 — LangGraph Extraction

**What AI generated:** `EntityService`, `ExtractionGraph` with two LangGraph nodes (extract + store), `EntitiesModule`, `ExtractionModule`, wiring into `ChatService`.

**What I contributed:** Verified entity deduplication was working correctly — confirmed in logs that Lily's fact count grew from 3 → 4 → 6 across messages without creating duplicate records. Confirmed the graph completed successfully across multiple messages without blocking the stream.

---

### Phase 6 — Context Assembly (RAG)

**What AI generated:** `ContextAssemblyService` with `Promise.all` parallel execution, similarity threshold filtering, people name matching, context string builder. Updated `ChatService` to call assembly synchronously before streaming.

**What I contributed:** Verified the full RAG pipeline end-to-end. Confirmed Claude was referencing past memories correctly — notably the word "again" in a greeting response, which confirmed retrieval was coming from the vector database and not just the current conversation history.

---

### Phase 7 — Document Upload

**What AI generated:** `DocumentProcessorService` with chunking strategy and processing pipeline, `DocumentsController` with multer, `DocumentsModule`.

**Bugs I caught and fixed:**

**1. Upload timeout (HTTP fetch failing)**
The initial implementation awaited the full document processing pipeline synchronously before returning an HTTP response. Processing 43 chunks took ~20–28 seconds, causing the browser's fetch request to time out before a response arrived — showing `TypeError: Failed to fetch` even though the document processed correctly.

My fix: restructure the controller to return immediately with `{ status: "processing" }` and move all processing into a private `processInBackground()` method. The WebSocket `chat:complete` event fires when processing is truly done. This eliminated the timeout error entirely.

**2. CORS blocking document upload**
The browser test page is opened from the filesystem (`file://`), which triggers CORS restrictions on the HTTP fetch for file upload. The WebSocket worked fine (Socket.IO handles CORS separately) but the multipart file upload was being blocked instantly.

Fix: added `app.enableCors({ origin: '*' })` in `main.ts`, consistent with the existing `cors: { origin: '*' }` already configured on the WebSocket gateway.

**3. Missing memory entry for document upload**
After processing completed, Claude couldn't answer "what document did I upload?" because no searchable memory of the upload existed. Added a `createMemoryEntry` call in `processInBackground` that stores a fact about the document — file name, chunk count, people mentioned — making it retrievable via semantic search.

**4. System prompt ignoring memory context**
After document upload, asking "What do you know about Marcus?" returned "I don't have any information about Marcus" — even though 11,563 chars of memory context had been assembled and confirmed in the server logs.

The problem: the system prompt contained the instruction "When you do not know something about the user, say so honestly rather than guessing." Claude was following this instruction and overriding the memory context it had been given.

My fix: rewrote the system prompt to include explicit MEMORY INSTRUCTIONS that tell Claude to trust the memory context completely, reference it naturally without saying "according to my records," and never deny knowledge of something present in the context. Also strengthened the memory context wrapper from `What you already know about this user:` to `=== MEMORY CONTEXT (verified facts — trust completely) ===`.

After this fix, responses like the full Marcus arc (antagonist → mentor → promotion) came through correctly with zero fabrication.

**5. Extraction timing — document summary firing before extraction complete**
The WebSocket summary was emitting before all extraction pipeline runs had finished, meaning people weren't yet queryable when the summary arrived. Fixed by awaiting the extraction graph call per chunk inside the processing loop, so the summary only fires after all 43 chunks are fully processed.

**Minor test page edits**
Updated `scripts/ws-test.html` with a styled file picker (hidden native input, custom button), upload status display, and a 60-second AbortController timeout on the fetch to handle the processing delay gracefully.

---

### Phase 8 — Tests

**What the spec required:** 6 named unit test files, 2 integration tests. I confirmed which tests were explicitly required by reading the spec before writing any tests.

**What I added beyond the spec:**
- `chat.gateway.spec.ts` — WebSocket connection lifecycle tests (valid userId, missing userId, disconnect, error handling)
- `e2e-pipeline.spec.ts` — a 10-phase end-to-end sequence test covering the full flow from conversation creation through document upload through memory recall
- 8-person recall test — verifies all named people from the sample journal are extracted with specific testable facts (Sophie's thesis, Marcus's promotion, Jake's startup, Lily's Vancouver, Dad's cardiologist)
- Large document processing test — verifies the ~50KB limit case processes without errors and produces the correct chunk count

**Test principles applied:**
- Pre-computed fixture vectors (1536-dim arrays) — never calls real embedding APIs
- All LLM responses mocked with realistic fixture data
- Services instantiated directly with mocked constructor arguments — no `@nestjs/testing`
- No `any` types anywhere in test files

---

## Product Thinking — Thematic Clustering

During Phase 7 testing, while reviewing how the context assembly service groups memories by person, I noticed a structural gap: the system knows *facts* about people but has no notion of *themes* — the emotional and relational patterns that connect facts and people together.

Bridge is building an AI companion designed to deeply understand people — not just store what they said, but understand the patterns of their life. Looking at Bridge's product vision of building genuine relationship intelligence through AI, thematic clustering directly serves that goal. In the sample journal:

- Both Sophie (romantic partner) and the user's parents fall under a **love** theme
- Both Dad's health and Lily's unhappiness in Vancouver fall under a **concern / family** theme
- The user's promotion and Marcus's mentorship fall under a **career growth** theme

Without theme clustering, a query like "what are the things Alex is worried about?" must rely entirely on semantic similarity to surface the right memories. With theme clustering, the same query can filter `memory_entries` by `theme = 'concern'` and return a precision-ranked result set in a single indexed lookup — faster and more accurate as the memory store grows over time.

**Proposed implementation:**

1. New `themes` table: `id`, `user_id`, `name`, `sub_theme`, `created_at`
2. FK column `theme_id` on `memory_entries`
3. A **Classification Node** added to the LangGraph graph between the existing Extract and Store nodes — calls Claude Haiku to classify each extracted memory into a theme + sub-theme before storage
4. `ContextAssemblyService` updated to optionally filter assembled context by theme
5. BTREE index on `(user_id, theme)` in `memory_entries` for fast filtered retrieval

I chose not to implement this in the current submission due to time constraints and the risk of introducing schema changes close to the deadline. It is documented in the README under Future Improvements.

---

## Prompting Strategy

**Phase division** — Claude read the assignment README and divided the work into 9 phases. Each phase had a clearly scoped goal, a set of files to produce, and an explicit list of things intentionally not in scope.

**Cursor prompt structure** — prompts given to Cursor were precise and surgical. They specified exact file paths, exact method signatures, exact injection tokens, and exact constraints (no `any`, no `console.log`, Logger only). Vague prompts produced vague code — specificity was the most important factor in prompt quality.

**Error-first iteration** — when something failed, the raw error output or browser log was pasted directly into Claude without cleanup. Claude diagnosed the issue and produced a corrected prompt. This was faster than trying to understand the error and reformulate the prompt independently.

**File context** — for fixes and updates, the current file contents were pasted into the prompt so Claude could produce a precise change rather than rewriting the whole file. This reduced the risk of Cursor changing things it shouldn't.

**Phase gates** — no phase started until the previous one passed all verification steps (build, server logs, browser test). This prevented compounding errors where a later bug was actually a problem from an earlier phase.

---

## What I Would Do Differently

- Start with thematic clustering in the schema from Phase 1 — it's easier to add a column to a migration than to retrofit it later
- Add a Docker container for the NestJS app from the start so the full stack is portable with a single `docker-compose up`
- Write tests alongside each phase rather than in a dedicated Phase 8 — some test-driven thinking would have caught the system prompt memory issue earlier

---

---

# Know Me Agent — AI Development Discourse

---

## Phase 1

### Cursor (Phase 1)

#### Prompts (in order)

**Prompt 1 — Main scaffold**
Asked for: NestJS 11 + pnpm only, strict TS, no `any`, no `console.log` in `src/` (Logger only), class-validator/class-transformer, full dependency list, folder layout, `configuration.ts`, DatabaseModule + Supabase token, SQL migration + RLS, `migrate.ts`, `docker-compose.yml`, `.env` / `.env.example`, `AppModule` / `main.ts`, `vitest.config.ts`, `package.json` scripts, then verify `pnpm build`, Docker, `pnpm migrate`, `pnpm start:dev`.

Scaffolded Nest in the repo, adjusted tsconfig, installed deps, created module/common/config/database folders and placeholders, added all listed files, wired `ConfigModule` and `DatabaseModule`, removed default controller/service/spec, switched tests toward Vitest, fixed Nest incremental/dist and node dist/main alignment (`tsconfig.build.json` + `tsBuildInfoFile` under dist), ESLint tweaks for src (`no-console`, `no-explicit-any`).

Verification: build OK; Docker/migrate/start had environment issues (Docker off, port 5432/3000 conflicts) — addressed in a retry.

**Prompt 2 — Retry failed verification**
Mapped Postgres to host port 5433 in `docker-compose.yml` and `DB_PORT=5433` in `.env` / `.env.example` (5432 taken by local Postgres). Brought up `know-me-postgres`, ran `pnpm migrate` successfully. Freed port 3000, confirmed `pnpm start:dev`.

**Prompt 3 — Broad overview**
Narrative only — explained stack, layout, DB/migrations, tooling, and what was intentionally not built yet.

**Prompt 4 — Fix TypeScript error**
Updated `tsconfig.json`: dropped `baseUrl`, kept the listed options, added `"ignoreDeprecations": "5.0"`. Confirmed `pnpm build` still passes.

**Prompt 5 — Create vitest.config.ts**
Reset `vitest.config.ts` to exact content (globals, root, v8 coverage, unplugin-swc). Vitest starts and loads config cleanly.

---

### Claude (Phase 1)

#### What Phase 1 built

Phase 1 was purely foundation — no AI, no chat, no business logic. Just the skeleton everything else sits on.

#### Project Initialization

NestJS 11 project bootstrapped with TypeScript strict mode, pnpm as the package manager, all dependencies installed — LangChain, Anthropic, OpenAI, Socket.io, pgvector, Vitest.

#### Configuration System

`src/config/configuration.ts` — central config factory that reads all environment variables. `.env.example` documents every variable needed to run the project.

#### Database Layer

`docker-compose.yml` — runs PostgreSQL 16 with pgvector in a Docker container. `src/database/migrations/001_initial_schema.sql` — creates all 5 tables, the HNSW index, and RLS policies. `src/database/migrate.ts` — script that connects directly to postgres and runs the migration. `src/database/database.module.ts` — NestJS module that creates and exports the database client.

#### Application Shell

`src/app.module.ts` — root module. `src/main.ts` — app entry point with global validation pipe. All 6 module folders scaffolded: `chat`, `memory`, `extraction`, `documents`, `entities`, `conversations`. Common layer folders: `dto`, `filters`, `types`.

#### Testing Setup

`vitest.config.ts` — configured with SWC transformer for fast TypeScript compilation in tests.

#### Fixes Applied

- Docker port conflict — container mapped to 5433 (local postgres was occupying 5432)
- Postgres authentication — nuked old volume with `docker-compose down -v` to reset credentials
- TypeScript deprecation — removed `baseUrl` from tsconfig (deprecated in TS 6.0+)

#### Verification — Phase 1

| Check | Command | Result |
|-------|---------|--------|
| TypeScript compiles | `pnpm build` | ✅ Zero errors |
| Docker container healthy | `docker-compose up -d` | ✅ Running on port 5433 |
| Migration ran | `pnpm migrate` | ✅ All tables created |
| App starts | `pnpm start:dev` | ✅ Running on port 3000 |
| Tests run | `pnpm test` | ✅ Vitest starts cleanly |

#### Database tables created

- `conversations` — chat sessions
- `conversation_messages` — every message ever sent
- `message_embeddings` — vector representations for semantic search
- `people` — everyone the user mentions with their facts
- `memory_entries` — structured extracted memories

---

## Phase 2

### Cursor (Phase 2)

#### Goal — Phase 2

Build real-time chat (Socket.IO) and message/conversation persistence, without calling an LLM yet. Assistant replies are a fixed placeholder echo until Phase 3.

#### What was added — Phase 2

- **Types** (`src/common/types/index.ts`): `MessageRecord`, `ConversationRecord`, and WebSocket event shapes (`ChatChunkEvent`, `ChatCompleteEvent`, `ChatErrorEvent`).
- **DTOs** (`src/common/dto/index.ts`): `SendMessageDto` and `CreateConversationDto`, validated with class-validator only.
- **Conversations module**: service (create, get by id+user, save message, recent messages), `POST /api/conversations`, Nest module wired to the database layer.
- **Chat module**: Socket.IO gateway on `/`, `userId` in `handshake.query` (disconnect if missing), `chat:send` with validation, service that persists user + assistant rows then emits `chat:chunk` and `chat:complete` (or `chat:error`).
- **`AppModule`**: imports `ConversationsModule` and `ChatModule`.
- **`main.ts`**: `IoAdapter` so Socket.IO shares the HTTP server with Nest; global `ValidationPipe` unchanged.

#### Important corrections

The stack is plain Postgres (Docker, port 5433), not Supabase PostgREST. The Supabase JS client was replaced with a `pg` `Pool` (`PG_POOL` in `DatabaseModule`), SQL in `ConversationService`, and config via `DB_*` in `configuration.ts`. `@supabase/supabase-js` was removed. `scripts/ws-test.html` was added as a browser smoke test using the Socket.IO client CDN.

---

### Claude (Phase 2)

#### What Phase 2 built

Phase 2 established the real-time communication layer — the plumbing that lets a client talk to the server over WebSocket, with every message persisted to the database.

**ConversationService** — four methods: create a conversation, get by id and userId, save a message, and fetch recent messages. All queries are raw SQL via pg Pool with parameterized `$1 $2` placeholders.

**ConversationsController** — `POST /api/conversations` creates a new conversation and returns it.

**ChatGateway** — Socket.IO entry point. On connection reads `userId` from handshake query — if missing, client is immediately disconnected. Listens for `chat:send` events, routes to ChatService. ValidationPipe runs on every incoming message.

**ChatService** — verify/create conversation → save user message → fetch recent history → generate placeholder response → save assistant message → emit `chat:chunk` → emit `chat:complete`.

**The Supabase problem solved**
The original plan used `@supabase/supabase-js`. But Supabase's JS client needs a PostgREST API layer — it doesn't talk directly to PostgreSQL. The fix was replacing it with a `pg.Pool`. The `SUPABASE_CLIENT` injection token became `PG_POOL`, and the service was rewritten with raw parameterized SQL.

#### WebSocket flow

```text
Browser connects to ws://localhost:3000?userId=<uuid>
        │
ChatGateway.handleConnection()
        │  validates userId, stores on socket, or disconnects
        │
        │  sends: { event: "chat:send", data: { conversationId, content, requestId } }
        ▼
ChatGateway.handleMessage()
        │  ValidationPipe checks the DTO
        ▼
ChatService.handleIncomingMessage()
        ├── getConversation() → if missing, createConversation()
        ├── saveMessage() → user message stored in DB
        ├── getRecentMessages() → last 10 messages loaded
        ├── saveMessage() → placeholder assistant message stored
        ├── emit chat:chunk
        └── emit chat:complete
```

---

## Phase 3

### Cursor (Phase 3)

#### Goal — Phase 3

Replace the Phase 2 placeholder echo with real Claude answers, streamed over the existing Socket.IO contract (`chat:chunk` → `chat:complete` / `chat:error`), while keeping the same persistence and DTOs.

#### What was added — Phase 3

- **`StreamService`**: `ChatAnthropic` with `streaming: true`, `apiKey` and `model` from `ConfigService`. `ChatPromptTemplate.fromMessages`: system persona ("Shirin" + guidelines + `{memoryContext}`), `MessagesPlaceholder('history')`, human `{userMessage}`. `buildLangchainHistory`: last 8 user/assistant turns as `HumanMessage` / `AIMessage`. `extractTextFromChunk`: `unknown`-safe extraction of text from stream chunks. After the stream finishes: `saveMessage` once with the full assistant text and metadata, then `chat:complete` with the real `messageId` and `conversationId`. On failure: `chat:error`.
- **`ChatService`**: after saving the user message and loading recent history (10 rows), calls `streamService.streamResponse(...)` with `memoryContext = ''` (reserved for Phase 6 RAG).
- **`ChatModule`**: registers and exports `StreamService`.
- **Types**: `MemoryContext` and `StreamContext` added.
- **Dependencies**: `@langchain/core` added as a direct dependency so imports like `@langchain/core/prompts` resolve under pnpm.
- **`scripts/ws-test.html`**: Phase 3 streaming test UI.

---

### Claude (Phase 3)

#### What Phase 3 built

Phase 3 replaced the fake echo with real Claude AI responses streaming token by token.

**StreamService** — creates a `ChatAnthropic` instance via LangChain with streaming enabled, builds a `ChatPromptTemplate` with a system prompt defining Shirin's personality, converts conversation history from DB records into LangChain `HumanMessage` and `AIMessage` objects, streams Claude's response token by token using an `async for...of` loop, emits each token chunk as a `chat:chunk` WebSocket event in real time, saves the complete assembled response to the database after streaming completes, emits `chat:complete` with the real persisted message ID, handles errors gracefully and emits `chat:error` if anything fails.

**Problems solved**
- `@langchain/core` not exposed by pnpm — added explicitly to `package.json`.
- Invalid API key (401) — `.env` still had the placeholder value.
- Credit balance too low (400) — new Anthropic account had no credits.
- Port 3000 already in use — killed with `npx kill-port 3000`.

**Verification**
Three messages showed growing response lengths (354 → 519 → 555 chars) — Claude builds on full conversation history rather than treating each message in isolation.

---

## Phase 4

### Cursor (Phase 4)

#### What was added — Phase 4

- `src/modules/memory/embedding.service.ts` — Uses LangChain `OpenAIEmbeddings` from `@langchain/openai` with `apiKey` / `model` / `dimensions` from `ConfigService`. Inserts into `message_embeddings` via `PG_POOL`. On missing config, bad config, OpenAI errors, or DB errors it logs with Nest `Logger` and returns `null` / skips work (graceful degradation). No `any`; no hardcoded model/dimension IDs.
- `src/modules/memory/semantic-search.service.ts` — Cosine-style search with `<=>` on `message_embeddings`, optional `source` filter, `topK`. Uses `EmbeddingService` for the query vector; returns `[]` if embedding fails or on SQL errors.
- `src/modules/memory/memory.module.ts` — Imports `DatabaseModule`, registers and exports `EmbeddingService` and `SemanticSearchService`.
- `src/modules/chat/chat.service.ts` — Injects `EmbeddingService`. After saving a user message, calls `generateAndStore(...)` in a fire-and-forget way with `.catch(...)` so streaming is not blocked.

---

### Claude (Phase 4)

#### What Phase 4 built

Phase 4 built the vector memory system — the foundation of the entire RAG pipeline. Every message now gets converted into 1536 numbers (a vector embedding) representing its meaning, and stored in the database.

**EmbeddingService** — `generateEmbedding(text)` sends text to OpenAI and gets back 1536 numbers; `storeEmbedding(params)` stores a vector in `message_embeddings` formatted as a postgres vector literal; `generateAndStore()` calls both in sequence; full graceful degradation — if OpenAI is unavailable, logs a warning and returns null.

**SemanticSearchService** — `search(query, userId, topK)` converts query to vector, runs cosine similarity search against all stored embeddings for that user, returns top K results; uses the `<=>` pgvector operator; measures and logs query time — must stay under 200ms per the spec.

**Cosine similarity search SQL**
```sql
SELECT id, content, source, metadata,
       1 - (embedding <=> $1::vector) AS similarity
FROM message_embeddings
WHERE user_id = $2
  AND embedding IS NOT NULL
ORDER BY embedding <=> $1::vector
LIMIT $3
```

**Verification**
Five consecutive messages all produced: Saved user message → Generated embedding (1536 dims) → Stored embedding → Stream complete. Embedding always completed before stream finished — proving it runs truly in the background without delaying responses.

---

## Phase 5

### Cursor (Phase 5)

#### Goal — Phase 5

After each saved user message, a background LangGraph job turns the text into structured entities and writes them to `people` and `memory_entries`, without delaying the chat stream.

#### What was added — Phase 5

**`EntityService`**
- `upsertPerson`: match by `user_id` + case-insensitive name; merge facts (deduped); update relationship/timestamps on existing rows.
- `createMemoryEntry`: insert into `memory_entries` (category, optional `entity_id` / `embedding_id`).
- `getPersonByName`, `getAllPeople`: read paths for Phase 6.

**`ExtractionGraph`**
- LangGraph graph with two nodes: `extract` → `store`.
- `extract`: `ChatPromptTemplate` + `ChatAnthropic` (non-streaming), `anthropic.apiKey` + `anthropic.extractionModel` from `ConfigService` only; parses JSON into `ExtractedEntities` with `unknown` narrowing.
- `store`: upserts people, creates relationship + per-fact `memory_entries`, optional emotion line, then fire-and-forget `EmbeddingService.generateAndStore` for `keyFacts` as `source: 'memory'`.
- State defined with `Annotation.Root` (LangGraph 1.x style).

**Chat wiring** — `ChatService` calls `this.extractionGraph.run(userMessage.id, userId, content)` in a `.catch(…)` fire-and-forget path.

---

### Claude (Phase 5)

#### What Phase 5 built

Phase 5 built the LangGraph entity extraction pipeline — a background AI system that reads every user message, understands who is mentioned, what facts were shared, and what emotions were expressed, then stores all of that structured knowledge into the database.

**LangGraph flow**
```text
Initial State
{ messageId, userId, content, extractedEntities: null, errors: [] }
        │
        ▼
   Extract Node — calls Claude Haiku → returns { extractedEntities }
        │
        ▼
   Store Node — saves everything to database → returns {}
        │
        ▼
      END
```

**Deduplication**
Message 1: `Created person: Lily | facts: 3`
Message 2: `Updated person: Lily | facts: 4`
Message 3: `Updated person: Lily | facts: 6`

Every new fact about Lily gets accumulated into one record. The `UNIQUE(user_id, name)` constraint in the database prevents duplicates at the DB level; the service-level deduplication using a JavaScript `Set` does the merging.

---

## Phase 6

### Cursor (Phase 6)

#### Goal — Phase 6

Before each Claude stream starts, the app synchronously builds a `memoryContext` string from vector search + known people, and passes it into `StreamService`.

#### What was added — Phase 6

**`ContextAssemblyService`**
- `assembleContext(userId, currentMessage)` — runs in parallel: semantic search (top 5) and "who is named in this message?" via `getAllPeople` + case-insensitive substring match.
- `buildContextString`: memories with similarity > 0.3 → bullet list. Matched people → bullets with relationship + facts.
- On any failure: log, return empty context (stream still runs).

**`ChatService`** — injects `ContextAssemblyService`. After `getRecentMessages`, `await assembleContext(userId, content)` — not fire-and-forget (must finish before `streamResponse`).

---

### Claude (Phase 6)

#### What Phase 6 built

Phase 6 was the final piece of the RAG pipeline — context assembly. Before every Claude response, the system retrieves semantically relevant memories from the vector database and looks up facts about mentioned people, assembles them into a formatted context string, and injects it directly into Claude's system prompt.

**Verification**
- Message 1 — Claude responded: *"Hi Alex! It's good to hear from you again."* — the word "again" confirmed memory retrieval from previous sessions.
- Message 2 — "Tell me what you know about Lily" — Claude synthesized every fact correctly from extracted entities. Zero fabrication.
- Message 3 — "What city does she live in?" — Answered instantly from memory. Claude also called out the repetition — the AI being genuinely intelligent with its memory, not just retrieving facts mechanically.

**Spec requirements satisfied**
- ✅ FR4 — Semantic memory retrieval with top-k=5 vector search
- ✅ FR4 — Person name detection triggers `people` table lookup
- ✅ FR4 — Retrieved context injected into system prompt
- ✅ FR4 — Unified search across conversation messages and document chunks
- ✅ FR5 — References facts from earlier in conversation
- ✅ FR5 — Synthesizes everything known about a specific person
- ✅ FR5 — Acknowledges what it knows honestly without fabricating

---

## Phase 7

### Cursor (Phase 7)

#### Goal — Phase 7

Let users upload `.txt` / `.md` files (up to 50KB), turn them into searchable memory: chunk → embed (`source: 'document'`) → run the same LangGraph extraction per chunk → return a REST result and broadcast a WebSocket `chat:complete`-style event with a summary.

#### What was added — Phase 7

**`DocumentProcessorService`**
- Chunking: split on paragraphs (`\n` + blank lines), then ~500 characters with 50 overlap.
- Per chunk (sequential): `EmbeddingService.generateAndStore(..., 'document', { fileName, chunkIndex, totalChunks, conversationId })`.
- Per chunk (non-blocking): `ExtractionGraph.run('doc-{file}-{index}', userId, chunk)` with `.catch(...)`.

**`DocumentsController`** — `POST /api/conversations/:conversationId/upload`, multer in memory, 50KB limit, extension filter. After processing, `ChatGateway.server.emit('chat:complete', { …, summary, isDocumentSummary: true })`.

**`ChatModule`** — exports `ChatGateway` so the documents layer can emit.

**`scripts/ws-test.html`** — file picker + Upload Document (`fetch` multipart), `chat:complete` handler logs `data.summary` when present.

---

### Claude (Phase 7)

#### What Phase 7 built

Phase 7 built the document upload and processing pipeline.

**DocumentProcessorService** — `chunkText()` splits a document into overlapping segments paragraph-first; the journal produced 43 chunks from 15KB of text. `processDocument()` orchestrates the full pipeline for each chunk sequentially: generate and store an embedding with `source: 'document'`, then await the LangGraph extraction pipeline. After all chunks are processed, fetches all known people and returns a `DocumentProcessingResult`.

**Verification**
43 chunks created, 43 embeddings stored, 7+ major people extracted. Memory context assembled per query: Marcus (3,228 chars), Jake (2,120 chars), Dad (1,917 chars), Lily (1,473 chars). Every fact matched the journal precisely. Zero fabrication.

**Spec requirements satisfied**
- ✅ FR3 — REST endpoint `POST /api/conversations/:conversationId/upload`
- ✅ FR3 — Accepts `.txt` and `.md` files up to 50KB
- ✅ FR3 — Chunked with paragraph strategy and overlap
- ✅ FR3 — Each chunk embedded and stored with `source: 'document'`
- ✅ FR3 — LangGraph extraction pipeline runs on each chunk
- ✅ FR3 — After processing, agent sends summary with extracted people
- ✅ FR4 — Unified vector search across messages and document chunks
- ✅ FR5 — References facts from uploaded documents naturally
- ✅ FR5 — Synthesizes everything known about a person from all sources

---

## Phase 8

### Cursor (Phase 8)

#### Goal — Phase 8

Build a full test harness around the memory agent pipeline. All tests use mocks only — no real DB/API calls.

#### What was delivered

10 new `.spec.ts` files. Key coverage themes: graceful degradation paths, ordering expectations in pipeline-style integration tests, source tagging verification, recall-oriented fixtures for major people/entities from journal scenarios.

**Final verification:** `pnpm test --run` — 10/10 test files passed, 66/66 tests passed.

---

### Claude (Phase 8)

#### Phase 8 — Tests Complete

**Branch:** `phase/8-tests` → merged to `dev`
**Result:** 66 tests passing across 10 files, zero failures

**6 unit test files (spec-required)**
1. `embedding.service.spec.ts` — embedding generation, storage, graceful degradation, no DB call when embedding fails
2. `semantic-search.service.spec.ts` — top-k retrieval, similarity ordering, source filtering, empty results, embedding failure fallback
3. `entity.service.spec.ts` — person creation, deduplication by name+user, fact merging, case-insensitive name lookup, null when not found
4. `context-assembly.service.spec.ts` — context string assembly, empty string when no data, low similarity filtering, parallel execution
5. `extraction.graph.spec.ts` — full graph run, store node called after extract node, malformed JSON handled gracefully, empty people array skips upsert
6. `stream.service.spec.ts` — chat:chunk emitted per token, chat:complete with correct messageId, assistant message saved to DB, chat:error on failure

**2 spec-required integration tests**
1. `chat.service.integration.spec.ts` — message pipeline in correct order: save → embed → extract → assemble context → stream
2. `document-processor.integration.spec.ts` — upload pipeline: chunks created → all embedded → extraction per chunk → semantic search returns doc content

**2 additional tests**
1. `chat.gateway.spec.ts` — WebSocket connection lifecycle, auth rejection, event routing
2. `e2e-pipeline.spec.ts` — full 10-phase sequence from conversation creation through memory recall

**Additions beyond the spec**
- WebSocket connection lifecycle tests
- End-to-end pipeline — all 10 phases in sequence
- 8-person recall test — all named people from the sample journal with specific testable facts
- Large document test — ~50KB document processed without errors
- Themes/sub-themes concept — identified as a future architectural improvement
