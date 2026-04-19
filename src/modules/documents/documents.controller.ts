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
import { DocumentProcessingResult } from '../../common/types';

@Controller('api/conversations')
export class DocumentsController {
  private readonly logger = new Logger(DocumentsController.name);

  constructor(
    private readonly documentProcessor: DocumentProcessorService,
    private readonly chatGateway: ChatGateway,
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
  ): Promise<DocumentProcessingResult> {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    this.logger.log(
      `Document upload received — file: ${file.originalname} | size: ${file.size} bytes | conversationId: ${conversationId}`,
    );

    const userId = '550e8400-e29b-41d4-a716-446655440000';

    const content = file.buffer.toString('utf-8');

    const result = await this.documentProcessor.processDocument(
      userId,
      conversationId,
      file.originalname,
      content,
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

    this.logger.log(`Document upload complete — emitted WebSocket summary`);

    return result;
  }
}
