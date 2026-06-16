const domain = 'test.myflynai.com';
const hostWithoutPort = domain.split(':')[0];

const PLATFORM_DOMAINS = [
  'api.myflynai.com',
  'app.myflynai.com',
  'esim.myflynai.com',
  'myflynai.com',
];

const isPlatformDomain = 
  PLATFORM_DOMAINS.some(pd => hostWithoutPort === pd) ||
  hostWithoutPort.includes('localhost') ||
  hostWithoutPort.includes('127.0.0.1');

console.log(`Domain: ${domain}`);
console.log(`Is Platform Domain: ${isPlatformDomain}`);
console.log(`Should resolve as custom domain: ${!isPlatformDomain}`);
