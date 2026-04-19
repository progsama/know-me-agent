import { IsString, IsNotEmpty, IsUUID, IsOptional } from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  @IsNotEmpty()
  conversationId!: string;

  @IsString()
  @IsNotEmpty()
  content!: string;

  @IsString()
  @IsNotEmpty()
  requestId!: string;
}

export class CreateConversationDto {
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @IsString()
  @IsOptional()
  title?: string;
}
