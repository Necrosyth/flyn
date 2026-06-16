import { Module, forwardRef } from '@nestjs/common';
import { PhonebookController } from './phonebook.controller';
import { ChannelsModule } from '../channels/channels.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { AIProviderModule } from '../orchestrator/ai-provider/ai-provider.module';
import { PhonebookService } from './phonebook.service';

@Module({
    imports: [FirebaseModule, forwardRef(() => ChannelsModule), AIProviderModule],
    controllers: [PhonebookController],
    providers: [PhonebookService],
    exports: [PhonebookService],
})
export class PhonebookModule {}
