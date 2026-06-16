import { Controller, Get, Post, Param, Body, Res } from '@nestjs/common';
import { Response } from 'express';
import { WebsiteBuilderService } from './website-builder.service';
import { Public } from '../billing/guards/public.decorator';

@Public()
@Controller('website-builder/forms')
export class PublicFormsController {
  constructor(private readonly websiteBuilderService: WebsiteBuilderService) {}

  /**
   * GET /api/website-builder/forms/p/:id
   * Serves the published form as a styled standalone page — no auth required.
   */
  @Get('p/:id')
  async renderForm(@Param('id') id: string, @Res() res: Response) {
    const form = await this.websiteBuilderService.getFormByIdPublic(id);

    if (!form || !form.html) {
      res.status(404).setHeader('Content-Type', 'text/plain').send('Form not found');
      return;
    }

    const backendOrigin = process.env.API_BASE_URL || 'https://api.myflynai.com';
    const submitUrl = `${backendOrigin}/api/website-builder/forms/submit/${id}`;

    const page = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${form.name}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #f0f4ff 0%, #faf5ff 100%);
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 48px 20px;
    }
    .card {
      width: 100%;
      max-width: 560px;
      background: #ffffff;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(99,102,241,0.10), 0 1px 4px rgba(0,0,0,0.06);
      padding: 40px 36px 36px;
    }
    .card h1, .card h2, .card h3 {
      font-size: 22px;
      font-weight: 700;
      color: #111827;
      margin-bottom: 24px;
    }
    /* Normalise any inputs/selects/textareas the AI generated without styles */
    .card input:not([type=submit]):not([type=button]):not([type=checkbox]):not([type=radio]),
    .card select,
    .card textarea {
      display: block;
      width: 100%;
      padding: 10px 14px;
      border: 1.5px solid #d1d5db;
      border-radius: 8px;
      font-size: 15px;
      color: #111827;
      background: #fff;
      outline: none;
      box-sizing: border-box;
      margin-bottom: 16px;
      font-family: inherit;
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .card input:focus, .card select:focus, .card textarea:focus {
      border-color: #6366f1;
      box-shadow: 0 0 0 3px rgba(99,102,241,0.12);
    }
    .card label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
      margin-bottom: 6px;
    }
    .card textarea { min-height: 100px; resize: vertical; }
    .card input[type=submit], .card button[type=submit], .card button:not([type]) {
      display: block;
      width: 100%;
      padding: 13px;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff;
      border: none;
      border-radius: 8px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      margin-top: 8px;
      font-family: inherit;
      transition: opacity 0.2s;
    }
    .card input[type=submit]:hover, .card button[type=submit]:hover, .card button:not([type]):hover { opacity: 0.9; }
    .card select { appearance: auto; }
    .card p { font-size: 14px; color: #6b7280; margin-bottom: 16px; }
    #success-msg {
      display: none;
      text-align: center;
      padding: 32px 0 8px;
    }
    #success-msg .check { font-size: 48px; margin-bottom: 12px; }
    #success-msg h2 { color: #059669; font-size: 20px; margin-bottom: 8px; }
    #success-msg p { color: #6b7280; font-size: 14px; }
    .powered {
      text-align: center;
      margin-top: 24px;
      font-size: 11px;
      color: #9ca3af;
    }
    .powered a { color: #6366f1; text-decoration: none; }
  </style>
</head>
<body>
  <div class="card">
    ${form.html}
    <div id="success-msg">
      <div class="check">✅</div>
      <h2>Submitted successfully!</h2>
      <p>Thank you — we've received your response and will be in touch soon.</p>
    </div>
  </div>
  <div class="powered">Powered by <a href="https://myflynai.com" target="_blank">Flyn AI</a></div>

  <script>
    (function() {
      var SUBMIT_URL = '${submitUrl}';
      var forms = document.querySelectorAll('form');
      forms.forEach(function(form) {
        form.addEventListener('submit', function(e) {
          e.preventDefault();
          var data = {};
          var elements = form.elements;
          for (var i = 0; i < elements.length; i++) {
            var el = elements[i];
            if (el.name && el.type !== 'submit' && el.type !== 'button') {
              data[el.name] = el.value;
            }
          }
          var btn = form.querySelector('[type=submit], button');
          if (btn) { btn.disabled = true; btn.textContent = 'Submitting…'; }
          fetch(SUBMIT_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ formData: data, submittedAt: new Date().toISOString() })
          })
          .then(function(r) {
            if (!r.ok) throw new Error('Submit failed');
            form.style.display = 'none';
            document.getElementById('success-msg').style.display = 'block';
          })
          .catch(function(err) {
            if (btn) { btn.disabled = false; btn.textContent = 'Submit'; }
            alert('Submission failed. Please try again.');
          });
        });
      });
    })();
  </script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('X-Frame-Options', 'ALLOWALL');
    return res.send(page);
  }

  /**
   * POST /api/website-builder/forms/submit/:id
   * Captures a form submission and stores it in Firestore — no auth required.
   */
  @Post('submit/:id')
  async submitForm(
    @Param('id') id: string,
    @Body() body: { formData: Record<string, string>; submittedAt?: string },
    @Res() res: Response,
  ) {
    await this.websiteBuilderService.saveFormSubmission(id, body.formData ?? {}, body.submittedAt);
    res.json({ success: true });
  }
}
