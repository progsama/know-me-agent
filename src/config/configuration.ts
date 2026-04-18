export default () => ({
  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
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
