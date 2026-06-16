import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdateContactFormDto {
  @IsOptional()
  @IsIn(['new', 'opened', 'in_progress', 'resolved', 'closed'])
  status?: string;

  @IsOptional()
  @IsString()
  response?: string;

  @IsOptional()
  @IsString()
  assigned_to?: string;
}
