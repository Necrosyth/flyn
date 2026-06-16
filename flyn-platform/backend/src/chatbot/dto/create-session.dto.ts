import { IsEmail, IsString, IsOptional, MinLength, MaxLength } from 'class-validator';

export class CreateSessionDto {
  @IsString()
  tenantId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  visitorName: string;

  @IsEmail()
  visitorEmail: string;

  @IsOptional()
  @IsString()
  agentId?: string;
}
