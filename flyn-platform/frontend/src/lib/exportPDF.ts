/**
 * Opens a print-ready window containing the inner HTML of the given element.
 * Works without any external PDF library — the browser print dialog lets users
 * save as PDF natively.
 */
export function exportElementToPDF(element: HTMLElement, title: string): void {
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      color: #111;
      background: #fff;
      margin: 24px;
    }
    h1, h2, h3, h4 { margin: 0 0 8px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th, td { border: 1px solid #ddd; padding: 6px 10px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    button, [role="button"], .no-print { display: none !important; }
    img { max-width: 100%; }
    @media print {
      body { margin: 0; }
      @page { margin: 20mm; }
    }
  </style>
</head>
<body>
  <h2 style="margin-bottom:16px">${title}</h2>
  ${element.innerHTML}
  <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
</body>
</html>`;

  const win = window.open('', '_blank');
  if (!win) return;
  win.document.open();
  win.document.write(html);
  win.document.close();
}
