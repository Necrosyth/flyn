import { Injectable, Logger } from '@nestjs/common';
import { ChannelCredentialsService } from './channel-credentials.service';
import { TenantsService } from '../../tenants/tenants.service';
import { ChannelType } from '../types/channel.types';

interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  email: string;
  name?: string;
}

@Injectable()
export class EmailOAuthService {
  private readonly logger = new Logger(EmailOAuthService.name);

  private get backendUrl() {
    return process.env.BACKEND_URL || 'http://localhost:3001';
  }

  constructor(
    private readonly credentialsService: ChannelCredentialsService,
    private readonly tenantsService: TenantsService,
  ) {}

  // ── Gmail ──────────────────────────────────────────────────────────────────

  getGmailAuthUrl(tenantId: string): string {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not configured.');

    const redirectUri = `${this.backendUrl}/api/channels/oauth/gmail/callback`;
    const state = Buffer.from(JSON.stringify({ tenantId, provider: 'gmail' })).toString('base64url');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: [
        'https://mail.google.com/',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }

  async handleGmailCallback(code: string, state: string): Promise<{ tenantId: string; email: string }> {
    const { tenantId } = JSON.parse(Buffer.from(state, 'base64url').toString());
    const redirectUri = `${this.backendUrl}/api/channels/oauth/gmail/callback`;

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json() as any;
    if (!tokens.access_token) throw new Error(tokens.error_description || 'Gmail token exchange failed');

    // Fetch user profile
    const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as any;

    const creds: OAuthTokens = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      email: profile.email,
      name: profile.name,
    };

    await this.credentialsService.storeCredentials(tenantId, ChannelType.EMAIL, {
      provider: 'gmail',
      ...creds,
      smtpHost: 'smtp.gmail.com',
      smtpPort: 587,
      smtpUsername: profile.email,
      imapHost: 'imap.gmail.com',
      imapPort: 993,
      imapUsername: profile.email,
    } as any);

    this.logger.log(`Gmail connected for tenant ${tenantId}: ${profile.email}`);
    return { tenantId, email: profile.email };
  }

  async refreshGmailToken(tenantId: string): Promise<string> {
    const creds = await this.credentialsService.getCredentials(tenantId, ChannelType.EMAIL) as any;
    if (!creds?.refreshToken) throw new Error('No refresh token stored');

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        refresh_token: creds.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const tokens = await res.json() as any;
    if (!tokens.access_token) throw new Error('Gmail token refresh failed');

    await this.credentialsService.updateCredentials(tenantId, ChannelType.EMAIL, {
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    } as any);

    return tokens.access_token;
  }

  // ── Outlook / Microsoft ────────────────────────────────────────────────────

  getOutlookAuthUrl(tenantId: string): string {
    const clientId = process.env.MICROSOFT_CLIENT_ID;
    if (!clientId) throw new Error('MICROSOFT_CLIENT_ID is not configured.');

    const redirectUri = `${this.backendUrl}/api/channels/oauth/outlook/callback`;
    const state = Buffer.from(JSON.stringify({ tenantId, provider: 'outlook' })).toString('base64url');

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: [
        'offline_access',
        'https://outlook.office.com/IMAP.AccessAsUser.All',
        'https://outlook.office.com/SMTP.Send',
        'User.Read',
      ].join(' '),
      state,
    });

    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params}`;
  }

  async handleOutlookCallback(code: string, state: string): Promise<{ tenantId: string; email: string }> {
    const { tenantId } = JSON.parse(Buffer.from(state, 'base64url').toString());
    const redirectUri = `${this.backendUrl}/api/channels/oauth/outlook/callback`;

    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.MICROSOFT_CLIENT_ID!,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET!,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokens = await tokenRes.json() as any;
    if (!tokens.access_token) throw new Error(tokens.error_description || 'Outlook token exchange failed');

    // Fetch user profile
    const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as any;
    const email = profile.mail || profile.userPrincipalName;

    await this.credentialsService.storeCredentials(tenantId, ChannelType.EMAIL, {
      provider: 'outlook',
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
      email,
      name: profile.displayName,
      smtpHost: 'smtp.office365.com',
      smtpPort: 587,
      smtpUsername: email,
      imapHost: 'outlook.office365.com',
      imapPort: 993,
      imapUsername: email,
    } as any);

    this.logger.log(`Outlook connected for tenant ${tenantId}: ${email}`);
    return { tenantId, email };
  }
}
