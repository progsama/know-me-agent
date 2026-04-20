import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import {
  Annotation,
  StateGraph,
  END,
  START,
} from '@langchain/langgraph';
import { EntityService } from '../entities/entity.service';
import { EmbeddingService } from '../memory/embedding.service';
import {
  ExtractionGraphState,
  ExtractedEntities,
  ExtractedPerson,
} from '../../common/types';

const ExtractionStateAnnotation = Annotation.Root({
  messageId: Annotation<string>,
  userId: Annotation<string>,
  content: Annotation<string>,
  extractedEntities: Annotation<ExtractedEntities | null>,
  errors: Annotation<string[]>({
    reducer: (left, right) => [...left, ...right],
    default: () => [],
  }),
});

type GraphState = typeof ExtractionStateAnnotation.State;

/** Narrow surface used from `compile()` — avoids TS internal graph-builder variance. */
interface CompiledExtractionGraph {
  invoke(input: GraphState): Promise<GraphState>;
}

@Injectable()
export class ExtractionGraph {
  private readonly logger = new Logger(ExtractionGraph.name);
  private readonly model: ChatAnthropic | null;
  private readonly compiled: CompiledExtractionGraph;

  constructor(
    private readonly configService: ConfigService,
    private readonly entityService: EntityService,
    private readonly embeddingService: EmbeddingService,
  ) {
    const apiKey = this.configService.get<string>('anthropic.apiKey') ?? '';
    const modelName =
      this.configService.get<string>('anthropic.extractionModel') ?? '';

    if (!modelName) {
      this.logger.warn(
        'anthropic.extractionModel missing from config — extraction LLM disabled',
      );
      this.model = null;
    } else {
      this.model = new ChatAnthropic({
        apiKey: apiKey || undefined,
        model: modelName,
        streaming: false,
      });
    }

    const graph = new StateGraph(ExtractionStateAnnotation)
      .addNode('extract', (state: GraphState) => this.extractNode(state))
      .addNode('store', (state: GraphState) => this.storeNode(state))
      .addEdge(START, 'extract')
      .addEdge('extract', 'store')
      .addEdge('store', END);

    this.compiled = graph.compile() as CompiledExtractionGraph;
  }

  private buildExtractionPrompt(): ChatPromptTemplate {
    return ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are an entity extraction system. Extract structured information from the user message.

Return ONLY valid JSON with this exact structure — no markdown, no explanation, just raw JSON:
{{
  "people": [
    {{
      "name": "string — person's name",
      "relationship": "string — relationship to the user (sister, friend, coworker, etc.) or empty string if unknown",
      "facts": ["array of specific facts about this person"]
    }}
  ],
  "keyFacts": ["array of key facts about the user themselves"],
  "emotionalTone": "one of: positive, negative, neutral, mixed",
  "topics": ["array of topics discussed e.g. family, work, health, travel"]
}}

Rules:
- Only extract people explicitly mentioned by name
- Facts must be specific and concrete — not vague
- If no people are mentioned, return empty array for people
- emotionalTone must be exactly one of: positive, negative, neutral, mixed
- Return valid JSON only — no text before or after`,
      ],
      ['human', 'Extract entities from this message: {message}'],
    ]);
  }

  private parseExtractedEntities(raw: string): ExtractedEntities | null {
    try {
      const cleaned = raw
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

      const parsed: unknown = JSON.parse(cleaned);

      if (typeof parsed !== 'object' || parsed === null) return null;

      const obj = parsed as Record<string, unknown>;

      const people: ExtractedPerson[] = Array.isArray(obj['people'])
        ? (obj['people'] as unknown[])
            .map((p) => {
              const person = p as Record<string, unknown>;
              return {
                name:
                  typeof person['name'] === 'string' ? person['name'] : '',
                relationship:
                  typeof person['relationship'] === 'string'
                    ? person['relationship']
                    : '',
                facts: Array.isArray(person['facts'])
                  ? (person['facts'] as unknown[]).filter(
                      (f): f is string => typeof f === 'string',
                    )
                  : [],
              };
            })
            .filter((p) => p.name.length > 0)
        : [];

      const keyFacts = Array.isArray(obj['keyFacts'])
        ? (obj['keyFacts'] as unknown[]).filter(
            (f): f is string => typeof f === 'string',
          )
        : [];

      const validTones = ['positive', 'negative', 'neutral', 'mixed'] as const;
      const tone =
        typeof obj['emotionalTone'] === 'string'
          ? obj['emotionalTone']
          : 'neutral';
      const emotionalTone = validTones.includes(
        tone as (typeof validTones)[number],
      )
        ? (tone as (typeof validTones)[number])
        : 'neutral';

      const topics = Array.isArray(obj['topics'])
        ? (obj['topics'] as unknown[]).filter(
            (t): t is string => typeof t === 'string',
          )
        : [];

      return { people, keyFacts, emotionalTone, topics };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Failed to parse extraction response: ${message}`);
      return null;
    }
  }

  private async extractNode(
    state: GraphState,
  ): Promise<Partial<ExtractionGraphState>> {
    this.logger.log(`Extract node — messageId: ${state.messageId}`);

    if (!this.model) {
      this.logger.warn('Extract node skipped — extraction model not configured');
      return {
        extractedEntities: null,
        errors: ['extract: model not configured'],
      };
    }

    try {
      const prompt = this.buildExtractionPrompt();
      const chain = prompt.pipe(this.model);

      const response = await chain.invoke({
        message: state.content,
      });

      const rawText =
        typeof response.content === 'string'
          ? response.content
          : Array.isArray(response.content)
            ? response.content
                .map((c) => {
                  if (
                    typeof c === 'object' &&
                    c !== null &&
                    'text' in c &&
                    typeof (c as Record<string, unknown>)['text'] === 'string'
                  ) {
                    return (c as Record<string, unknown>)['text'] as string;
                  }
                  return '';
                })
                .join('')
            : '';

      const extracted = this.parseExtractedEntities(rawText);

      if (extracted) {
        this.logger.log(
          `Extracted — people: ${extracted.people.length} | facts: ${extracted.keyFacts.length} | tone: ${extracted.emotionalTone}`,
        );
      }

      return { extractedEntities: extracted };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Extract node failed: ${message}`);
      return {
        extractedEntities: null,
        errors: [`extract: ${message}`],
      };
    }
  }

  private async storeNode(
    state: GraphState,
  ): Promise<Partial<ExtractionGraphState>> {
    this.logger.log(`Store node — messageId: ${state.messageId}`);

    if (!state.extractedEntities) {
      this.logger.warn('Store node — no entities to store, skipping');
      return {};
    }

    const { people, keyFacts, emotionalTone, topics } =
      state.extractedEntities;

    try {
      for (const person of people) {
        const personRecord = await this.entityService.upsertPerson(
          state.userId,
          person,
        );

        if (personRecord && person.relationship) {
          await this.entityService.createMemoryEntry(
            state.userId,
            `${person.name} is the user's ${person.relationship}`,
            'relationship',
            personRecord.id,
            null,
          );
        }

        if (personRecord) {
          for (const fact of person.facts) {
            await this.entityService.createMemoryEntry(
              state.userId,
              `${person.name}: ${fact}`,
              'fact',
              personRecord.id,
              null,
            );
          }
        }
      }

      for (const fact of keyFacts) {
        await this.entityService.createMemoryEntry(
          state.userId,
          fact,
          'fact',
          null,
          null,
        );
      }

      if (emotionalTone !== 'neutral') {
        await this.entityService.createMemoryEntry(
          state.userId,
          `User expressed ${emotionalTone} emotion when discussing: ${topics.join(', ')}`,
          'emotion',
          null,
          null,
        );
      }

      for (const fact of keyFacts) {
        this.embeddingService
          .generateAndStore(null, state.userId, fact, 'memory', {
            messageId: state.messageId,
            type: 'key_fact',
          })
          .catch((error: unknown) => {
            const msg =
              error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(`Fact embedding failed: ${msg}`);
          });
      }

      this.logger.log(
        `Store node complete — stored ${people.length} people, ${keyFacts.length} facts`,
      );
      return {};
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Store node failed: ${message}`);
      return {
        errors: [`store: ${message}`],
      };
    }
  }

  async run(
    messageId: string,
    userId: string,
    content: string,
  ): Promise<void> {
    const initialState: GraphState = {
      messageId,
      userId,
      content,
      extractedEntities: null,
      errors: [],
    };

    try {
      const result = await this.compiled.invoke(initialState);

      if (result.errors && result.errors.length > 0) {
        this.logger.warn(
          `Extraction graph completed with errors: ${result.errors.join(', ')}`,
        );
      } else {
        this.logger.log(
          `Extraction graph completed successfully — messageId: ${messageId}`,
        );
      }
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Extraction graph failed — messageId: ${messageId}: ${message}`,
      );
    }
  }
}
