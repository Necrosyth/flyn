const nodemailer = require('nodemailer');

// Test Brevo SMTP
const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: 'a94610001@smtp-brevo.com',
    pass: 'YOUR_BREVO_SMTP_KEY',
  },
});

async function testEmail() {
  try {
    console.log('Testing Brevo SMTP connection...');
    console.log(`Host: smtp-relay.brevo.com:587`);
    console.log(`User: a94610001@smtp-brevo.com`);
    console.log('Attempting to send test email...\n');

    const info = await transporter.sendMail({
      from: 'FLYNAI <marketing@myflynai.com>',
      to: 'talraniansh@gmail.com',
      subject: 'FLYNAI Brevo SMTP Test',
      html: '<h1>Test Email</h1><p>This is a test from Brevo SMTP</p>',
    });

    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to send email');
    console.error('Error:', err.message);
    process.exit(1);
  }
}

testEmail();
