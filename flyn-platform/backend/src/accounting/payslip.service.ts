/**
 * PayslipService
 *
 * Generates structured payslip data for employees.
 * Returns a JSON object that can be rendered as:
 *  - HTML (for display)
 *  - PDF (via browser print / puppeteer)
 *
 * Includes country-specific deductions (UAE, US, KE, GH, IN, PH, PK).
 */

import { Injectable, Logger } from '@nestjs/common';
import { PAYROLL_DEDUCTIONS } from './accounting.types';

export interface PayslipData {
  // Company
  companyName: string;
  companyAddress?: string;
  companyEmail?: string;
  logoUrl?: string;

  // Employee
  employeeId: string;
  employeeName: string;
  designation?: string;
  department?: string;
  joiningDate?: string;

  // Pay Period
  period: string;           // e.g. "April 2026"
  payDate: string;          // ISO date
  frequency: 'weekly' | 'bi-weekly' | 'monthly';

  // Earnings
  basicSalary: number;
  allowances: Array<{ name: string; amount: number }>;
  overtime?: { hours: number; rate: number; amount: number };
  grossSalary: number;

  // Deductions
  deductions: Array<{ name: string; type: string; amount: number }>;
  totalDeductions: number;
  netPay: number;

  // Employer Side
  employerContributions: Array<{ name: string; amount: number }>;
  totalEmployerCost: number;

  // Leave
  leaveBalance?: { annual: number; sick: number; used: number };
  unpaidLeaveDays?: number;
  leaveDeduction?: number;

  // Banking
  bankName?: string;
  accountNumber?: string;
  iban?: string;

  // Meta
  currency: string;
  country: string;
  payslipNumber: string;
}

export interface PayslipGenerationInput {
  companyName: string;
  companyAddress?: string;
  companyEmail?: string;
  logoUrl?: string;
  employeeId: string;
  employeeName: string;
  designation?: string;
  department?: string;
  joiningDate?: string;
  period: string;
  frequency?: 'weekly' | 'bi-weekly' | 'monthly';
  basicSalary: number;
  allowances?: Array<{ name: string; amount: number }>;
  overtimeHours?: number;
  overtimeRate?: number;
  unpaidLeaveDays?: number;
  bankName?: string;
  accountNumber?: string;
  iban?: string;
  currency: string;
  country: string;
  leaveBalance?: { annual: number; sick: number; used: number };
}

@Injectable()
export class PayslipService {
  private readonly logger = new Logger(PayslipService.name);
  private payslipSeq = 1000;

  generatePayslip(input: PayslipGenerationInput): PayslipData {
    const country = (input.country ?? 'US').toUpperCase();
    const frequency = input.frequency ?? 'monthly';
    const allowances = input.allowances ?? [];

    // Calculate overtime
    let overtime: PayslipData['overtime'];
    let overtimeAmount = 0;
    if (input.overtimeHours && input.overtimeHours > 0) {
      const overtimeRate = input.overtimeRate ?? (input.basicSalary / 176) * 1.5; // 176 working hours/month
      overtimeAmount = input.overtimeHours * overtimeRate;
      overtime = { hours: input.overtimeHours, rate: overtimeRate, amount: overtimeAmount };
    }

    // Gross salary
    const allowanceTotal = allowances.reduce((s, a) => s + a.amount, 0);
    const grossSalary = input.basicSalary + allowanceTotal + overtimeAmount;

    // Leave deduction
    let leaveDeduction = 0;
    if (input.unpaidLeaveDays && input.unpaidLeaveDays > 0) {
      const dailyRate = input.basicSalary / 30;
      leaveDeduction = dailyRate * input.unpaidLeaveDays;
    }

    // Apply country-specific deductions
    const deductionRules = PAYROLL_DEDUCTIONS[country] ?? PAYROLL_DEDUCTIONS['US'];
    const deductions: Array<{ name: string; type: string; amount: number }> = [];
    const employerContributions: Array<{ name: string; amount: number }> = [];

    const grossForDeductions = grossSalary - leaveDeduction;

    for (const rule of deductionRules) {
      // Employee deductions
      if (rule.rate && rule.rate > 0) {
        const amount = parseFloat(((grossForDeductions * rule.rate) / 100).toFixed(2));
        deductions.push({ name: rule.name, type: rule.type, amount });
      } else if (rule.fixedAmount && rule.fixedAmount > 0) {
        deductions.push({ name: rule.name, type: rule.type, amount: rule.fixedAmount });
      }

      // Employer contributions
      if (rule.employerContribution && rule.employerContribution > 0) {
        const empAmount = rule.fixedAmount
          ? rule.employerContribution
          : parseFloat(((grossForDeductions * rule.employerContribution) / 100).toFixed(2));
        employerContributions.push({ name: `${rule.name} (Employer)`, amount: empAmount });
      }
    }

    // Add leave deduction if applicable
    if (leaveDeduction > 0) {
      deductions.push({
        name: `Unpaid Leave (${input.unpaidLeaveDays} days)`,
        type: 'other',
        amount: parseFloat(leaveDeduction.toFixed(2)),
      });
    }

    const totalDeductions = deductions.reduce((s, d) => s + d.amount, 0);
    const netPay = grossSalary - totalDeductions;
    const totalEmployerCost = grossSalary + employerContributions.reduce((s, e) => s + e.amount, 0);

    this.payslipSeq++;
    const payslipNumber = `PAY-${new Date().getFullYear()}-${String(this.payslipSeq).padStart(4, '0')}`;

    const payslip: PayslipData = {
      companyName: input.companyName,
      companyAddress: input.companyAddress,
      companyEmail: input.companyEmail,
      logoUrl: input.logoUrl,
      employeeId: input.employeeId,
      employeeName: input.employeeName,
      designation: input.designation,
      department: input.department,
      joiningDate: input.joiningDate,
      period: input.period,
      payDate: new Date().toISOString().slice(0, 10),
      frequency,
      basicSalary: input.basicSalary,
      allowances,
      overtime,
      grossSalary: parseFloat(grossSalary.toFixed(2)),
      deductions,
      totalDeductions: parseFloat(totalDeductions.toFixed(2)),
      netPay: parseFloat(netPay.toFixed(2)),
      employerContributions,
      totalEmployerCost: parseFloat(totalEmployerCost.toFixed(2)),
      unpaidLeaveDays: input.unpaidLeaveDays,
      leaveDeduction: leaveDeduction > 0 ? parseFloat(leaveDeduction.toFixed(2)) : undefined,
      leaveBalance: input.leaveBalance,
      bankName: input.bankName,
      accountNumber: input.accountNumber,
      iban: input.iban,
      currency: input.currency,
      country,
      payslipNumber,
    };

    this.logger.log(`Generated payslip ${payslipNumber} for ${input.employeeName}`);
    return payslip;
  }

  // ── HTML Payslip Template ─────────────────────────────────────────────────

  generateHTML(payslip: PayslipData): string {
    const formatCurrency = (amount: number) =>
      `${payslip.currency} ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Payslip — ${payslip.payslipNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; font-size: 12px; background: #f5f5f5; }
    .payslip { max-width: 800px; margin: 24px auto; background: #fff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); overflow: hidden; }
    .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); color: white; padding: 28px 32px; }
    .header-top { display: flex; justify-content: space-between; align-items: flex-start; }
    .company-name { font-size: 22px; font-weight: 700; margin-bottom: 4px; }
    .company-details { font-size: 11px; opacity: 0.85; }
    .payslip-label { text-align: right; }
    .payslip-label h2 { font-size: 18px; font-weight: 700; }
    .payslip-label .slip-num { font-size: 11px; opacity: 0.8; margin-top: 4px; }
    .period-bar { background: rgba(255,255,255,0.15); border-radius: 6px; padding: 10px 16px; margin-top: 16px; display: flex; gap: 32px; }
    .period-item { font-size: 11px; opacity: 0.85; }
    .period-item strong { display: block; font-size: 13px; opacity: 1; }
    .employee-section { padding: 20px 32px; background: #f8f9ff; border-bottom: 1px solid #e8e8f0; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
    .emp-field label { font-size: 10px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; }
    .emp-field value { display: block; font-size: 13px; font-weight: 600; color: #1a1a2e; margin-top: 2px; }
    .body { display: grid; grid-template-columns: 1fr 1fr; gap: 0; }
    .col { padding: 24px 32px; }
    .col:first-child { border-right: 1px solid #e8e8f0; }
    .col-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: #6366f1; margin-bottom: 14px; }
    .line-item { display: flex; justify-content: space-between; margin-bottom: 10px; }
    .line-item .label { color: #555; }
    .line-item .amount { font-weight: 600; color: #1a1a2e; }
    .line-item.deduction .amount { color: #ef4444; }
    .divider { border: none; border-top: 1px dashed #e0e0e0; margin: 14px 0; }
    .total-line { display: flex; justify-content: space-between; font-weight: 700; font-size: 13px; }
    .total-line.positive .amount { color: #22c55e; }
    .total-line.negative .amount { color: #ef4444; }
    .net-pay-box { margin: 0 32px 24px; background: linear-gradient(135deg, #6366f1, #4f46e5); border-radius: 10px; padding: 20px 24px; color: white; display: flex; justify-content: space-between; align-items: center; }
    .net-pay-box .label { font-size: 14px; font-weight: 600; }
    .net-pay-box .amount { font-size: 24px; font-weight: 800; }
    .footer { padding: 16px 32px; border-top: 1px solid #e8e8f0; display: flex; justify-content: space-between; align-items: center; background: #f8f9ff; }
    .footer-note { font-size: 10px; color: #999; }
    .bank-info { font-size: 11px; color: #666; text-align: right; }
    @media print { body { background: white; } .payslip { box-shadow: none; } }
  </style>
</head>
<body>
<div class="payslip">
  <div class="header">
    <div class="header-top">
      <div>
        ${payslip.logoUrl ? `<img src="${payslip.logoUrl}" height="36" style="margin-bottom:8px;border-radius:4px;" />` : ''}
        <div class="company-name">${payslip.companyName}</div>
        <div class="company-details">${payslip.companyAddress ?? ''}${payslip.companyEmail ? ` · ${payslip.companyEmail}` : ''}</div>
      </div>
      <div class="payslip-label">
        <h2>PAYSLIP</h2>
        <div class="slip-num">${payslip.payslipNumber}</div>
      </div>
    </div>
    <div class="period-bar">
      <div class="period-item"><span>Pay Period</span><strong>${payslip.period}</strong></div>
      <div class="period-item"><span>Pay Date</span><strong>${payslip.payDate}</strong></div>
      <div class="period-item"><span>Frequency</span><strong>${payslip.frequency}</strong></div>
      <div class="period-item"><span>Currency</span><strong>${payslip.currency}</strong></div>
    </div>
  </div>

  <div class="employee-section">
    <div class="emp-field"><label>Employee</label><value>${payslip.employeeName}</value></div>
    <div class="emp-field"><label>Employee ID</label><value>${payslip.employeeId}</value></div>
    <div class="emp-field"><label>Designation</label><value>${payslip.designation ?? '—'}</value></div>
    <div class="emp-field"><label>Department</label><value>${payslip.department ?? '—'}</value></div>
    <div class="emp-field"><label>Joining Date</label><value>${payslip.joiningDate ?? '—'}</value></div>
    <div class="emp-field"><label>Country</label><value>${payslip.country}</value></div>
  </div>

  <div class="body">
    <div class="col">
      <div class="col-title">💰 Earnings</div>
      <div class="line-item">
        <span class="label">Basic Salary</span>
        <span class="amount">${formatCurrency(payslip.basicSalary)}</span>
      </div>
      ${payslip.allowances.map(a => `
      <div class="line-item">
        <span class="label">${a.name}</span>
        <span class="amount">${formatCurrency(a.amount)}</span>
      </div>`).join('')}
      ${payslip.overtime ? `
      <div class="line-item">
        <span class="label">Overtime (${payslip.overtime.hours}h)</span>
        <span class="amount">${formatCurrency(payslip.overtime.amount)}</span>
      </div>` : ''}
      <hr class="divider" />
      <div class="total-line positive">
        <span>Gross Salary</span>
        <span class="amount">${formatCurrency(payslip.grossSalary)}</span>
      </div>
    </div>

    <div class="col">
      <div class="col-title">📋 Deductions</div>
      ${payslip.deductions.map(d => `
      <div class="line-item deduction">
        <span class="label">${d.name}</span>
        <span class="amount">− ${formatCurrency(d.amount)}</span>
      </div>`).join('')}
      <hr class="divider" />
      <div class="total-line negative">
        <span>Total Deductions</span>
        <span class="amount">− ${formatCurrency(payslip.totalDeductions)}</span>
      </div>
    </div>
  </div>

  <div class="net-pay-box">
    <span class="label">Net Pay</span>
    <span class="amount">${formatCurrency(payslip.netPay)}</span>
  </div>

  <div class="footer">
    <div class="footer-note">
      This is a system-generated payslip and does not require a signature.<br/>
      ${payslip.leaveBalance ? `Leave Balance: Annual ${payslip.leaveBalance.annual}d · Sick ${payslip.leaveBalance.sick}d · Used ${payslip.leaveBalance.used}d` : ''}
    </div>
    <div class="bank-info">
      ${payslip.bankName ? `<div>${payslip.bankName}</div>` : ''}
      ${payslip.iban ? `<div>IBAN: ${payslip.iban}</div>` : payslip.accountNumber ? `<div>Acc: ${payslip.accountNumber}</div>` : ''}
    </div>
  </div>
</div>
</body>
</html>`;
  }
}
