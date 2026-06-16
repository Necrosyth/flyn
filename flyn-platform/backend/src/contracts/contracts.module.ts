import { Module, forwardRef } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractsController } from './contracts.controller';
import { AIProviderModule } from '../orchestrator/ai-provider';
import { ChannelsModule } from '../channels/channels.module';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [AIProviderModule, forwardRef(() => ChannelsModule), MailModule],
    controllers: [ContractsController],
    providers: [ContractsService],
    exports: [ContractsService],
})
export class ContractsModule {}
