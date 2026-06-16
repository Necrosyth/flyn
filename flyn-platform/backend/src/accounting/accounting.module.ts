import { Module, forwardRef } from '@nestjs/common';
import { AccountingService } from './accounting.service';
import { AccountingController } from './accounting.controller';
import { HRModule } from '../hr/hr.module';
import { NocoBaseModule } from '../nocobase/nocobase.module';
import { TenantsModule } from '../tenants/tenants.module';
import { MailModule } from '../mail/mail.module';
import { ChannelsModule } from '../channels/channels.module';
import { XeroSyncService } from './xero-sync.service';
import { QuickBooksSyncService } from './quickbooks-sync.service';
import { BankImportService } from './bank-import.service';
import { PayslipService } from './payslip.service';
import { InvoicePDFService } from './invoice-pdf.service';
import { TaxEngineService } from './tax-engine.service';
import { InventoryService } from './inventory.service';
import { StripeService } from './stripe.service';
import { PlaidService } from './plaid.service';
import { CrmModule } from '../crm/crm.module';
import { FirebaseModule } from '../firebase/firebase.module';
import { ChurchModule } from '../church/church.module';

@Module({
  imports: [
    forwardRef(() => HRModule),
    NocoBaseModule,
    forwardRef(() => TenantsModule),
    MailModule,
    forwardRef(() => ChannelsModule),
    forwardRef(() => CrmModule),
    FirebaseModule,
    forwardRef(() => ChurchModule),
  ],
  controllers: [AccountingController],
  providers: [AccountingService, XeroSyncService, QuickBooksSyncService, BankImportService, PayslipService, InvoicePDFService, TaxEngineService, InventoryService, StripeService, PlaidService],
  exports: [AccountingService, XeroSyncService, QuickBooksSyncService, PayslipService, InvoicePDFService, TaxEngineService, InventoryService, StripeService, PlaidService],
})
export class AccountingModule {}
