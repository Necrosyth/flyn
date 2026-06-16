import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.logger.log(`Initializing SMTP with host: ${process.env.SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com'}`);
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'email-smtp.us-east-1.amazonaws.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  async sendEmail(params: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    from?: string;
    replyTo?: string;
    attachments?: any[];
  }) {
    try {
      const info = await this.transporter.sendMail({
        from: params.from || process.env.SMTP_FROM || 'FLYNAI <noreply@myflynai.com>',
        to: params.to,
        subject: params.subject,
        text: params.text,
        html: params.html,
        ...(params.replyTo ? { replyTo: params.replyTo } : {}),
        attachments: params.attachments,
      });
      this.logger.log(`Email sent successfully: ${info.messageId}`);
      return info;
    } catch (err) {
      this.logger.error(`Failed to send email: ${err.message}`);
      throw err;
    }
  }

  async sendWelcomeEmail(email: string, name: string) {
    return this.sendEmail({
      to: email,
      subject: `Welcome to FLYNAI, ${name}!`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <img src="https://myflynai.com/flyn_icon.png" width="50" height="50" alt="FLYNAI Logo" />
          <h1>Welcome to FLYNAI</h1>
          <p>Hi ${name},</p>
          <p>We're thrilled to have you on board! FLYNAI is your all-in-one business automation platform.</p>
          <p>Get started by setting up your first AI Agent or connecting your WhatsApp CRM.</p>
          <a href="https://app.myflynai.com" style="background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Go to Dashboard</a>
          <p>If you have any questions, just reply to this email.</p>
          <br/>
          <p>Best,<br/>The FLYNAI Team</p>
        </div>
      `,
    });
  }

  async sendContractInvite(email: string, name: string, contractTitle: string, signUrl: string) {
    return this.sendEmail({
      to: email,
      subject: `Signature Requested: ${contractTitle}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h1>Signature Requested</h1>
          <p>Hi ${name},</p>
          <p>You have been requested to sign the following document: <strong>${contractTitle}</strong>.</p>
          <p>Please review and sign the document using the link below:</p>
          <a href="${signUrl}" style="background: #6366f1; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">Review & Sign</a>
          <p>This link will expire in 7 days.</p>
          <br/>
          <p>Thank you!</p>
        </div>
      `,
    });
  }

  async sendRevocationEmail(params: {
    to: string;
    memberFirstName: string;
    orgName: string;
    adminName: string;
  }) {
    return this.sendEmail({
      to: params.to,
      subject: `Your access to ${params.orgName} has been revoked`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px;">
          <img src="https://myflynai.com/flyn_icon.png" width="50" height="50" alt="FLYNAI Logo" />
          <h2 style="color: #18181b;">Access Revoked</h2>
          <p>Hi ${params.memberFirstName},</p>
          <p>Your access to <strong>${params.orgName}</strong> on Flyn has been revoked by <strong>${params.adminName}</strong>.</p>
          <p>If you believe this was done in error, please reach out to your administrator directly.</p>
          <br/>
          <p style="color: #71717a; font-size: 14px;">— The FLYNAI Team</p>
        </div>
      `,
    });
  }

  async sendInviteCancelledEmail(params: { to: string; orgName: string }) {
    return this.sendEmail({
      to: params.to,
      subject: `Your invite to ${params.orgName} has been cancelled`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333; max-width: 600px;">
          <img src="https://myflynai.com/flyn_icon.png" width="50" height="50" alt="FLYNAI Logo" />
          <h2 style="color: #18181b;">Invite Cancelled</h2>
          <p>Your invitation to join <strong>${params.orgName}</strong> on Flyn has been cancelled.</p>
          <p>If you believe this was done in error, please contact the organization administrator.</p>
          <br/>
          <p style="color: #71717a; font-size: 14px;">— The FLYNAI Team</p>
        </div>
      `,
    });
  }

  async sendNotification(email: string, title: string, message: string) {
    return this.sendEmail({
      to: email,
      subject: title,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333;">
          <h2>${title}</h2>
          <p>${message}</p>
          <br/>
          <p>Sent via FLYNAI Notifications</p>
        </div>
      `,
    });
  }
}
