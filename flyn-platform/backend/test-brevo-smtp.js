const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: 'smtp-relay.brevo.com',
  port: 587,
  secure: false,
  auth: {
    user: 'a94610001@smtp-brevo.com',
    pass: 'YOUR_BREVO_SMTP_KEY',
  },
});

async function test() {
  try {
    console.log('🔗 Testing Brevo SMTP connection...');
    const info = await transporter.sendMail({
      from: 'marketing@myflynai.com',
      to: 'talraniansh@gmail.com',
      subject: 'FLYNAI Brevo SMTP Test',
      html: '<h1>✅ Brevo SMTP Works!</h1><p>This email was sent via Brevo</p>',
    });
    console.log('✅ Email sent successfully!');
    console.log('Message ID:', info.messageId);
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed:', err.message);
    process.exit(1);
  }
}

test();
