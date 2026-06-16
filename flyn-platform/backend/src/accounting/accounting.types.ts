/**
 * Accounting Types — Global Feature Specification
 * US · Middle East · Africa · Asia
 *
 * Supports invoicing, billing, multi-currency, multi-language,
 * regional compliance, credit notes, recurring invoices, partial payments,
 * payment links, and pro forma invoices.
 */

// ── Status Types ────────────────────────────────────────────────────────────
export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'partially_paid';
export type InvoiceType = 'standard' | 'proforma' | 'credit_note' | 'recurring';
export type ExpenseStatus = 'pending' | 'approved' | 'rejected';
export type PaymentMethod = 'bank_transfer' | 'credit_card' | 'mobile_money' | 'cash' | 'paypal' | 'stripe' | 'flutterwave' | 'razorpay' | 'other';

// ── Supported Currencies ────────────────────────────────────────────────────
export const SUPPORTED_CURRENCIES = [
  'USD', 'AED', 'SAR', 'EGP', 'JOD',   // US + Middle East
  'GHS', 'KES', 'ZAR',                   // Africa
  'INR', 'PHP', 'PKR', 'IDR', 'MYR',    // Asia
  'EUR', 'GBP',                           // International
] as const;
export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number];

// ── Supported Languages ─────────────────────────────────────────────────────
export const SUPPORTED_LANGUAGES = [
  { code: 'en',    name: 'English',   rtl: false },
  { code: 'ar',    name: 'Arabic',    rtl: true  },
  { code: 'fr',    name: 'French',    rtl: false },
  { code: 'sw',    name: 'Swahili',   rtl: false },
  { code: 'hi',    name: 'Hindi',     rtl: false },
  { code: 'id',    name: 'Bahasa',    rtl: false },
] as const;

// ── FX Rates (base: USD) — refreshed daily in production ────────────────────
export const FX_RATES: Record<string, number> = {
  USD: 1.00, AED: 3.67, SAR: 3.75, EGP: 30.90, JOD: 0.71,
  GHS: 14.50, KES: 129.00, ZAR: 18.10,
  INR: 83.40, PHP: 56.20, PKR: 278.00, IDR: 15650.00, MYR: 4.72,
  EUR: 0.92, GBP: 0.79,
};

// ── Invoice Line Item ───────────────────────────────────────────────────────
export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;       // percentage 0–100
  taxRate?: number;         // percentage (e.g. 5 for 5% VAT)
  taxLabel?: string;        // e.g. "VAT", "GST", "Sales Tax"
  hsnCode?: string;         // India GST/HSN
  total: number;            // computed: (qty × unitPrice) × (1 - discount/100) × (1 + taxRate/100)
}

// ── Regional Compliance ─────────────────────────────────────────────────────
export interface RegionalCompliance {
  // Global
  region?: 'US' | 'ME' | 'AF' | 'AS';
  country?: string;         // ISO 3166 alpha-2

  // United States
  ein?: string;             // Employer Identification Number
  w9Attached?: boolean;
  paymentTerms?: 'NET_15' | 'NET_30' | 'NET_60' | 'DUE_ON_RECEIPT';

  // Middle East
  taxId?: string;           // TRN for UAE/KSA
  isRTL?: boolean;
  hijriDate?: string;       // Hijri calendar date string
  zatcaQr?: string;         // ZATCA QR code data (KSA e-invoicing)
  vatNumber?: string;

  // Africa
  graTin?: string;          // Ghana Revenue Authority TIN
  kraPin?: string;          // Kenya Revenue Authority PIN
  sarsVat?: string;         // South Africa SARS VAT number
  mobileMoneyInfo?: string; // M-Pesa, MTN MoMo, etc. payment instructions

  // Asia
  gstin?: string;           // India GSTIN
  hsnCode?: string;         // India HSN/SAC code
  irpQr?: string;           // India IRP e-invoice QR
  birOr?: string;           // Philippines BIR Official Receipt number
  ntn?: string;             // Pakistan National Tax Number
}

// ── Recurring Configuration ─────────────────────────────────────────────────
export interface RecurringConfig {
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate?: string;
  nextRunDate: string;
  autoSend: boolean;
  remindersEnabled: boolean;
  reminderDays?: number[];   // e.g. [7, 3, 1] = remind 7, 3, 1 days before due
  lateFeePercent?: number;   // e.g. 1.5 = 1.5% per month
  occurrencesGenerated?: number;
}

// ── Partial Payment Entry ───────────────────────────────────────────────────
export interface PartialPayment {
  id: string;
  date: string;
  amount: string;
  method: PaymentMethod;
  reference?: string;       // transaction ID or check number
  notes?: string;
}

// ── Credit Note ─────────────────────────────────────────────────────────────
export interface CreditNote {
  _id: string;
  creditNoteNumber: string;  // CN-YYYY-XXX
  originalInvoiceId: string;
  originalInvoiceNumber: string;
  client: string;
  amount: string;
  currency: string;
  reason: string;
  status: 'draft' | 'issued' | 'applied';
  lineItems?: InvoiceLineItem[];
  compliance?: RegionalCompliance;
  createdAt: Date;
}

// ── Invoice ─────────────────────────────────────────────────────────────────
export interface Invoice {
  _id: string;
  tenant_id?: string;
  invoice: string;           // INV-YYYY-XXX or PF-YYYY-XXX
  type: InvoiceType;
  client: string;
  clientEmail?: string;
  clientPhone?: string;
  clientCountry?: string;
  amount: string;
  status: InvoiceStatus;
  dueDate: string;
  module: string;            // source module: CRM, HR, Events, Church, etc.
  description?: string;
  currency: string;
  baseCurrencyAmount?: string;  // Amount in base currency (USD) for FX display
  language?: string;         // Invoice template language code
  taxAmount?: string;
  taxCode?: string;          // selected tax code id (e.g. UAE_VAT) — persisted for round-trip
  taxRate?: string;          // manual tax rate % entered on the form
  paymentTerms?: string;     // Due on Receipt / Net 15 / Net 30 …
  taxId?: string;            // top-level mirror of compliance.taxId for form prefill

  // Line Items
  lineItems?: InvoiceLineItem[];
  subtotal?: string;
  totalDiscount?: string;
  totalTax?: string;

  // Regional Compliance
  compliance?: RegionalCompliance;

  // Recurring
  recurring?: RecurringConfig;

  // Payment
  paymentLink?: string;
  paymentMethod?: PaymentMethod;
  partialPayments?: PartialPayment[];
  outstandingBalance?: string;

  // Credit Notes
  linkedCreditNotes?: string[];  // credit note IDs
  linkedCreditNoteTotal?: string; // sum of all credit notes applied
  linkedToInvoice?: string;       // for credit note rows: the original invoice number
  linkedToInvoiceId?: string;     // for credit note rows: the original invoice ID

  // Pro Forma
  isProForma?: boolean;
  customsReference?: string;

  // External sync status
  xeroSynced?: boolean;
  xeroSyncedAt?: Date;
  qboSynced?: boolean;
  qboSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ── Expense ─────────────────────────────────────────────────────────────────
export interface Expense {
  _id: string;
  tenant_id?: string;
  description: string;
  amount: string;
  currency?: string;
  category: string;
  date: string;
  status: ExpenseStatus;
  employee?: string;
  receipt?: string;
  merchant?: string;
  taxId?: string;
  notes?: string;
  paymentMethod?: string;
  projectCode?: string;
  source?: string;
  storageDestination?: string;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: PAYMENTS & COLLECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Gateway Registry ────────────────────────────────────────────────────────
export interface PaymentGateway {
  id: string;
  name: string;
  region: 'US' | 'ME' | 'AF' | 'AS' | 'GLOBAL';
  countries: string[];
  supportedMethods: PaymentMethod[];
  priority: number;         // lower = higher priority
  enabled: boolean;
}

export const GATEWAY_REGISTRY: PaymentGateway[] = [
  // United States
  { id: 'stripe', name: 'Stripe', region: 'US', countries: ['US','CA','GB','EU'], supportedMethods: ['credit_card','bank_transfer'], priority: 1, enabled: true },
  { id: 'paypal', name: 'PayPal', region: 'US', countries: ['US','CA','GB','EU'], supportedMethods: ['paypal'], priority: 2, enabled: true },
  { id: 'square', name: 'Square', region: 'US', countries: ['US'], supportedMethods: ['credit_card','cash'], priority: 3, enabled: true },
  // Middle East
  { id: 'tap', name: 'Tap Payments', region: 'ME', countries: ['AE','SA','KW','BH','QA','OM'], supportedMethods: ['credit_card'], priority: 1, enabled: true },
  { id: 'moyasar', name: 'Moyasar', region: 'ME', countries: ['SA'], supportedMethods: ['credit_card','bank_transfer'], priority: 2, enabled: true },
  { id: 'fawry', name: 'Fawry', region: 'ME', countries: ['EG'], supportedMethods: ['cash','bank_transfer'], priority: 1, enabled: true },
  { id: 'sadad', name: 'SADAD', region: 'ME', countries: ['SA'], supportedMethods: ['bank_transfer'], priority: 3, enabled: true },
  // Africa
  { id: 'flutterwave', name: 'Flutterwave', region: 'AF', countries: ['GH','KE','ZA','NG'], supportedMethods: ['credit_card','mobile_money','bank_transfer'], priority: 1, enabled: true },
  { id: 'mpesa', name: 'M-Pesa', region: 'AF', countries: ['KE'], supportedMethods: ['mobile_money'], priority: 1, enabled: true },
  { id: 'mtn_momo', name: 'MTN MoMo', region: 'AF', countries: ['GH','KE'], supportedMethods: ['mobile_money'], priority: 2, enabled: true },
  { id: 'ozow', name: 'Ozow', region: 'AF', countries: ['ZA'], supportedMethods: ['bank_transfer'], priority: 2, enabled: true },
  // Asia
  { id: 'razorpay', name: 'Razorpay/UPI', region: 'AS', countries: ['IN'], supportedMethods: ['credit_card','bank_transfer'], priority: 1, enabled: true },
  { id: 'gcash', name: 'GCash/Maya', region: 'AS', countries: ['PH'], supportedMethods: ['mobile_money'], priority: 1, enabled: true },
  { id: 'easypaisa', name: 'EasyPaisa/JazzCash', region: 'AS', countries: ['PK'], supportedMethods: ['mobile_money'], priority: 1, enabled: true },
  { id: 'gopay', name: 'GoPay/OVO', region: 'AS', countries: ['ID'], supportedMethods: ['mobile_money'], priority: 1, enabled: true },
  { id: 'fpx', name: 'FPX', region: 'AS', countries: ['MY'], supportedMethods: ['bank_transfer'], priority: 1, enabled: true },
];

// ── Vendor Bill (Accounts Payable) ──────────────────────────────────────────
export type VendorBillStatus = 'draft' | 'pending_approval' | 'approved' | 'scheduled' | 'paid' | 'rejected';

export interface VendorBill {
  _id: string;
  vendor: string;
  vendorEmail?: string;
  amount: string;
  currency: string;
  dueDate: string;
  description: string;
  category: string;
  status: VendorBillStatus;
  paymentMethod?: string;
  paymentTerms?: string;
  taxCode?: string;
  taxRate?: string;
  taxId?: string;
  approvedBy?: string;
  paidDate?: string;
  reference?: string;
  createdAt: Date;
}

// ── Dunning Sequence ────────────────────────────────────────────────────────
export interface DunningStep {
  daysOverdue: number;
  channel: 'email' | 'sms' | 'whatsapp';
  templateId: string;
  escalation: 'reminder' | 'warning' | 'final_notice' | 'collections';
}

export interface DunningConfig {
  enabled: boolean;
  steps: DunningStep[];
  lateFeePercent?: number;
}

export const DEFAULT_DUNNING_STEPS: DunningStep[] = [
  { daysOverdue: 1,  channel: 'email',    templateId: 'overdue_reminder',  escalation: 'reminder' },
  { daysOverdue: 7,  channel: 'whatsapp', templateId: 'overdue_warning',   escalation: 'warning' },
  { daysOverdue: 14, channel: 'sms',      templateId: 'overdue_urgent',    escalation: 'warning' },
  { daysOverdue: 30, channel: 'email',    templateId: 'final_notice',      escalation: 'final_notice' },
  { daysOverdue: 60, channel: 'email',    templateId: 'collections',       escalation: 'collections' },
];

// ── Reconciliation ──────────────────────────────────────────────────────────
export type ReconciliationStatus = 'matched' | 'unmatched' | 'partial_match' | 'manual_review';

export interface ReconciliationEntry {
  _id: string;
  paymentAmount: string;
  paymentDate: string;
  paymentReference: string;
  paymentMethod: PaymentMethod;
  matchedInvoiceId?: string;
  matchedInvoiceNumber?: string;
  status: ReconciliationStatus;
  confidence: number;        // 0–100 match confidence
  notes?: string;
  createdAt: Date;
}

// ── Bulk Payment ────────────────────────────────────────────────────────────
export type BulkPaymentFormat = 'ACH' | 'SWIFT' | 'WPS' | 'LOCAL_BANK' | 'MOBILE_MONEY';

export interface BulkPaymentEntry {
  recipient: string;
  recipientAccount?: string;
  amount: string;
  currency: string;
  reference: string;
}

export interface BulkPaymentBatch {
  _id: string;
  format: BulkPaymentFormat;
  entries: BulkPaymentEntry[];
  totalAmount: string;
  currency: string;
  status: 'draft' | 'pending_approval' | 'approved' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: TAX & COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════════

// ── Tax Code ────────────────────────────────────────────────────────────────
export type TaxType = 'VAT' | 'GST' | 'SALES_TAX' | 'WHT' | 'SERVICE_CHARGE' | 'CESS' | 'PPN' | 'SST' | 'ZAKAT';

export interface TaxCode {
  id: string;
  code?: string;            // display code e.g. 'AE-VAT'; mirrors id for system codes, user-supplied for custom
  country: string;
  name: string;
  type: TaxType;
  rate: number;             // percentage
  description: string;
  isDefault: boolean;
  isCustom?: boolean;       // true for tenant-created codes
}

export const TAX_CODE_LIBRARY: TaxCode[] = [
  // United States
  { id: 'US_SALES', country: 'US', name: 'Sales Tax', type: 'SALES_TAX', rate: 0, description: 'Multi-state sales tax (rate varies by state)', isDefault: true },
  { id: 'US_FICA', country: 'US', name: 'FICA', type: 'WHT', rate: 7.65, description: 'Social Security + Medicare', isDefault: false },
  // UAE
  { id: 'AE_VAT', country: 'AE', name: 'UAE VAT', type: 'VAT', rate: 5, description: 'Standard VAT rate', isDefault: true },
  // Saudi Arabia
  { id: 'SA_VAT', country: 'SA', name: 'KSA VAT', type: 'VAT', rate: 15, description: 'Standard VAT rate', isDefault: true },
  { id: 'SA_ZAKAT', country: 'SA', name: 'Zakat', type: 'ZAKAT', rate: 2.5, description: 'Zakat on net income', isDefault: false },
  // Egypt
  { id: 'EG_VAT', country: 'EG', name: 'Egypt VAT', type: 'VAT', rate: 14, description: 'Standard VAT rate', isDefault: true },
  // Jordan
  { id: 'JO_VAT', country: 'JO', name: 'Jordan VAT', type: 'VAT', rate: 16, description: 'General sales tax', isDefault: true },
  // Ghana
  { id: 'GH_VAT', country: 'GH', name: 'Ghana VAT', type: 'VAT', rate: 15, description: 'Standard rate', isDefault: true },
  { id: 'GH_GET', country: 'GH', name: 'Ghana GET', type: 'CESS', rate: 2.5, description: 'Ghana Education Trust Fund', isDefault: false },
  { id: 'GH_WHT', country: 'GH', name: 'Ghana WHT', type: 'WHT', rate: 5, description: 'Withholding tax', isDefault: false },
  // Kenya
  { id: 'KE_VAT', country: 'KE', name: 'Kenya VAT', type: 'VAT', rate: 16, description: 'Standard rate', isDefault: true },
  { id: 'KE_WHT', country: 'KE', name: 'Kenya WHT', type: 'WHT', rate: 5, description: 'Withholding tax', isDefault: false },
  // South Africa
  { id: 'ZA_VAT', country: 'ZA', name: 'SA VAT', type: 'VAT', rate: 15, description: 'Standard rate', isDefault: true },
  // India
  { id: 'IN_GST_0', country: 'IN', name: 'GST 0%', type: 'GST', rate: 0, description: 'Exempt', isDefault: false },
  { id: 'IN_GST_5', country: 'IN', name: 'GST 5%', type: 'GST', rate: 5, description: 'Essential goods', isDefault: false },
  { id: 'IN_GST_12', country: 'IN', name: 'GST 12%', type: 'GST', rate: 12, description: 'Standard goods', isDefault: false },
  { id: 'IN_GST_18', country: 'IN', name: 'GST 18%', type: 'GST', rate: 18, description: 'Standard services', isDefault: true },
  { id: 'IN_TDS', country: 'IN', name: 'TDS', type: 'WHT', rate: 10, description: 'Tax Deducted at Source', isDefault: false },
  // Philippines
  { id: 'PH_VAT', country: 'PH', name: 'PH VAT', type: 'VAT', rate: 12, description: 'Standard rate', isDefault: true },
  { id: 'PH_WHT', country: 'PH', name: 'PH WHT', type: 'WHT', rate: 5, description: 'Withholding tax', isDefault: false },
  // Pakistan
  { id: 'PK_GST', country: 'PK', name: 'Pakistan GST', type: 'GST', rate: 17, description: 'General sales tax', isDefault: true },
  // Indonesia
  { id: 'ID_PPN', country: 'ID', name: 'Indonesia PPN', type: 'PPN', rate: 11, description: 'Value Added Tax', isDefault: true },
  // Malaysia
  { id: 'MY_SST', country: 'MY', name: 'Malaysia SST', type: 'SST', rate: 6, description: 'Sales and Service Tax', isDefault: true },
];

// ── Audit Trail ─────────────────────────────────────────────────────────────
export type AuditAction = 'create' | 'update' | 'delete' | 'approve' | 'reject' | 'payment' | 'credit_note' | 'export' | 'archive';

export interface AuditEntry {
  _id: string;
  entityType: 'invoice' | 'expense' | 'credit_note' | 'vendor_bill' | 'payment' | 'bulk_payment';
  entityId: string;
  action: AuditAction;
  userId: string;
  userName: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  timestamp: Date;
  ipAddress?: string;
}

// ── Document Retention ──────────────────────────────────────────────────────
export interface ArchivedDocument {
  _id: string;
  documentType: 'invoice' | 'receipt' | 'contract' | 'credit_note' | 'tax_return';
  documentId: string;
  title: string;
  country: string;
  retentionYears: number;
  archiveDate: Date;
  expiryDate: Date;
  searchTags: string[];
}

export const RETENTION_RULES: Record<string, number> = {
  US: 7, AE: 5, SA: 6, EG: 5, JO: 5,
  GH: 6, KE: 5, ZA: 5,
  IN: 8, PH: 10, PK: 6, ID: 10, MY: 7,
};

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: EXPENSE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReceiptScan {
  _id: string;
  imageUrl?: string;
  vendor: string;
  amount: string;
  currency: string;
  date: string;
  category: string;
  confidence: number;
  rawText?: string;
  taxAmount?: number;
  description?: string;
  lineItems?: Array<{ name: string; qty: number; unitPrice: string }>;
  status: 'pending_review' | 'approved' | 'rejected';
  expenseId?: string;
  createdAt: Date;
}

export const EXPENSE_CATEGORIES: Record<string, string[]> = {
  default: ['Travel', 'Software', 'Hardware', 'Marketing', 'Office', 'Utilities', 'Meals', 'Other'],
  church: ['Ministry Supplies', 'Mission Trips', 'Worship Equipment', 'Youth Programs', 'Building Maintenance', 'Benevolence', 'Staff Training'],
  esim: ['Data Procurement', 'API Costs', 'Network Fees', 'Roaming Charges', 'SIM Inventory', 'Shipping'],
  ghana: ['Field Agent Travel', 'Mobile Money Fees', 'GRA Compliance', 'Market Research', 'Community Outreach'],
  us: ['Client Entertainment', 'SaaS Subscriptions', 'Insurance', 'Legal', 'Professional Development'],
  me: ['Visa Processing', 'PRO Services', 'Office Lease', 'Vehicle Maintenance', 'Sponsorship Fees'],
};

export interface ExpenseApproval {
  _id: string;
  expenseId: string;
  level: number;
  approver: string;
  status: 'pending' | 'approved' | 'rejected';
  comments?: string;
  timestamp: Date;
}

export interface MileageEntry {
  _id: string;
  employeeId: string;
  employee: string;
  date: string;
  distance: number;         // km or miles
  unit: 'km' | 'mi';
  rate: number;             // per unit rate
  totalAmount: number;
  purpose: string;
  country: string;
  createdAt: Date;
}

// IRS 2024 rate: $0.67/mile; configurable per country
export const MILEAGE_RATES: Record<string, { rate: number; unit: 'km' | 'mi' }> = {
  US: { rate: 0.67, unit: 'mi' },
  AE: { rate: 0.50, unit: 'km' },
  SA: { rate: 0.50, unit: 'km' },
  GH: { rate: 0.30, unit: 'km' },
  KE: { rate: 0.25, unit: 'km' },
  IN: { rate: 8.00, unit: 'km' },  // INR per km
  PH: { rate: 5.00, unit: 'km' },  // PHP per km
};

export interface PettyCashEntry {
  _id: string;
  type: 'withdrawal' | 'replenishment' | 'expense';
  amount: string;
  currency: string;
  description: string;
  approvedBy?: string;
  balance: string;          // running balance
  createdAt: Date;
}

export interface DonorFund {
  _id: string;
  donorName: string;
  grantCode: string;
  totalAmount: string;
  currency: string;
  usedAmount: string;
  remainingAmount: string;
  purpose: string;
  restrictions?: string;
  expiryDate?: string;
  linkedExpenseIds: string[];
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: PAYROLL MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export type PayrollFrequency = 'weekly' | 'bi-weekly' | 'monthly';

export interface PayrollDeduction {
  name: string;
  type: 'tax' | 'social_security' | 'pension' | 'insurance' | 'other';
  rate?: number;            // percentage
  fixedAmount?: number;
  employerContribution?: number;
  country: string;
}

export const PAYROLL_DEDUCTIONS: Record<string, PayrollDeduction[]> = {
  US: [
    { name: 'Federal Income Tax', type: 'tax', rate: 22, country: 'US' },
    { name: 'Social Security (FICA)', type: 'social_security', rate: 6.2, employerContribution: 6.2, country: 'US' },
    { name: 'Medicare', type: 'social_security', rate: 1.45, employerContribution: 1.45, country: 'US' },
  ],
  AE: [
    { name: 'GOSI (Employer)', type: 'social_security', rate: 0, employerContribution: 12.5, country: 'AE' },
  ],
  SA: [
    { name: 'GOSI (Employee)', type: 'social_security', rate: 9, employerContribution: 11, country: 'SA' },
  ],
  GH: [
    { name: 'PAYE', type: 'tax', rate: 25, country: 'GH' },
    { name: 'SSNIT (Employee)', type: 'pension', rate: 5.5, employerContribution: 13, country: 'GH' },
    { name: 'Tier 2 Pension', type: 'pension', rate: 5, country: 'GH' },
  ],
  KE: [
    { name: 'PAYE', type: 'tax', rate: 30, country: 'KE' },
    { name: 'NHIF', type: 'insurance', fixedAmount: 1700, country: 'KE' },
    { name: 'NSSF (Employee)', type: 'pension', fixedAmount: 2160, employerContribution: 2160, country: 'KE' },
  ],
  IN: [
    { name: 'Income Tax (TDS)', type: 'tax', rate: 20, country: 'IN' },
    { name: 'EPF (Employee)', type: 'pension', rate: 12, employerContribution: 12, country: 'IN' },
    { name: 'ESI (Employee)', type: 'insurance', rate: 0.75, employerContribution: 3.25, country: 'IN' },
  ],
  PH: [
    { name: 'Withholding Tax', type: 'tax', rate: 20, country: 'PH' },
    { name: 'SSS', type: 'social_security', rate: 4.5, employerContribution: 9.5, country: 'PH' },
    { name: 'PhilHealth', type: 'insurance', rate: 2.25, employerContribution: 2.25, country: 'PH' },
    { name: 'Pag-IBIG', type: 'pension', rate: 2, employerContribution: 2, country: 'PH' },
  ],
  PK: [
    { name: 'Income Tax', type: 'tax', rate: 15, country: 'PK' },
    { name: 'EOBI', type: 'pension', rate: 1, employerContribution: 5, country: 'PK' },
  ],
};

export interface PayrollRun {
  _id: string;
  period: string;            // e.g. "2026-04"
  frequency: PayrollFrequency;
  country: string;
  currency: string;
  status: 'draft' | 'processing' | 'completed' | 'failed';
  employees: PayrollEntry[];
  totalGross: number;
  totalDeductions: number;
  totalNet: number;
  totalEmployerCost: number;
  processedAt?: Date;
  createdAt: Date;
}

export interface PayrollEntry {
  employeeId: string;
  employeeName: string;
  department?: string;
  grossSalary: number;
  deductions: Array<{ name: string; amount: number }>;
  totalDeductions: number;
  netPay: number;
  employerContributions: Array<{ name: string; amount: number }>;
  totalEmployerCost: number;
  overtimeHours?: number;
  overtimeAmount?: number;
  unpaidLeaveDays?: number;
  leaveDeduction?: number;
}

export interface EOSBCalculation {
  employeeId: string;
  employeeName: string;
  country: string;
  startDate: string;
  endDate: string;
  yearsOfService: number;
  lastSalary: number;
  currency: string;
  gratuityAmount: number;
  formula: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: FINANCIAL REPORTING
// ═══════════════════════════════════════════════════════════════════════════════

export interface ProfitAndLoss {
  period: string;
  currency: string;
  totalIncome: number;
  incomeByCategory: Record<string, number>;
  incomeByModule: Record<string, number>;
  totalExpenses: number;
  expensesByCategory: Record<string, number>;
  grossProfit: number;
  netProfit: number;
  taxExpense: number;
  fxGainLoss?: number;
}

export interface CashFlowForecast {
  asOfDate: string;
  currency: string;
  currentBalance: number;
  forecast: Array<{
    period: string;          // e.g. "30d", "60d", "90d"
    expectedInflows: number;
    expectedOutflows: number;
    projectedBalance: number;
  }>;
}

export interface ARAgingBucket {
  range: string;             // e.g. "0-30", "31-60", "61-90", "90+"
  count: number;
  totalAmount: number;
  invoices: Array<{ invoiceId?: string; invoiceNumber: string; client: string; amount: number; daysOverdue: number }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 7: BANK & ACCOUNT MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export type BankAccountType = 'checking' | 'savings' | 'mobile_money' | 'e_wallet' | 'petty_cash';

export interface BankAccount {
  _id: string;
  accountName: string;
  bankName: string;
  accountNumber?: string;
  iban?: string;
  type: BankAccountType;
  currency: string;
  balance: string;
  country: string;
  isDefault: boolean;
  lastSyncedAt?: Date;
  createdAt: Date;
}

export interface BankTransaction {
  _id: string;
  tenant_id?: string;
  accountId: string;
  date: string;
  description: string;
  amount: string;
  type: 'debit' | 'credit';
  category?: string;
  reference?: string;
  matchedInvoiceId?: string;
  matchedExpenseId?: string;
  reconciled: boolean;
  createdAt: Date;
}

export interface IntercompanyTransfer {
  _id: string;
  fromAccountId: string;
  toAccountId: string;
  amount: string;
  currency: string;
  description: string;
  date: string;
  status: 'pending' | 'completed';
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 8: SUBSCRIPTIONS & RECURRING REVENUE
// ═══════════════════════════════════════════════════════════════════════════════

export interface LocalizedPrice {
  country: string;
  currency: string;
  amount: number;
}

export interface SubscriptionPlan {
  _id: string;
  name: string;
  description: string;
  basePriceUSD: number;
  localizedPrices: LocalizedPrice[];
  billingCycle: 'monthly' | 'quarterly' | 'annual';
  features: string[];
  isActive: boolean;
  createdAt: Date;
}

export const DEFAULT_LOCALIZED_PRICES: Record<string, { currency: string; multiplier: number }> = {
  US: { currency: 'USD', multiplier: 1 },
  AE: { currency: 'AED', multiplier: 3.67 },
  SA: { currency: 'SAR', multiplier: 3.75 },
  EG: { currency: 'EGP', multiplier: 30.9 },
  GH: { currency: 'GHS', multiplier: 12.0 },
  KE: { currency: 'KES', multiplier: 129.0 },
  ZA: { currency: 'ZAR', multiplier: 18.5 },
  IN: { currency: 'INR', multiplier: 83.0 },
  PH: { currency: 'PHP', multiplier: 56.0 },
  PK: { currency: 'PKR', multiplier: 278.0 },
  ID: { currency: 'IDR', multiplier: 15700 },
  MY: { currency: 'MYR', multiplier: 4.7 },
};

export interface Subscription {
  _id: string;
  memberId: string;
  memberName: string;
  planId: string;
  planName: string;
  country: string;
  currency: string;
  amount: number;
  status: 'active' | 'paused' | 'cancelled' | 'past_due' | 'trial';
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelledAt?: string;
  createdAt: Date;
}

export interface ProrationResult {
  originalAmount: number;
  newAmount: number;
  daysRemaining: number;
  totalDays: number;
  creditAmount: number;
  chargeAmount: number;
  netCharge: number;
}

export interface Coupon {
  _id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'regional';
  value: number;
  currency?: string;
  regionalValues?: LocalizedPrice[];
  maxUses: number;
  currentUses: number;
  expiresAt?: string;
  applicablePlans?: string[];
  applicableCountries?: string[];
  isActive: boolean;
  createdAt: Date;
}

export interface AtRiskClient {
  memberId: string;
  name: string;
  email?: string;
  lastActive?: string;
  riskScore: string;
  riskLevel: 'high' | 'medium' | 'low';
  riskFactors: {
    failedPayments: number;   // (A) failed/declined payment attempts
    supportTickets: number;   // (B) support ticket volume (high = frustration signal)
    contractExpiring: boolean; // (C) subscription ending within 30 days
  };
}

export interface ChurnMetrics {
  period: string;
  mrr: number;
  arr: number;
  totalSubscribers: number;
  newSubscribers: number;
  churnedSubscribers: number;
  churnRate: number;
  ltv: number;
  atRiskClients: AtRiskClient[];
  churnTrend: number[];
  byPlan: Record<string, { count: number; mrr: number; churnRate: number }>;
  byRegion: Record<string, { count: number; mrr: number; churnRate: number }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 9: INTEGRATIONS & FLYN AI ECOSYSTEM
// ═══════════════════════════════════════════════════════════════════════════════

export type WebhookEvent = 'invoice.created' | 'invoice.paid' | 'invoice.overdue' | 'payment.received' | 'expense.created' | 'payroll.completed' | 'subscription.created' | 'subscription.cancelled';

export interface WebhookEndpoint {
  _id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
  isActive: boolean;
  failureCount: number;
  lastTriggeredAt?: Date;
  createdAt: Date;
}

export interface IntegrationSync {
  _id: string;
  source: 'crm' | 'hr' | 'events' | 'coaches' | 'freelancers' | 'freelance' | 'church' | 'telephony' | 'whatsapp' | 'xero' | 'quickbooks' | 'zapier' | 'shopify';
  eventType: string;
  sourceId: string;
  accountingEntityType: 'invoice' | 'expense' | 'payment';
  accountingEntityId?: string;
  status: 'pending' | 'synced' | 'failed';
  data: Record<string, unknown>;
  error?: string;
  timestamp: Date;
}

export interface ExternalSyncConfig {
  _id: string;
  provider: 'xero' | 'quickbooks';
  apiKey?: string;
  tenantId?: string;
  syncDirection: 'push' | 'pull' | 'bidirectional';
  lastSyncAt?: Date;
  isActive: boolean;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 10: ROLES, PERMISSIONS & MULTI-ENTITY
// ═══════════════════════════════════════════════════════════════════════════════

export type AccountingRole = 'admin' | 'accountant' | 'manager' | 'view_only' | 'custom';

export type AccountingPermission =
  | 'invoices.create' | 'invoices.edit' | 'invoices.delete' | 'invoices.approve' | 'invoices.view'
  | 'expenses.create' | 'expenses.edit' | 'expenses.approve' | 'expenses.view'
  | 'payroll.run' | 'payroll.view'
  | 'reports.view' | 'reports.export'
  | 'settings.manage' | 'bank.manage' | 'subscriptions.manage';

export const ROLE_PERMISSIONS: Record<AccountingRole, AccountingPermission[]> = {
  admin: ['invoices.create', 'invoices.edit', 'invoices.delete', 'invoices.approve', 'invoices.view', 'expenses.create', 'expenses.edit', 'expenses.approve', 'expenses.view', 'payroll.run', 'payroll.view', 'reports.view', 'reports.export', 'settings.manage', 'bank.manage', 'subscriptions.manage'],
  accountant: ['invoices.create', 'invoices.edit', 'invoices.approve', 'invoices.view', 'expenses.create', 'expenses.edit', 'expenses.approve', 'expenses.view', 'payroll.run', 'payroll.view', 'reports.view', 'reports.export', 'bank.manage'],
  manager: ['invoices.create', 'invoices.view', 'expenses.create', 'expenses.approve', 'expenses.view', 'payroll.view', 'reports.view'],
  view_only: ['invoices.view', 'expenses.view', 'payroll.view', 'reports.view'],
  custom: [],
};

export interface ApprovalChain {
  _id: string;
  entityType: 'invoice' | 'expense' | 'vendor_bill' | 'bulk_payment';
  thresholdAmount: number;
  currency: string;
  requiredApprovers: Array<{ userId: string; userName: string; role: string }>;
  isActive: boolean;
}

export interface LegalEntity {
  _id: string;
  name: string;
  country: string;
  currency: string;
  registrationNumber: string;
  taxId: string;
  address: string;
  isParent: boolean;
  parentEntityId?: string;
  createdAt: Date;
}

export interface AccountantInvite {
  _id: string;
  email: string;
  name: string;
  accessLevel: 'read_only' | 'export_only' | 'full';
  entityIds: string[];
  expiresAt: string;
  isActive: boolean;
  createdAt: Date;
}

export interface ExportLog {
  _id: string;
  userId: string;
  userName: string;
  exportType: string;
  entityType: string;
  recordCount: number;
  ipAddress?: string;
  timestamp: Date;
}

export type DataRegion = 'us-east' | 'me-dubai' | 'af-accra' | 'as-mumbai';

export const COUNTRY_DATA_REGION: Record<string, DataRegion> = {
  US: 'us-east', CA: 'us-east',
  AE: 'me-dubai', SA: 'me-dubai', EG: 'me-dubai', JO: 'me-dubai',
  GH: 'af-accra', KE: 'af-accra', ZA: 'af-accra', NG: 'af-accra',
  IN: 'as-mumbai', PH: 'as-mumbai', PK: 'as-mumbai', ID: 'as-mumbai', MY: 'as-mumbai',
};

// ═══════════════════════════════════════════════════════════════════════════════
// COUNTRY-CONFIG ARCHITECTURE LAYER
// ═══════════════════════════════════════════════════════════════════════════════

export interface CountryConfig {
  code: string;
  name: string;
  currency: string;
  region: 'US' | 'ME' | 'AF' | 'AS';
  dataRegion: DataRegion;
  taxCodes: string[];           // refs into TAX_CODE_LIBRARY
  payrollDeductions: string[];  // country key in PAYROLL_DEDUCTIONS
  gateways: string[];           // gateway IDs from GATEWAY_REGISTRY
  invoiceFormat: { prefix: string; dateFormat: string; rtl: boolean; language: string };
  eInvoicing?: { adapter: string; mandatory: boolean };
  compliance: { tinFormat?: string; tinLabel?: string; retentionYears: number };
  offlineFirst: boolean;
}

export const COUNTRY_CONFIGS: Record<string, CountryConfig> = {
  US: { code: 'US', name: 'United States', currency: 'USD', region: 'US', dataRegion: 'us-east', taxCodes: ['US_SALES', 'US_FICA'], payrollDeductions: ['US'], gateways: ['stripe', 'paypal', 'square'], invoiceFormat: { prefix: 'INV', dateFormat: 'MM/DD/YYYY', rtl: false, language: 'en' }, compliance: { tinFormat: 'XX-XXXXXXX', tinLabel: 'EIN', retentionYears: 7 }, offlineFirst: false },
  AE: { code: 'AE', name: 'UAE', currency: 'AED', region: 'ME', dataRegion: 'me-dubai', taxCodes: ['AE_VAT'], payrollDeductions: ['AE'], gateways: ['tap', 'moyasar'], invoiceFormat: { prefix: 'INV', dateFormat: 'DD/MM/YYYY', rtl: true, language: 'ar' }, compliance: { tinFormat: 'XXXXXXXXXXXXXXXXX', tinLabel: 'TRN', retentionYears: 5 }, offlineFirst: false },
  SA: { code: 'SA', name: 'Saudi Arabia', currency: 'SAR', region: 'ME', dataRegion: 'me-dubai', taxCodes: ['SA_VAT', 'SA_ZAKAT'], payrollDeductions: ['SA'], gateways: ['tap', 'moyasar', 'sadad'], invoiceFormat: { prefix: 'INV', dateFormat: 'DD/MM/YYYY', rtl: true, language: 'ar' }, eInvoicing: { adapter: 'zatca', mandatory: true }, compliance: { tinFormat: 'XXXXXXXXXXXXXXXXX', tinLabel: 'VAT Reg', retentionYears: 6 }, offlineFirst: false },
  EG: { code: 'EG', name: 'Egypt', currency: 'EGP', region: 'ME', dataRegion: 'me-dubai', taxCodes: ['EG_VAT'], payrollDeductions: [], gateways: ['fawry'], invoiceFormat: { prefix: 'INV', dateFormat: 'DD/MM/YYYY', rtl: true, language: 'ar' }, compliance: { retentionYears: 5 }, offlineFirst: false },
  GH: { code: 'GH', name: 'Ghana', currency: 'GHS', region: 'AF', dataRegion: 'af-accra', taxCodes: ['GH_VAT', 'GH_GET', 'GH_WHT'], payrollDeductions: ['GH'], gateways: ['flutterwave', 'mtn_momo'], invoiceFormat: { prefix: 'INV', dateFormat: 'DD/MM/YYYY', rtl: false, language: 'en' }, compliance: { tinFormat: 'CXXXXXXXXXX', tinLabel: 'GRA TIN', retentionYears: 6 }, offlineFirst: true },
  KE: { code: 'KE', name: 'Kenya', currency: 'KES', region: 'AF', dataRegion: 'af-accra', taxCodes: ['KE_VAT', 'KE_WHT'], payrollDeductions: ['KE'], gateways: ['flutterwave', 'mpesa'], invoiceFormat: { prefix: 'INV', dateFormat: 'DD/MM/YYYY', rtl: false, language: 'sw' }, compliance: { tinFormat: 'AXXXXXXXXX', tinLabel: 'KRA PIN', retentionYears: 5 }, offlineFirst: true },
  ZA: { code: 'ZA', name: 'South Africa', currency: 'ZAR', region: 'AF', dataRegion: 'af-accra', taxCodes: ['ZA_VAT'], payrollDeductions: [], gateways: ['flutterwave', 'ozow'], invoiceFormat: { prefix: 'INV', dateFormat: 'DD/MM/YYYY', rtl: false, language: 'en' }, compliance: { retentionYears: 5 }, offlineFirst: false },
  IN: { code: 'IN', name: 'India', currency: 'INR', region: 'AS', dataRegion: 'as-mumbai', taxCodes: ['IN_GST_0', 'IN_GST_5', 'IN_GST_12', 'IN_GST_18', 'IN_TDS'], payrollDeductions: ['IN'], gateways: ['razorpay'], invoiceFormat: { prefix: 'INV', dateFormat: 'DD/MM/YYYY', rtl: false, language: 'hi' }, eInvoicing: { adapter: 'irp', mandatory: true }, compliance: { tinFormat: 'XXAAAXXXXXXXA', tinLabel: 'GSTIN', retentionYears: 8 }, offlineFirst: true },
  PH: { code: 'PH', name: 'Philippines', currency: 'PHP', region: 'AS', dataRegion: 'as-mumbai', taxCodes: ['PH_VAT', 'PH_WHT'], payrollDeductions: ['PH'], gateways: ['gcash'], invoiceFormat: { prefix: 'INV', dateFormat: 'MM/DD/YYYY', rtl: false, language: 'en' }, eInvoicing: { adapter: 'bir', mandatory: false }, compliance: { tinFormat: 'XXX-XXX-XXX-XXX', tinLabel: 'TIN', retentionYears: 10 }, offlineFirst: true },
  PK: { code: 'PK', name: 'Pakistan', currency: 'PKR', region: 'AS', dataRegion: 'as-mumbai', taxCodes: ['PK_GST'], payrollDeductions: ['PK'], gateways: ['easypaisa'], invoiceFormat: { prefix: 'INV', dateFormat: 'DD/MM/YYYY', rtl: false, language: 'en' }, compliance: { tinFormat: 'XXXXXXX', tinLabel: 'NTN', retentionYears: 6 }, offlineFirst: true },
  ID: { code: 'ID', name: 'Indonesia', currency: 'IDR', region: 'AS', dataRegion: 'as-mumbai', taxCodes: ['ID_PPN'], payrollDeductions: [], gateways: ['gopay'], invoiceFormat: { prefix: 'INV', dateFormat: 'DD/MM/YYYY', rtl: false, language: 'id' }, eInvoicing: { adapter: 'efaktur', mandatory: true }, compliance: { tinFormat: 'XX.XXX.XXX.X-XXX.XXX', tinLabel: 'NPWP', retentionYears: 10 }, offlineFirst: true },
  MY: { code: 'MY', name: 'Malaysia', currency: 'MYR', region: 'AS', dataRegion: 'as-mumbai', taxCodes: ['MY_SST'], payrollDeductions: [], gateways: ['fpx'], invoiceFormat: { prefix: 'INV', dateFormat: 'DD/MM/YYYY', rtl: false, language: 'en' }, compliance: { retentionYears: 7 }, offlineFirst: false },
};
