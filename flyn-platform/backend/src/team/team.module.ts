import { Module } from '@nestjs/common';
import { FirebaseModule } from '../firebase/firebase.module';
import { TenantsModule } from '../tenants/tenants.module';
import { TeamController } from './team.controller';
import { TeamService } from './team.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [FirebaseModule, MailModule, TenantsModule],
  controllers: [TeamController],
  providers: [TeamService],
})
export class TeamModule {}
