import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from '../memory/embedding.service';
import { ExtractionGraph } from '../extraction/extraction.graph';
import { EntityService } from '../entities/entity.service';
import { DocumentChunk, DocumentProcessingResult } from '../../common/types';

@Injectable()
export class DocumentProcessorService {
  private readonly logger = new Logger(DocumentProcessorService.name);
  private readonly CHUNK_SIZE = 500;
  private readonly CHUNK_OVERLAP = 50;

  constructor(
    private readonly embeddingService: EmbeddingService,
    private readonly extractionGraph: ExtractionGraph,
    private readonly entityService: EntityService,
  ) {}

  chunkText(text: string, fileName: string): DocumentChunk[] {
    const paragraphs = text
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter((p) => p.length > 0);

    const segments: string[] = [];
    for (const p of paragraphs) {
      if (p.length <= this.CHUNK_SIZE) {
        segments.push(p);
      } else {
        let start = 0;
        while (start < p.length) {
          const end = Math.min(start + this.CHUNK_SIZE, p.length);
          const slice = p.slice(start, end).trim();
          if (slice.length > 0) {
            segments.push(slice);
          }
          if (end >= p.length) break;
          start += this.CHUNK_SIZE - this.CHUNK_OVERLAP;
        }
      }
    }

    const merged: string[] = [];
    let buffer = '';
    for (const text of segments) {
      const joined = buffer ? `${buffer}\n\n${text}` : text;
      if (joined.length <= this.CHUNK_SIZE) {
        buffer = joined;
      } else {
        if (buffer.trim().length > 0) {
          merged.push(buffer.trim());
          const tail = buffer.slice(
            Math.max(0, buffer.length - this.CHUNK_OVERLAP),
          );
          buffer = tail.length > 0 ? `${tail}\n\n${text}` : text;
        } else {
          buffer = text;
        }
        while (buffer.length > this.CHUNK_SIZE) {
          merged.push(buffer.slice(0, this.CHUNK_SIZE).trim());
          buffer = buffer.slice(
            Math.max(1, this.CHUNK_SIZE - this.CHUNK_OVERLAP),
          );
        }
      }
    }
    if (buffer.trim().length > 0) {
      merged.push(buffer.trim());
    }

    const total = merged.length;
    return merged.map((content, index) => {
      const fromCharOnly =
        !content.includes('\n\n') && content.length >= this.CHUNK_SIZE - 1;
      return {
        content,
        index,
        totalChunks: total,
        metadata: {
          fileName,
          chunkStrategy: fromCharOnly ? 'character' : 'paragraph',
        },
      };
    });
  }

  async processDocument(
    userId: string,
    conversationId: string,
    fileName: string,
    content: string,
  ): Promise<DocumentProcessingResult> {
    const startTime = Date.now();
    this.logger.log(
      `Processing document: ${fileName} | size: ${content.length} chars | userId: ${userId}`,
    );

    const chunks = this.chunkText(content, fileName);
    this.logger.log(`Created ${chunks.length} chunks from document`);

    let embeddingsStored = 0;

    for (const chunk of chunks) {
      try {
        const embedding = await this.embeddingService.generateAndStore(
          null,
          userId,
          chunk.content,
          'document',
          {
            fileName,
            chunkIndex: chunk.index,
            totalChunks: chunk.totalChunks,
            conversationId,
            ...chunk.metadata,
          },
        );

        if (embedding) {
          embeddingsStored++;
        }

        const syntheticMessageId = `doc-${fileName}-chunk-${chunk.index}`;
        await this.extractionGraph
          .run(syntheticMessageId, userId, chunk.content)
          .catch((error: unknown) => {
            const message =
              error instanceof Error ? error.message : 'Unknown error';
            this.logger.warn(
              `Chunk extraction failed for ${fileName}[${chunk.index}]: ${message}`,
            );
          });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(
          `Failed to process chunk ${chunk.index} of ${fileName}: ${message}`,
        );
      }
    }

    const allPeople = await this.entityService.getAllPeople(userId);
    const peopleNames = allPeople.map((p) => p.name);

    const processingTimeMs = Date.now() - startTime;

    this.logger.log(
      `Document processed — chunks: ${chunks.length} | embeddings: ${embeddingsStored} | time: ${processingTimeMs}ms`,
    );

    return {
      fileName,
      totalChunks: chunks.length,
      embeddingsStored,
      peopleExtracted: peopleNames,
      processingTimeMs,
    };
  }
}
