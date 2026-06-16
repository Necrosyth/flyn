import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateSalesInquiryDto {
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

  @IsOptional()
  @IsString()
  @MaxLength(200)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsIn(['enterprise', 'reseller', 'general'])
  inquiryType: string;
}
