import { IsIn, IsString, MinLength, MaxLength } from 'class-validator';

export class SendMessageDto {
  @IsString()
  chat_id: string;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  message: string;

  @IsIn(['visitor', 'agent'])
  sender_type: string;
}
