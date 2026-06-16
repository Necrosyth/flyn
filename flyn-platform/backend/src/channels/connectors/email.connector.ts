import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { randomUUID } from 'crypto';
import { buildOwnMessageId, parseAddressList } from '../services/email.util';
import { formatFromHeader } from '../../branding/email-branding.util';
import { BaseConnector } from './base.connector';
import {
  ChannelConfig,
  ChannelCredentials,
  ChannelConnection,
  IncomingMessage,
  OutgoingMessage,
  ConnectionTestResult,
  ChannelSetupResult,
} from '../types/channel.types';

@Injectable()
export class EmailConnector implements BaseConnector {
  private readonly logger = new Logger(EmailConnector.name);

  async testConnection(config: ChannelConfig): Promise<ConnectionTestResult> {
    const { smtpHost, smtpPort, smtpUsername, smtpPassword } = config.credentials;
    if (!smtpHost || !smtpUsername || !smtpPassword) {
      return { success: false, error: 'Missing SMTP credentials (host, username, password)' };
    }
    try {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort || 587,
        secure: smtpPort === 465,
        auth: { user: smtpUsername, pass: smtpPassword },
        connectionTimeout: 10000,
        socketTimeout: 10000,
      });
      await transporter.verify();
      return { success: true, details: { smtpHost, smtpUsername } };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  async setupChannel(_config: ChannelConfig, _webhookUrl: string): Promise<ChannelSetupResult> {
    // Email incoming is handled via IMAP polling — no external webhook to register
    return { success: true, channelId: `email_${Date.now()}` };
  }

  async cleanupChannel(_channel: ChannelConnection, _credentials: ChannelCredentials): Promise<void> {
    // Nothing to clean up
  }

  async parseIncomingMessage(payload: any): Promise<IncomingMessage> {
    // Email incoming is handled by EmailPollingService; this is a fallback
    return {
      id: String(payload.messageId || Date.now()),
      channelExternalId: payload.from || '',
      sender: { id: payload.from || '', email: payload.from },
      content: { type: 'text', text: payload.text || payload.subject || '' },
      timestamp: Date.now(),
    };
  }

  async verifyWebhook(_payload: any, _signature: string): Promise<boolean> {
    return true;
  }

  /**
   * Send an email and return a tracking token that can be used to detect opens.
   * The caller is responsible for storing the tracking token → Chatwoot mapping.
   */
  async sendMessage(
    channel: ChannelConnection,
    credentials: ChannelCredentials,
    message: OutgoingMessage & {
      subject?: string;
      inReplyTo?: string;
      references?: string[];
      attachments?: Array<{ filename: string; path: string; contentType?: string }>;
      cc?: string | string[];
      bcc?: string | string[];
    },
  ): Promise<{ trackingToken: string; messageId: string }> {
    const { smtpHost, smtpPort, smtpUsername, smtpPassword } = credentials;
    if (!smtpHost || !smtpUsername || !smtpPassword) {
      throw new Error(`Missing SMTP credentials for email channel ${channel.id}`);
    }
    if (!message.recipientId) {
      throw new Error('No recipient email address provided for outbound email');
    }

    const trackingToken = randomUUID();
    const backendUrl = (process.env.PUBLIC_BACKEND_URL || '').replace(/\/$/, '');
    const pixelUrl = `${backendUrl}/api/track/email/open/${trackingToken}.gif`;

    const textBody = message.content.text || '';
    const trackingPixel = `<!-- email tracking pixel -->
<img src="${pixelUrl}" width="1" height="1" border="0" alt="" style="display:block;width:1px;height:1px;opacity:0" />`;
    // When a pre-rendered HTML body is supplied (e.g. campaign template), send it verbatim
    // and just append the tracking pixel. Otherwise wrap the plain text.
    const htmlBody = message.html
      ? `${message.html}\n${trackingPixel}`
      : `<div style="font-family:sans-serif;font-size:14px;line-height:1.6;color:#333">
${textBody.replace(/\n/g, '<br>')}
</div>
${trackingPixel}`;

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort || 587,
      secure: smtpPort === 465,
      auth: { user: smtpUsername, pass: smtpPassword },
    });

    // A stable Message-ID we own — so the customer's reply (In-Reply-To: this) chains back to us,
    // and so our outbound row can be threaded. In-Reply-To/References are set ONLY on a reply
    // (passed by the caller) so the mail lands inside the customer's existing Gmail thread.
    const ownMessageId = buildOwnMessageId(trackingToken, smtpUsername);
    // cc/bcc — validated address arrays (nodemailer Options.cc/bcc accept string[] — verified
    // @types/nodemailer index.d.ts:106,108). BCC is intentionally NOT added to any visible header:
    // nodemailer's mime-node excludes Bcc from generated headers unless keepBcc is set (which we
    // never set — mime-node/index.js:581), while still delivering to the bcc envelope. So bcc
    // recipients receive the mail but are hidden from to/cc recipients.
    const cc = parseAddressList(message.cc);
    const bcc = parseAddressList(message.bcc);
    await transporter.sendMail({
      // Display name override only — the envelope address stays the connected (DKIM-aligned)
      // mailbox, so deliverability is unchanged. Reply-To carries the tenant's customEmailDomain.
      from: message.fromName ? formatFromHeader(message.fromName, smtpUsername) : smtpUsername,
      to: message.recipientId,
      subject: message.subject || 'Re: Support',
      text: textBody,
      html: htmlBody,
      messageId: ownMessageId,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.inReplyTo ? { inReplyTo: message.inReplyTo } : {}),
      ...(message.references?.length ? { references: message.references } : {}),
      ...(cc.length ? { cc } : {}),
      ...(bcc.length ? { bcc } : {}),
      // nodemailer streams each attachment from its `path` (a presigned S3 GET URL — verified the
      // installed @types/nodemailer Attachment supports a URL path).
      ...(message.attachments?.length
        ? { attachments: message.attachments.map((a) => ({ filename: a.filename, path: a.path, contentType: a.contentType })) }
        : {}),
    });

    this.logger.log(`[Email] Sent to ${message.recipientId} via ${smtpHost} (tracking: ${trackingToken}, id: ${ownMessageId}${message.inReplyTo ? `, inReplyTo: ${message.inReplyTo}` : ''})`);
    return { trackingToken, messageId: ownMessageId };
  }
}
