import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatAnthropic } from '@langchain/anthropic';
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from '@langchain/core/prompts';
import {
  HumanMessage,
  AIMessage,
  BaseMessage,
} from '@langchain/core/messages';
import { Socket } from 'socket.io';
import { ConversationService } from '../conversations/conversation.service';
import {
  MessageRecord,
  ChatChunkEvent,
  ChatCompleteEvent,
  ChatErrorEvent,
} from '../../common/types';

@Injectable()
export class StreamService {
  private readonly logger = new Logger(StreamService.name);
  private readonly model: ChatAnthropic;

  constructor(
    private readonly configService: ConfigService,
    private readonly conversationService: ConversationService,
  ) {
    const apiKey =
      this.configService.get<string>('anthropic.apiKey') ?? '';
    const modelName = this.configService.getOrThrow<string>(
      'anthropic.chatModel',
    );

    this.model = new ChatAnthropic({
      apiKey,
      model: modelName,
      streaming: true,
    });
  }

  private buildLangchainHistory(history: MessageRecord[]): BaseMessage[] {
    return history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-8)
      .map((m) => {
        if (m.role === 'user') return new HumanMessage(m.content);
        return new AIMessage(m.content);
      });
  }

  private extractTextFromChunk(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
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
        .join('');
    }
    return '';
  }

  async streamResponse(
    client: Socket,
    userId: string,
    conversationId: string,
    requestId: string,
    userContent: string,
    history: MessageRecord[],
    memoryContext: string,
  ): Promise<void> {
    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `You are Shirin, a warm and thoughtful AI companion who genuinely wants to understand the person you are talking with. Your goal is to learn about this person — their life, relationships, feelings, preferences, and experiences — through natural conversation.

MEMORY INSTRUCTIONS (critical — follow exactly):
- The memory context below contains verified facts from previous conversations and uploaded documents. Trust it completely.
- Even if the user introduces themselves as if meeting you for the first time, you already know them. Greet them warmly but do not pretend you have no history.
- If a person, place, or event appears in your memory context, you know about it. Never say you have no information about something that is in your memory context.
- Reference memories naturally — do not say "according to my memory" or "my records show". Just speak as if you remember, because you do.
- Only say you do not know something if it is genuinely absent from both the conversation history and the memory context.

CONVERSATION GUIDELINES:
- Ask thoughtful follow-up questions to learn more about people and events the user mentions
- Reference things the user has shared earlier in the conversation naturally
- Be empathetic, curious, and supportive — never clinical or robotic
- Keep responses concise and conversational — this is a chat, not an essay
- If the user mentions a person by name and you have memory about them, share what you know and ask follow-up questions

{memoryContext}`,
      ],
      new MessagesPlaceholder('history'),
      ['human', '{userMessage}'],
    ]);

    const chain = prompt.pipe(this.model);
    let fullResponse = '';

    try {
      const stream = await chain.stream({
        memoryContext: memoryContext
          ? `\n=== MEMORY CONTEXT (verified facts — trust completely) ===\n${memoryContext}\n=== END MEMORY CONTEXT ===`
          : '',
        history: this.buildLangchainHistory(history),
        userMessage: userContent,
      });

      for await (const chunk of stream) {
        const text = this.extractTextFromChunk(
          (chunk as { content?: unknown }).content,
        );

        if (text) {
          fullResponse += text;

          const chunkEvent: ChatChunkEvent = {
            requestId,
            chunk: text,
            messageId: 'pending',
          };
          client.emit('chat:chunk', chunkEvent);
        }
      }

      const modelId = this.configService.get<string>('anthropic.chatModel');
      const metadata: Record<string, unknown> = { requestId };
      if (modelId !== undefined && modelId !== '') {
        metadata['model'] = modelId;
      }

      const assistantMessage = await this.conversationService.saveMessage(
        conversationId,
        userId,
        'assistant',
        fullResponse,
        metadata,
      );

      const completeEvent: ChatCompleteEvent = {
        requestId,
        messageId: assistantMessage.id,
        conversationId,
      };
      client.emit('chat:complete', completeEvent);

      this.logger.log(
        `Stream complete — messageId: ${assistantMessage.id} | chars: ${fullResponse.length}`,
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Streaming failed';
      this.logger.error(`Streaming error for requestId ${requestId}: ${message}`);

      const errorEvent: ChatErrorEvent = {
        message: 'Failed to generate response — please try again',
        requestId,
      };
      client.emit('chat:error', errorEvent);
    }
  }
}
