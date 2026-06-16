import { Module } from '@nestjs/common';
import { FirebaseModule } from '../firebase/firebase.module';
import { MailboxesController } from './mailboxes.controller';
import { MailboxesService } from './mailboxes.service';
import { EmailDomainsController } from './email-domains.controller';
import { EmailDomainsService } from './email-domains.service';

@Module({
  imports: [FirebaseModule],
  controllers: [MailboxesController, EmailDomainsController],
  providers: [MailboxesService, EmailDomainsService],
  exports: [MailboxesService, EmailDomainsService],
})
export class MailboxesModule {}
