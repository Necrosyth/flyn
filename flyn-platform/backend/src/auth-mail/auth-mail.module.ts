import { Module } from '@nestjs/common';
import { AuthMailController } from './auth-mail.controller';
import { AuthMailService } from './auth-mail.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [AuthMailController],
  providers: [AuthMailService],
  exports: [AuthMailService],
})
export class AuthMailModule {}
