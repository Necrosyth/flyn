import { Module, forwardRef } from '@nestjs/common';
import { ChurchService } from './church.service';
import { ChurchExecutor } from './church.executor';
import { ChurchController } from './church.controller';
import { AccountingModule } from '../accounting/accounting.module';
import { AIProviderModule } from '../orchestrator/ai-provider';
import { FirebaseModule } from '../firebase/firebase.module';
import { MailModule } from '../mail/mail.module';
import { CalendarModule } from '../calendar/calendar.module';

@Module({
    imports: [forwardRef(() => AccountingModule), AIProviderModule, FirebaseModule, MailModule, CalendarModule],
    controllers: [ChurchController],
    providers: [ChurchService, ChurchExecutor],
    exports: [ChurchService, ChurchExecutor],
})
export class ChurchModule { }
