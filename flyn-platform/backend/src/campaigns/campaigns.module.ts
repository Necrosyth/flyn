import { Module, forwardRef } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { ChannelsModule } from '../channels/channels.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { InboxModule } from '../inbox/inbox.module';

@Module({
  imports: [forwardRef(() => ChannelsModule), FirebaseModule, InboxModule],
  controllers: [CampaignsController],
  providers: [CampaignsService],
  exports: [CampaignsService],
})
export class CampaignsModule {}
