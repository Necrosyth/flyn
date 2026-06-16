import { Module } from '@nestjs/common';
import { CoachesService } from './coaches.service';
import { CoachesExecutor } from './coaches.executor';
import { CoachesController } from './coaches.controller';
import { AccountingModule } from '../accounting/accounting.module';
import { AIProviderModule } from '../orchestrator/ai-provider';

@Module({
    imports: [AccountingModule, AIProviderModule],
    controllers: [CoachesController],
    providers: [CoachesService, CoachesExecutor],
    exports: [CoachesService, CoachesExecutor],
})
export class CoachesModule { }
