import { Injectable, Logger } from '@nestjs/common';
import { SemanticSearchService } from './semantic-search.service';
import { EntityService } from '../entities/entity.service';
import {
  AssembledContext,
  PersonRecord,
  SemanticSearchResult,
} from '../../common/types';

@Injectable()
export class ContextAssemblyService {
  private readonly logger = new Logger(ContextAssemblyService.name);

  constructor(
    private readonly semanticSearch: SemanticSearchService,
    private readonly entityService: EntityService,
  ) {}

  async assembleContext(
    userId: string,
    currentMessage: string,
  ): Promise<AssembledContext> {
    const empty: AssembledContext = {
      memoryContext: '',
      retrievedMemories: [],
      mentionedPeople: [],
    };

    try {
      const [relevantMemories, mentionedPeople] = await Promise.all([
        this.searchRelevantMemories(userId, currentMessage),
        this.findMentionedPeople(userId, currentMessage),
      ]);

      const memoryContext = this.buildContextString(
        relevantMemories,
        mentionedPeople,
      );

      this.logger.log(
        `Context assembled — memories: ${relevantMemories.length} | people: ${mentionedPeople.length} | chars: ${memoryContext.length}`,
      );

      return {
        memoryContext,
        retrievedMemories: relevantMemories,
        mentionedPeople,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(
        `Context assembly failed — continuing with empty context: ${message}`,
      );
      return empty;
    }
  }

  private async searchRelevantMemories(
    userId: string,
    query: string,
  ): Promise<SemanticSearchResult[]> {
    try {
      return await this.semanticSearch.search(query, userId, 5);
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`Memory search failed: ${message}`);
      return [];
    }
  }

  private async findMentionedPeople(
    userId: string,
    message: string,
  ): Promise<PersonRecord[]> {
    try {
      const allPeople = await this.entityService.getAllPeople(userId);

      if (allPeople.length === 0) return [];

      const messageLower = message.toLowerCase();
      const mentioned = allPeople.filter((person) =>
        messageLower.includes(person.name.toLowerCase()),
      );

      return mentioned;
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.warn(`People lookup failed: ${message}`);
      return [];
    }
  }

  private factsAsStrings(person: PersonRecord): string[] {
    const raw = person.facts;
    if (!Array.isArray(raw)) return [];
    return raw.filter((f): f is string => typeof f === 'string');
  }

  private buildContextString(
    memories: SemanticSearchResult[],
    people: PersonRecord[],
  ): string {
    const sections: string[] = [];

    if (memories.length > 0) {
      const memoryLines = memories
        .filter((m) => m.similarity > 0.3)
        .map((m) => `- ${m.content}`)
        .join('\n');

      if (memoryLines.length > 0) {
        sections.push(
          `Relevant memories from past conversations:\n${memoryLines}`,
        );
      }
    }

    if (people.length > 0) {
      const peopleLines = people
        .map((p) => {
          const facts = this.factsAsStrings(p);
          const factsText =
            facts.length > 0 ? `\n  Known facts: ${facts.join('; ')}` : '';
          const relationship = p.relationship
            ? ` (${p.relationship})`
            : '';
          return `- ${p.name}${relationship}${factsText}`;
        })
        .join('\n');

      sections.push(`People mentioned in this message:\n${peopleLines}`);
    }

    return sections.join('\n\n');
  }
}
