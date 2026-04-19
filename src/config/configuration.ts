export default () => ({
  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5433', 10),
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? 'postgres',
    name: process.env.DB_NAME ?? 'know_me',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? '',
    chatModel: process.env.ANTHROPIC_CHAT_MODEL ?? 'claude-sonnet-4-20250514',
    extractionModel:
      process.env.ANTHROPIC_EXTRACTION_MODEL ?? 'claude-haiku-4-5-20251001',
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    embeddingModel:
      process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small',
    embeddingDimensions: parseInt(
      process.env.OPENAI_EMBEDDING_DIMENSIONS ?? '1536',
      10,
    ),
  },
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
  },
});
