const fs = require('fs');

// Read the synced pages content
const pagesContent = JSON.parse(fs.readFileSync('pages_content.json', 'utf8'));
const template = fs.readFileSync('index.html.template', 'utf8');

// For now, we update the homepage (default)
// To support all pages, we would need to generate individual HTML files per route
const defaultPage = pagesContent['homepage'] || {}; 

let output = template
  .replace(/{{OG_TITLE}}/g, defaultPage.ogTitle || "FLYNAI | All-in-one Business Automation platform")
  .replace(/{{OG_DESCRIPTION}}/g, defaultPage.ogDescription || "Our Solutions include: HR, CRM, Accounting, AI Agents, WhatsAppCRM, Telephony, Telegram CRM, SEO + Growth, Email Marketing, Omnichannel Orchestration, Church Management Software, Freelance, Coaches, Events, Communities built for Startups, founders, and more.")
  .replace(/{{OG_IMAGE}}/g, defaultPage.ogImageUrl || "/flyn_icon.png");

fs.writeFileSync('index.html', output);
console.log('index.html generated with content from Firestore.');
