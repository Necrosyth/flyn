import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class JoinWithInviteDto {
  @IsString()
  @IsNotEmpty()
  inviteCode: string;

  @IsEmail()
  @IsNotEmpty()
  email: string;
}
