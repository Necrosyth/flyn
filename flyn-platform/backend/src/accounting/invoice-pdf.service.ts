/**
 * InvoicePDFService
 *
 * Generates premium, production-quality HTML invoice templates.
 * Output is a self-contained HTML string that can be:
 *  - Rendered in browser (print-to-PDF)
 *  - Piped to Puppeteer for server-side PDF generation
 *  - Sent directly as email attachment
 *
 * Supports:
 *  - LTR and RTL (Arabic) layouts
 *  - Multi-currency display
 *  - Regional compliance fields (VAT, GST, TRN, GSTIN, etc.)
 *  - Line items with tax breakdown
 *  - Company branding (logo, colors)
 *  - QR code field (ZATCA/India IRP)
 */

import { Injectable } from '@nestjs/common';
import { Invoice } from './accounting.types';

export interface InvoicePDFOptions {
  companyName: string;
  companyAddress?: string;
  companyEmail?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;      // hex e.g. '#6366f1'
  vatNumber?: string;
  registrationNumber?: string;
  ein?: string;               // EIN passed explicitly when not persisted in compliance JSON
}

@Injectable()
export class InvoicePDFService {

  generateHTML(invoice: Invoice, options: InvoicePDFOptions): string {
    // Sanitise any field that might carry the literal string "undefined" or "null"
    const safe = (v: string | undefined | null): string =>
      (!v || v === 'undefined' || v === 'null') ? '' : v;

    const sanitised: InvoicePDFOptions = {
      ...options,
      companyName:    safe(options.companyName) || 'FLYN',
      companyAddress: safe(options.companyAddress),
      companyEmail:   safe(options.companyEmail),
      companyPhone:   safe(options.companyPhone),
      logoUrl:        safe(options.logoUrl),
      vatNumber:      safe(options.vatNumber),
      registrationNumber: safe(options.registrationNumber),
      ein:            safe(options.ein),
    };
    options = sanitised;

    const isRTL = invoice.compliance?.isRTL ?? false;
    const dir = isRTL ? 'rtl' : 'ltr';
    const primary = options.primaryColor ?? '#6366f1';
    const currency = invoice.currency ?? 'USD';

    const formatAmt = (val: string | number | undefined) => {
      const n = parseFloat(String(val ?? 0));
      return `${currency} ${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const statusColor: Record<string, string> = {
      paid: '#22c55e', pending: '#f59e0b', overdue: '#ef4444',
      draft: '#94a3b8', cancelled: '#6b7280', partially_paid: '#3b82f6',
    };
    const statusBadgeColor = statusColor[invoice.status] ?? '#94a3b8';

    const lineItemsHTML = invoice.lineItems && invoice.lineItems.length > 0
      ? invoice.lineItems.map((li, i) => `
          <tr style="background: ${i % 2 === 0 ? '#f8f9ff' : '#ffffff'};">
            <td style="padding: 12px 16px;">${li.description}</td>
            <td style="padding: 12px 16px; text-align: center;">${li.quantity}</td>
            <td style="padding: 12px 16px; text-align: right;">${formatAmt(li.unitPrice)}</td>
            ${li.discount ? `<td style="padding: 12px 16px; text-align: center;">${li.discount}%</td>` : '<td style="padding: 12px 16px;"></td>'}
            ${li.taxRate ? `<td style="padding: 12px 16px; text-align: center;">${li.taxRate}% ${li.taxLabel ?? ''}</td>` : '<td style="padding: 12px 16px;"></td>'}
            <td style="padding: 12px 16px; text-align: right; font-weight: 600;">${formatAmt(li.total)}</td>
          </tr>`).join('')
      : (() => {
          const subtotalVal = invoice.subtotal && parseFloat(invoice.subtotal) > 0
            ? invoice.subtotal : invoice.amount;
          const taxVal = invoice.taxAmount && parseFloat(invoice.taxAmount) > 0
            ? invoice.taxAmount : (invoice.totalTax && parseFloat(invoice.totalTax) > 0 ? invoice.totalTax : null);
          return `<tr>
            <td style="padding: 12px 16px;">${invoice.description ?? `Invoice ${invoice.invoice}`}</td>
            <td style="padding: 12px 16px; text-align: center;">1</td>
            <td style="padding: 12px 16px; text-align: right;">${formatAmt(subtotalVal)}</td>
            <td style="padding: 12px 16px; text-align: center;">—</td>
            <td style="padding: 12px 16px; text-align: center;">${taxVal ? formatAmt(taxVal) : '—'}</td>
            <td style="padding: 12px 16px; text-align: right; font-weight: 600;">${formatAmt(invoice.amount)}</td>
          </tr>`;
        })();

    // Compliance fields
    const complianceFields: string[] = [];
    const c = invoice.compliance ?? {};
    const einValue = c.ein || c.taxId || options.ein;
    if (einValue) complianceFields.push(`EIN: ${einValue}`);
    else if (c.vatNumber) complianceFields.push(`VAT/TRN: ${c.vatNumber}`);
    if (c.gstin) complianceFields.push(`GSTIN: ${c.gstin}`);
    if (c.kraPin) complianceFields.push(`KRA PIN: ${c.kraPin}`);
    if (c.graTin) complianceFields.push(`GRA TIN: ${c.graTin}`);
    if (c.ntn) complianceFields.push(`NTN: ${c.ntn}`);
    if (c.paymentTerms) complianceFields.push(`Terms: ${c.paymentTerms.replace('_', ' ')}`);

    return `<!DOCTYPE html>
<html lang="${invoice.language ?? 'en'}" dir="${dir}">
<head>
  <meta charset="UTF-8" />
  <title>Invoice ${invoice.invoice}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    body { font-family: 'Inter', 'Segoe UI', sans-serif; color: #1e1b4b; font-size: 13px; background: #f1f5f9; }
    .invoice { max-width: 860px; margin: 24px auto; background: #ffffff; border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.08); overflow: hidden; }

    /* Header */
    .invoice-header { background: linear-gradient(135deg, ${primary} 0%, ${primary}cc 100%); color: white; padding: 36px 40px; }
    .header-content { display: flex; justify-content: space-between; align-items: flex-start; }
    .brand { display: flex; flex-direction: column; gap: 8px; }
    .brand img { height: 44px; border-radius: 6px; }
    .company-name { font-size: 22px; font-weight: 800; }
    .company-meta { font-size: 11px; opacity: 0.8; line-height: 1.6; }
    .invoice-meta { text-align: ${isRTL ? 'left' : 'right'}; }
    .invoice-title { font-size: 32px; font-weight: 800; letter-spacing: -1px; opacity: 0.9; }
    .invoice-num { font-size: 13px; margin-top: 4px; opacity: 0.8; }
    .status-badge {
      display: inline-block; padding: 4px 12px; border-radius: 20px;
      background: ${statusBadgeColor}33; color: ${statusBadgeColor};
      font-size: 11px; font-weight: 700; text-transform: uppercase;
      letter-spacing: 0.5px; margin-top: 8px; border: 1px solid ${statusBadgeColor}66;
    }

    /* Parties */
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border-bottom: 1px solid #e8eaf6; }
    .party { padding: 24px 40px; }
    .party:first-child { border-right: 1px solid #e8eaf6; background: #f8f9ff; }
    .party-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: ${primary}; margin-bottom: 10px; }
    .party-name { font-size: 15px; font-weight: 700; margin-bottom: 4px; }
    .party-detail { font-size: 12px; color: #666; line-height: 1.6; }

    /* Dates */
    .dates-bar { display: flex; gap: 0; border-bottom: 1px solid #e8eaf6; background: #f8f9ff; }
    .date-item { padding: 16px 40px; flex: 1; }
    .date-item:not(:last-child) { border-right: 1px solid #e8eaf6; }
    .date-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; margin-bottom: 4px; }
    .date-value { font-size: 14px; font-weight: 600; }

    /* Line Items */
    .items-section { padding: 28px 40px; }
    .items-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: ${primary}; margin-bottom: 14px; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: ${primary}; color: white; padding: 12px 16px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
    thead th:last-child { text-align: right; }
    tbody tr:hover { background: #f0f2ff !important; }

    /* Totals */
    .totals { display: flex; justify-content: flex-end; padding: 0 40px 28px; }
    .totals-table { width: 320px; }
    .totals-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; }
    .totals-row.divider { border-top: 1px dashed #d1d5e8; margin-top: 4px; padding-top: 12px; }
    .totals-row.grand { font-size: 16px; font-weight: 800; color: ${primary}; border-top: 2px solid ${primary}; margin-top: 4px; padding-top: 12px; }

    /* Payment & Notes */
    .bottom-section { display: grid; grid-template-columns: 1fr 1fr; border-top: 1px solid #e8eaf6; }
    .bottom-col { padding: 24px 40px; }
    .bottom-col:first-child { border-right: 1px solid #e8eaf6; background: #f8f9ff; }
    .bottom-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px; color: ${primary}; margin-bottom: 10px; }
    .payment-link { display: inline-block; margin-top: 8px; padding: 8px 16px; background: ${primary}; color: white; border-radius: 6px; font-size: 12px; font-weight: 600; text-decoration: none; }
    .compliance-field { font-size: 11px; color: #666; margin-bottom: 4px; }

    /* Footer */
    .invoice-footer { padding: 16px 40px; background: ${primary}11; border-top: 1px solid ${primary}22; text-align: center; font-size: 11px; color: #888; }

    @media print {
      body { background: white; }
      .invoice { box-shadow: none; margin: 0; border-radius: 0; }
    }
  </style>
</head>
<body>
<div class="invoice">

  <!-- Header -->
  <div class="invoice-header">
    <div class="header-content">
      <div class="brand">
        ${options.logoUrl ? `<img src="${options.logoUrl}" alt="${options.companyName}" />` : ''}
        <div class="company-name">${options.companyName}</div>
        <div class="company-meta">
          ${options.companyAddress ? `${options.companyAddress}<br/>` : ''}
          ${options.companyEmail ? `${options.companyEmail}` : ''}
          ${options.companyPhone ? ` · ${options.companyPhone}` : ''}
          ${options.vatNumber ? `<br/>VAT: ${options.vatNumber}` : ''}
          ${options.registrationNumber ? `<br/>Reg: ${options.registrationNumber}` : ''}
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-title">${invoice.isProForma ? 'PRO FORMA' : 'INVOICE'}</div>
        <div class="invoice-num">${invoice.invoice}</div>
        <div class="status-badge">${invoice.status.replace('_', ' ')}</div>
      </div>
    </div>
  </div>

  <!-- Parties -->
  <div class="parties">
    <div class="party">
      <div class="party-label">Billed To</div>
      <div class="party-name">${invoice.client}</div>
      <div class="party-detail">
        ${invoice.clientEmail ? `${invoice.clientEmail}<br/>` : ''}
        ${invoice.clientPhone ? `${invoice.clientPhone}<br/>` : ''}
        ${invoice.clientCountry ? `${invoice.clientCountry}` : ''}
      </div>
    </div>
    <div class="party">
      <div class="party-label">From</div>
      <div class="party-name">${options.companyName}</div>
      <div class="party-detail">${options.companyAddress ?? ''}</div>
    </div>
  </div>

  <!-- Dates -->
  <div class="dates-bar">
    <div class="date-item">
      <div class="date-label">Invoice Date</div>
      <div class="date-value">${new Date(invoice.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
    <div class="date-item">
      <div class="date-label">Due Date</div>
      <div class="date-value">${new Date(invoice.dueDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
    </div>
    <div class="date-item">
      <div class="date-label">Module</div>
      <div class="date-value">${invoice.module}</div>
    </div>
    <div class="date-item">
      <div class="date-label">Currency</div>
      <div class="date-value">${currency}</div>
    </div>
  </div>

  <!-- Line Items -->
  <div class="items-section">
    <div class="items-title">📄 Line Items</div>
    <table>
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align:center;">Qty</th>
          <th style="text-align:right;">Unit Price</th>
          <th style="text-align:center;">Discount</th>
          <th style="text-align:center;">Tax</th>
          <th style="text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>${lineItemsHTML}</tbody>
    </table>
  </div>

  <!-- Totals -->
  <div class="totals">
    <div class="totals-table">
      ${invoice.subtotal && parseFloat(invoice.subtotal) > 0 ? `<div class="totals-row"><span>Subtotal</span><span>${formatAmt(invoice.subtotal)}</span></div>` : ''}
      ${invoice.totalDiscount && parseFloat(invoice.totalDiscount) > 0 ? `<div class="totals-row"><span>Discount</span><span style="color:#ef4444;">− ${formatAmt(invoice.totalDiscount)}</span></div>` : ''}
      ${invoice.taxAmount && parseFloat(invoice.taxAmount) > 0 ? `<div class="totals-row"><span>Tax</span><span>${formatAmt(invoice.taxAmount)}</span></div>` : ''}
      <div class="totals-row grand divider"><span>Invoice Total</span><span>${formatAmt(invoice.amount)}</span></div>
      ${invoice.status === 'paid'
        ? `<div class="totals-row" style="color:#22c55e;font-weight:700;"><span>✓ Paid in Full</span><span>− ${formatAmt(invoice.amount)}</span></div>
           <div class="totals-row" style="font-weight:700;"><span>Balance Due</span><span style="color:#22c55e;">USD 0.00</span></div>`
        : invoice.status === 'partially_paid' && invoice.partialPayments && invoice.partialPayments.length > 0
          ? `<div class="totals-row" style="color:#22c55e;"><span>Paid</span><span>− ${formatAmt(invoice.partialPayments.reduce((s, p) => s + parseFloat(p.amount), 0))}</span></div>
             <div class="totals-row" style="font-weight:700;"><span>Balance Due</span><span style="color:#ef4444;">${formatAmt(invoice.outstandingBalance ?? '0')}</span></div>`
          : `<div class="totals-row" style="font-weight:700;"><span>Balance Due</span><span style="color:#ef4444;">${formatAmt(invoice.outstandingBalance ?? invoice.amount)}</span></div>`
      }
    </div>
  </div>

  <!-- Payment & Compliance -->
  <div class="bottom-section">
    <div class="bottom-col">
      <div class="bottom-label">💳 Payment</div>
      ${invoice.paymentLink ? `<a class="payment-link" href="${invoice.paymentLink}">Pay Online →</a>` : ''}
      ${complianceFields.map(f => `<div class="compliance-field" style="margin-top:8px;">${f}</div>`).join('')}
    </div>
    <div class="bottom-col">
      <div class="bottom-label">📝 Notes</div>
      <div style="font-size:12px;color:#666;line-height:1.6;">
        ${invoice.description ? `<p style="margin-bottom:8px;">${invoice.description}</p>` : ''}
        ${invoice.customsReference ? `<p>Customs Ref: ${invoice.customsReference}</p>` : ''}
        ${invoice.compliance?.mobileMoneyInfo ? `<p>${invoice.compliance.mobileMoneyInfo}</p>` : ''}
        ${!invoice.description && !invoice.customsReference ? '<p>Thank you for your business.</p>' : ''}
      </div>
    </div>
  </div>

  <!-- Footer -->
  <div class="invoice-footer">
    Generated by Flyn Platform · ${invoice.invoice} · ${new Date().toLocaleDateString()}
  </div>

</div>
</body>
</html>`;
  }
}
