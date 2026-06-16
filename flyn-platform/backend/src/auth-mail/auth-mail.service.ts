import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthMailService {
  private readonly logger = new Logger(AuthMailService.name);

  constructor(private readonly mail: MailService) {}

  private auth() {
    return admin.auth();
  }

  async sendVerificationEmail(idToken: string): Promise<{ ok: true }> {
    if (!idToken) throw new BadRequestException('idToken required');

    let email: string;
    try {
      const decoded = await this.auth().verifyIdToken(idToken);
      email = decoded.email!;
      if (!email) throw new Error('No email on token');
    } catch (err: any) {
      throw new BadRequestException('Invalid token: ' + err.message);
    }

    const link = await this.auth().generateEmailVerificationLink(email, {
      url: 'https://app.myflynai.com/dashboard',
    });

    await this.mail.sendEmail({
      to: email,
      subject: 'Verify your email address — FLYNAI',
      html: `
        <div style="font-family: sans-serif; padding: 32px; color: #333; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://app.myflynai.com/flyn_icon.png" width="48" height="48" alt="FLYNAI" />
          </div>
          <h2 style="color: #18181b; text-align: center; margin-bottom: 8px;">Verify your email address</h2>
          <p style="color: #71717a; text-align: center; margin-bottom: 32px;">
            Click the button below to verify <strong>${email}</strong> and activate your FLYNAI account.
          </p>
          <div style="text-align: center; margin-bottom: 32px;">
            <a href="${link}"
               style="background: linear-gradient(135deg, #6366f1, #06b6d4); color: white; padding: 14px 32px;
                      text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px;">
              Verify Email Address
            </a>
          </div>
          <p style="color: #a1a1aa; font-size: 13px; text-align: center;">
            This link expires in 24 hours. If you didn't create a FLYNAI account, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #f4f4f5; margin: 24px 0;" />
          <p style="color: #a1a1aa; font-size: 12px; text-align: center;">— The FLYNAI Team</p>
        </div>
      `,
    });

    this.logger.log(`Verification email sent to ${email}`);
    return { ok: true };
  }

  async sendPasswordResetEmail(email: string): Promise<{ ok: true }> {
    if (!email) throw new BadRequestException('email required');

    let link: string;
    try {
      link = await this.auth().generatePasswordResetLink(email.trim().toLowerCase(), {
        url: 'https://app.myflynai.com/login',
      });
    } catch (err: any) {
      // Don't reveal whether the email exists
      this.logger.warn(`Password reset requested for unknown email: ${email}`);
      return { ok: true };
    }

    await this.mail.sendEmail({
      to: email,
      subject: 'Reset your FLYNAI password',
      html: `
        <div style="font-family: sans-serif; padding: 32px; color: #333; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 24px;">
            <img src="https://app.myflynai.com/flyn_icon.png" width="48" height="48" alt="FLYNAI" />
          </div>
          <h2 style="color: #18181b; text-align: center; margin-bottom: 8px;">Reset your password</h2>
          <p style="color: #71717a; text-align: center; margin-bottom: 32px;">
            We received a request to reset the password for <strong>${email}</strong>.
            Click the button below to choose a new password.
          </p>
          <div style="text-align: center; margin-bottom: 32px;">
            <a href="${link}"
               style="background: linear-gradient(135deg, #6366f1, #06b6d4); color: white; padding: 14px 32px;
                      text-decoration: none; border-radius: 8px; display: inline-block; font-weight: 600; font-size: 16px;">
              Reset Password
            </a>
          </div>
          <p style="color: #a1a1aa; font-size: 13px; text-align: center;">
            This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
          <hr style="border: none; border-top: 1px solid #f4f4f5; margin: 24px 0;" />
          <p style="color: #a1a1aa; font-size: 12px; text-align: center;">— The FLYNAI Team</p>
        </div>
      `,
    });

    this.logger.log(`Password reset email sent to ${email}`);
    return { ok: true };
  }
}
