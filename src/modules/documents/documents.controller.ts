import {
  Controller,
  Post,
  Param,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Express, Request } from 'express';
import { DocumentProcessorService } from './document-processor.service';
import { ChatGateway } from '../chat/chat.gateway';
import { EntityService } from '../entities/entity.service';

@Controller('api/conversations')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly documentProcessor: DocumentProcessorService,
    private readonly chatGateway: ChatGateway,
    private readonly entityService: EntityService,
  ) {}

  @Post(':conversationId/upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 },
      fileFilter: (
        _req: Request,
        file: Express.Multer.File,
        cb: (error: Error | null, acceptFile: boolean) => void,
      ) => {
        const allowed = ['.txt', '.md'];
        const ext =
          '.' + (file.originalname.split('.').pop()?.toLowerCase() ?? '');
        if (allowed.includes(ext)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException('Only .txt and .md files are accepted'),
            false,
          );
        }
      },
    }),
  )
  async uploadDocument(
    @Param('conversationId') conversationId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<{ status: string; fileName: string; message: string }> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `Document upload received — file: ${file.originalname} | size: ${file.size} bytes | conversationId: ${conversationId}`,
    );

    const userId = '550e8400-e29b-41d4-a716-446655440000';
    const content = file.buffer.toString('utf-8');
    const fileName = file.originalname;

    // Return immediately — process in background
    this.processInBackground(userId, conversationId, fileName, content);

    return {
      status: 'processing',
      fileName,
      message: 'Document received and processing started. You will receive a WebSocket notification when complete.',
    };
  }

  private processInBackground(
    userId: string,
    conversationId: string,
    fileName: string,
    content: string,
  ): void {
    this.documentProcessor
      .processDocument(userId, conversationId, fileName, content)
      .then(async (result) => {
        await this.entityService.createMemoryEntry(
          userId,
          `User uploaded a document called "${result.fileName}" containing ${result.totalChunks} sections. People mentioned in the document include: ${result.peopleExtracted.join(', ')}.`,
          'fact',
          null,
          null,
        );

        const peopleList =
          result.peopleExtracted.length > 0
            ? result.peopleExtracted.join(', ')
            : 'no specific people';

        const summaryMessage = `I've finished reading "${result.fileName}". I processed ${result.totalChunks} sections and stored ${result.embeddingsStored} memory chunks. I noticed mentions of: ${peopleList}. Feel free to ask me anything about the document!`;

        this.chatGateway.server.emit('chat:complete', {
          requestId: `doc-upload-${Date.now()}`,
          messageId: `doc-${conversationId}-${Date.now()}`,
          conversationId,
          summary: summaryMessage,
          isDocumentSummary: true,
        });

        this.logger.log(`Document processing complete — emitted WebSocket summary`);
      })
      .catch((error: unknown) => {
        const message =
          error instanceof Error ? error.message : 'Unknown error';
        this.logger.error(`Background document processing failed: ${message}`);

        this.chatGateway.server.emit('chat:error', {
          message: `Failed to process document "${fileName}"`,
          requestId: `doc-upload-${Date.now()}`,
        });
      });
  }}
