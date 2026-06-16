/**
 * Accounting Module — Frontend Service
 * Global Feature Specification: US · Middle East · Africa · Asia
 *
 * Supports: Invoicing, Credit Notes, Partial Payments, Recurring,
 * Multi-Currency FX, Pro Forma, Payment Links, Regional Compliance
 */

import { authedFetch } from '@/services/authApi';

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE = `${envBaseUrl?.trim() ? envBaseUrl.trim().replace(/\/$/, '') : 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api'}/accounting`;
const H = { 'Content-Type': 'application/json' } as const;

// ── Types ──────────────────────────────────────────────────────────────────────

export type InvoiceStatus = 'draft' | 'pending' | 'paid' | 'overdue' | 'cancelled' | 'partially_paid';
export type InvoiceType = 'standard' | 'proforma' | 'credit_note' | 'recurring';
export type PaymentMethod = 'bank_transfer' | 'credit_card' | 'mobile_money' | 'cash' | 'paypal' | 'stripe' | 'flutterwave' | 'razorpay' | 'other';

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
  taxLabel?: string;
  hsnCode?: string;
  total: number;
}

export interface RegionalCompliance {
  region?: 'US' | 'ME' | 'AF' | 'AS';
  country?: string;
  ein?: string; taxId?: string; vatNumber?: string;
  isRTL?: boolean; hijriDate?: string; zatcaQr?: string;
  graTin?: string; kraPin?: string; sarsVat?: string; mobileMoneyInfo?: string;
  gstin?: string; hsnCode?: string; irpQr?: string; birOr?: string; ntn?: string;
  paymentTerms?: string;
}

export interface RecurringConfig {
  frequency: 'weekly' | 'monthly' | 'quarterly' | 'yearly';
  startDate: string;
  endDate?: string;
  nextRunDate: string;
  autoSend: boolean;
  remindersEnabled: boolean;
  reminderDays?: number[];
  lateFeePercent?: number;
  occurrencesGenerated?: number;
}

export interface PartialPayment {
  id: string;
  date: string;
  amount: string;
  method: PaymentMethod;
  reference?: string;
  notes?: string;
}

export interface Invoice {
  id: string;
  invoice: string;
  type: InvoiceType;
  client: string;
  clientEmail?: string;
  clientPhone?: string;
  clientCountry?: string;
  amount: string;
  status: InvoiceStatus;
  dueDate: string;
  module: string;
  description?: string;
  currency: string;
  baseCurrencyAmount?: string;
  language?: string;
  taxAmount?: string;
  lineItems?: InvoiceLineItem[];
  subtotal?: string;
  totalDiscount?: string;
  totalTax?: string;
  compliance?: RegionalCompliance;
  recurring?: RecurringConfig;
  paymentLink?: string;
  paymentMethod?: PaymentMethod;
  partialPayments?: PartialPayment[];
  outstandingBalance?: string;
  linkedCreditNotes?: string[];
  isProForma?: boolean;
  customsReference?: string;
  createdAt?: string;
}

export interface CreditNote {
  id: string;
  creditNoteNumber: string;
  originalInvoiceId: string;
  originalInvoiceNumber: string;
  client: string;
  amount: string;
  currency: string;
  reason: string;
  status: 'draft' | 'issued' | 'applied';
  createdAt?: string;
}

export interface Expense {
  id: string;
  description: string;
  amount: string;
  currency?: string;
  category: string;
  date: string;
  status: 'pending' | 'approved' | 'rejected';
  employee?: string;
  receipt?: string;
  merchant?: string;
  vendor?: string;
  taxId?: string;
  taxAmount?: number;
  notes?: string;
  paymentMethod?: string;
  projectCode?: string;
  source?: string;
  storageDestination?: string;
}

export interface AccountingStats {
  totalRevenue: number;
  outstanding: number;
  totalExpenses: number;
  netProfit: number;
  invoiceCount: number;
  paidInvoices: number;
  overdueInvoices: number;
  pendingInvoices: number;
  revenueByModule: Record<string, number>;
  mrr?: number;
  arr?: number;
}

// ── FX Rates (client-side mirror for instant display) ─────────────────────────
export const FX_RATES: Record<string, number> = {
  USD: 1.00, AED: 3.67, SAR: 3.75, EGP: 30.90, JOD: 0.71,
  GHS: 14.50, KES: 129.00, ZAR: 18.10,
  INR: 83.40, PHP: 56.20, PKR: 278.00, IDR: 15650.00, MYR: 4.72,
  EUR: 0.92, GBP: 0.79,
};

export const SUPPORTED_CURRENCIES = Object.keys(FX_RATES);

export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', rtl: false },
  { code: 'ar', name: 'Arabic', rtl: true },
  { code: 'fr', name: 'French', rtl: false },
  { code: 'sw', name: 'Swahili', rtl: false },
  { code: 'hi', name: 'Hindi', rtl: false },
  { code: 'id', name: 'Bahasa', rtl: false },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function nextInvoiceNumber(prefix = 'INV'): string {
  const year = new Date().getFullYear();
  const seq = String(Math.floor(Math.random() * 900) + 100).padStart(3, '0');
  return `${prefix}-${year}-${seq}`;
}

// ── Service ────────────────────────────────────────────────────────────────────

export const accountingService = {
  // ── Invoices ────────────────────────────────────────────────────────────────

  getInvoices: async (params?: { search?: string; status?: InvoiceStatus; module?: string; limit?: number }): Promise<Invoice[]> => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.status) query.set('status', params.status);
    if (params?.module) query.set('module', params.module);
    if (params?.limit) query.set('limit', String(params.limit));
    try {
      const res = await authedFetch(`${BASE}/invoices?${query.toString()}`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    } catch { return []; }
  },

  syncContactsToCrm: async (): Promise<{ synced: number; errors: number } | null> => {
    try {
      const res = await authedFetch(`${BASE}/crm-sync`, { method: 'POST', headers: H });
      return res.ok ? res.json() : null;
    } catch { return null; }
  },

  createInvoice: async (data: Partial<Invoice> & Record<string, unknown>): Promise<Invoice | null> => {
    const res = await authedFetch(`${BASE}/invoices`, {
      method: 'POST',
      headers: H,
      body: JSON.stringify({ ...data, invoice: data.invoice ?? nextInvoiceNumber(), status: data.status ?? 'draft' }),
    });
    if (res.status === 409) { const body = await res.json().catch(() => ({})); throw new Error(body?.message ?? 'Duplicate invoice'); }
    return res.ok ? res.json() : null;
  },

  updateInvoice: async (id: string, data: Partial<Invoice>): Promise<Invoice | null> => {
    try {
      const res = await authedFetch(`${BASE}/invoices/${id}`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify(data),
      });
      return res.ok ? res.json() : null;
    } catch { return null; }
  },

  deleteInvoice: async (id: string): Promise<boolean> => {
    try {
      const res = await authedFetch(`${BASE}/invoices/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      const json = await res.json();
      return json.success !== false;
    } catch { return false; }
  },

  // ── Credit Notes ────────────────────────────────────────────────────────────

  createCreditNote: async (data: { originalInvoiceId: string; amount: string; reason: string }): Promise<CreditNote | null> => {
    try {
      const res = await authedFetch(`${BASE}/credit-notes`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify(data),
      });
      return res.ok ? res.json() : null;
    } catch { return null; }
  },

  getCreditNotes: async (): Promise<CreditNote[]> => {
    try {
      const res = await authedFetch(`${BASE}/credit-notes`);
      if (!res.ok) return [];
      return res.json();
    } catch { return []; }
  },

  // ── Partial Payments ────────────────────────────────────────────────────────

  addPartialPayment: async (invoiceId: string, payment: { date: string; amount: string; method: string; reference?: string }): Promise<Invoice | null> => {
    try {
      const res = await authedFetch(`${BASE}/invoices/${invoiceId}/payments`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify(payment),
      });
      return res.ok ? res.json() : null;
    } catch { return null; }
  },

  // ── Recurring ───────────────────────────────────────────────────────────────

  processRecurring: async (): Promise<{ generated: number } | null> => {
    try {
      const res = await authedFetch(`${BASE}/recurring/process`, { method: 'POST' });
      return res.ok ? res.json() : null;
    } catch { return null; }
  },

  // ── FX Conversion ───────────────────────────────────────────────────────────

  convertCurrency: async (amount: number, from: string, to: string): Promise<{ converted: number; rate: number } | null> => {
    try {
      const res = await authedFetch(`${BASE}/fx/convert?amount=${amount}&from=${from}&to=${to}`);
      return res.ok ? res.json() : null;
    } catch { return null; }
  },

  /** Client-side instant FX conversion (no network call) */
  convertLocal: (amount: number, from: string, to: string): number => {
    const fromRate = FX_RATES[from] ?? 1;
    const toRate = FX_RATES[to] ?? 1;
    return Math.round(((amount / fromRate) * toRate) * 100) / 100;
  },

  // ── Pro Forma ───────────────────────────────────────────────────────────────

  createProForma: async (data: Partial<Invoice> & { customsReference?: string }): Promise<Invoice | null> => {
    try {
      const res = await authedFetch(`${BASE}/proforma`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.ok ? res.json() : null;
    } catch { return null; }
  },

  // ── Expenses ────────────────────────────────────────────────────────────────

  getExpenses: async (params?: { limit?: number; category?: string }): Promise<Expense[]> => {
    const query = new URLSearchParams();
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.category) query.set('category', params.category);
    try {
      const res = await authedFetch(`${BASE}/expenses?${query.toString()}`);
      if (!res.ok) return [];
      const json = await res.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    } catch { return []; }
  },

  createExpense: async (data: Partial<Expense>): Promise<Expense | null> => {
    const res = await authedFetch(`${BASE}/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, date: data.date ?? new Date().toISOString().slice(0, 10) }),
    });
    if (res.status === 409) { const body = await res.json().catch(() => ({})); throw new Error(body?.message ?? 'Duplicate expense'); }
    return res.ok ? res.json() : null;
  },

  updateExpense: async (id: string, data: Partial<Expense>): Promise<Expense | null> => {
    try {
      const res = await authedFetch(`${BASE}/expenses/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      return res.ok ? res.json() : null;
    } catch { return null; }
  },

  deleteExpense: async (id: string): Promise<boolean> => {
    try {
      const res = await authedFetch(`${BASE}/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      const json = await res.json();
      return json.success !== false;
    } catch { return false; }
  },

  // ── Stats & Analytics ───────────────────────────────────────────────────────

  getStats: async (): Promise<AccountingStats> => {
    const empty: AccountingStats = { totalRevenue: 0, outstanding: 0, totalExpenses: 0, netProfit: 0, invoiceCount: 0, paidInvoices: 0, overdueInvoices: 0, pendingInvoices: 0, revenueByModule: {} };
    try {
      const res = await authedFetch(`${BASE}/stats`);
      if (!res.ok) return empty;
      return res.json();
    } catch { return empty; }
  },

  getAnalytics: async (range = '30d') => {
    try {
      const res = await authedFetch(`${BASE}/analytics?range=${range}`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  getInsights: async () => {
    try {
      const res = await authedFetch(`${BASE}/insights`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  // ── Payroll ─────────────────────────────────────────────────────────────────

  /** Fetch payroll summary for the current period — merges live HR preview with run history */
  getPayrollSummary: async () => {
    try {
      const [runsRes, previewRes] = await Promise.all([
        authedFetch(`${BASE}/payroll/runs`),
        authedFetch(`${BASE}/payroll/preview`),
      ]);
      const runs = runsRes.ok ? await runsRes.json() : [];
      const preview = previewRes.ok ? await previewRes.json() : null;
      const latest = Array.isArray(runs) && runs.length > 0 ? runs[0] : null;
      return {
        runs: Array.isArray(runs) ? runs : [],
        period: latest?.period ?? preview?.period ?? new Date().toISOString().slice(0, 7),
        // Prefer live HR preview data over stale run history for the pre-run display
        totalGross: preview?.totalGross ?? latest?.totalGross ?? 0,
        totalNet: preview?.totalNet ?? latest?.totalNet ?? 0,
        totalDeductions: preview?.totalDeductions ?? latest?.totalDeductions ?? 0,
        currency: latest?.currency ?? preview?.currency ?? 'USD',
        employeeCount: preview?.employeeCount ?? latest?.employeeCount ?? 0,
        employeeList: preview?.employeeList ?? [],
        missingPayData: preview?.missingPayData ?? [],
        status: latest?.status ?? 'ready',
      };
    } catch {
      return { runs: [], period: new Date().toISOString().slice(0, 7), totalGross: 0, totalNet: 0, totalDeductions: 0, currency: 'USD', employeeCount: 0, employeeList: [], status: 'ready' };
    }
  },

  runPayroll: async (params: { period: string; currency?: string; adjustments?: Record<string, unknown> }) => {
    try {
      const res = await authedFetch(`${BASE}/payroll/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
      return res.ok ? res.json() : null;
    } catch { return null; }
  },

  // ── Tax Reports ─────────────────────────────────────────────────────────────

  getTaxSummary: async (params: { period: string; country?: string }) => {
    try {
      const query = new URLSearchParams(params as Record<string, string>);
      const res = await authedFetch(`${BASE}/tax/summary?${query.toString()}`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 2: PAYMENTS & COLLECTIONS
  // ═══════════════════════════════════════════════════════════════════════════

  getGateways: async (country: string) => {
    try { const r = await authedFetch(`${BASE}/gateways/${country}`); return r.ok ? r.json() : []; } catch { return []; }
  },

  routePayment: async (country: string, method?: string) => {
    try { const q = method ? `?method=${method}` : ''; const r = await authedFetch(`${BASE}/gateways/${country}/route${q}`); return r.ok ? r.json() : null; } catch { return null; }
  },

  reconcilePayment: async (data: { amount: string; date: string; reference: string; method: string }) => {
    try { const r = await authedFetch(`${BASE}/reconcile`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  getReconciliation: async (status?: string) => {
    try { const q = status ? `?status=${status}` : ''; const r = await authedFetch(`${BASE}/reconciliation${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },

  processDunning: async () => {
    try { const r = await authedFetch(`${BASE}/dunning/process`, { method: 'POST' }); return r.ok ? r.json() : null; } catch { return null; }
  },

  getVendorBills: async (params?: { status?: string; limit?: number }) => {
    const q = new URLSearchParams(); if (params?.status) q.set('status', params.status); if (params?.limit) q.set('limit', String(params.limit));
    try { const r = await authedFetch(`${BASE}/vendor-bills?${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },

  createVendorBill: async (data: Record<string, unknown>) => {
    const r = await authedFetch(`${BASE}/vendor-bills`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (r.status === 409) { const body = await r.json().catch(() => ({})); throw new Error(body?.message ?? 'Duplicate vendor bill'); }
    return r.ok ? r.json() : null;
  },

  approveVendorBill: async (id: string, approver = 'admin') => {
    try { const r = await authedFetch(`${BASE}/vendor-bills/${id}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approver }) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  deleteVendorBill: async (id: string) => {
    try { const r = await authedFetch(`${BASE}/vendor-bills/${id}`, { method: 'DELETE' }); return r.ok; } catch { return false; }
  },

  createBulkPayment: async (data: { entries: Array<{ recipient: string; amount: string; currency: string; reference: string }>; format: string; currency: string }) => {
    try { const r = await authedFetch(`${BASE}/bulk-payments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  getBulkPayments: async () => {
    try { const r = await authedFetch(`${BASE}/bulk-payments`); return r.ok ? r.json() : []; } catch { return []; }
  },

  approveBulkPayment: async (id: string) => {
    try { const r = await authedFetch(`${BASE}/bulk-payments/${id}/approve`, { method: 'POST' }); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 3: TAX & COMPLIANCE
  // ═══════════════════════════════════════════════════════════════════════════

  getTaxCodes: async (country?: string) => {
    try { const q = country ? `?country=${country}` : ''; const r = await authedFetch(`${BASE}/tax-codes${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  createTaxCode: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/tax-codes`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  getDefaultTaxCode: async (country: string) => {
    try { const r = await authedFetch(`${BASE}/tax-codes/${country}/default`); return r.ok ? r.json() : null; } catch { return null; }
  },

  getAuditTrail: async (params?: { entityId?: string; entityType?: string; limit?: number }) => {
    const q = new URLSearchParams(); if (params?.entityId) q.set('entityId', params.entityId); if (params?.entityType) q.set('entityType', params.entityType); if (params?.limit) q.set('limit', String(params.limit));
    try { const r = await authedFetch(`${BASE}/audit-trail?${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },

  archiveDocument: async (data: { documentType: string; documentId: string; title: string; country: string; searchTags?: string[] }) => {
    try { const r = await authedFetch(`${BASE}/documents/archive`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  getArchivedDocuments: async (params?: { search?: string; documentType?: string; limit?: number }) => {
    const q = new URLSearchParams(); if (params?.search) q.set('search', params.search); if (params?.documentType) q.set('documentType', params.documentType); if (params?.limit) q.set('limit', String(params.limit));
    try { const r = await authedFetch(`${BASE}/documents/archive?${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 4: EXPENSE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  scanReceipt: async (data: { vendor?: string; amount?: string; date?: string; rawText?: string; imageBase64?: string; mediaType?: string }) => {
    try { const r = await authedFetch(`${BASE}/receipts/scan`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getReceiptScans: async (status?: string) => {
    try { const q = status ? `?status=${status}` : ''; const r = await authedFetch(`${BASE}/receipts${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  approveReceipt: async (id: string) => {
    try { const r = await authedFetch(`${BASE}/receipts/${id}/approve`, { method: 'POST' }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getExpenseCategories: async (memberType?: string) => {
    try { const q = memberType ? `?memberType=${memberType}` : ''; const r = await authedFetch(`${BASE}/expense-categories${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  submitExpenseForApproval: async (expenseId: string, approver: string) => {
    try { const r = await authedFetch(`${BASE}/expenses/${expenseId}/submit-approval`, { method: 'POST', headers: H, body: JSON.stringify({ approver }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  approveExpenseApproval: async (approvalId: string, comments?: string) => {
    try { const r = await authedFetch(`${BASE}/expense-approvals/${approvalId}/approve`, { method: 'POST', headers: H, body: JSON.stringify({ comments }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getExpenseApprovals: async (status?: string) => {
    try { const q = status ? `?status=${status}` : ''; const r = await authedFetch(`${BASE}/expense-approvals${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  addMileageEntry: async (data: { employeeId: string; employee: string; distance: number; purpose: string; country: string }) => {
    try { const r = await authedFetch(`${BASE}/mileage`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getMileageEntries: async (employeeId?: string) => {
    try { const q = employeeId ? `?employeeId=${employeeId}` : ''; const r = await authedFetch(`${BASE}/mileage${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  addPettyCashEntry: async (data: { type: string; amount: string; currency: string; description: string }) => {
    try { const r = await authedFetch(`${BASE}/petty-cash`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getPettyCashEntries: async () => {
    try { const r = await authedFetch(`${BASE}/petty-cash`); return r.ok ? r.json() : []; } catch { return []; }
  },
  getPettyCashBalance: async () => {
    try { const r = await authedFetch(`${BASE}/petty-cash/balance`); return r.ok ? r.json() : { balance: 0, currency: 'USD' }; } catch { return { balance: 0, currency: 'USD' }; }
  },
  createDonorFund: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/donor-funds`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getDonorFunds: async () => {
    try { const r = await authedFetch(`${BASE}/donor-funds`); return r.ok ? r.json() : []; } catch { return []; }
  },
  chargeDonorFund: async (fundId: string, expenseId: string, amount: string) => {
    try { const r = await authedFetch(`${BASE}/donor-funds/${fundId}/charge`, { method: 'POST', headers: H, body: JSON.stringify({ expenseId, amount }) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 5: PAYROLL MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  runPayrollAdvanced: async (data: { period: string; country: string; currency: string; frequency?: string; employees: Array<{ id: string; name: string; grossSalary: number; overtimeHours?: number; unpaidLeaveDays?: number }> }) => {
    try { const r = await authedFetch(`${BASE}/payroll/run-advanced`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getPayrollRuns: async () => {
    try { const r = await authedFetch(`${BASE}/payroll/runs`); return r.ok ? r.json() : []; } catch { return []; }
  },
  getPayrollDeductions: async (country: string) => {
    try { const r = await authedFetch(`${BASE}/payroll/deductions/${country}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  calculateEOSB: async (data: { employeeName: string; country: string; startDate: string; lastSalary: number; currency: string }) => {
    try { const r = await authedFetch(`${BASE}/payroll/eosb`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 6: FINANCIAL REPORTING
  // ═══════════════════════════════════════════════════════════════════════════

  getProfitAndLoss: async (period?: string, currency?: string) => {
    const q = new URLSearchParams(); if (period) q.set('period', period); if (currency) q.set('currency', currency);
    try { const r = await authedFetch(`${BASE}/reports/pnl?${q}`); return r.ok ? r.json() : null; } catch { return null; }
  },
  getCashFlowForecast: async (currency?: string) => {
    const q = currency ? `?currency=${currency}` : '';
    try { const r = await authedFetch(`${BASE}/reports/cash-flow${q}`); return r.ok ? r.json() : null; } catch { return null; }
  },
  /** Used by AI Cash Flow Forecast panel */
  getForecastData: async () => {
    try {
      const [cashFlow, pnl, arAging, stats] = await Promise.all([
        authedFetch(`${BASE}/reports/cash-flow`).then(r => r.ok ? r.json() : null).catch(() => null),
        authedFetch(`${BASE}/reports/pnl`).then(r => r.ok ? r.json() : null).catch(() => null),
        authedFetch(`${BASE}/reports/ar-aging`).then(r => r.ok ? r.json() : []).catch(() => []),
        authedFetch(`${BASE}/stats`).then(r => r.ok ? r.json() : null).catch(() => null),
      ]);
      return { cashFlow, pnl, arAging, stats };
    } catch { return { cashFlow: null, pnl: null, arAging: [], stats: null }; }
  },
  /** Used by Smart Dunning panel — returns overdue invoices */
  getOverdueInvoices: async () => {
    try {
      const r = await authedFetch(`${BASE}/invoices?status=overdue`);
      if (!r.ok) return [];
      const json = await r.json();
      return Array.isArray(json) ? json : (json.data ?? []);
    } catch { return []; }
  },
  getARAgingReport: async () => {
    try { const r = await authedFetch(`${BASE}/reports/ar-aging`); return r.ok ? r.json() : []; } catch { return []; }
  },


  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 7: BANK & ACCOUNT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════════════════

  createBankAccount: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/bank-accounts`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getBankAccounts: async () => {
    try { const r = await authedFetch(`${BASE}/bank-accounts`); return r.ok ? r.json() : []; } catch { return []; }
  },
  addBankTransaction: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/bank-transactions`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getBankTransactions: async (accountId?: string, reconciled?: boolean) => {
    const q = new URLSearchParams(); if (accountId) q.set('accountId', accountId); if (reconciled !== undefined) q.set('reconciled', String(reconciled));
    try { const r = await authedFetch(`${BASE}/bank-transactions?${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  reconcileBankTransaction: async (txnId: string, invoiceId?: string, expenseId?: string) => {
    try { const r = await authedFetch(`${BASE}/bank-transactions/${txnId}/reconcile`, { method: 'POST', headers: H, body: JSON.stringify({ invoiceId, expenseId }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  createIntercompanyTransfer: async (data: { fromAccountId: string; toAccountId: string; amount: string; currency: string; description: string }) => {
    try { const r = await authedFetch(`${BASE}/intercompany-transfers`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getIntercompanyTransfers: async () => {
    try { const r = await authedFetch(`${BASE}/intercompany-transfers`); return r.ok ? r.json() : []; } catch { return []; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 8: SUBSCRIPTIONS & RECURRING REVENUE
  // ═══════════════════════════════════════════════════════════════════════════

  createSubscriptionPlan: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/subscription-plans`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getSubscriptionPlans: async () => {
    try { const r = await authedFetch(`${BASE}/subscription-plans`); return r.ok ? r.json() : []; } catch { return []; }
  },
  getLocalizedPrice: async (planId: string, country: string) => {
    try { const r = await authedFetch(`${BASE}/subscription-plans/${planId}/price/${country}`); return r.ok ? r.json() : null; } catch { return null; }
  },
  createSubscription: async (data: { memberId: string; memberName: string; planId: string; country: string; couponCode?: string }) => {
    try { const r = await authedFetch(`${BASE}/subscriptions`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getSubscriptions: async (status?: string) => {
    try { const q = status ? `?status=${status}` : ''; const r = await authedFetch(`${BASE}/subscriptions${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  cancelSubscription: async (id: string) => {
    try { const r = await authedFetch(`${BASE}/subscriptions/${id}/cancel`, { method: 'POST' }); return r.ok ? r.json() : null; } catch { return null; }
  },
  calculateProration: async (data: { currentAmount: number; newAmount: number; periodEnd: string }) => {
    try { const r = await authedFetch(`${BASE}/subscriptions/prorate`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  createCoupon: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/coupons`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getCoupons: async () => {
    try { const r = await authedFetch(`${BASE}/coupons`); return r.ok ? r.json() : []; } catch { return []; }
  },
  deactivateCoupon: async (id: string) => {
    try { const r = await authedFetch(`${BASE}/coupons/${id}/deactivate`, { method: 'POST' }); return r.ok ? r.json() : null; } catch { return null; }
  },
  applyCoupon: async (code: string, amount: number, country?: string) => {
    try { const r = await authedFetch(`${BASE}/coupons/apply`, { method: 'POST', headers: H, body: JSON.stringify({ code, amount, country }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getChurnMetrics: async () => {
    try { const r = await authedFetch(`${BASE}/churn-metrics`); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 9: INTEGRATIONS & FLYN AI ECOSYSTEM
  // ═══════════════════════════════════════════════════════════════════════════

  registerWebhook: async (data: { url: string; events: string[] }) => {
    try { const r = await authedFetch(`${BASE}/webhooks`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getWebhooks: async () => {
    try { const r = await authedFetch(`${BASE}/webhooks`); return r.ok ? r.json() : []; } catch { return []; }
  },
  deleteWebhook: async (id: string) => {
    try { const r = await authedFetch(`${BASE}/webhooks/${id}`, { method: 'DELETE' }); return r.ok; } catch { return false; }
  },
  syncFromIntegration: async (data: { source: string; eventType: string; sourceId: string; data: Record<string, unknown> }) => {
    try { const r = await authedFetch(`${BASE}/integrations/sync`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getIntegrationSyncs: async (source?: string) => {
    try { const q = source ? `?source=${source}` : ''; const r = await authedFetch(`${BASE}/integrations/sync${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  configureExternalSync: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/integrations/external`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getExternalSyncs: async () => {
    try { const r = await authedFetch(`${BASE}/integrations/external`); return r.ok ? r.json() : []; } catch { return []; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 10: ROLES, PERMISSIONS & MULTI-ENTITY
  // ═══════════════════════════════════════════════════════════════════════════

  getPermissionsForRole: async (role: string) => {
    try { const r = await authedFetch(`${BASE}/permissions/${role}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  checkPermission: async (role: string, permission: string) => {
    try { const r = await authedFetch(`${BASE}/permissions/${role}/check/${permission}`); return r.ok ? r.json() : { allowed: false }; } catch { return { allowed: false }; }
  },
  createApprovalChain: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/approval-chains`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getApprovalChains: async () => {
    try { const r = await authedFetch(`${BASE}/approval-chains`); return r.ok ? r.json() : []; } catch { return []; }
  },
  checkApprovalRequired: async (entityType: string, amount: number) => {
    try { const r = await authedFetch(`${BASE}/approval-chains/check?entityType=${entityType}&amount=${amount}`); return r.ok ? r.json() : { required: false, approvers: [] }; } catch { return { required: false, approvers: [] }; }
  },
  createLegalEntity: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/entities`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getLegalEntities: async () => {
    try { const r = await authedFetch(`${BASE}/entities`); return r.ok ? r.json() : []; } catch { return []; }
  },
  deleteLegalEntity: async (id: string) => {
    try { const r = await authedFetch(`${BASE}/entities/${id}`, { method: 'DELETE' }); return r.ok; } catch { return false; }
  },
  getAllRolePermissions: async (): Promise<Record<string, string[]>> => {
    try { const r = await authedFetch(`${BASE}/roles/permissions`); return r.ok ? r.json() : {}; } catch { return {}; }
  },
  saveRolePermissions: async (role: string, permissions: string[]): Promise<boolean> => {
    try { const r = await authedFetch(`${BASE}/roles/permissions`, { method: 'POST', headers: H, body: JSON.stringify({ role, permissions }) }); return r.ok; } catch { return false; }
  },
  inviteAccountant: async (data: { email: string; name: string; accessLevel?: string; role?: string }) => {
    try { const r = await authedFetch(`${BASE}/accountant-invites`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getAccountantInvites: async () => {
    try { const r = await authedFetch(`${BASE}/accountant-invites`); return r.ok ? r.json() : []; } catch { return []; }
  },
  revokeAccountantInvite: async (id: string) => {
    try { const r = await authedFetch(`${BASE}/accountant-invites/${id}/revoke`, { method: 'POST' }); return r.ok; } catch { return false; }
  },
  logExport: async (data: { userId: string; userName: string; exportType: string; entityType: string; recordCount: number }) => {
    try { const r = await authedFetch(`${BASE}/export-log`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getExportLogs: async (userId?: string) => {
    try { const q = userId ? `?userId=${userId}` : ''; const r = await authedFetch(`${BASE}/export-log${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  getCountryConfig: async (code: string) => {
    try { const r = await authedFetch(`${BASE}/country-config/${code}`); return r.ok ? r.json() : null; } catch { return null; }
  },
  getAllCountryConfigs: async () => {
    try { const r = await authedFetch(`${BASE}/country-configs`); return r.ok ? r.json() : {}; } catch { return {}; }
  },
  getDataRegion: async (code: string) => {
    try { const r = await authedFetch(`${BASE}/data-region/${code}`); return r.ok ? r.json() : null; } catch { return null; }
  },
  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 19: PLAID BANK CONNECTIVITY
  // ═══════════════════════════════════════════════════════════════════════════

  plaidGetStatus: async (): Promise<{ connected: boolean; institutionName?: string; connectedAt?: number; accountsCount?: number; needsReconnect?: boolean; error?: string }> => {
    try { const r = await authedFetch(`${BASE}/plaid/status`); return r.ok ? r.json() : { connected: false }; } catch { return { connected: false }; }
  },

  plaidCreateLinkToken: async (userId?: string): Promise<{ success?: boolean; link_token?: string; error?: string } | null> => {
    try { const r = await authedFetch(`${BASE}/plaid/link-token`, { method: 'POST', headers: H, body: JSON.stringify({ userId }) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  plaidExchange: async (publicToken: string, metadata?: any): Promise<{ success?: boolean; itemId?: string; accountsVerified?: number; error?: string } | null> => {
    try { const r = await authedFetch(`${BASE}/plaid/exchange`, { method: 'POST', headers: H, body: JSON.stringify({ publicToken, metadata }) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  plaidGetAccounts: async (): Promise<any[]> => {
    try { const r = await authedFetch(`${BASE}/plaid/accounts`); return r.ok ? r.json() : []; } catch { return []; }
  },

  plaidGetBalances: async (): Promise<any[]> => {
    try { const r = await authedFetch(`${BASE}/plaid/balances`); return r.ok ? r.json() : []; } catch { return []; }
  },

  plaidGetTransactions: async (startDate?: string, endDate?: string): Promise<{ transactions: any[]; total: number }> => {
    try {
      const q = new URLSearchParams();
      if (startDate) q.set('startDate', startDate);
      if (endDate) q.set('endDate', endDate);
      const r = await authedFetch(`${BASE}/plaid/transactions?${q}`);
      return r.ok ? r.json() : { transactions: [], total: 0 };
    } catch { return { transactions: [], total: 0 }; }
  },

  plaidDisconnect: async (): Promise<boolean> => {
    try { const r = await authedFetch(`${BASE}/plaid/disconnect`, { method: 'POST', headers: H }); return r.ok; } catch { return false; }
  },

  /** Generic AI analysis endpoint — used by Sync, Churn, Dunning panels */
  runAI: async (data: { prompt: string; context?: string }): Promise<{ response: string } | null> => {
    try {
      const r = await authedFetch(`${BASE}/ai/respond`, { method: 'POST', headers: H, body: JSON.stringify({ query: data.prompt, category: data.context }) });
      if (r.ok) return r.json();
      return null;
    } catch { return null; }
  },

  // ── Row-level Actions ──────────────────────────────────────────────────────

  sendInvoice: async (id: string): Promise<{ success: boolean; message?: string; emailSent?: boolean; whatsappSent?: boolean }> => {
    try {
      const res = await authedFetch(`${BASE}/invoices/${id}/send`, { method: 'POST', headers: H });
      if (res.ok) return res.json();
      const body = await res.json().catch(() => ({}));
      return { success: false, message: body?.message ?? 'Send failed' };
    } catch { return { success: false, message: 'Network error' }; }
  },

  createCheckoutSession: async (id: string, amountOverride?: number): Promise<{ url: string } | null> => {
    try {
      const body = amountOverride ? JSON.stringify({ amountOverride }) : undefined;
      const res = await authedFetch(`${BASE}/invoices/${id}/checkout`, { method: 'POST', headers: H, body });
      return res.ok ? res.json() : null;
    } catch { return null; }
  },

  downloadInvoice: async (id: string): Promise<Blob | null> => {
    try {
      const res = await authedFetch(`${BASE}/invoices/${id}/download`);
      return res.ok ? res.blob() : null;
    } catch { return null; }
  },

  recordPayment: async (id: string, data: { amount: number; date: string; method: string; reference?: string }): Promise<boolean> => {
    try {
      const res = await authedFetch(`${BASE}/invoices/${id}/payments`, {
        method: 'POST',
        headers: H,
        body: JSON.stringify(data),
      });
      return res.ok;
    } catch { return false; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 11: XERO SYNC
  // ═══════════════════════════════════════════════════════════════════════════

  getXeroStatus: async (tenantId: string) => {
    try { const r = await authedFetch(`${BASE}/xero/status?tenantId=${tenantId}`); return r.ok ? r.json() : null; } catch { return null; }
  },
  getXeroAccounts: async (tenantId: string) => {
    try { const r = await authedFetch(`${BASE}/xero/accounts?tenantId=${tenantId}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  pushInvoiceToXero: async (tenantId: string, invoiceId: string, accountMap?: Record<string, string>) => {
    try { const r = await authedFetch(`${BASE}/xero/push-invoice`, { method: 'POST', headers: H, body: JSON.stringify({ tenantId, invoiceId, accountMap }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  pushAllToXero: async (tenantId: string): Promise<{ pushed: number; failed: number; errors: string[] } | null> => {
    try { const r = await authedFetch(`${BASE}/xero/push-all`, { method: 'POST', headers: H, body: JSON.stringify({ tenantId }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  pullXeroPayments: async (tenantId: string, since?: string) => {
    try { const r = await authedFetch(`${BASE}/xero/pull-payments`, { method: 'POST', headers: H, body: JSON.stringify({ tenantId, since }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  pushContactToXero: async (tenantId: string, contact: { name: string; email?: string; phone?: string; taxNumber?: string }) => {
    try { const r = await authedFetch(`${BASE}/xero/push-contact`, { method: 'POST', headers: H, body: JSON.stringify({ tenantId, ...contact }) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 12: QUICKBOOKS SYNC
  // ═══════════════════════════════════════════════════════════════════════════

  getQBOStatus: async (tenantId: string) => {
    try { const r = await authedFetch(`${BASE}/quickbooks/status?tenantId=${tenantId}`); return r.ok ? r.json() : null; } catch { return null; }
  },
  pushInvoiceToQBO: async (tenantId: string, invoiceId: string) => {
    try { const r = await authedFetch(`${BASE}/quickbooks/push-invoice`, { method: 'POST', headers: H, body: JSON.stringify({ tenantId, invoiceId }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  pushAllToQBO: async (tenantId: string): Promise<{ pushed: number; failed: number; skipped?: number; errors: string[] } | null> => {
    try { const r = await authedFetch(`${BASE}/quickbooks/push-all`, { method: 'POST', headers: H, body: JSON.stringify({ tenantId }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  pullQBOPayments: async (tenantId: string, since?: string) => {
    try { const r = await authedFetch(`${BASE}/quickbooks/pull-payments`, { method: 'POST', headers: H, body: JSON.stringify({ tenantId, since }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  disconnectXero: async (tenantId: string): Promise<boolean> => {
    try { const r = await authedFetch(`${BASE}/xero/disconnect?tenantId=${encodeURIComponent(tenantId)}`, { method: 'POST', headers: H }); return r.ok; } catch { return false; }
  },
  disconnectQBO: async (tenantId: string): Promise<boolean> => {
    try { const r = await authedFetch(`${BASE}/quickbooks/disconnect?tenantId=${encodeURIComponent(tenantId)}`, { method: 'POST', headers: H }); return r.ok; } catch { return false; }
  },
  disconnectStripe: async (tenantId: string): Promise<boolean> => {
    try { const r = await authedFetch(`${BASE}/stripe/disconnect?tenantId=${encodeURIComponent(tenantId)}`, { method: 'POST', headers: H }); return r.ok; } catch { return false; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 13: BANK IMPORT
  // ═══════════════════════════════════════════════════════════════════════════

  importBankCSV: async (content: string, format?: string, accountId?: string, matchingRules?: Array<{ pattern: string; category: string }>) => {
    try { const r = await authedFetch(`${BASE}/bank-import/csv`, { method: 'POST', headers: H, body: JSON.stringify({ content, format, accountId, matchingRules }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  importBankOFX: async (content: string, accountId?: string) => {
    try { const r = await authedFetch(`${BASE}/bank-import/ofx`, { method: 'POST', headers: H, body: JSON.stringify({ content, accountId }) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 14: PAYSLIPS
  // ═══════════════════════════════════════════════════════════════════════════

  generatePayslip: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/payslips/generate`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  generatePayslipHTML: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/payslips/html`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  runPayrollWithPayslips: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/payroll/run-with-payslips`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 15: INVOICE PDF
  // ═══════════════════════════════════════════════════════════════════════════

  generateInvoicePDF: async (invoiceId: string, company: Record<string, string>) => {
    try { const r = await authedFetch(`${BASE}/invoices/${invoiceId}/pdf`, { method: 'POST', headers: H, body: JSON.stringify(company) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  previewInvoicePDF: async (invoice: Record<string, unknown>, company: Record<string, string>) => {
    try { const r = await authedFetch(`${BASE}/invoices/pdf/preview`, { method: 'POST', headers: H, body: JSON.stringify({ invoice, company }) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 16: TAX ENGINE
  // ═══════════════════════════════════════════════════════════════════════════

  calculateTax: async (data: { amount: number; currency: string; country: string; state?: string; productType?: string; isB2B?: boolean; customerCountry?: string; hsnCode?: string }) => {
    try { const r = await authedFetch(`${BASE}/tax/calculate`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  generateVATReturn: async (data: { period: string; country: string; currency: string; vatRate?: number }) => {
    try { const r = await authedFetch(`${BASE}/tax/vat-return`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  generateGSTFiling: async (data: { period: string; gstin: string; currency?: string }) => {
    try { const r = await authedFetch(`${BASE}/tax/gst-filing`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getZATCAFields: async (invoiceId: string) => {
    try { const r = await authedFetch(`${BASE}/tax/zatca/${invoiceId}`, { method: 'POST' }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getUSStateTaxRates: async () => {
    try { const r = await authedFetch(`${BASE}/tax/rates/us-states`); return r.ok ? r.json() : {}; } catch { return {}; }
  },
  getEUVATRates: async () => {
    try { const r = await authedFetch(`${BASE}/tax/rates/eu`); return r.ok ? r.json() : {}; } catch { return {}; }
  },
  getTaxCodesByCountry: async (country: string) => {
    try { const r = await authedFetch(`${BASE}/tax/codes/${country}`); return r.ok ? r.json() : []; } catch { return []; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 17: INVENTORY
  // ═══════════════════════════════════════════════════════════════════════════

  createStockItem: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/inventory/items`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getStockItems: async (params?: { search?: string; category?: string; lowStock?: boolean }) => {
    const q = new URLSearchParams();
    if (params?.search) q.set('search', params.search);
    if (params?.category) q.set('category', params.category);
    if (params?.lowStock) q.set('lowStock', 'true');
    try { const r = await authedFetch(`${BASE}/inventory/items?${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  adjustStock: async (id: string, data: { quantity: number; type: string; notes?: string; reference?: string }) => {
    try { const r = await authedFetch(`${BASE}/inventory/items/${id}/adjust`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getStockMovements: async (stockItemId?: string) => {
    const q = stockItemId ? `?stockItemId=${stockItemId}` : '';
    try { const r = await authedFetch(`${BASE}/inventory/movements${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  getInventoryValuation: async () => {
    try { const r = await authedFetch(`${BASE}/inventory/valuation`); return r.ok ? r.json() : null; } catch { return null; }
  },
  getLowStockAlerts: async () => {
    try { const r = await authedFetch(`${BASE}/inventory/low-stock`); return r.ok ? r.json() : []; } catch { return []; }
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SECTION 18: FIXED ASSETS
  // ═══════════════════════════════════════════════════════════════════════════

  createAsset: async (data: Record<string, unknown>) => {
    try { const r = await authedFetch(`${BASE}/assets`, { method: 'POST', headers: H, body: JSON.stringify(data) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getAssets: async (params?: { status?: string; category?: string }) => {
    const q = new URLSearchParams(); if (params?.status) q.set('status', params.status); if (params?.category) q.set('category', params.category);
    try { const r = await authedFetch(`${BASE}/assets?${q}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  getAssetSummary: async () => {
    try { const r = await authedFetch(`${BASE}/assets/summary`); return r.ok ? r.json() : null; } catch { return null; }
  },
  getDepreciationSchedule: async (assetId: string) => {
    try { const r = await authedFetch(`${BASE}/assets/${assetId}/schedule`); return r.ok ? r.json() : null; } catch { return null; }
  },
  processDepreciation: async (period: string) => {
    try { const r = await authedFetch(`${BASE}/assets/depreciation/process`, { method: 'POST', headers: H, body: JSON.stringify({ period }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  disposeAsset: async (assetId: string, disposalDate: string, disposalValue: number) => {
    try { const r = await authedFetch(`${BASE}/assets/${assetId}/dispose`, { method: 'POST', headers: H, body: JSON.stringify({ disposalDate, disposalValue }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
};

// ────────────────────────────────────────────────────────────────────────────────
// STRIPE INTEGRATION
// ────────────────────────────────────────────────────────────────────────────────

export const StripeAccountingService = {

  // ── Balance ──────────────────────────────────────────────────────────────────
  getBalance: async () => {
    try { const r = await authedFetch(`${BASE}/stripe/balance`); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ── Customers ─────────────────────────────────────────────────────────────────
  listCustomers: async (limit = 100) => {
    try { const r = await authedFetch(`${BASE}/stripe/customers?limit=${limit}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  ensureCustomer: async (params: { email: string; name?: string; phone?: string; metadata?: Record<string, string> }) => {
    try { const r = await authedFetch(`${BASE}/stripe/customers`, { method: 'POST', headers: H, body: JSON.stringify(params) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  getCustomer: async (id: string) => {
    try { const r = await authedFetch(`${BASE}/stripe/customers/${id}`); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ── Payment Intents ───────────────────────────────────────────────────────────
  createPaymentIntent: async (params: { amountCents: number; currency: string; customerId?: string; description?: string; invoiceId?: string }) => {
    try { const r = await authedFetch(`${BASE}/stripe/payment-intents`, { method: 'POST', headers: H, body: JSON.stringify(params) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  listPaymentIntents: async (limit = 100) => {
    try { const r = await authedFetch(`${BASE}/stripe/payment-intents?limit=${limit}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  getPaymentIntent: async (id: string) => {
    try { const r = await authedFetch(`${BASE}/stripe/payment-intents/${id}`); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ── Subscriptions ─────────────────────────────────────────────────────────────
  createSubscription: async (params: { customerId: string; priceId: string; trialDays?: number; coupon?: string }) => {
    try { const r = await authedFetch(`${BASE}/stripe/subscriptions`, { method: 'POST', headers: H, body: JSON.stringify(params) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  listSubscriptions: async (status?: string, limit = 100) => {
    try {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (status) qs.set('status', status);
      const r = await authedFetch(`${BASE}/stripe/subscriptions?${qs}`);
      return r.ok ? r.json() : [];
    } catch { return []; }
  },
  cancelSubscription: async (id: string, atPeriodEnd = true) => {
    try { const r = await authedFetch(`${BASE}/stripe/subscriptions/${id}/cancel`, { method: 'POST', headers: H, body: JSON.stringify({ atPeriodEnd }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  updateSubscription: async (id: string, priceId: string) => {
    try { const r = await authedFetch(`${BASE}/stripe/subscriptions/${id}/update`, { method: 'POST', headers: H, body: JSON.stringify({ priceId }) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ── Stripe Invoices ───────────────────────────────────────────────────────────
  listStripeInvoices: async (customerId?: string, limit = 100) => {
    try {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (customerId) qs.set('customerId', customerId);
      const r = await authedFetch(`${BASE}/stripe/invoices?${qs}`);
      return r.ok ? r.json() : [];
    } catch { return []; }
  },
  getStripeInvoice: async (id: string) => {
    try { const r = await authedFetch(`${BASE}/stripe/invoices/${id}`); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ── Payouts ───────────────────────────────────────────────────────────────────
  listPayouts: async (limit = 100) => {
    try { const r = await authedFetch(`${BASE}/stripe/payouts?limit=${limit}`); return r.ok ? r.json() : []; } catch { return []; }
  },

  // ── Products & Prices ─────────────────────────────────────────────────────────
  listProducts: async (limit = 100) => {
    try { const r = await authedFetch(`${BASE}/stripe/products?limit=${limit}`); return r.ok ? r.json() : []; } catch { return []; }
  },
  createProduct: async (name: string, description?: string) => {
    try { const r = await authedFetch(`${BASE}/stripe/products`, { method: 'POST', headers: H, body: JSON.stringify({ name, description }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
  listPrices: async (productId?: string, limit = 100) => {
    try {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (productId) qs.set('productId', productId);
      const r = await authedFetch(`${BASE}/stripe/prices?${qs}`);
      return r.ok ? r.json() : [];
    } catch { return []; }
  },
  createPrice: async (params: { productId: string; unitAmountCents: number; currency: string; interval?: 'day' | 'week' | 'month' | 'year' }) => {
    try { const r = await authedFetch(`${BASE}/stripe/prices`, { method: 'POST', headers: H, body: JSON.stringify(params) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ── Connect ───────────────────────────────────────────────────────────────────
  getConnectUrl: async (tenantId: string, redirectUri: string, country?: string) => {
    const qs = new URLSearchParams({ tenantId, redirectUri, ...(country ? { country } : {}) });
    const r = await authedFetch(`${BASE}/stripe/connect/url?${qs}`);
    const body = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(body?.error ?? `HTTP ${r.status}`);
    return body as { url: string };
  },
  connectCallback: async (code: string) => {
    try { const r = await authedFetch(`${BASE}/stripe/connect/callback`, { method: 'POST', headers: H, body: JSON.stringify({ code }) }); return r.ok ? r.json() : null; } catch { return null; }
  },

  // ── Historical Sync ───────────────────────────────────────────────────────────
  syncHistoricalCharges: async (limit = 100) => {
    try { const r = await authedFetch(`${BASE}/stripe/sync`, { method: 'POST', headers: H, body: JSON.stringify({ limit }) }); return r.ok ? r.json() : null; } catch { return null; }
  },
};

export const integrationsService = {
  // Uses the dedicated accounting status endpoints (proven to work, explicit tenantId)
  getOAuthStatus: async (): Promise<{ xero: boolean; quickbooks: boolean; stripe: boolean; stripeAccountId?: string }> => {
    const tenantId = localStorage.getItem('tenantId') ?? localStorage.getItem('orgId') ?? 'default';
    const qs = `?tenantId=${encodeURIComponent(tenantId)}`;
    const [xeroRes, qbRes, stripeRes] = await Promise.all([
      authedFetch(`${BASE}/xero/status${qs}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      authedFetch(`${BASE}/quickbooks/status${qs}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
      authedFetch(`${BASE}/stripe/status${qs}`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]);
    return {
      xero: !!(xeroRes as any)?.connected,
      quickbooks: !!(qbRes as any)?.connected,
      stripe: !!(stripeRes as any)?.connected,
      stripeAccountId: (stripeRes as any)?.stripeUserId,
    };
  },
};
