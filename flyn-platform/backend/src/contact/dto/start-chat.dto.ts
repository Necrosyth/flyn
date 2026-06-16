import { IsEmail, IsIn, IsString, MinLength, MaxLength } from 'class-validator';

export class StartChatDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  visitor_name: string;

  @IsEmail()
  visitor_email: string;

  @IsIn(['general', 'support', 'sales', 'careers', 'brand'])
  department: string;
}
