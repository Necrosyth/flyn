import { Module, forwardRef } from '@nestjs/common';
import { HRService } from './hr.service';
import { HRExecutor } from './hr.executor';
import { HRController } from './hr.controller';
import { AIProviderModule } from '../orchestrator/ai-provider';
import { CalendarModule } from '../calendar/calendar.module';
import { ContractsModule } from '../contracts/contracts.module';
import { ChannelsModule } from '../channels/channels.module';
import { MailModule } from '../mail/mail.module';

@Module({
    imports: [AIProviderModule, CalendarModule, ContractsModule, forwardRef(() => ChannelsModule), MailModule],
    controllers: [HRController],
    providers: [HRService, HRExecutor],
    exports: [HRService, HRExecutor],
})
export class HRModule { }
