import { Module } from '@nestjs/common';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { FirebaseModule } from '../firebase/firebase.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [FirebaseModule, MailModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
