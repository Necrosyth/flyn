import { IsEmail, IsIn, IsOptional, IsString, MinLength, MaxLength } from 'class-validator';

export class SubmitContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  phone?: string;

  @IsString()
  country: string;

  @IsString()
  @MinLength(3)
  @MaxLength(200)
  subject: string;

  @IsString()
  @MinLength(10)
  @MaxLength(5000)
  message: string;

  @IsIn(['general', 'support', 'sales', 'careers', 'brand'])
  department: string;

  @IsIn(['low', 'medium', 'high', 'urgent'])
  priority: string;
}
