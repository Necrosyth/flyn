/**
 * TaxEngineService
 *
 * Production-grade, multi-country tax calculation and VAT filing engine.
 *
 * Capabilities:
 *  - Dynamic tax rate lookup by country + product type
 *  - Multi-rate GST (India: 5%, 12%, 18%, 28%)
 *  - US multi-state sales tax (with nexus support)
 *  - Withholding tax calculations
 *  - VAT Return report generation (UAE, KSA, EU, UK)
 *  - GST Filing report (India)
 *  - Quarterly/Monthly summary
 *  - ZATCA e-invoice compliance (KSA)
 *  - Reverse charge mechanism (B2B cross-border)
 */

import { Injectable, Logger } from '@nestjs/common';
import { TAX_CODE_LIBRARY, TaxCode, Invoice, Expense } from './accounting.types';

// ── US State Sales Tax Rates (state-level only) ──────────────────────────────
const US_STATE_TAX: Record<string, number> = {
  AL: 4, AK: 0, AZ: 5.6, AR: 6.5, CA: 7.25, CO: 2.9, CT: 6.35,
  DE: 0, FL: 6, GA: 4, HI: 4, ID: 6, IL: 6.25, IN: 7, IA: 6,
  KS: 6.5, KY: 6, LA: 4.45, ME: 5.5, MD: 6, MA: 6.25, MI: 6,
  MN: 6.875, MS: 7, MO: 4.225, MT: 0, NE: 5.5, NV: 6.85, NH: 0,
  NJ: 6.625, NM: 4.875, NY: 4, NC: 4.75, ND: 5, OH: 5.75, OK: 4.5,
  OR: 0, PA: 6, RI: 7, SC: 6, SD: 4.5, TN: 7, TX: 6.25, UT: 4.85,
  VT: 6, VA: 4.3, WA: 6.5, WV: 6, WI: 5, WY: 4, DC: 6,
};

// ── Average County / Local Tax Rates (adds on top of state rate) ─────────────
// Source: Tax Foundation averages — reflects typical effective rate within state
const US_LOCAL_AVG_TAX: Record<string, number> = {
  AL: 5.14, AK: 1.82, AZ: 2.77, AR: 2.94, CA: 1.43, CO: 4.73, CT: 0,
  DE: 0, FL: 1.07, GA: 3.23, HI: 0.44, ID: 0.02, IL: 2.73, IN: 0, IA: 0.94,
  KS: 2.17, KY: 0, LA: 5.10, ME: 0, MD: 0, MA: 0, MI: 0, MN: 0.57,
  MS: 0.07, MO: 4.17, MT: 0, NE: 1.44, NV: 1.38, NH: 0, NJ: 0.03,
  NM: 2.72, NY: 4.52, NC: 2.22, ND: 1.96, OH: 1.48, OK: 4.45, OR: 0,
  PA: 0.34, RI: 0, SC: 1.20, SD: 1.90, TN: 2.55, TX: 1.95, UT: 1.09,
  VT: 0.18, VA: 1.20, WA: 2.73, WV: 0.66, WI: 0.44, WY: 1.44, DC: 0,
};

// ── States that EXEMPT specific product types ─────────────────────────────────

// Food/grocery exemptions (unprepared food only — prepared/restaurant food is taxable everywhere)
const FOOD_EXEMPT_STATES = new Set([
  'AZ','CA','CO','GA','IL','IA','KS','KY','LA','MA','MI','MN','MO',
  'NE','NJ','NV','NY','NC','ND','OH','OK','PA','RI','SC','TX','UT',
  'VT','VA','WA','WI',
]);

// States with REDUCED food rates instead of full exemption (representative rate used)
const FOOD_REDUCED_STATES: Record<string, number> = {
  AR: 0.125, // 0.125% on groceries
  MO: 1.225, // 1.225% on groceries
  SD: 4.5,   // No exemption, full rate
  TN: 4,     // 4% on food (vs 7% general)
  WV: 3,     // 3% on food (vs 6% general)
};

// Prescription & OTC medicine — most states exempt; these DO tax them
const MEDICINE_TAXABLE_STATES = new Set(['HI', 'IL']);

// Clothing exemptions (permanent, not just tax-free weekends)
const CLOTHING_EXEMPT_STATES = new Set(['NJ', 'NY', 'PA', 'MN', 'VT']);

// Services: these states broadly tax services (others generally do NOT)
const SERVICES_TAXABLE_STATES = new Set(['HI', 'NM', 'SD', 'WA', 'TX', 'IA', 'MN']);

// SaaS / digital goods: states that impose sales tax on SaaS subscriptions
const SAAS_TAXABLE_STATES = new Set([
  'AL','AZ','CO','CT','GA','HI','ID','IN','KY','MA','MI','MN',
  'NC','NJ','NY','OH','PA','RI','SC','SD','TN','TX','UT','VA',
  'WA','WI','WV',
]);

// ── Economic Nexus Thresholds (post-South Dakota v. Wayfair, 2018) ────────────
export interface NexusThreshold {
  revenueUSD: number;         // Annual revenue threshold
  transactions: number | null; // Transaction count threshold (null = revenue only)
  note?: string;
}
const US_NEXUS_THRESHOLDS: Record<string, NexusThreshold> = {
  AL: { revenueUSD: 250000, transactions: null },
  AK: { revenueUSD: 100000, transactions: 200, note: 'Local jurisdictions only' },
  AZ: { revenueUSD: 100000, transactions: null },
  AR: { revenueUSD: 100000, transactions: 200 },
  CA: { revenueUSD: 500000, transactions: null },
  CO: { revenueUSD: 100000, transactions: null },
  CT: { revenueUSD: 100000, transactions: 200 },
  FL: { revenueUSD: 100000, transactions: null },
  GA: { revenueUSD: 100000, transactions: 200 },
  HI: { revenueUSD: 100000, transactions: 200 },
  ID: { revenueUSD: 100000, transactions: null },
  IL: { revenueUSD: 100000, transactions: 200 },
  IN: { revenueUSD: 100000, transactions: 200 },
  IA: { revenueUSD: 100000, transactions: null },
  KS: { revenueUSD: 100000, transactions: null },
  KY: { revenueUSD: 100000, transactions: 200 },
  LA: { revenueUSD: 100000, transactions: 200 },
  ME: { revenueUSD: 100000, transactions: 200 },
  MD: { revenueUSD: 100000, transactions: 200 },
  MA: { revenueUSD: 100000, transactions: null },
  MI: { revenueUSD: 100000, transactions: 200 },
  MN: { revenueUSD: 100000, transactions: 200 },
  MS: { revenueUSD: 250000, transactions: null },
  MO: { revenueUSD: 100000, transactions: null },
  NE: { revenueUSD: 100000, transactions: 200 },
  NV: { revenueUSD: 100000, transactions: 200 },
  NJ: { revenueUSD: 100000, transactions: 200 },
  NM: { revenueUSD: 100000, transactions: null },
  NY: { revenueUSD: 500000, transactions: 100 },
  NC: { revenueUSD: 100000, transactions: 200 },
  ND: { revenueUSD: 100000, transactions: 200 },
  OH: { revenueUSD: 100000, transactions: 200 },
  OK: { revenueUSD: 100000, transactions: null },
  PA: { revenueUSD: 100000, transactions: null },
  RI: { revenueUSD: 100000, transactions: 200 },
  SC: { revenueUSD: 100000, transactions: null },
  SD: { revenueUSD: 100000, transactions: 200 },
  TN: { revenueUSD: 100000, transactions: null },
  TX: { revenueUSD: 500000, transactions: null },
  UT: { revenueUSD: 100000, transactions: 200 },
  VT: { revenueUSD: 100000, transactions: 200 },
  VA: { revenueUSD: 100000, transactions: 200 },
  WA: { revenueUSD: 100000, transactions: null },
  WV: { revenueUSD: 100000, transactions: 200 },
  WI: { revenueUSD: 100000, transactions: 200 },
  WY: { revenueUSD: 100000, transactions: 200 },
};

// ── US State Filing Frequencies & Deadlines ───────────────────────────────────
const US_FILING_DEADLINES: Record<string, string> = {
  AL: 'Monthly (20th), Quarterly (20th after quarter), or Annual (Jan 20)',
  AZ: 'Monthly (20th), Quarterly, or Annual based on liability',
  AR: 'Monthly (20th) or Quarterly (last day of month after quarter)',
  CA: 'Monthly, Quarterly, or Annual — BOE assigns frequency based on liability',
  CO: 'Monthly (20th), Quarterly, or Annual (Jan 20)',
  CT: 'Monthly (last day) or Quarterly (last day of month after quarter)',
  FL: 'Monthly (20th) or Quarterly (1st–20th after quarter)',
  GA: 'Monthly (20th) or Quarterly (20th after quarter)',
  HI: 'Monthly (20th) or Quarterly',
  ID: 'Monthly (20th) or Quarterly (last day of month after quarter)',
  IL: 'Monthly (20th) or Quarterly (last day of month after quarter)',
  IN: 'Monthly (30th) or Quarterly (30th after quarter)',
  IA: 'Monthly (last day) or Quarterly (last day of month after quarter)',
  KS: 'Monthly (25th) or Quarterly (25th after quarter)',
  KY: 'Monthly (20th) or Quarterly',
  LA: 'Monthly (20th) or Quarterly (20th after quarter)',
  ME: 'Monthly (15th) or Quarterly (15th after quarter)',
  MD: 'Monthly (20th) or Quarterly (20th after quarter)',
  MA: 'Monthly (20th) or Quarterly (20th after quarter)',
  MI: 'Monthly (20th) or Quarterly (20th after quarter)',
  MN: 'Monthly (20th) or Quarterly (20th after quarter)',
  MS: 'Monthly (20th) or Quarterly',
  MO: 'Monthly (20th) or Quarterly (last day of month after quarter)',
  NE: 'Monthly (25th) or Quarterly (last day of month after quarter)',
  NV: 'Monthly (last day) or Quarterly (last day of month after quarter)',
  NJ: 'Monthly (20th) or Quarterly (20th after quarter)',
  NM: 'Monthly (25th) or Quarterly (25th after quarter)',
  NY: 'Monthly (20th) or Quarterly (20th after quarter)',
  NC: 'Monthly (20th) or Quarterly (last day of month after quarter)',
  ND: 'Monthly (last day) or Quarterly',
  OH: 'Monthly (23rd) or Quarterly (23rd after quarter)',
  OK: 'Monthly (20th) or Quarterly (20th after quarter)',
  PA: 'Monthly or Quarterly — based on annual liability',
  RI: 'Monthly (20th) or Quarterly',
  SC: 'Monthly (20th) or Quarterly (20th after quarter)',
  SD: 'Monthly (20th) or Quarterly (last day of month after quarter)',
  TN: 'Monthly (20th) or Quarterly (20th after quarter)',
  TX: 'Monthly (20th) or Quarterly (20th after quarter)',
  UT: 'Monthly (last day) or Quarterly (last day of month after quarter)',
  VT: 'Monthly (25th) or Quarterly (25th after quarter)',
  VA: 'Monthly (20th) or Quarterly (20th after quarter)',
  WA: 'Monthly or Quarterly — based on annual liability (last day)',
  WV: 'Monthly (20th) or Quarterly',
  WI: 'Monthly (last day) or Quarterly (last day of month after quarter)',
  WY: 'Monthly (last day) or Quarterly (last day of month after quarter)',
  DC: 'Monthly (20th) or Quarterly',
};

// ── EU VAT Rates ─────────────────────────────────────────────────────────────
const EU_VAT_RATES: Record<string, number> = {
  AT: 20, BE: 21, BG: 20, CY: 19, CZ: 21, DE: 19, DK: 25,
  EE: 22, EL: 24, ES: 21, FI: 24, FR: 20, HR: 25, HU: 27,
  IE: 23, IT: 22, LT: 21, LU: 17, LV: 21, MT: 18, NL: 21,
  PL: 23, PT: 23, RO: 19, SE: 25, SI: 22, SK: 20,
};

export interface TaxCalculationInput {
  amount: number;
  currency: string;
  country: string;
  state?: string;          // US state code e.g. 'CA'
  productType?: 'service' | 'goods' | 'digital' | 'food' | 'medical';
  isB2B?: boolean;         // B2B cross-border (reverse charge applies)
  customerCountry?: string; // For cross-border transactions
  hsnCode?: string;        // India HSN/SAC code
}

export interface TaxCalculationResult {
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  totalAmount: number;
  taxType: string;
  taxLabel: string;
  country: string;
  state?: string;
  reverseCharge?: boolean;
  breakdown?: Array<{ name: string; rate: number; amount: number }>;
}

export interface VATReturnReport {
  period: string;           // e.g. "Q1 2026" or "April 2026"
  country: string;
  currency: string;
  vatRate: number;

  // Output Tax (on sales)
  standardRatedSales: number;
  outputVAT: number;
  zeroRatedSales: number;
  exemptSales: number;

  // Input Tax (on purchases)
  standardRatedPurchases: number;
  inputVAT: number;

  // Net
  netVATPayable: number;
  isRefund: boolean;

  // Filing Details
  filingDeadline: string;
  filingReference: string;
  invoiceCount: number;
  expenseCount: number;
}

export interface GSTFilingReport {
  period: string;
  gstin: string;
  currency: string;

  // GSTR-1 (Outward Supplies)
  b2bSupplies: number;
  b2cSupplies: number;
  totalOutwardSupplies: number;
  outputIGST: number;
  outputCGST: number;
  outputSGST: number;

  // GSTR-3B (Net Liability)
  inputTaxCredit: number;
  netGSTPayable: number;

  filingDeadline: string;
}

@Injectable()
export class TaxEngineService {
  private readonly logger = new Logger(TaxEngineService.name);

  // ── Core Tax Calculation ──────────────────────────────────────────────────

  calculateTax(input: TaxCalculationInput): TaxCalculationResult {
    const country = input.country.toUpperCase();
    const amount = input.amount;

    // B2B cross-border (EU reverse charge)
    if (input.isB2B && input.customerCountry && input.customerCountry !== country) {
      if (EU_VAT_RATES[country] !== undefined && EU_VAT_RATES[input.customerCountry] !== undefined) {
        return {
          taxableAmount: amount,
          taxRate: 0,
          taxAmount: 0,
          totalAmount: amount,
          taxType: 'VAT',
          taxLabel: 'Reverse Charge (B2B EU)',
          country,
          state: input.state,
          reverseCharge: true,
        };
      }
    }

    switch (country) {
      case 'US': return this.calculateUS(input);
      case 'IN': return this.calculateIndia(input);
      case 'AE': return this.calculateFlat(amount, 5, 'VAT', 'UAE VAT 5%', country);
      case 'SA': return this.calculateFlat(amount, 15, 'VAT', 'KSA VAT 15%', country);
      case 'EG': return this.calculateFlat(amount, 14, 'VAT', 'Egypt VAT 14%', country);
      case 'JO': return this.calculateFlat(amount, 16, 'VAT', 'Jordan GST 16%', country);
      case 'GH': return this.calculateFlat(amount, 15, 'VAT', 'Ghana VAT 15%', country);
      case 'KE': return this.calculateFlat(amount, 16, 'VAT', 'Kenya VAT 16%', country);
      case 'ZA': return this.calculateFlat(amount, 15, 'VAT', 'SA VAT 15%', country);
      case 'PH': return this.calculateFlat(amount, 12, 'VAT', 'PH VAT 12%', country);
      case 'PK': return this.calculateFlat(amount, 17, 'GST', 'PK GST 17%', country);
      case 'ID': return this.calculateFlat(amount, 11, 'PPN', 'Indonesia PPN 11%', country);
      case 'MY': return this.calculateFlat(amount, 6, 'SST', 'Malaysia SST 6%', country);
      default: {
        // Try EU VAT
        if (EU_VAT_RATES[country] !== undefined) {
          const rate = EU_VAT_RATES[country];
          return this.calculateFlat(amount, rate, 'VAT', `${country} VAT ${rate}%`, country);
        }
        // Default: 0%
        return this.calculateFlat(amount, 0, 'EXEMPT', 'Tax Exempt', country);
      }
    }
  }

  private calculateFlat(amount: number, rate: number, type: string, label: string, country: string): TaxCalculationResult {
    const taxAmount = parseFloat(((amount * rate) / 100).toFixed(2));
    return {
      taxableAmount: amount,
      taxRate: rate,
      taxAmount,
      totalAmount: parseFloat((amount + taxAmount).toFixed(2)),
      taxType: type,
      taxLabel: label,
      country,
    };
  }

  private calculateUS(input: TaxCalculationInput): TaxCalculationResult {
    const state = input.state?.toUpperCase();
    const productType = input.productType ?? 'service';
    const amount = input.amount;

    // No sales tax states
    if (!state || US_STATE_TAX[state] === undefined) {
      return this.calculateFlat(amount, 0, 'SALES_TAX', 'US Sales Tax (state unknown — 0% applied)', 'US');
    }

    // ── Check product-type exemptions ─────────────────────────────────────────
    if (productType === 'medical') {
      if (!MEDICINE_TAXABLE_STATES.has(state)) {
        return {
          taxableAmount: amount, taxRate: 0, taxAmount: 0, totalAmount: amount,
          taxType: 'EXEMPT', taxLabel: `${state} — Medical/Rx exempt`,
          country: 'US', state,
          breakdown: [{ name: 'Medical exemption', rate: 0, amount: 0 }],
        };
      }
    }

    if (productType === 'food') {
      if (FOOD_EXEMPT_STATES.has(state)) {
        return {
          taxableAmount: amount, taxRate: 0, taxAmount: 0, totalAmount: amount,
          taxType: 'EXEMPT', taxLabel: `${state} — Groceries exempt`,
          country: 'US', state,
          breakdown: [{ name: 'Food/grocery exemption', rate: 0, amount: 0 }],
        };
      }
      if (FOOD_REDUCED_STATES[state] !== undefined) {
        const reducedRate = FOOD_REDUCED_STATES[state];
        const taxAmount = parseFloat(((amount * reducedRate) / 100).toFixed(2));
        return {
          taxableAmount: amount, taxRate: reducedRate, taxAmount,
          totalAmount: parseFloat((amount + taxAmount).toFixed(2)),
          taxType: 'SALES_TAX', taxLabel: `${state} — Food reduced rate ${reducedRate}%`,
          country: 'US', state,
          breakdown: [{ name: `Food rate (${state})`, rate: reducedRate, amount: taxAmount }],
        };
      }
    }

    if (productType === 'goods' && CLOTHING_EXEMPT_STATES.has(state)) {
      // Clothing is exempt in these states; treat general goods as clothing-eligible
      return {
        taxableAmount: amount, taxRate: 0, taxAmount: 0, totalAmount: amount,
        taxType: 'EXEMPT', taxLabel: `${state} — Clothing/apparel exempt`,
        country: 'US', state,
        breakdown: [{ name: 'Clothing exemption', rate: 0, amount: 0 }],
      };
    }

    if (productType === 'service' && !SERVICES_TAXABLE_STATES.has(state)) {
      return {
        taxableAmount: amount, taxRate: 0, taxAmount: 0, totalAmount: amount,
        taxType: 'EXEMPT', taxLabel: `${state} — Services not taxable`,
        country: 'US', state,
        breakdown: [{ name: 'Service exemption', rate: 0, amount: 0 }],
      };
    }

    if (productType === 'digital' && !SAAS_TAXABLE_STATES.has(state)) {
      return {
        taxableAmount: amount, taxRate: 0, taxAmount: 0, totalAmount: amount,
        taxType: 'EXEMPT', taxLabel: `${state} — SaaS/digital goods not taxable`,
        country: 'US', state,
        breakdown: [{ name: 'Digital goods exemption', rate: 0, amount: 0 }],
      };
    }

    // ── Calculate combined state + local rate ─────────────────────────────────
    const stateRate = US_STATE_TAX[state];
    const localAvg = US_LOCAL_AVG_TAX[state] ?? 0;
    const totalRate = parseFloat((stateRate + localAvg).toFixed(4));
    const stateAmt = parseFloat(((amount * stateRate) / 100).toFixed(2));
    const localAmt = parseFloat(((amount * localAvg) / 100).toFixed(2));
    const taxAmount = parseFloat(((amount * totalRate) / 100).toFixed(2));

    const breakdown: Array<{ name: string; rate: number; amount: number }> = [];
    if (stateRate > 0) breakdown.push({ name: `${state} State Tax`, rate: stateRate, amount: stateAmt });
    if (localAvg > 0) breakdown.push({ name: `${state} Avg Local/County Tax`, rate: localAvg, amount: localAmt });

    return {
      taxableAmount: amount,
      taxRate: totalRate,
      taxAmount,
      totalAmount: parseFloat((amount + taxAmount).toFixed(2)),
      taxType: 'SALES_TAX',
      taxLabel: `${state} Sales Tax ${totalRate}% (state ${stateRate}% + local avg ${localAvg}%)`,
      country: 'US',
      state,
      breakdown,
    };
  }

  // ── US Nexus Check ────────────────────────────────────────────────────────

  checkUSNexus(state: string, annualRevenueUSD: number, transactionCount: number): {
    hasNexus: boolean;
    state: string;
    threshold: NexusThreshold | null;
    reason: string;
  } {
    const s = state.toUpperCase();
    const threshold = US_NEXUS_THRESHOLDS[s];
    if (!threshold) {
      return { hasNexus: false, state: s, threshold: null, reason: `No economic nexus law for ${s}` };
    }

    const revenueTriggered = annualRevenueUSD >= threshold.revenueUSD;
    const txTriggered = threshold.transactions !== null && transactionCount >= threshold.transactions;
    const hasNexus = revenueTriggered || txTriggered;

    const reasons: string[] = [];
    if (revenueTriggered) reasons.push(`Revenue $${annualRevenueUSD.toLocaleString()} ≥ threshold $${threshold.revenueUSD.toLocaleString()}`);
    if (txTriggered) reasons.push(`Transactions ${transactionCount} ≥ threshold ${threshold.transactions}`);
    if (!hasNexus) reasons.push(`Below nexus threshold (revenue < $${threshold.revenueUSD.toLocaleString()}${threshold.transactions ? `, transactions < ${threshold.transactions}` : ''})`);

    return {
      hasNexus,
      state: s,
      threshold,
      reason: reasons.join('; '),
    };
  }

  // ── US Multi-State Nexus Report ───────────────────────────────────────────

  generateUSNexusReport(invoices: Invoice[]): {
    totalRevenue: number;
    stateBreakdown: Array<{
      state: string; revenue: number; transactionCount: number;
      hasNexus: boolean; nexusReason: string;
      stateRate: number; localAvgRate: number; combinedRate: number;
      estimatedTaxLiability: number;
      filingDeadline: string;
    }>;
    nexusStates: string[];
    totalEstimatedLiability: number;
  } {
    const paid = invoices.filter(i => i.status === 'paid' || i.status === 'partially_paid');
    const totalRevenue = paid.reduce((s, i) => s + parseFloat(i.amount), 0);

    // Group by client state (clientCountry === 'US' implied, use clientCountry as state code fallback)
    const byState: Record<string, { revenue: number; count: number }> = {};
    for (const inv of paid) {
      const st = (inv.clientCountry ?? '').toUpperCase().slice(0, 2);
      if (!st || !US_STATE_TAX[st]) continue;
      if (!byState[st]) byState[st] = { revenue: 0, count: 0 };
      byState[st].revenue += parseFloat(inv.amount);
      byState[st].count += 1;
    }

    const stateBreakdown = Object.entries(byState).map(([state, { revenue, count }]) => {
      const nexus = this.checkUSNexus(state, revenue, count);
      const stateRate = US_STATE_TAX[state] ?? 0;
      const localAvgRate = US_LOCAL_AVG_TAX[state] ?? 0;
      const combinedRate = parseFloat((stateRate + localAvgRate).toFixed(4));
      const estimatedTaxLiability = nexus.hasNexus
        ? parseFloat(((revenue * combinedRate) / 100).toFixed(2))
        : 0;
      return {
        state, revenue: parseFloat(revenue.toFixed(2)), transactionCount: count,
        hasNexus: nexus.hasNexus, nexusReason: nexus.reason,
        stateRate, localAvgRate, combinedRate,
        estimatedTaxLiability,
        filingDeadline: US_FILING_DEADLINES[state] ?? 'Check state revenue department',
      };
    });

    const nexusStates = stateBreakdown.filter(s => s.hasNexus).map(s => s.state);
    const totalEstimatedLiability = stateBreakdown.reduce((s, r) => s + r.estimatedTaxLiability, 0);

    return {
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      stateBreakdown: stateBreakdown.sort((a, b) => b.revenue - a.revenue),
      nexusStates,
      totalEstimatedLiability: parseFloat(totalEstimatedLiability.toFixed(2)),
    };
  }

  // ── US Estimated Quarterly Tax (for self-employed / small biz) ───────────

  calculateUSEstimatedTax(annualNetIncome: number, filingStatus: 'single' | 'married_joint' | 'married_sep' | 'head_of_household' = 'single'): {
    annualNetIncome: number;
    selfEmploymentTax: number;
    adjustedGrossIncome: number;
    federalIncomeTax: number;
    totalAnnualTax: number;
    quarterlyPayment: number;
    brackets: Array<{ rate: number; from: number; to: number | null; taxOnBracket: number }>;
    dueDates: string[];
  } {
    // Self-employment tax: 15.3% on net SE income (92.35% of gross)
    const seBase = annualNetIncome * 0.9235;
    const selfEmploymentTax = parseFloat((seBase * 0.153).toFixed(2));
    // SE tax deduction: half of SE tax reduces AGI
    const seDeduction = parseFloat((selfEmploymentTax / 2).toFixed(2));
    const agi = parseFloat((annualNetIncome - seDeduction).toFixed(2));

    // 2024 federal income tax brackets (single filer)
    const bracketSingle = [
      { rate: 10, from: 0, to: 11600 },
      { rate: 12, from: 11600, to: 47150 },
      { rate: 22, from: 47150, to: 100525 },
      { rate: 24, from: 100525, to: 191950 },
      { rate: 32, from: 191950, to: 243725 },
      { rate: 35, from: 243725, to: 609350 },
      { rate: 37, from: 609350, to: null },
    ];
    const bracketMFJ = [
      { rate: 10, from: 0, to: 23200 },
      { rate: 12, from: 23200, to: 94300 },
      { rate: 22, from: 94300, to: 201050 },
      { rate: 24, from: 201050, to: 383900 },
      { rate: 32, from: 383900, to: 487450 },
      { rate: 35, from: 487450, to: 731200 },
      { rate: 37, from: 731200, to: null },
    ];
    const bracketHoH = [
      { rate: 10, from: 0, to: 16550 },
      { rate: 12, from: 16550, to: 63100 },
      { rate: 22, from: 63100, to: 100500 },
      { rate: 24, from: 100500, to: 191950 },
      { rate: 32, from: 191950, to: 243700 },
      { rate: 35, from: 243700, to: 609350 },
      { rate: 37, from: 609350, to: null },
    ];

    const brackets = filingStatus === 'married_joint' ? bracketMFJ
      : filingStatus === 'head_of_household' ? bracketHoH
      : bracketSingle;

    // Standard deduction 2024
    const standardDeduction = filingStatus === 'married_joint' ? 29200
      : filingStatus === 'head_of_household' ? 21900
      : 14600;

    const taxableIncome = Math.max(0, agi - standardDeduction);
    let remaining = taxableIncome;
    let federalIncomeTax = 0;
    const bracketDetails: Array<{ rate: number; from: number; to: number | null; taxOnBracket: number }> = [];

    for (const b of brackets) {
      const top = b.to ?? Infinity;
      const inBracket = Math.max(0, Math.min(remaining, top - b.from));
      const taxOnBracket = parseFloat(((inBracket * b.rate) / 100).toFixed(2));
      federalIncomeTax += taxOnBracket;
      bracketDetails.push({ ...b, taxOnBracket });
      remaining -= inBracket;
      if (remaining <= 0) break;
    }

    federalIncomeTax = parseFloat(federalIncomeTax.toFixed(2));
    const totalAnnualTax = parseFloat((selfEmploymentTax + federalIncomeTax).toFixed(2));
    const quarterlyPayment = parseFloat((totalAnnualTax / 4).toFixed(2));

    return {
      annualNetIncome,
      selfEmploymentTax,
      adjustedGrossIncome: agi,
      federalIncomeTax,
      totalAnnualTax,
      quarterlyPayment,
      brackets: bracketDetails,
      dueDates: [
        'Q1: April 15',
        'Q2: June 17',
        'Q3: September 16',
        'Q4: January 15 (next year)',
      ],
    };
  }

  getNexusThresholds(): Record<string, NexusThreshold> {
    return US_NEXUS_THRESHOLDS;
  }

  getNexusThreshold(state: string): NexusThreshold | null {
    return US_NEXUS_THRESHOLDS[state.toUpperCase()] ?? null;
  }

  getUSFilingDeadlines(): Record<string, string> {
    return US_FILING_DEADLINES;
  }

  private calculateIndia(input: TaxCalculationInput): TaxCalculationResult {
    // Determine GST rate based on product type or HSN code
    let rate = 18; // default
    if (input.productType === 'food') rate = 5;
    else if (input.productType === 'medical') rate = 0;
    else if (input.productType === 'goods') rate = 12;
    else if (input.productType === 'digital') rate = 18;

    // HSN code overrides
    if (input.hsnCode) {
      const hsn = parseInt(input.hsnCode.slice(0, 2));
      if (hsn >= 1 && hsn <= 4) rate = 0;      // Vegetables, fruits
      else if (hsn >= 27 && hsn <= 27) rate = 5; // Petroleum
      else if (hsn >= 61 && hsn <= 63) rate = 12; // Textiles
      else if (hsn >= 84 && hsn <= 85) rate = 18; // Machinery, electronics
    }

    const halfRate = rate / 2;
    const cgstAmt = parseFloat(((input.amount * halfRate) / 100).toFixed(2));
    const sgstAmt = parseFloat(((input.amount * halfRate) / 100).toFixed(2));
    const taxAmount = cgstAmt + sgstAmt;

    return {
      taxableAmount: input.amount,
      taxRate: rate,
      taxAmount,
      totalAmount: parseFloat((input.amount + taxAmount).toFixed(2)),
      taxType: 'GST',
      taxLabel: `India GST ${rate}% (CGST ${halfRate}% + SGST ${halfRate}%)`,
      country: 'IN',
      breakdown: [
        { name: `CGST ${halfRate}%`, rate: halfRate, amount: cgstAmt },
        { name: `SGST ${halfRate}%`, rate: halfRate, amount: sgstAmt },
      ],
    };
  }

  // ── VAT Return Report ─────────────────────────────────────────────────────

  generateVATReturn(
    invoices: Invoice[],
    expenses: Expense[],
    options: { period: string; country: string; currency: string; vatRate?: number; gstin?: string }
  ): VATReturnReport {
    const country = options.country.toUpperCase();
    const vatRate = options.vatRate ?? this.getStandardVATRate(country);

    const paidInvoices = invoices.filter(i => i.status === 'paid' || i.status === 'partially_paid');
    const totalSales = paidInvoices.reduce((s, i) => s + parseFloat(i.amount), 0);

    // Zero-rated (exports, cross-border services)
    const zeroRated = paidInvoices
      .filter(i => i.compliance?.country && i.compliance.country !== country)
      .reduce((s, i) => s + parseFloat(i.amount), 0);

    const standardRatedSales = totalSales - zeroRated;
    const outputVAT = parseFloat(((standardRatedSales * vatRate) / 100).toFixed(2));

    const totalPurchases = expenses
      .filter(e => e.status === 'approved')
      .reduce((s, e) => s + parseFloat(e.amount), 0);
    const inputVAT = parseFloat(((totalPurchases * vatRate) / 100).toFixed(2));

    const netVATPayable = parseFloat((outputVAT - inputVAT).toFixed(2));
    const filingDeadline = this.getFilingDeadline(country, options.period);

    return {
      period: options.period,
      country,
      currency: options.currency,
      vatRate,
      standardRatedSales: parseFloat(standardRatedSales.toFixed(2)),
      outputVAT,
      zeroRatedSales: parseFloat(zeroRated.toFixed(2)),
      exemptSales: 0,
      standardRatedPurchases: parseFloat(totalPurchases.toFixed(2)),
      inputVAT,
      netVATPayable,
      isRefund: netVATPayable < 0,
      filingDeadline,
      filingReference: `VAT-${country}-${options.period.replace(/\s/g, '-')}-${Date.now().toString(36).toUpperCase()}`,
      invoiceCount: paidInvoices.length,
      expenseCount: expenses.filter(e => e.status === 'approved').length,
    };
  }

  // ── India GST Filing ──────────────────────────────────────────────────────

  generateGSTFiling(
    invoices: Invoice[],
    expenses: Expense[],
    options: { period: string; gstin: string; currency: string }
  ): GSTFilingReport {
    const paidInvoices = invoices.filter(i => i.status === 'paid');

    // B2B: clientCountry is India and amount > 0
    const b2b = paidInvoices.filter(i => !i.clientCountry || i.clientCountry === 'IN');
    const b2c = paidInvoices.filter(i => i.clientCountry && i.clientCountry !== 'IN');

    const b2bTotal = b2b.reduce((s, i) => s + parseFloat(i.amount), 0);
    const b2cTotal = b2c.reduce((s, i) => s + parseFloat(i.amount), 0);
    const totalOutward = b2bTotal + b2cTotal;

    // Assume 18% GST split CGST 9% + SGST 9%
    const outputIGST = parseFloat(((b2cTotal * 18) / 100).toFixed(2)); // Inter-state
    const outputCGST = parseFloat(((b2bTotal * 9) / 100).toFixed(2));
    const outputSGST = parseFloat(((b2bTotal * 9) / 100).toFixed(2));

    const totalPurchases = expenses
      .filter(e => e.status === 'approved')
      .reduce((s, e) => s + parseFloat(e.amount), 0);
    const inputTaxCredit = parseFloat(((totalPurchases * 18) / 100).toFixed(2));

    const netGSTPayable = parseFloat((outputCGST + outputSGST + outputIGST - inputTaxCredit).toFixed(2));

    return {
      period: options.period,
      gstin: options.gstin,
      currency: options.currency,
      b2bSupplies: parseFloat(b2bTotal.toFixed(2)),
      b2cSupplies: parseFloat(b2cTotal.toFixed(2)),
      totalOutwardSupplies: parseFloat(totalOutward.toFixed(2)),
      outputIGST,
      outputCGST,
      outputSGST,
      inputTaxCredit,
      netGSTPayable,
      filingDeadline: this.getFilingDeadline('IN', options.period),
    };
  }

  // ── ZATCA KSA E-Invoice Compliance ───────────────────────────────────────

  generateZATCAFields(invoice: Invoice): Record<string, string> {
    const vatAmt = parseFloat(invoice.taxAmount ?? '0');
    const netAmt = parseFloat(invoice.amount) - vatAmt;
    return {
      invoiceType: invoice.isProForma ? 'Simplified' : 'Standard',
      invoiceSubtype: '388',                           // Tax invoice
      sellerTaxId: invoice.compliance?.taxId ?? '',
      buyerTaxId: invoice.compliance?.vatNumber ?? '',
      invoiceDate: new Date(invoice.createdAt).toISOString().slice(0, 10),
      invoiceTimestamp: new Date(invoice.createdAt).toISOString(),
      netAmount: netAmt.toFixed(2),
      vatAmount: vatAmt.toFixed(2),
      vatRate: '15',
      totalAmount: invoice.amount,
      currency: invoice.currency,
      // QR code data (TLV encoded in production — base64 placeholder)
      zatcaQR: Buffer.from(JSON.stringify({
        sellerName: 'Flyn',
        vatNumber: invoice.compliance?.taxId ?? '',
        timestamp: new Date(invoice.createdAt).toISOString(),
        invoiceTotal: invoice.amount,
        vatTotal: vatAmt.toFixed(2),
      })).toString('base64'),
    };
  }

  // ── Tax Summary ───────────────────────────────────────────────────────────

  generateTaxSummary(invoices: Invoice[], expenses: Expense[], country: string, period: string) {
    const countryUp = country.toUpperCase();
    const vatRate = this.getStandardVATRate(countryUp);
    const corporateTaxRate = this.getCorporateTaxRate(countryUp);

    // Filter by period: supports YYYY-MM (month) or YYYY (year)
    const matchesPeriod = (dateVal: Date | string | undefined): boolean => {
      if (!period || !dateVal) return true;
      const iso = (dateVal instanceof Date ? dateVal : new Date(dateVal)).toISOString();
      return iso.startsWith(period);
    };

    const paid = invoices.filter(i => (i.status === 'paid' || i.status === 'partially_paid') && matchesPeriod(i.createdAt));
    const approvedExpenses = expenses.filter(e => e.status === 'approved' && matchesPeriod(e.createdAt));

    const totalRevenue = paid.reduce((s, i) => s + (parseFloat(i.subtotal ?? i.amount) || 0), 0);
    const totalExpenses = approvedExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const taxableIncome = Math.max(0, totalRevenue - totalExpenses);

    // Actual output tax: sum the recorded taxAmount/totalTax on each paid invoice
    let totalTaxCollected = 0;
    // Breakdown grouped by effective tax rate
    const byRate: Record<string, { taxRate: number; taxLabel: string; taxableAmount: number; taxAmount: number }> = {};

    for (const inv of paid) {
      const actualTax = parseFloat(inv.totalTax ?? inv.taxAmount ?? '0') || 0;
      const subtotal = parseFloat(inv.subtotal ?? inv.amount ?? '0') || 0;
      totalTaxCollected += actualTax;

      // Derive effective rate: prefer line-item rate, fall back to computed ratio
      let effectiveRate = 0;
      if (inv.lineItems && inv.lineItems.length > 0) {
        const rates = inv.lineItems.map(li => li.taxRate ?? 0).filter(r => r > 0);
        if (rates.length > 0) effectiveRate = rates[0];
      }
      if (effectiveRate === 0 && subtotal > 0 && actualTax > 0) {
        effectiveRate = parseFloat(((actualTax / subtotal) * 100).toFixed(1));
      }

      const rateKey = String(effectiveRate);
      const taxLabel = effectiveRate === 0
        ? 'Exempt / 0%'
        : countryUp === 'US' ? `${effectiveRate}% Sales Tax` : `${effectiveRate}% VAT`;
      if (!byRate[rateKey]) byRate[rateKey] = { taxRate: effectiveRate, taxLabel, taxableAmount: 0, taxAmount: 0 };
      byRate[rateKey].taxableAmount += subtotal;
      byRate[rateKey].taxAmount += actualTax;
    }

    // Input tax from expenses: estimate using country VAT rate (no taxAmount field on Expense)
    const totalInputTax = parseFloat(((totalExpenses * vatRate) / 100).toFixed(2));
    const netVATPayable = parseFloat(Math.max(0, totalTaxCollected - totalInputTax).toFixed(2));
    const corporateTax = parseFloat(((taxableIncome * corporateTaxRate) / 100).toFixed(2));

    const breakdown = Object.values(byRate)
      .map(b => ({
        taxLabel: b.taxLabel,
        taxRate: b.taxRate,
        taxableAmount: parseFloat(b.taxableAmount.toFixed(2)),
        taxAmount: parseFloat(b.taxAmount.toFixed(2)),
      }))
      .sort((a, b) => b.taxRate - a.taxRate);

    return {
      period,
      country: countryUp,
      vatRate,
      corporateTaxRate,
      totalRevenue: parseFloat(totalRevenue.toFixed(2)),
      totalExpenses: parseFloat(totalExpenses.toFixed(2)),
      taxableIncome: parseFloat(taxableIncome.toFixed(2)),
      // Correctly named for the frontend
      totalTaxCollected: parseFloat(totalTaxCollected.toFixed(2)),
      totalInputTax,
      netVATPayable,
      estimatedCorporateTax: corporateTax,
      totalTaxLiability: parseFloat((netVATPayable + corporateTax).toFixed(2)),
      invoiceCount: paid.length,
      breakdown,
      // Legacy aliases kept for backward compatibility
      vatCollected: parseFloat(totalTaxCollected.toFixed(2)),
      vatOnExpenses: totalInputTax,
      byCategory: breakdown.map(b => ({ category: b.taxLabel, revenue: b.taxableAmount, taxCollected: b.taxAmount })),
      complianceNote: this.getComplianceNote(countryUp),
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getStandardVATRate(country: string): number {
    const rates: Record<string, number> = {
      AE: 5, SA: 15, EG: 14, JO: 16, GH: 15, KE: 16, ZA: 15,
      IN: 18, PH: 12, PK: 17, ID: 11, MY: 6, UK: 20, GB: 20,
      US: 0, ...EU_VAT_RATES,
    };
    return rates[country] ?? 0;
  }

  getCorporateTaxRate(country: string): number {
    const rates: Record<string, number> = {
      US: 21, AE: 9, SA: 20, EG: 22.5, JO: 20, GH: 25, KE: 30,
      ZA: 27, IN: 25, PH: 25, PK: 29, ID: 22, MY: 24, GB: 25, DE: 30,
    };
    return rates[country] ?? 20;
  }

  getFilingDeadline(country: string, period: string): string {
    // Returns the standard filing deadline string per country
    const deadlines: Record<string, string> = {
      AE: '28 days after quarter end',
      SA: '30 days after month end',
      UK: '1 month + 7 days after period end',
      GB: '1 month + 7 days after period end',
      IN: '20th of next month (GSTR-3B)',
      US: 'Varies by state',
      GH: '30 days after quarter end',
      KE: '20 days after month end',
    };
    return deadlines[country] ?? '30 days after period end';
  }

  getTaxCodesForCountry(country: string): TaxCode[] {
    return TAX_CODE_LIBRARY.filter(tc => tc.country === country.toUpperCase());
  }

  getAllStateTaxRates(): Record<string, number> {
    return US_STATE_TAX;
  }

  getEUVATRates(): Record<string, number> {
    return EU_VAT_RATES;
  }

  private getComplianceNote(country: string): string {
    const notes: Record<string, string> = {
      AE: 'UAE VAT: File quarterly with FTA. TRN required on all invoices > AED 10,000.',
      SA: 'KSA VAT: Monthly filing with ZATCA. E-invoicing (FATOORAH) mandatory for all VAT-registered businesses.',
      IN: 'India GST: File GSTR-1 by 11th and GSTR-3B by 20th of every month. E-invoicing mandatory for turnover > ₹5 Cr.',
      US: 'US Sales Tax: Nexus rules apply per state. Consult a tax advisor for multi-state compliance.',
      GH: 'Ghana VAT: File monthly with GRA. VAT Flat Rate Scheme available for small businesses.',
      KE: 'Kenya VAT: Monthly filing with KRA. Digital services subject to DST from 2024.',
      ZA: 'South Africa VAT: Bi-monthly filing with SARS for turnover < R30M.',
    };
    return notes[country] ?? 'Consult a local tax advisor for compliance requirements.';
  }
}
