/**
 * Accounting Controller — Global Feature Specification
 * ─────────────────────
 * REST endpoints for the FLYN Accounting module.
 *
 * GET  /api/accounting/invoices              — list invoices
 * POST /api/accounting/invoices              — create invoice (with line items, compliance, FX)
 * POST /api/accounting/invoices/:id          — update invoice
 * DELETE /api/accounting/invoices/:id        — delete invoice
 * POST /api/accounting/invoices/:id/payments — add partial payment
 * GET  /api/accounting/expenses              — list expenses
 * POST /api/accounting/expenses              — create expense
 * DELETE /api/accounting/expenses/:id        — delete expense
 * POST /api/accounting/credit-notes          — issue credit note
 * GET  /api/accounting/credit-notes          — list credit notes
 * POST /api/accounting/recurring/process     — process recurring invoices
 * GET  /api/accounting/fx/convert            — FX currency conversion
 * POST /api/accounting/proforma              — create pro forma invoice
 * GET  /api/accounting/stats                 — KPI stats
 * GET  /api/accounting/analytics             — chart data
 * GET  /api/accounting/insights              — AI insights
 * POST /api/accounting/payroll/run           — run payroll
 * GET  /api/accounting/tax/summary           — tax summary
 */

import {
  Controller, Get, Post, Put, Delete, Param, Body, Query, HttpCode, Logger, Inject, forwardRef, RawBodyRequest, Req, Res, Headers, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';
import { FirebaseAuthGuard } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { TenantFromAuthInterceptor } from '../common/tenant-from-auth.interceptor';
import { Public } from '../billing/guards/public.decorator';
import { AccountingService } from './accounting.service';
import { HRService } from '../hr/hr.service';
import { ChurchService } from '../church/church.service';
import { XeroSyncService } from './xero-sync.service';
import { QuickBooksSyncService } from './quickbooks-sync.service';
import { BankImportService } from './bank-import.service';
import { PayslipService } from './payslip.service';
import { InvoicePDFService } from './invoice-pdf.service';
import { TaxEngineService } from './tax-engine.service';
import { InventoryService } from './inventory.service';
import { StripeService } from './stripe.service';
import { PlaidService } from './plaid.service';

@ApiTags('Accounting')
@Controller('accounting')
@UseGuards(ApiOrFirebaseAuthGuard)
@UseInterceptors(TenantFromAuthInterceptor)
export class AccountingController {
  private readonly logger = new Logger(AccountingController.name);

  constructor(
    private readonly accountingService: AccountingService,
    @Inject(forwardRef(() => HRService)) private readonly hrService: HRService,
    @Inject(forwardRef(() => ChurchService)) private readonly churchService: ChurchService,
    private readonly xeroSync: XeroSyncService,
    private readonly qboSync: QuickBooksSyncService,
    private readonly bankImport: BankImportService,
    private readonly payslipService: PayslipService,
    private readonly invoicePdf: InvoicePDFService,
    private readonly taxEngine: TaxEngineService,
    private readonly inventoryService: InventoryService,
    private readonly stripeService: StripeService,
    private readonly plaidService: PlaidService,
  ) {}

  // ── CRM Sync ───────────────────────────────────────────────────────────────

  @Post('crm-sync')
  async syncAllToCrm(@Headers('x-tenant-id') tenantId: string) {
    return this.accountingService.syncAllInvoicesToCrm(tenantId || 'default');
  }

  // ── Invoices ───────────────────────────────────────────────────────────────

  @Get('invoices')
  async listInvoices(
    @Headers('x-tenant-id') tenantId: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('module') module?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.accountingService.getInvoices({
      search,
      status,
      module,
      limit: limit ? parseInt(limit, 10) : 100,
      tenantId,
    });
    // Return array directly (frontend expects array)
    return result.data;
  }

  @Post('invoices')
  async createInvoice(@Headers('x-tenant-id') tenantId: string, @Body() body: any) {
    return this.accountingService.createInvoice(body, tenantId);
  }

  @Post('invoices/:id')
  async updateInvoice(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string, @Body() body: any) {
    return this.accountingService.updateInvoice(id, body, tenantId);
  }

  @Delete('invoices/:id')
  @HttpCode(200)
  async deleteInvoice(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string) {
    const success = await this.accountingService.deleteInvoice(id, tenantId);
    return { success };
  }

  @Post('invoices/:id/send')
  async sendInvoice(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string) {
    return this.accountingService.sendInvoice(id, tenantId);
  }

  @Post('invoices/:id/checkout')
  async createCheckout(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string, @Req() req: Request, @Body() body?: { amountOverride?: number }) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const baseUrl = `${protocol}://${host}`;
    return this.accountingService.createInvoiceCheckout(id, tenantId, baseUrl, body?.amountOverride);
  }

  /**
   * Public (unauthenticated) customer-facing payment gateway.
   * GET /api/accounting/public/invoices/:invoiceId/pay?tenant=:tenantId
   * Generates a fresh Stripe Checkout session and HTTP 302 redirects the customer.
   */
  @Public()
  @Get('public/invoices/:invoiceId/pay')
  async publicInvoicePay(
    @Param('invoiceId') invoiceId: string,
    @Query('tenant') tenantId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    if (!invoiceId || !tenantId) {
      return res.status(400).json({ error: 'invoiceId and tenant query param are required' });
    }
    try {
      const protocol = req.headers['x-forwarded-proto'] ?? req.protocol;
      const host = req.headers['x-forwarded-host'] ?? req.get('host');
      const baseUrl = `${protocol}://${host}`;
      const checkout = await this.accountingService.createInvoiceCheckout(invoiceId, tenantId, baseUrl);
      return res.redirect(302, checkout.url);
    } catch (err: any) {
      this.logger.error(`Public invoice pay error for ${invoiceId}: ${err.message}`);
      return res.status(400).send(`
        <html><body style="font-family:sans-serif;text-align:center;padding:60px">
          <h2>Payment Unavailable</h2>
          <p>${err.message.includes('not connected') ? 'Payment processing is not yet configured for this business.' : 'This payment link is invalid or has expired.'}</p>
        </body></html>
      `);
    }
  }

  // ── Expenses ───────────────────────────────────────────────────────────────

  @Get('expenses')
  async listExpenses(
    @Headers('x-tenant-id') tenantId: string,
    @Query('limit') limit?: string,
    @Query('category') category?: string,
  ) {
    return this.accountingService.getExpenses({
      limit: limit ? parseInt(limit, 10) : 100,
      category,
      tenantId,
    });
  }

  @Post('expenses')
  async createExpense(@Headers('x-tenant-id') tenantId: string, @Body() body: any) {
    return this.accountingService.createExpense(body, tenantId);
  }

  @Put('expenses/:id')
  async updateExpense(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string, @Body() body: any) {
    return this.accountingService.updateExpense(id, body, tenantId);
  }

  @Delete('expenses/:id')
  @HttpCode(200)
  async deleteExpense(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string) {
    const success = await this.accountingService.deleteExpense(id, tenantId);
    return { success };
  }

  // ── Stats & Analytics ─────────────────────────────────────────────────────

  @Get('stats')
  async getStats(@Headers('x-tenant-id') tenantId: string) {
    return this.accountingService.getStats(tenantId);
  }

  @Get('analytics')
  async getAnalytics(@Headers('x-tenant-id') tenantId: string, @Query('range') range = '30d') {
    return this.accountingService.getAnalytics(range, tenantId);
  }

  @Get('insights')
  async getInsights(@Headers('x-tenant-id') tenantId: string) {
    return this.accountingService.getInsights(tenantId);
  }

  // ── Payroll — pulls from HR employees and creates accounting expenses ────────

  @Post('payroll/run')
  async runPayroll(@Headers('x-tenant-id') tenantId: string, @Body() body: { period: string; currency?: string; salaryMap?: Record<string, number> }) {
    const currency = body.currency ?? 'USD';
    const period = body.period;

    // Fetch all active employees from HR module
    const hrResult = await this.hrService.getEmployees({ limit: 10000, tenantId }).catch(() => ({ data: [] as any[] }));
    const employees = Array.isArray(hrResult) ? hrResult : (hrResult as { data: any[] }).data;
    const active = employees.filter((e: any) => e.status === 'active');

    if (active.length === 0) {
      return { period, currency, status: 'skipped', employeesProcessed: 0, totalPayout: 0, message: 'No active employees found in HR module.' };
    }

    let totalPayout = 0;
    const entries: Array<{ employee: string; salary: number }> = [];
    const missingPayData: Array<{ id: string; name: string }> = [];

    for (const emp of active) {
      // Priority: salaryMap override → employee.salary field → skip (flag as missing)
      const realSalary = Number(emp.salary ?? 0);
      const salary = body.salaryMap?.[emp._id] ?? body.salaryMap?.[emp.name] ?? (realSalary > 0 ? realSalary : null);

      if (!salary) {
        missingPayData.push({ id: emp._id ?? emp.id, name: emp.name });
        continue;
      }

      totalPayout += salary;
      entries.push({ employee: emp.name, salary });

      // Record each employee's pay as an approved expense in accounting
      this.accountingService.createExpense({
        description: `Payroll — ${emp.name} · ${emp.position ?? emp.department} · ${period}`,
        amount: String(salary),
        category: 'Payroll',
        date: new Date().toISOString().slice(0, 10),
        status: 'approved',
        employee: emp.name,
      }, tenantId).catch((err) => this.logger.warn(`Payroll expense failed for ${emp.name}: ${err?.message}`));
    }

    const processed = entries.length;
    const skipped = missingPayData.length;

    return {
      period,
      currency,
      status: processed > 0 ? 'processed' : 'skipped',
      employeesProcessed: processed,
      totalPayout,
      entries,
      missingPayData,
      message: processed > 0
        ? `Payroll processed for ${processed} employee(s). Expenses recorded in Accounting.${skipped > 0 ? ` ${skipped} skipped — no salary data.` : ''}`
        : `No employees with salary data found. Add monthly salary to each employee profile.`,
    };
  }

  // ── Tax Summary (Real Engine) ─────────────────────────────────────────────

  @Get('tax/summary')
  async getTaxSummary(
    @Headers('x-tenant-id') tenantId: string,
    @Query('period') period?: string,
    @Query('country') country?: string,
  ) {
    const [{ data: invoices }, expenses] = await Promise.all([
      this.accountingService.getInvoices({ limit: 10000, tenantId }),
      this.accountingService.getExpenses({ limit: 10000, tenantId }),
    ]);
    return this.taxEngine.generateTaxSummary(
      invoices,
      expenses,
      country ?? 'US',
      period ?? new Date().getFullYear().toString(),
    );
  }

  // ── Credit Notes ──────────────────────────────────────────────────────────

  @Post('credit-notes')
  async createCreditNote(@Body() body: { originalInvoiceId: string; amount: string; reason: string }, @Headers('x-tenant-id') tenantId?: string) {
    return this.accountingService.createCreditNote(body, tenantId);
  }

  @Get('credit-notes')
  async listCreditNotes() {
    return this.accountingService.getCreditNotes();
  }

  // ── Partial Payments ──────────────────────────────────────────────────────

  @Post('invoices/:id/payments')
  async addPartialPayment(@Param('id') id: string, @Body() body: { date: string; amount: string; method: string; reference?: string; notes?: string }) {
    const result = await this.accountingService.addPartialPayment(id, body as any);
    if (!result) return { error: 'Invoice not found' };
    return result;
  }

  // ── Recurring Invoices ────────────────────────────────────────────────────

  @Post('recurring/process')
  async processRecurring() {
    return this.accountingService.processRecurringInvoices();
  }

  // ── FX Conversion ─────────────────────────────────────────────────────────

  @Get('fx/convert')
  async convertCurrency(
    @Query('amount') amount: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.accountingService.convertAmount(parseFloat(amount || '0'), from || 'USD', to || 'AED');
  }

  // ── Pro Forma Invoices ────────────────────────────────────────────────────

  @Post('proforma')
  async createProForma(@Body() body: any) {
    return this.accountingService.createProFormaInvoice(body);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: PAYMENTS & COLLECTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('gateways/:country')
  getGateways(@Param('country') country: string) {
    return this.accountingService.getGatewaysForCountry(country);
  }

  @Get('gateways/:country/route')
  routePayment(@Param('country') country: string, @Query('method') method?: string) {
    return this.accountingService.routePayment(country, method);
  }

  @Post('reconcile')
  async reconcile(@Body() body: { amount: string; date: string; reference: string; method: string }) {
    return this.accountingService.reconcilePayment(body);
  }

  @Get('reconciliation')
  async listReconciliation(@Query('status') status?: string) {
    return this.accountingService.getReconciliationEntries(status);
  }

  @Post('dunning/process')
  async processDunning() {
    return this.accountingService.processDunning();
  }

  @Get('vendor-bills')
  async listVendorBills(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.accountingService.getVendorBills({ status, limit: limit ? parseInt(limit) : 100 });
  }

  @Post('vendor-bills')
  async createVendorBill(@Body() body: any) {
    return this.accountingService.createVendorBill(body);
  }

  @Post('vendor-bills/:id')
  async updateVendorBill(@Param('id') id: string, @Body() body: any) {
    return this.accountingService.updateVendorBill(id, body);
  }

  @Post('vendor-bills/:id/approve')
  async approveVendorBill(@Param('id') id: string, @Body() body: { approver: string }) {
    return this.accountingService.approveVendorBill(id, body.approver ?? 'admin');
  }

  @Delete('vendor-bills/:id')
  @HttpCode(200)
  async deleteVendorBill(@Param('id') id: string) {
    const success = await this.accountingService.deleteVendorBill(id);
    return { success };
  }

  @Post('bulk-payments')
  async createBulkPayment(@Body() body: any) {
    return this.accountingService.createBulkPayment(body);
  }

  @Get('bulk-payments')
  async listBulkPayments() {
    return this.accountingService.getBulkPayments();
  }

  @Post('bulk-payments/:id/approve')
  async approveBulkPayment(@Param('id') id: string) {
    return this.accountingService.approveBulkPayment(id);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: TAX & COMPLIANCE
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('tax-codes')
  @UseGuards(FirebaseAuthGuard)
  async getTaxCodes(@Headers('x-tenant-id') tenantId: string, @Query('country') country?: string) {
    if (country) return this.accountingService.getTaxCodesForCountry(country, tenantId || undefined);
    return this.accountingService.getAllTaxCodes(tenantId || undefined);
  }

  @Post('tax-codes')
  @UseGuards(FirebaseAuthGuard)
  async createTaxCode(@Headers('x-tenant-id') tenantId: string, @Body() body: any) {
    return this.accountingService.createCustomTaxCode(body, tenantId || undefined);
  }

  @Get('tax-codes/:country/default')
  getDefaultTaxCode(@Param('country') country: string) {
    return this.accountingService.getDefaultTaxCode(country) ?? { error: 'No default tax code for this country' };
  }

  @Get('audit-trail')
  @UseGuards(FirebaseAuthGuard)
  async getAuditTrail(
    @Headers('x-tenant-id') tenantId: string,
    @Query('entityId') entityId?: string,
    @Query('entityType') entityType?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountingService.getAuditTrail({ entityId, entityType, limit: limit ? parseInt(limit) : 200, tenantId: tenantId || undefined });
  }

  @Post('documents/archive')
  archiveDocument(@Body() body: { documentType: string; documentId: string; title: string; country: string; searchTags?: string[] }) {
    return this.accountingService.archiveDocument(body as any);
  }

  @Get('documents/archive')
  listArchivedDocuments(@Query('search') search?: string, @Query('documentType') documentType?: string, @Query('limit') limit?: string) {
    return this.accountingService.getArchivedDocuments({ search, documentType, limit: limit ? parseInt(limit) : 100 });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: EXPENSE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('receipts/scan')
  async scanReceipt(@Body() body: any) { return this.accountingService.scanReceipt(body); }

  @Get('receipts')
  async getReceipts(@Query('status') status?: string) { return this.accountingService.getReceiptScans(status); }

  @Post('receipts/:id/approve')
  async approveReceipt(@Param('id') id: string) { return this.accountingService.approveReceiptScan(id); }

  @Get('expense-categories')
  getExpenseCategories(@Query('memberType') memberType?: string) { return this.accountingService.getExpenseCategories(memberType); }

  @Post('expenses/:id/submit-approval')
  async submitExpenseApproval(@Param('id') id: string, @Body() body: { approver: string }) { return this.accountingService.submitExpenseForApproval(id, body.approver); }

  @Post('expense-approvals/:id/approve')
  async approveExpense(@Param('id') id: string, @Body() body: { comments?: string }) { return this.accountingService.approveExpense(id, body.comments); }

  @Get('expense-approvals')
  async getExpenseApprovals(@Query('status') status?: string) { return this.accountingService.getExpenseApprovals(status); }

  @Post('mileage')
  async addMileage(@Body() body: any) { return this.accountingService.addMileageEntry(body); }

  @Get('mileage')
  async getMileage(@Query('employeeId') employeeId?: string) { return this.accountingService.getMileageEntries(employeeId); }

  @Post('petty-cash')
  async addPettyCash(@Body() body: any) { return this.accountingService.addPettyCashEntry(body); }

  @Get('petty-cash')
  getPettyCash() { return this.accountingService.getPettyCashEntries(); }

  @Get('petty-cash/balance')
  getPettyCashBalance() { return this.accountingService.getPettyCashBalance(); }

  @Post('donor-funds')
  async createDonorFund(@Body() body: any) { return this.accountingService.createDonorFund(body); }

  @Get('donor-funds')
  async getDonorFunds() { return this.accountingService.getDonorFunds(); }

  @Post('donor-funds/:id/charge')
  async chargeDonorFund(@Param('id') id: string, @Body() body: { expenseId: string; amount: string }) { return this.accountingService.chargeExpenseToDonorFund(id, body.expenseId, body.amount); }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: PAYROLL MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('payroll/run-advanced')
  async runPayrollAdvanced(@Body() body: any) { return this.accountingService.runPayrollAdvanced(body); }

  @Get('payroll/runs')
  async getPayrollRuns() { return this.accountingService.getPayrollRuns(); }

  @Get('payroll/preview')
  async getPayrollPreview(@Headers('x-tenant-id') tenantId: string) {
    const hrResult = await this.hrService.getEmployees({ limit: 10000, tenantId, status: 'active' }).catch(() => [] as any[]);
    const employees = Array.isArray(hrResult) ? hrResult : (hrResult as any).data ?? [];

    const employeeList = employees.map((e: any) => ({
      id: e.id ?? e._id,
      name: e.name,
      department: e.department,
      position: e.position,
      salary: Number(e.salary ?? 0),
    }));

    const withSalary = employeeList.filter((e: any) => e.salary > 0);
    const missingPayData = employeeList.filter((e: any) => e.salary === 0);

    const totalGross = withSalary.reduce((sum: number, e: any) => sum + e.salary, 0);
    const deductionRate = 0.2765; // ~20% federal + 7.65% FICA (US default)
    const totalDeductions = Math.round(totalGross * deductionRate);
    const totalNet = totalGross - totalDeductions;

    return {
      employeeCount: employees.length,
      totalGross,
      totalDeductions,
      totalNet,
      employeeList,
      missingPayData,
      currency: 'USD',
      period: new Date().toISOString().slice(0, 7),
      status: 'preview',
    };
  }

  @Get('payroll/deductions/:country')
  getPayrollDeductions(@Param('country') country: string) { return this.accountingService.getPayrollDeductions(country); }

  @Post('payroll/eosb')
  calculateEOSB(@Body() body: any) { return this.accountingService.calculateEOSB(body); }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: FINANCIAL REPORTING
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('reports/pnl')
  async getProfitAndLoss(@Query('period') period?: string, @Query('currency') currency?: string) { return this.accountingService.generateProfitAndLoss(period, currency); }

  @Get('reports/cash-flow')
  async getCashFlow(@Query('currency') currency?: string) { return this.accountingService.generateCashFlowForecast(currency); }

  @Get('reports/ar-aging')
  async getARAging() { return this.accountingService.generateARAgingReport(); }

  @Post('ai/respond')
  async aiRespond(@Body() body: { query: string; category?: string }) {
    return this.accountingService.generateAINarrative(body.query);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6B: PLAID BANK CONNECTIVITY
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('plaid/status')
  async plaidStatus(@Headers('x-tenant-id') tenantId: string) {
    return this.plaidService.getStatus(tenantId || 'default');
  }

  @Post('plaid/link-token')
  async plaidLinkToken(@Body() body: { userId?: string }, @Headers('x-tenant-id') tenantId: string) {
    try {
      const r = await this.plaidService.createLinkToken(tenantId || 'default', body.userId);
      return { success: true, ...r };
    } catch (err: any) {
      this.logger.error(`[plaid] link-token endpoint error tenant=${tenantId}: ${err.message}`);
      return { success: false, error: err.message ?? 'Failed to create link token' };
    }
  }

  @Post('plaid/exchange')
  async plaidExchange(@Body() body: { publicToken: string; metadata?: any }, @Headers('x-tenant-id') tenantId: string) {
    try {
      const r = await this.plaidService.exchangePublicToken(tenantId || 'default', body.publicToken, body.metadata);
      return { success: true, ...r };
    } catch (err: any) {
      this.logger.error(`[plaid] exchange endpoint error tenant=${tenantId}: ${err.message}`);
      return { success: false, error: err.message ?? 'Failed to connect bank' };
    }
  }

  @Get('plaid/accounts')
  async plaidAccounts(@Headers('x-tenant-id') tenantId: string) {
    return this.plaidService.getAccounts(tenantId || 'default');
  }

  @Get('plaid/balances')
  async plaidBalances(@Headers('x-tenant-id') tenantId: string) {
    return this.plaidService.getBalances(tenantId || 'default');
  }

  @Get('plaid/transactions')
  async plaidTransactions(
    @Headers('x-tenant-id') tenantId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.plaidService.getTransactions(tenantId || 'default', startDate, endDate);
  }

  @Post('plaid/disconnect')
  async plaidDisconnect(@Headers('x-tenant-id') tenantId: string) {
    return this.plaidService.disconnect(tenantId || 'default');
  }

  @Public()
  @Post('plaid/webhook')
  @HttpCode(200)
  async plaidWebhook(@Body() body: any) {
    await this.plaidService.handleWebhook(body);
    return { received: true };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: BANK & ACCOUNT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('bank-accounts')
  async createBankAccount(@Body() body: any) { return this.accountingService.createBankAccount(body); }

  @Get('bank-accounts')
  async getBankAccounts() { return this.accountingService.getBankAccounts(); }

  @Post('bank-transactions')
  async addBankTransaction(@Body() body: any) { return this.accountingService.addBankTransaction(body); }

  @Get('bank-transactions')
  async getBankTransactions(@Query('accountId') accountId?: string, @Query('reconciled') reconciled?: string) {
    return this.accountingService.getBankTransactions(accountId, reconciled === 'true' ? true : reconciled === 'false' ? false : undefined);
  }

  @Post('bank-transactions/:id/reconcile')
  async reconcileBankTxn(@Param('id') id: string, @Body() body: { invoiceId?: string; expenseId?: string }) { return this.accountingService.reconcileBankTransaction(id, body.invoiceId, body.expenseId); }

  @Post('intercompany-transfers')
  async createIntercompanyTransfer(@Body() body: any) { return this.accountingService.createIntercompanyTransfer(body); }

  @Get('intercompany-transfers')
  async getIntercompanyTransfers() { return this.accountingService.getIntercompanyTransfers(); }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: SUBSCRIPTIONS & RECURRING REVENUE
  // ═══════════════════════════════════════════════════════════════════════════

  @UseGuards(FirebaseAuthGuard)
  @Post('subscription-plans')
  async createPlan(@Headers('x-tenant-id') tenantId: string, @Body() body: any) { return this.accountingService.createSubscriptionPlan(body, tenantId); }

  @UseGuards(FirebaseAuthGuard)
  @Get('subscription-plans')
  async getPlans(@Headers('x-tenant-id') tenantId: string) { return this.accountingService.getSubscriptionPlans(tenantId); }

  @Get('subscription-plans/:id/price/:country')
  getLocalizedPrice(@Param('id') id: string, @Param('country') country: string) { return this.accountingService.getLocalizedPrice(id, country); }

  @UseGuards(FirebaseAuthGuard)
  @Post('subscriptions')
  async createSubscription(@Headers('x-tenant-id') tenantId: string, @Body() body: any) { return this.accountingService.createSubscription(body, tenantId); }

  @UseGuards(FirebaseAuthGuard)
  @Get('subscriptions')
  async getSubscriptions(@Headers('x-tenant-id') tenantId: string, @Query('status') status?: string) { return this.accountingService.getSubscriptions(status, tenantId); }

  @UseGuards(FirebaseAuthGuard)
  @Post('subscriptions/:id/cancel')
  async cancelSubscription(@Headers('x-tenant-id') tenantId: string, @Param('id') id: string) { return this.accountingService.cancelSubscription(id, tenantId); }

  @Post('subscriptions/prorate')
  calculateProration(@Body() body: any) { return this.accountingService.calculateProration(body); }

  @UseGuards(FirebaseAuthGuard)
  @Post('coupons')
  async createCoupon(@Headers('x-tenant-id') tenantId: string, @Body() body: any) { return this.accountingService.createCoupon(body, tenantId); }

  @UseGuards(FirebaseAuthGuard)
  @Get('coupons')
  async getCoupons(@Headers('x-tenant-id') tenantId: string) { return this.accountingService.getCoupons(tenantId); }

  @UseGuards(FirebaseAuthGuard)
  @Post('coupons/:id/deactivate')
  deactivateCoupon(@Param('id') id: string, @Headers('x-tenant-id') tenantId: string) { return this.accountingService.deactivateCoupon(id, tenantId); }

  @UseGuards(FirebaseAuthGuard)
  @Post('coupons/apply')
  async applyCoupon(@Headers('x-tenant-id') tenantId: string, @Body() body: { code: string; amount: number; country?: string }) { return this.accountingService.applyCoupon(body.code, body.amount, tenantId, body.country); }

  @Get('churn-metrics')
  async getChurnMetrics(@Headers('x-tenant-id') tenantId: string) { return this.accountingService.getChurnMetrics(tenantId); }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: INTEGRATIONS & FLYN AI ECOSYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('webhooks')
  async registerWebhook(@Body() body: any) { return this.accountingService.registerWebhook(body); }

  @Get('webhooks')
  async getWebhooks() { return this.accountingService.getWebhooks(); }

  @Delete('webhooks/:id')
  async deleteWebhook(@Param('id') id: string) { return this.accountingService.deleteWebhook(id); }

  @Post('integrations/sync')
  async syncIntegration(@Body() body: any) { return this.accountingService.syncFromIntegration(body); }

  @Get('integrations/sync')
  async getIntegrationSyncs(@Query('source') source?: string) { return this.accountingService.getIntegrationSyncs(source); }

  @Post('integrations/external')
  async configureExternalSync(@Body() body: any) { return this.accountingService.configureExternalSync(body); }

  @Get('integrations/external')
  async getExternalSyncs() { return this.accountingService.getExternalSyncs(); }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 10: ROLES, PERMISSIONS & MULTI-ENTITY
  // ═══════════════════════════════════════════════════════════════════════════

  @Get('permissions/:role')
  getPermissions(@Param('role') role: string) { return this.accountingService.getPermissionsForRole(role as any); }

  @Get('permissions/:role/check/:permission')
  checkPermission(@Param('role') role: string, @Param('permission') permission: string) { return { allowed: this.accountingService.checkPermission(role as any, permission as any) }; }

  @Post('approval-chains')
  async createApprovalChain(@Body() body: any) { return this.accountingService.createApprovalChain(body); }

  @Get('approval-chains')
  async getApprovalChains() { return this.accountingService.getApprovalChains(); }

  @Get('approval-chains/check')
  checkApproval(@Query('entityType') entityType: string, @Query('amount') amount: string) { return this.accountingService.checkApprovalRequired(entityType, parseFloat(amount || '0')); }

  @Post('entities')
  @UseGuards(FirebaseAuthGuard)
  async createEntity(
    @Headers('x-tenant-id') tenantId: string,
    @Body() body: any,
  ) {
    return this.accountingService.createLegalEntity(body, tenantId || 'default');
  }

  @Get('entities')
  @UseGuards(FirebaseAuthGuard)
  async getEntities(@Headers('x-tenant-id') tenantId: string) {
    return this.accountingService.getLegalEntities(tenantId || 'default');
  }

  @Delete('entities/:id')
  @UseGuards(FirebaseAuthGuard)
  @HttpCode(200)
  async deleteEntity(
    @Param('id') id: string,
    @Headers('x-tenant-id') tenantId: string,
  ) {
    const success = await this.accountingService.deleteLegalEntity(id, tenantId || 'default');
    return { success };
  }

  @Post('accountant-invites')
  async inviteAccountant(@Body() body: any) { return this.accountingService.inviteAccountant(body); }

  @Get('accountant-invites')
  async getAccountantInvites() { return this.accountingService.getAccountantInvites(); }

  @Post('accountant-invites/:id/revoke')
  async revokeInvite(@Param('id') id: string) { return this.accountingService.revokeAccountantInvite(id); }

  @Post('export-log')
  logExport(@Body() body: any) { return this.accountingService.logExport(body); }

  @Get('export-log')
  getExportLogs(@Query('userId') userId?: string) { return this.accountingService.getExportLogs(userId); }

  @Get('country-config/:code')
  getCountryConfig(@Param('code') code: string) { return this.accountingService.getCountryConfig(code); }

  @Get('country-configs')
  getAllCountryConfigs() { return this.accountingService.getAllCountryConfigs(); }

  @Get('data-region/:code')
  getDataRegion(@Param('code') code: string) { return { country: code, region: this.accountingService.getDataRegion(code) }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 11: XERO SYNC
  // ═══════════════════════════════════════════════════════════════════════════

  /** GET /api/accounting/xero/status?tenantId=xxx — Connection status */
  @Get('xero/status')
  @UseGuards(FirebaseAuthGuard)
  async xeroStatus(@Headers('x-tenant-id') headerTenant: string, @Query('tenantId') queryTenant: string) {
    const tenantId = headerTenant || queryTenant;
    if (!tenantId) return { error: 'tenantId required' };
    return this.xeroSync.getConnectionStatus(tenantId);
  }

  /** POST /api/accounting/xero/disconnect — Remove Xero OAuth tokens */
  @Post('xero/disconnect')
  @UseGuards(FirebaseAuthGuard)
  async xeroDisconnect(@Headers('x-tenant-id') headerTenant: string, @Query('tenantId') queryTenant: string) {
    const tenantId = headerTenant || queryTenant;
    if (!tenantId) return { error: 'tenantId required' };
    return this.xeroSync.disconnect(tenantId);
  }

  /** GET /api/accounting/xero/accounts?tenantId=xxx — Chart of Accounts from Xero */
  @Get('xero/accounts')
  async xeroAccounts(@Query('tenantId') tenantId: string) {
    if (!tenantId) return { error: 'tenantId required' };
    return this.xeroSync.getXeroAccounts(tenantId);
  }

  /** POST /api/accounting/xero/push-invoice — Push a Flyn invoice to Xero */
  @Post('xero/push-invoice')
  async xeroPushInvoice(
    @Body() body: { tenantId?: string; invoiceId: string; accountMap?: Record<string, string> },
    @Headers('x-tenant-id') headerTenantId?: string,
  ) {
    const tenantId = body.tenantId || headerTenantId;
    const { invoiceId, accountMap } = body;
    if (!tenantId || !invoiceId) return { error: 'tenantId and invoiceId required' };
    const { data: invoices } = await this.accountingService.getInvoices({ limit: 10000 });
    const invoice = invoices.find(i => i._id === invoiceId || (i as any).id === invoiceId);
    if (!invoice) return { error: `Invoice ${invoiceId} not found` };
    const result = await this.xeroSync.pushInvoice(tenantId, invoice, accountMap);
    if (result?.success) await this.accountingService.markExternalSync(invoiceId, 'xero');
    return result;
  }

  /** POST /api/accounting/xero/push-all — Bulk push all un-synced invoices to Xero */
  @Post('xero/push-all')
  async xeroPushAll(
    @Body() body: { tenantId?: string; accountMap?: Record<string, string>; force?: boolean },
    @Headers('x-tenant-id') headerTenantId?: string,
  ) {
    const tenantId = body.tenantId || headerTenantId;
    if (!tenantId) return { error: 'tenantId required' };
    const { data: invoices } = await this.accountingService.getInvoices({ limit: 10000 });
    const result = await this.xeroSync.pushAllInvoices(tenantId, invoices, body.accountMap, body.force);
    // Mark ONLY the invoices that actually pushed successfully (not all un-synced ones)
    await Promise.allSettled(result.syncedIds.map(id => this.accountingService.markExternalSync(id, 'xero')));
    return result;
  }

  /** POST /api/accounting/xero/pull-payments — Pull payments from Xero → reconcile in Flyn */
  @Post('xero/pull-payments')
  async xeroPullPayments(@Body() body: { tenantId: string; since?: string }) {
    const { tenantId, since } = body;
    if (!tenantId) return { error: 'tenantId required' };
    const payments = await this.xeroSync.pullPayments(tenantId, since ? new Date(since) : undefined);
    // Auto-reconcile each pulled payment
    const results = await Promise.allSettled(
      payments.map(p =>
        this.accountingService.reconcilePayment({
          amount: String(p.amount),
          date: p.date,
          reference: p.paymentId,
          method: 'bank_transfer',
        })
      )
    );
    return { pulled: payments.length, reconciled: results.filter(r => r.status === 'fulfilled').length, payments };
  }

  /** POST /api/accounting/xero/push-contact — Push a CRM contact to Xero */
  @Post('xero/push-contact')
  async xeroPushContact(@Body() body: { tenantId: string; name: string; email?: string; phone?: string; taxNumber?: string }) {
    if (!body.tenantId) return { error: 'tenantId required' };
    const contactId = await this.xeroSync.pushContact(body.tenantId, { name: body.name, email: body.email, phone: body.phone, taxNumber: body.taxNumber });
    return { success: !!contactId, xeroContactId: contactId };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 12: QUICKBOOKS SYNC
  // ═══════════════════════════════════════════════════════════════════════════

  /** GET /api/accounting/quickbooks/status?tenantId=xxx — Connection status */
  @Get('quickbooks/status')
  @UseGuards(FirebaseAuthGuard)
  async qboStatus(@Headers('x-tenant-id') headerTenant: string, @Query('tenantId') queryTenant: string) {
    const tenantId = headerTenant || queryTenant;
    if (!tenantId) return { error: 'tenantId required' };
    return this.qboSync.getConnectionStatus(tenantId);
  }

  /** POST /api/accounting/quickbooks/disconnect — Remove QuickBooks OAuth tokens */
  @Post('quickbooks/disconnect')
  @UseGuards(FirebaseAuthGuard)
  async qboDisconnect(@Headers('x-tenant-id') headerTenant: string, @Query('tenantId') queryTenant: string) {
    const tenantId = headerTenant || queryTenant;
    if (!tenantId) return { error: 'tenantId required' };
    return this.qboSync.disconnect(tenantId);
  }

  /** GET /api/accounting/stripe/status — Connection status (tenantId from header or query fallback) */
  @Get('stripe/status')
  async stripeStatus(@Query('tenantId') tenantId: string) {
    if (!tenantId) return { error: 'tenantId required' };
    return this.stripeService.getConnectionStatus(tenantId);
  }

  /** POST /api/accounting/stripe/disconnect — Remove Stripe OAuth tokens */
  @Post('stripe/disconnect')
  @UseGuards(FirebaseAuthGuard)
  async stripeDisconnect(@Headers('x-tenant-id') headerTenant: string, @Query('tenantId') queryTenant: string) {
    const tenantId = headerTenant || queryTenant;
    if (!tenantId) return { error: 'tenantId required' };
    return this.stripeService.disconnectAccount(tenantId);
  }

  /** POST /api/accounting/quickbooks/push-invoice — Push a Flyn invoice to QBO */
  @Post('quickbooks/push-invoice')
  async qboPushInvoice(
    @Body() body: { tenantId?: string; invoiceId: string },
    @Headers('x-tenant-id') headerTenantId?: string,
  ) {
    const tenantId = body.tenantId || headerTenantId;
    const { invoiceId } = body;
    if (!tenantId || !invoiceId) return { error: 'tenantId and invoiceId required' };
    const { data: invoices } = await this.accountingService.getInvoices({ limit: 10000 });
    const invoice = invoices.find(i => i._id === invoiceId || (i as any).id === invoiceId);
    if (!invoice) return { error: `Invoice ${invoiceId} not found` };
    const result = await this.qboSync.pushInvoice(tenantId, invoice);
    if (result?.success) await this.accountingService.markExternalSync(invoiceId, 'qbo');
    return result;
  }

  /** POST /api/accounting/quickbooks/push-all — Bulk push all un-synced invoices to QBO */
  @Post('quickbooks/push-all')
  async qboPushAll(
    @Body() body: { tenantId?: string; force?: boolean },
    @Headers('x-tenant-id') headerTenantId?: string,
  ) {
    const tenantId = body.tenantId || headerTenantId;
    if (!tenantId) return { error: 'tenantId required' };
    const { data: invoices } = await this.accountingService.getInvoices({ limit: 10000 });
    const result = await this.qboSync.pushAllInvoices(tenantId, invoices, body.force);
    // Mark ONLY the invoices that actually pushed successfully (not all un-synced ones)
    await Promise.allSettled(result.syncedIds.map(id => this.accountingService.markExternalSync(id, 'qbo')));
    return result;
  }

  /** POST /api/accounting/quickbooks/pull-payments — Pull payments from QBO */
  @Post('quickbooks/pull-payments')
  async qboPullPayments(@Body() body: { tenantId: string; since?: string }) {
    const { tenantId, since } = body;
    if (!tenantId) return { error: 'tenantId required' };
    const payments = await this.qboSync.pullPayments(tenantId, since ? new Date(since) : undefined);
    const results = await Promise.allSettled(
      payments.map(p =>
        this.accountingService.reconcilePayment({
          amount: String(p.amount),
          date: p.date,
          reference: p.id,
          method: 'bank_transfer',
        })
      )
    );
    return { pulled: payments.length, reconciled: results.filter(r => r.status === 'fulfilled').length, payments };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 13: BANK STATEMENT IMPORT
  // ═══════════════════════════════════════════════════════════════════════════

  /** POST /api/accounting/bank-import/csv — Import bank statement from CSV text */
  @Post('bank-import/csv')
  async importBankCSV(@Body() body: { content: string; format?: string; accountId?: string; matchingRules?: Array<{ pattern: string; category: string }> }) {
    const result = this.bankImport.parseCSV(body.content, (body.format ?? 'standard') as any);

    // Auto-categorize and optionally apply custom matching rules
    const transactions = result.transactions.map(txn => {
      const customCategory = body.matchingRules
        ? this.bankImport.applyMatchingRule(txn.description, body.matchingRules!)
        : null;
      const category = customCategory ?? this.bankImport.autoCategory(txn.description);
      return { ...txn, category };
    });

    // Persist each transaction as a bank transaction
    if (body.accountId) {
      await Promise.allSettled(
        transactions.map(txn =>
          this.accountingService.addBankTransaction({
            accountId: body.accountId,
            date: txn.date,
            description: txn.description,
            amount: txn.amount,
            type: txn.type,
            category: txn.category,
            reference: txn.reference,
            reconciled: false,
          })
        )
      );
    }

    return { ...result, transactions };
  }

  /** POST /api/accounting/bank-import/ofx — Import bank statement from OFX format */
  @Post('bank-import/ofx')
  async importBankOFX(@Body() body: { content: string; accountId?: string }) {
    const result = this.bankImport.parseOFX(body.content);

    const transactions = result.transactions.map(txn => ({
      ...txn,
      category: this.bankImport.autoCategory(txn.description),
    }));

    if (body.accountId) {
      await Promise.allSettled(
        transactions.map(txn =>
          this.accountingService.addBankTransaction({
            accountId: body.accountId,
            date: txn.date,
            description: txn.description,
            amount: txn.amount,
            type: txn.type,
            category: txn.category,
            reference: txn.reference,
            reconciled: false,
          })
        )
      );
    }

    return { ...result, transactions };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 14: PAYSLIPS
  // ═══════════════════════════════════════════════════════════════════════════

  /** POST /api/accounting/payslips/generate — Generate a payslip JSON */
  @Post('payslips/generate')
  generatePayslip(@Body() body: any) {
    return this.payslipService.generatePayslip(body);
  }

  /** POST /api/accounting/payslips/html — Generate a full HTML payslip */
  @Post('payslips/html')
  generatePayslipHTML(@Body() body: any) {
    const payslip = this.payslipService.generatePayslip(body);
    const html = this.payslipService.generateHTML(payslip);
    return { payslip, html };
  }

  /** POST /api/accounting/payroll/run-with-payslips — Run payroll AND generate payslips */
  @Post('payroll/run-with-payslips')
  async runPayrollWithPayslips(@Body() body: {
    period: string;
    country: string;
    currency: string;
    companyName: string;
    companyAddress?: string;
    employees: Array<{
      employeeId: string;
      employeeName: string;
      designation?: string;
      department?: string;
      basicSalary: number;
      allowances?: Array<{ name: string; amount: number }>;
      overtimeHours?: number;
      bankName?: string;
      accountNumber?: string;
    }>;
  }) {
    const payslips = body.employees.map(emp =>
      this.payslipService.generatePayslip({
        ...emp,
        period: body.period,
        country: body.country,
        currency: body.currency,
        companyName: body.companyName,
        companyAddress: body.companyAddress,
      })
    );

    const totalGross = payslips.reduce((s, p) => s + p.grossSalary, 0);
    const totalNet = payslips.reduce((s, p) => s + p.netPay, 0);
    const totalDeductions = payslips.reduce((s, p) => s + p.totalDeductions, 0);
    const totalEmployerCost = payslips.reduce((s, p) => s + p.totalEmployerCost, 0);

    // Record payroll as expense
    await this.accountingService.createExpense({
      description: `Payroll Run — ${body.period} · ${body.employees.length} employees`,
      amount: String(totalNet),
      category: 'Payroll',
      date: new Date().toISOString().slice(0, 10),
      status: 'approved',
    }).catch(err => this.logger.warn(`Payroll expense record failed: ${err?.message}`));

    return {
      period: body.period,
      country: body.country,
      currency: body.currency,
      employeeCount: body.employees.length,
      totalGross: parseFloat(totalGross.toFixed(2)),
      totalDeductions: parseFloat(totalDeductions.toFixed(2)),
      totalNet: parseFloat(totalNet.toFixed(2)),
      totalEmployerCost: parseFloat(totalEmployerCost.toFixed(2)),
      payslips,
    };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 15: INVOICE PDF
  // ═══════════════════════════════════════════════════════════════════════════

  /** POST /api/accounting/invoices/:id/pdf — Generate HTML/PDF for a specific invoice */
  @Post('invoices/:id/pdf')
  async generateInvoicePDF(
    @Param('id') id: string,
    @Body() options: {
      companyName: string;
      companyAddress?: string;
      companyEmail?: string;
      companyPhone?: string;
      logoUrl?: string;
      primaryColor?: string;
      vatNumber?: string;
      registrationNumber?: string;
      ein?: string;
    }
  ) {
    const { data: invoices } = await this.accountingService.getInvoices({ limit: 10000 });
    const invoice = invoices.find(i => i._id === id);
    if (!invoice) return { error: 'Invoice not found' };
    const html = this.invoicePdf.generateHTML(invoice, options);
    return { invoiceId: id, invoiceNumber: invoice.invoice, html };
  }

  /** POST /api/accounting/invoices/pdf/preview — Generate PDF HTML for preview (body has invoice + company) */
  @Post('invoices/pdf/preview')
  generateInvoicePreview(@Body() body: { invoice: any; company: any }) {
    const html = this.invoicePdf.generateHTML(body.invoice, body.company ?? {});
    return { html };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 16: TAX ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  /** POST /api/accounting/tax/calculate — Dynamic tax calculation */
  @Post('tax/calculate')
  calculateTax(@Body() body: {
    amount: number;
    currency: string;
    country: string;
    state?: string;
    productType?: 'service' | 'goods' | 'digital' | 'food' | 'medical';
    isB2B?: boolean;
    customerCountry?: string;
    hsnCode?: string;
  }) {
    return this.taxEngine.calculateTax(body);
  }

  /** POST /api/accounting/tax/vat-return — Generate a VAT Return report */
  @Post('tax/vat-return')
  async generateVATReturn(@Body() body: {
    period: string;
    country: string;
    currency: string;
    vatRate?: number;
  }) {
    const [{ data: invoices }, expenses] = await Promise.all([
      this.accountingService.getInvoices({ limit: 10000 }),
      this.accountingService.getExpenses({ limit: 10000 }),
    ]);
    return this.taxEngine.generateVATReturn(invoices, expenses, body);
  }

  /** POST /api/accounting/tax/gst-filing — Generate India GST filing report */
  @Post('tax/gst-filing')
  async generateGSTFiling(@Body() body: { period: string; gstin: string; currency?: string }) {
    const [{ data: invoices }, expenses] = await Promise.all([
      this.accountingService.getInvoices({ limit: 10000 }),
      this.accountingService.getExpenses({ limit: 10000 }),
    ]);
    return this.taxEngine.generateGSTFiling(invoices, expenses, { ...body, currency: body.currency ?? 'INR' });
  }

  /** POST /api/accounting/tax/zatca/:invoiceId — Get ZATCA e-invoice compliance fields for KSA */
  @Post('tax/zatca/:invoiceId')
  async getZATCAFields(@Param('invoiceId') invoiceId: string) {
    const { data: invoices } = await this.accountingService.getInvoices({ limit: 10000 });
    const invoice = invoices.find(i => i._id === invoiceId);
    if (!invoice) return { error: 'Invoice not found' };
    return this.taxEngine.generateZATCAFields(invoice);
  }

  /** GET /api/accounting/tax/rates/us-states — US state sales tax rates (state only) */
  @Get('tax/rates/us-states')
  getUSStateTaxRates() {
    return this.taxEngine.getAllStateTaxRates();
  }

  /** GET /api/accounting/tax/rates/eu — EU VAT rates */
  @Get('tax/rates/eu')
  getEUVATRates() {
    return this.taxEngine.getEUVATRates();
  }

  /** GET /api/accounting/tax/codes/:country — Country-specific tax codes */
  @Get('tax/codes/:country')
  getTaxCodesByCountry(@Param('country') country: string) {
    return this.taxEngine.getTaxCodesForCountry(country);
  }

  /** GET /api/accounting/tax/us/nexus-thresholds — Economic nexus thresholds for all US states */
  @Get('tax/us/nexus-thresholds')
  getUSNexusThresholds() {
    return this.taxEngine.getNexusThresholds();
  }

  /** GET /api/accounting/tax/us/nexus-thresholds/:state — Nexus threshold for a specific state */
  @Get('tax/us/nexus-thresholds/:state')
  getUSNexusThreshold(@Param('state') state: string) {
    const threshold = this.taxEngine.getNexusThreshold(state);
    if (!threshold) return { error: `No economic nexus law found for state ${state.toUpperCase()}` };
    return { state: state.toUpperCase(), ...threshold };
  }

  /** POST /api/accounting/tax/us/nexus-check — Check if you have nexus in a specific state */
  @Post('tax/us/nexus-check')
  checkUSNexus(@Body() body: { state: string; annualRevenueUSD: number; transactionCount: number }) {
    if (!body.state) return { error: 'state required (e.g. "CA")' };
    return this.taxEngine.checkUSNexus(body.state, body.annualRevenueUSD ?? 0, body.transactionCount ?? 0);
  }

  /** GET /api/accounting/tax/us/nexus-report — Multi-state nexus exposure from your invoices */
  @Get('tax/us/nexus-report')
  async getUSNexusReport(@Headers('x-tenant-id') tenantId: string) {
    const { data: invoices } = await this.accountingService.getInvoices({ limit: 10000, tenantId });
    return this.taxEngine.generateUSNexusReport(invoices);
  }

  /** GET /api/accounting/tax/us/filing-deadlines — Filing deadlines for all states */
  @Get('tax/us/filing-deadlines')
  getUSFilingDeadlines() {
    return this.taxEngine.getUSFilingDeadlines();
  }

  /** POST /api/accounting/tax/us/estimated-tax — Quarterly estimated tax for self-employed / small biz */
  @Post('tax/us/estimated-tax')
  calculateUSEstimatedTax(@Body() body: {
    annualNetIncome: number;
    filingStatus?: 'single' | 'married_joint' | 'married_sep' | 'head_of_household';
  }) {
    if (!body.annualNetIncome) return { error: 'annualNetIncome required' };
    return this.taxEngine.calculateUSEstimatedTax(body.annualNetIncome, body.filingStatus ?? 'single');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 17: INVENTORY MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('inventory/items')
  async createStockItem(@Body() body: any) {
    return this.inventoryService.createStockItem(body);
  }

  @Get('inventory/items')
  async getStockItems(
    @Query('search') search?: string,
    @Query('category') category?: string,
    @Query('lowStock') lowStock?: string,
  ) {
    return this.inventoryService.getStockItems({ search, category, lowStockOnly: lowStock === 'true' });
  }

  @Get('inventory/items/:id')
  async getStockItem(@Param('id') id: string) {
    const item = await this.inventoryService.getStockItem(id);
    if (!item) return { error: 'Stock item not found' };
    return item;
  }

  @Post('inventory/items/:id')
  async updateStockItem(@Param('id') id: string, @Body() body: any) {
    const updated = await this.inventoryService.updateStockItem(id, body);
    if (!updated) return { error: 'Stock item not found' };
    return updated;
  }

  @Post('inventory/items/:id/adjust')
  async adjustStock(@Param('id') id: string, @Body() body: {
    quantity: number;
    type: 'purchase' | 'sale' | 'adjustment' | 'transfer_in' | 'transfer_out' | 'write_off';
    unitCost?: number;
    reference?: string;
    fromLocation?: string;
    toLocation?: string;
    notes?: string;
  }) {
    return this.inventoryService.adjustStock(id, body.quantity, body.type, body);
  }

  @Post('inventory/deduct-for-invoice')
  async deductStockForInvoice(@Body() body: { invoiceId: string; lineItems: Array<{ sku: string; quantity: number }> }) {
    return this.inventoryService.deductStockForInvoice(body.invoiceId, body.lineItems);
  }

  @Get('inventory/movements')
  getStockMovements(@Query('stockItemId') stockItemId?: string, @Query('limit') limit?: string) {
    return this.inventoryService.getStockMovements(stockItemId, limit ? parseInt(limit) : 100);
  }

  @Get('inventory/valuation')
  getInventoryValuation() {
    return this.inventoryService.getInventoryValuation();
  }

  @Get('inventory/low-stock')
  getLowStockAlerts() {
    return this.inventoryService.getLowStockAlerts();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 18: FIXED ASSETS & DEPRECIATION
  // ═══════════════════════════════════════════════════════════════════════════

  @Post('assets')
  async createAsset(@Body() body: any) {
    return this.inventoryService.createAsset(body);
  }

  @Get('assets')
  async getAssets(@Query('status') status?: string, @Query('category') category?: string) {
    return this.inventoryService.getAssets({ status, category });
  }

  @Get('assets/summary')
  getAssetRegisterSummary() {
    return this.inventoryService.getAssetRegisterSummary();
  }

  @Get('assets/:id')
  async getAsset(@Param('id') id: string) {
    const asset = await this.inventoryService.getAsset(id);
    if (!asset) return { error: 'Asset not found' };
    return asset;
  }

  @Get('assets/:id/schedule')
  getDepreciationSchedule(@Param('id') id: string) {
    const schedule = this.inventoryService.generateDepreciationSchedule(id);
    if (!schedule) return { error: 'Asset not found' };
    return schedule;
  }

  @Post('assets/depreciation/process')
  processDepreciation(@Body() body: { period: string }) {
    if (!body.period) return { error: 'period required (e.g. "2026-04")' };
    const entries = this.inventoryService.processMonthlyDepreciation(body.period);
    return { period: body.period, processedAssets: entries.length, entries };
  }

  @Get('assets/:id/depreciation-entries')
  getAssetDepreciation(@Param('id') id: string) {
    return this.inventoryService.getDepreciationEntries(id);
  }

  @Post('assets/:id/dispose')
  async disposeAsset(@Param('id') id: string, @Body() body: { disposalDate: string; disposalValue: number }) {
    const asset = await this.inventoryService.disposeAsset(id, body.disposalDate, body.disposalValue ?? 0);
    if (!asset) return { error: 'Asset not found' };
    return asset;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 19: STRIPE INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════════

  /** POST /api/accounting/stripe/webhook — Receive & verify Stripe events */
  @Public()
  @Post('stripe/webhook')
  @HttpCode(200)
  async stripeWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') sig: string,
  ) {
    const rawBody = (req as any).rawBody ?? req.body;
    const event = this.stripeService.constructWebhookEvent(rawBody, sig);
    if (!event) return { error: 'Invalid signature' };

    // Handle church recurring donations: every Stripe charge for a church subscription
    // auto-records in the church donation ledger so the church admin sees it.
    if (event.type === 'invoice.paid') {
      const invoice = event.data.object as any;
      const meta = invoice.subscription_details?.metadata ?? invoice.metadata ?? {};
      if (meta.type === 'church_recurring_donation') {
        const amountPaid = Number(invoice.amount_paid ?? 0) / 100;
        if (amountPaid > 0) {
          this.churchService.recordDonation({
            memberName: meta.donorName || 'Online Donor',
            amount: amountPaid,
            fund: meta.fund ?? 'General',
            type: 'recurring',
            frequency: meta.frequency ?? '',
            notes: `[STRIPE_AUTO] Recurring giving — subscription ${invoice.subscription ?? ''}`,
            date: new Date((invoice.status_transitions?.paid_at ?? invoice.created) * 1000).toISOString().slice(0, 10),
          }).catch(err => this.logger.warn(`Church donation auto-record failed: ${err.message}`));
        }
      }
    }

    return this.stripeService.handleWebhookEvent(event);
  }

  /** GET /api/accounting/stripe/balance — Current Stripe account balance */
  @Get('stripe/balance')
  async stripeBalance() {
    return this.stripeService.getBalance();
  }

  // ── Customers ────────────────────────────────────────────────────────────

  /** GET /api/accounting/stripe/customers — List all Stripe customers */
  @Get('stripe/customers')
  async stripeListCustomers(@Query('limit') limit?: string) {
    return this.stripeService.listCustomers(limit ? parseInt(limit) : 100);
  }

  /** POST /api/accounting/stripe/customers — Create or retrieve a customer */
  @Post('stripe/customers')
  async stripeEnsureCustomer(@Body() body: { email: string; name?: string; phone?: string; metadata?: Record<string, string> }) {
    if (!body.email) return { error: 'email required' };
    return this.stripeService.ensureCustomer(body);
  }

  /** GET /api/accounting/stripe/customers/:id — Retrieve a single customer */
  @Get('stripe/customers/:id')
  async stripeGetCustomer(@Param('id') id: string) {
    const c = await this.stripeService.getCustomer(id);
    if (!c) return { error: 'Customer not found' };
    return c;
  }

  // ── Payment Intents ────────────────────────────────────────────────────────

  /** POST /api/accounting/stripe/payment-intents — Create a payment intent */
  @Post('stripe/payment-intents')
  async stripeCreatePaymentIntent(@Body() body: {
    amountCents: number;
    currency: string;
    customerId?: string;
    description?: string;
    invoiceId?: string;
    metadata?: Record<string, string>;
  }) {
    if (!body.amountCents || !body.currency) return { error: 'amountCents and currency required' };
    return this.stripeService.createPaymentIntent(body);
  }

  /** GET /api/accounting/stripe/payment-intents — List payment intents */
  @Get('stripe/payment-intents')
  async stripeListPaymentIntents(@Query('limit') limit?: string) {
    return this.stripeService.listPaymentIntents(limit ? parseInt(limit) : 100);
  }

  /** GET /api/accounting/stripe/payment-intents/:id — Retrieve a payment intent */
  @Get('stripe/payment-intents/:id')
  async stripeGetPaymentIntent(@Param('id') id: string) {
    return this.stripeService.getPaymentIntent(id);
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  /** POST /api/accounting/stripe/subscriptions — Create a subscription */
  @Post('stripe/subscriptions')
  async stripeCreateSubscription(@Body() body: { customerId: string; priceId: string; trialDays?: number; coupon?: string }) {
    if (!body.customerId || !body.priceId) return { error: 'customerId and priceId required' };
    return this.stripeService.createSubscription(body);
  }

  /** GET /api/accounting/stripe/subscriptions — List subscriptions */
  @Get('stripe/subscriptions')
  async stripeListSubscriptions(@Query('status') status?: string, @Query('limit') limit?: string) {
    return this.stripeService.listSubscriptions(status as any, limit ? parseInt(limit) : 100);
  }

  /** POST /api/accounting/stripe/subscriptions/:id/cancel — Cancel a subscription */
  @Post('stripe/subscriptions/:id/cancel')
  async stripeCancelSubscription(@Param('id') id: string, @Body() body: { atPeriodEnd?: boolean }) {
    return this.stripeService.cancelSubscription(id, body.atPeriodEnd ?? true);
  }

  /** POST /api/accounting/stripe/subscriptions/:id/update — Change subscription plan */
  @Post('stripe/subscriptions/:id/update')
  async stripeUpdateSubscription(@Param('id') id: string, @Body() body: { priceId: string }) {
    if (!body.priceId) return { error: 'priceId required' };
    return this.stripeService.updateSubscription(id, body.priceId);
  }

  // ── Invoices ──────────────────────────────────────────────────────────────

  /** GET /api/accounting/stripe/invoices — List Stripe invoices */
  @Get('stripe/invoices')
  async stripeListInvoices(@Query('customerId') customerId?: string, @Query('limit') limit?: string) {
    return this.stripeService.listStripeInvoices(customerId, limit ? parseInt(limit) : 100);
  }

  /** GET /api/accounting/stripe/invoices/:id — Retrieve a Stripe invoice */
  @Get('stripe/invoices/:id')
  async stripeGetInvoice(@Param('id') id: string) {
    return this.stripeService.getStripeInvoice(id);
  }

  // ── Payouts ───────────────────────────────────────────────────────────────

  /** GET /api/accounting/stripe/payouts — List all payouts */
  @Get('stripe/payouts')
  async stripeListPayouts(@Query('limit') limit?: string) {
    return this.stripeService.listPayouts(limit ? parseInt(limit) : 100);
  }

  // ── Products & Prices ─────────────────────────────────────────────────────

  /** GET /api/accounting/stripe/products — List Stripe products */
  @Get('stripe/products')
  async stripeListProducts(@Query('limit') limit?: string) {
    return this.stripeService.listProducts(limit ? parseInt(limit) : 100);
  }

  /** POST /api/accounting/stripe/products — Create a Stripe product */
  @Post('stripe/products')
  async stripeCreateProduct(@Body() body: { name: string; description?: string }) {
    if (!body.name) return { error: 'name required' };
    return this.stripeService.createProduct(body.name, body.description);
  }

  /** GET /api/accounting/stripe/prices — List Stripe prices */
  @Get('stripe/prices')
  async stripeListPrices(@Query('productId') productId?: string, @Query('limit') limit?: string) {
    return this.stripeService.listPrices(productId, limit ? parseInt(limit) : 100);
  }

  /** POST /api/accounting/stripe/prices — Create a Stripe price */
  @Post('stripe/prices')
  async stripeCreatePrice(@Body() body: { productId: string; unitAmountCents: number; currency: string; interval?: 'day' | 'week' | 'month' | 'year' }) {
    if (!body.productId || !body.unitAmountCents || !body.currency) return { error: 'productId, unitAmountCents, and currency required' };
    return this.stripeService.createPrice(body);
  }

  // ── Connect ───────────────────────────────────────────────────────────────

  /** GET /api/accounting/stripe/connect/url — Get Account Link URL for tenant onboarding */
  @Get('stripe/connect/url')
  @UseGuards(FirebaseAuthGuard)
  async stripeConnectUrl(@Headers('x-tenant-id') headerTenant: string, @Query('tenantId') queryTenant: string, @Query('redirectUri') redirectUri: string, @Query('country') country: string, @Res() res: Response) {
    const tenantId = headerTenant || queryTenant;
    if (!tenantId || !redirectUri) return res.status(400).json({ error: 'tenantId and redirectUri required' });
    // Proactively block: live key + HTTP redirect will always fail at Stripe
    const stripeKey = process.env.STRIPE_SECRET_KEY ?? '';
    if (stripeKey.startsWith('sk_live') && redirectUri.startsWith('http://')) {
      return res.status(400).json({ error: 'Your Stripe key is in live mode, which requires HTTPS redirects. Use a test key (sk_test_...) for local development, or deploy to an HTTPS environment.' });
    }
    try {
      const url = await this.stripeService.getConnectOnboardingUrl(tenantId, redirectUri, country || undefined);
      return res.json({ url });
    } catch (err: any) {
      this.logger.error(`Stripe connect URL failed for tenant ${tenantId}: ${err.message}`);
      const raw = err.message ?? 'Stripe Connect configuration error';
      // Cross-border restriction: Flyn's platform Stripe account is US-based, and Stripe
      // forbids a US platform from opening connected accounts in certain countries (notably
      // India). This is a hard Stripe policy — surface a clear, actionable message instead
      // of Stripe's "contact support" boilerplate, and point the user at the gateway that
      // DOES work for that region.
      if (/cannot be created by platforms in/i.test(raw)) {
        const cc = (country || '').toUpperCase();
        const alt = cc === 'IN'
          ? 'For India, connect Razorpay instead — it’s in this same Integrations list.'
          : ['NG', 'KE', 'GH', 'ZA', 'EG'].includes(cc)
            ? 'For Africa & the Middle East, connect Flutterwave instead — it’s in this same Integrations list.'
            : 'Use a different payment gateway from this Integrations list for that region.';
        return res.status(502).json({
          error: `Stripe can’t open a ${cc || 'local'} account here: Flyn’s Stripe platform is based in the US, and Stripe doesn’t allow US platforms to create Stripe accounts in ${cc || 'this country'}. ${alt}`,
        });
      }
      // Stripe live mode rejects http:// redirect URIs, but also requires branding/policies in dashboard
      if (raw.toLowerCase().includes('livemode') || raw.toLowerCase().includes('https')) {
        return res.status(502).json({ error: `Stripe Connect Error: ${raw}` });
      }
      return res.status(502).json({ error: raw });
    }
  }

  // ── Stripe Connect via OAuth (link an EXISTING merchant-owned account) ──────
  // These are hit by top-level browser navigation (not XHR), so they must NOT use
  // FirebaseAuthGuard — the tenant travels in the OAuth `state` param, mirroring the
  // Xero/QuickBooks connect+callback flow. OAuth links an account the merchant already
  // owns, so it works in ANY Stripe country (UAE, AU, SG, JP, …), unlike Express.

  /** GET /api/accounting/stripe/oauth/connect — Redirect the browser to Stripe to authorize */
  @Get('stripe/oauth/connect')
  async stripeOAuthConnect(
    @Query('tenantId') tenantId: string,
    @Query('email') email: string,
    @Query('country') country: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGINS?.split(',')[0]?.trim() || 'https://app.myflynai.com';
    if (!tenantId) {
      return res.redirect(`${frontendUrl}/dashboard/accounting?stripe=error&reason=${encodeURIComponent('Missing tenant for Stripe connect')}`);
    }
    // Must EXACTLY match a redirect URI registered in the Stripe Connect OAuth settings.
    const redirectUri = process.env.STRIPE_OAUTH_REDIRECT_URI
      || `${(process.env.API_BASE_URL || 'https://api.myflynai.com/api').replace(/\/$/, '')}/accounting/stripe/oauth/callback`;
    try {
      const url = this.stripeService.getOAuthAuthorizeUrl(tenantId, redirectUri, {
        email: email || undefined,
        country: country || undefined,
      });
      return res.redirect(url);
    } catch (err: any) {
      this.logger.error(`Stripe OAuth connect failed for tenant ${tenantId}: ${err.message}`);
      return res.redirect(`${frontendUrl}/dashboard/accounting?stripe=error&reason=${encodeURIComponent(err.message || 'Stripe OAuth not configured')}`);
    }
  }

  /** GET /api/accounting/stripe/oauth/callback — Stripe redirects here after authorization */
  @Public()
  @Get('stripe/oauth/callback')
  async stripeOAuthCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Query('error_description') errorDescription: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGINS?.split(',')[0]?.trim() || 'https://app.myflynai.com';
    if (error || !code) {
      const reason = errorDescription || error || 'No authorization code returned by Stripe';
      this.logger.error(`Stripe OAuth rejected for tenant ${state}: ${reason}`);
      return res.redirect(`${frontendUrl}/dashboard/accounting?stripe=error&reason=${encodeURIComponent(reason)}`);
    }
    try {
      await this.stripeService.handleOAuthCallback(state, code);
      this.logger.log(`Stripe OAuth account linked successfully for tenant: ${state}`);
      return res.redirect(`${frontendUrl}/dashboard/accounting?stripe=connected`);
    } catch (err: any) {
      const detail = err?.message || 'Token exchange failed';
      this.logger.error(`Stripe OAuth callback FAILED for tenant ${state}: ${detail}`);
      return res.redirect(`${frontendUrl}/dashboard/accounting?stripe=error&reason=${encodeURIComponent(detail)}`);
    }
  }

  // ── Historical Sync ───────────────────────────────────────────────────────

  /** POST /api/accounting/stripe/sync — Backfill historical Stripe charges into Flyn */
  @Post('stripe/sync')
  async stripeSyncHistorical(@Body() body: { limit?: number }) {
    return this.stripeService.syncHistoricalCharges(body.limit ?? 100);
  }
}
