/**
 * CRM Module
 * 
 * NestJS module for the CRM plugin.
 * Provides contacts, deals, activities management via REST API
 * and a CRM executor for workflow integration.
 */

import { Module, forwardRef } from '@nestjs/common';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CRMExecutor } from './crm.executor';
import { AccountingModule } from '../accounting/accounting.module';
import { AIProviderModule } from '../orchestrator/ai-provider/ai-provider.module';
import { FirebaseModule } from '../firebase/firebase.module';

@Module({
    imports: [forwardRef(() => AccountingModule), AIProviderModule, FirebaseModule],
    controllers: [CrmController],
    providers: [CrmService, CRMExecutor],
    exports: [CrmService, CRMExecutor],
})
export class CrmModule { }
