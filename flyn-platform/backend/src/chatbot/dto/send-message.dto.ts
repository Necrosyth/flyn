import { IsString, MinLength, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  sessionId: string;

  @IsString()
  tenantId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;
}
