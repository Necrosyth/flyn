import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateTicketDto {
  @IsString()
  tenantId: string;

  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  visitorName: string;

  @IsEmail()
  visitorEmail: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  description: string;

  @IsOptional()
  @IsIn(['low', 'normal', 'high', 'urgent'])
  priority?: string;
}
