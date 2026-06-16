import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  Headers,
  Query,
  Res,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
  NotFoundException,
  UseGuards,
  Req,
  Sse,
  MessageEvent,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Observable, map } from 'rxjs';
import { Response } from 'express';
import { ChannelsService } from './channels.service';
import { WhatsAppQRService } from './services/whatsapp-qr.service';
import { EmailOAuthService } from './services/email-oauth.service';
import { ChannelType, ChannelConfig } from './types/channel.types';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { Public } from '../billing/guards/public.decorator';

@ApiTags('Channels')
@Controller('channels')
@UseGuards(ApiOrFirebaseAuthGuard)
export class ChannelsController {
  private readonly logger = new Logger(ChannelsController.name);

  constructor(
    private readonly channelsService: ChannelsService,
    private readonly whatsappQRService: WhatsAppQRService,
    private readonly emailOAuthService: EmailOAuthService,
  ) {}

  /**
   * Connect a new channel for a tenant
   */
  @Post('connect')
  @HttpCode(HttpStatus.CREATED)
  async connectChannel(
    @Body() body: {
      channelType: ChannelType;
      config: ChannelConfig;
    },
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!body?.channelType) {
      throw new BadRequestException('channelType is required');
    }
    if (!body?.config) {
      throw new BadRequestException('config is required');
    }

    const result = await this.channelsService.connectChannel(
      tenantId,
      body.channelType,
      body.config,
    );

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return {
      success: true,
      channelId: result.channelId,
      inboxId: result.inboxId,
    };
  }

  /**
   * Disconnect a channel
   */
  @Delete(':channelId')
  @HttpCode(HttpStatus.OK)
  async disconnectChannel(
    @Param('channelId') channelId: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const result = await this.channelsService.disconnectChannel(tenantId, channelId);

    if (!result.success) {
      throw new BadRequestException(result.error);
    }

    return { success: true };
  }

  /**
   * List all channels for a tenant
   */
  @Get('list')
  async listChannels(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const channels = await this.channelsService.getTenantChannels(tenantId);
    return { channels };
  }

  /**
   * Test channel connection without saving
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  async testConnection(
    @Body() body: { channelType: ChannelType; config: ChannelConfig },
    @Req() req: AuthRequest,
  ) {
    const connector = this.channelsService.getConnector(body.channelType);
    const result = await connector.testConnection(body.config);
    return result;
  }

  /**
   * Quick-connect email using SMTP credentials from environment variables (e.g. Brevo)
   */
  @Post('smtp/env-connect')
  @HttpCode(HttpStatus.CREATED)
  async connectEnvSmtp(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    if (!host || !user || !pass) {
      throw new BadRequestException('SMTP credentials are not configured on the server.');
    }
    const config: ChannelConfig = {
      name: 'Brevo SMTP',
      credentials: {
        smtpHost: host,
        smtpPort: Number(process.env.SMTP_PORT) || 587,
        smtpUsername: user,
        smtpPassword: pass,
      },
    };
    const result = await this.channelsService.connectChannel(tenantId, ChannelType.EMAIL, config);
    if (!result.success) throw new BadRequestException(result.error);
    return { success: true, channelId: result.channelId, provider: 'brevo' };
  }

  // ─── WhatsApp QR ──────────────────────────────────────────────────────────

  @Post('whatsapp/qr/start')
  @HttpCode(HttpStatus.CREATED)
  async startQRSession(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.whatsappQRService.startSession(tenantId);
  }

  @Public()
  @Sse('whatsapp/qr/:sessionId/stream')
  qrStream(@Param('sessionId') sessionId: string): Observable<MessageEvent> {
    const subject = this.whatsappQRService.getSessionStream(sessionId);
    if (!subject) throw new NotFoundException('QR session not found');
    return subject.asObservable().pipe(
      map((event) => ({ data: JSON.stringify(event) } as MessageEvent)),
    );
  }

  @Public()
  @Get('whatsapp/qr/:sessionId/status')
  getQRStatus(@Param('sessionId') sessionId: string): { status: string; qrCode?: string; phoneNumber?: string } {
    const status = this.whatsappQRService.getSessionStatus(sessionId);
    if (!status) throw new NotFoundException('QR session not found');
    return status;
  }

  @Delete('whatsapp/qr/:sessionId')
  @HttpCode(HttpStatus.OK)
  cancelQRSession(@Param('sessionId') sessionId: string) {
    this.whatsappQRService.destroySession(sessionId);
    return { success: true };
  }

  /**
   * "Sync Now" — reconnect a stale WhatsApp session for the caller's tenant and let the
   * resulting history sync repopulate the inbox. Returns the resulting session status so the
   * UI can either refresh (connected/reconnecting) or prompt a QR re-scan (needs_rescan).
   */
  @Post('whatsapp/sync')
  @HttpCode(HttpStatus.OK)
  async syncWhatsApp(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const result = await this.whatsappQRService.resync(tenantId);
    return { success: true, ...result };
  }

  // ─── Email OAuth ──────────────────────────────────────────────────────────

  @Get('oauth/gmail/url')
  getGmailAuthUrl(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    try {
      const url = this.emailOAuthService.getGmailAuthUrl(tenantId);
      return { url };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Public()
  @Get('oauth/gmail/callback')
  async gmailCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.myflynai.com';
    if (error || !code) {
      return res.redirect(`${frontendUrl}/settings/channels?oauth_error=gmail_denied`);
    }
    try {
      const { email } = await this.emailOAuthService.handleGmailCallback(code, state);
      return res.send(`<html><script>
        window.opener && window.opener.postMessage({type:'oauth_success',provider:'gmail',email:'${email}'}, '*');
        window.close();
      </script><body>Gmail connected! You can close this window.</body></html>`);
    } catch (err: any) {
      this.logger.error(`Gmail OAuth callback error: ${err.message}`);
      return res.send(`<html><script>
        window.opener && window.opener.postMessage({type:'oauth_error',provider:'gmail',message:'${err.message.replace(/'/g, '')}'}, '*');
        window.close();
      </script><body>Error: ${err.message}. Please close this window.</body></html>`);
    }
  }

  @Get('oauth/outlook/url')
  getOutlookAuthUrl(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    try {
      const url = this.emailOAuthService.getOutlookAuthUrl(tenantId);
      return { url };
    } catch (err: any) {
      throw new BadRequestException(err.message);
    }
  }

  @Public()
  @Get('oauth/outlook/callback')
  async outlookCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://app.myflynai.com';
    if (error || !code) {
      return res.redirect(`${frontendUrl}/settings/channels?oauth_error=outlook_denied`);
    }
    try {
      const { email } = await this.emailOAuthService.handleOutlookCallback(code, state);
      return res.send(`<html><script>
        window.opener && window.opener.postMessage({type:'oauth_success',provider:'outlook',email:'${email}'}, '*');
        window.close();
      </script><body>Outlook connected! You can close this window.</body></html>`);
    } catch (err: any) {
      this.logger.error(`Outlook OAuth callback error: ${err.message}`);
      return res.send(`<html><script>
        window.opener && window.opener.postMessage({type:'oauth_error',provider:'outlook',message:'${err.message.replace(/'/g, '')}'}, '*');
        window.close();
      </script><body>Error: ${err.message}. Please close this window.</body></html>`);
    }
  }

  /**
   * Broadcast a message to all subscribers of a given channel
   * POST /api/channels/broadcast
   * Body: { tenantId?: string; channelId: string; message: string }
   */
  @Post('broadcast')
  @HttpCode(HttpStatus.OK)
  async broadcastMessage(
    @Body() body: {
      tenantId?: string;
      channelId: string;
      message: string;
      recipients?: { phone: string; name?: string }[];
    },
    @Req() req: AuthRequest,
  ) {
    const tenantId =
      body.tenantId ||
      (req.firebaseUser?.['organization_id'] as string) ||
      req.firebaseUser?.uid;

    if (!body.channelId) throw new BadRequestException('channelId is required');
    if (!body.message?.trim()) throw new BadRequestException('message is required');

    // Route by channel type — Telegram doesn't need a recipient list
    const allChannels = await this.channelsService.getTenantChannels(tenantId);
    const channel = (allChannels as any[]).find((c: any) => c.id === body.channelId);

    if (channel?.type === ChannelType.TELEGRAM) {
      const chatId: string | undefined = channel.chatId;
      if (!chatId) {
        throw new BadRequestException(
          'No Channel/Group Chat ID configured. Reconnect your Telegram bot and enter the Chat ID (e.g. @mychannel) during setup.',
        );
      }
      const result = await this.channelsService.sendChannelMessage(tenantId, body.channelId, chatId, body.message);
      return { success: result.success, sent: result.success ? 1 : 0, failed: result.success ? 0 : 1, error: result.error };
    }

    // WhatsApp and other recipient-based channels
    const recipients = body.recipients?.filter((r: { phone: string }) => r.phone?.trim()) ?? [];
    if (recipients.length === 0) {
      throw new BadRequestException(
        'No recipients provided. Select contacts from the Phonebook to send a WhatsApp broadcast.',
      );
    }

    const result = await this.channelsService.broadcastWhatsApp(tenantId, recipients, body.message);
    return { success: result.sent > 0, ...result };
  }

  // ─── Telegram Subscribers & Campaigns ────────────────────────────────────────

  @Get('telegram/subscribers')
  async getTelegramSubscribers(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const subscribers = await this.channelsService.getTelegramSubscribers(tenantId);
    return { subscribers };
  }

  @Get('telegram/campaigns')
  async getTelegramCampaigns(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const campaigns = await this.channelsService.getTelegramCampaigns(tenantId);
    return { campaigns };
  }

  @Post('telegram/campaigns')
  @HttpCode(HttpStatus.CREATED)
  async createTelegramCampaign(
    @Body() body: any,
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.channelsService.createTelegramCampaign(tenantId, body);
  }

  @Post('telegram/campaigns/:id/launch')
  @HttpCode(HttpStatus.OK)
  async launchTelegramCampaign(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.channelsService.launchTelegramCampaign(tenantId, id);
  }

  @Delete('telegram/campaigns/:id')
  @HttpCode(HttpStatus.OK)
  async deleteTelegramCampaign(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.channelsService.deleteTelegramCampaign(tenantId, id);
  }

  // ─── Telegram Bot Brain ───────────────────────────────────────────────────────

  @Get('telegram/bot-settings')
  async getTelegramBotSettings(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.channelsService.getTelegramBotSettings(tenantId);
  }

  @Post('telegram/bot-settings')
  @HttpCode(HttpStatus.OK)
  async saveTelegramBotSettings(@Body() body: any, @Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.channelsService.saveTelegramBotSettings(tenantId, body);
  }

  @Post('telegram/ai/auto-reply')
  @HttpCode(HttpStatus.OK)
  async testTelegramAutoReply(
    @Body() body: { message: string },
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!body.message?.trim()) throw new BadRequestException('message is required');
    return this.channelsService.generateTelegramAutoReply(tenantId, body.message);
  }

  // ─── Vapi / Twilio tenant config endpoints ──────────────────────────────────

  /**
   * GET /api/channels/vapi/config
   * Returns the tenant's Vapi public key + assistant ID for the Dialer.
   * SAFE: only public key is returned, never the server key.
   */
  @Get('vapi/config')
  async getVapiConfig(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.channelsService.getTenantVapiConfig(tenantId);
  }

  /**
   * GET /api/channels/twilio/config
   * Returns whether Twilio is connected and the from-number.
   */
  @Get('twilio/config')
  async getTwilioConfig(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.channelsService.getTenantTwilioConfig(tenantId);
  }

  /**
   * POST /api/channels/vapi/call
   * Initiate an outbound AI voice call via the tenant's own Vapi account.
   * Body: { to: string; assistantId?: string }
   */
  @Post('vapi/call')
  @HttpCode(HttpStatus.OK)
  async makeVapiCall(
    @Body() body: { to: string; assistantId?: string },
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!body.to) throw new BadRequestException('to (phone number) is required');
    try {
      const result = await this.channelsService.makeVapiCall(tenantId, body.to, body.assistantId);
      return { success: true, ...result };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Vapi call failed');
    }
  }

  /**
   * POST /api/channels/twilio/ai-call
   * Initiate an outbound AI voice call using the tenant's Twilio credentials.
   * Twilio calls the customer; when they answer, a Gemini-powered TwiML webhook
   * handles the conversation.
   */
  @Post('twilio/ai-call')
  @HttpCode(HttpStatus.OK)
  async makeTwilioAiCall(
    @Body() body: { to: string; agentId?: string; recordingEnabled?: boolean; aiTranscription?: boolean; sentimentAnalysis?: boolean },
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!body.to) throw new BadRequestException('to (phone number) is required');
    try {
      const result = await this.channelsService.makeTwilioAiCall(
        tenantId,
        body.to,
        body.agentId,
        body.recordingEnabled === true,
        // Transcription + sentiment default ON when absent (preserve existing AI-call behavior).
        // Sentiment is meaningless without the transcript it analyzes → force it off when
        // transcription is off (enforced here too, not only in the UI).
        {
          aiTranscription: body.aiTranscription !== false,
          sentimentAnalysis: body.aiTranscription !== false && body.sentimentAnalysis !== false,
        },
      );
      return { success: true, ...result };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'AI voice call failed');
    }
  }

  /**
   * GET /api/channels/twilio/phone-numbers
   * Lists all Twilio phone numbers on this tenant's account.
   */
  @Get('twilio/phone-numbers')
  async getTwilioPhoneNumbers(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    try {
      const numbers = await this.channelsService.getTwilioPhoneNumbers(tenantId);
      return { numbers };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Could not fetch phone numbers');
    }
  }

  /**
   * POST /api/channels/twilio/configure-inbound
   * Point a Twilio phone number at the AI receptionist for this tenant.
   * Body: { phoneNumberSid: string; agentId: string }
   */
  @Post('twilio/configure-inbound')
  @HttpCode(HttpStatus.OK)
  async configureTwilioInbound(
    @Body() body: { phoneNumberSid: string; agentId: string },
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!body.phoneNumberSid) throw new BadRequestException('phoneNumberSid is required');
    if (!body.agentId) throw new BadRequestException('agentId is required');
    try {
      return await this.channelsService.configurePhoneNumberForInbound(
        tenantId, body.phoneNumberSid, body.agentId,
      );
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Could not configure inbound');
    }
  }

  /**
   * GET /api/channels/twilio/recording/:recordingSid/stream
   * Authenticated proxy — fetches the MP3 from Twilio using tenant credentials
   * and buffers it to the browser. The raw Twilio URL (which embeds account SID)
   * is never exposed to the client.
   */
  @Get('twilio/recording/:recordingSid/stream')
  async streamRecording(
    @Param('recordingSid') recordingSid: string,
    @Req() req: AuthRequest,
    @Res() res: Response,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    try {
      // Prefer Firebase Storage (permanent CDN) over Twilio proxy (30-day TTL)
      const signedUrl = await this.channelsService.getRecordingSignedUrl(tenantId, recordingSid);
      if (signedUrl) {
        return res.redirect(302, signedUrl);
      }

      // Fallback: buffer and proxy from Twilio — used until archive job completes
      const { buffer, contentType } = await this.channelsService.streamRecording(tenantId, recordingSid);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', buffer.length.toString());
      res.setHeader('Cache-Control', 'private, max-age=3600, immutable');
      res.setHeader('Content-Disposition', `inline; filename="${recordingSid}.mp3"`);
      res.end(buffer);
    } catch (err: any) {
      this.logger.warn(`[Recording Stream] Failed for ${recordingSid}: ${err.message}`);
      res.status(404).json({ error: err?.message || 'Recording not found' });
    }
  }

  /**
   * GET /api/channels/twilio/recordings
   * Returns all recordings for the tenant from DynamoDB (permanent store).
   * Each row includes audioUrl (S3 pre-signed, 1hr) when the MP3 is archived.
   */
  @Get('twilio/recordings')
  async listRecordings(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    return this.channelsService.listRecordings(tenantId);
  }

  // ─── Twilio Conference Bridge ──────────────────────────────────────────────

  @Post('twilio/conference')
  @HttpCode(HttpStatus.OK)
  async makeConferenceCall(
    @Body() body: { to: string; agentId?: string },
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!body.to) throw new BadRequestException('to (phone number) is required');
    try {
      const result = await this.channelsService.makeConferenceCall(tenantId, body.to, body.agentId);
      return { success: true, ...result };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Conference call failed');
    }
  }

  @Get('twilio/conference')
  async listConferenceSessions(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const sessions = await this.channelsService.getConferenceSessions(tenantId);
    return { sessions };
  }

  @Get('twilio/conference/:confName')
  async getConferenceSession(
    @Param('confName') confName: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    try {
      const session = await this.channelsService.getConferenceSession(tenantId, confName);
      return { success: true, session };
    } catch (err: any) {
      throw new NotFoundException(err?.message);
    }
  }

  @Post('twilio/conference/:confName/token')
  @HttpCode(HttpStatus.OK)
  async getConferenceToken(
    @Param('confName') confName: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    try {
      const result = await this.channelsService.getTwilioConferenceToken(tenantId, confName);
      return { success: true, ...result };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Token generation failed');
    }
  }

  @Post('twilio/conference/:confName/mute-bot')
  @HttpCode(HttpStatus.OK)
  async muteConferenceBot(
    @Param('confName') confName: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    try {
      await this.channelsService.muteConferenceBot(tenantId, confName);
      return { success: true };
    } catch (err: any) {
      throw new BadRequestException(err?.message);
    }
  }

  @Post('twilio/conference/:confName/remove-bot')
  @HttpCode(HttpStatus.OK)
  async removeConferenceBot(
    @Param('confName') confName: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    try {
      await this.channelsService.removeConferenceBot(tenantId, confName);
      return { success: true };
    } catch (err: any) {
      throw new BadRequestException(err?.message);
    }
  }

  @Post('twilio/conference/:confName/end')
  @HttpCode(HttpStatus.OK)
  async endConference(
    @Param('confName') confName: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    try {
      await this.channelsService.endConference(tenantId, confName);
      return { success: true };
    } catch (err: any) {
      throw new BadRequestException(err?.message);
    }
  }

  // ─── Twilio Conference TwiML Webhooks (Public) ─────────────────────────────

  @Public()
  @Get('webhook/twilio/conference-join')
  async twilioConferenceJoin(
    @Query('conf') conf: string,
    @Query('role') role: string,
    @Query('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    const twiml = this.channelsService.handleConferenceJoinTwiml(conf || 'unknown', role || 'agent');
    res.setHeader('Content-Type', 'text/xml');
    res.send(twiml);
  }

  // Browser SDK POSTs to TwiML App VoiceUrl (conf, tenantId in body).
  // Customer outbound leg also POSTs (conf, role, tenantId in query string).
  @Public()
  @Post('webhook/twilio/conference-join')
  @HttpCode(HttpStatus.OK)
  async twilioConferenceJoinPost(
    @Body() body: any,
    @Query('conf') confQuery: string,
    @Query('role') roleQuery: string,
    @Res() res: Response,
  ) {
    const conf: string = body?.conf || body?.conferenceName || confQuery || 'unknown';
    const role: string = roleQuery || body?.role || 'agent';
    this.logger.log(`[ConferenceJoin] webhook called — conf=${conf} role=${role} callSid=${body?.CallSid || 'none'}`);
    const twiml = this.channelsService.handleConferenceJoinTwiml(conf, role);
    res.setHeader('Content-Type', 'text/xml');
    res.send(twiml);
  }

  @Public()
  @Get('webhook/twilio/conference-bot')
  async twilioConferenceBotJoin(
    @Query('conf') conf: string,
    @Query('tenantId') tenantId: string,
    @Res() res: Response,
  ) {
    const twiml = this.channelsService.handleConferenceBotTwiml(conf || 'unknown');
    res.setHeader('Content-Type', 'text/xml');
    res.send(twiml);
  }

  @Public()
  @Get('webhook/twilio/conference-wait')
  async twilioConferenceWaitGet(@Res() res: Response) {
    this.logger.log('[ConferenceWait] GET called');
    res.setHeader('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="120"/></Response>`);
  }

  @Public()
  @Post('webhook/twilio/conference-wait')
  @HttpCode(HttpStatus.OK)
  async twilioConferenceWaitPost(@Body() body: any, @Res() res: Response) {
    this.logger.log(`[ConferenceWait] POST called — CallSid=${body?.CallSid || 'none'}`);
    res.setHeader('Content-Type', 'text/xml');
    res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Pause length="120"/></Response>`);
  }

  @Public()
  @Post('webhook/twilio/conference-status')
  @HttpCode(HttpStatus.OK)
  async twilioConferenceStatus(
    @Body() body: any,
    @Query('tenantId') tenantId: string,
    @Query('conf') conf: string,
  ) {
    this.logger.log(`[ConferenceStatus] CallSid=${body?.CallSid} CallStatus=${body?.CallStatus} ConferenceSid=${body?.ConferenceSid || 'none'} conf=${conf}`);
    if (tenantId && conf) {
      await this.channelsService.handleConferenceStatusCallback(tenantId, conf, body as Record<string, string>);
    }
    return '<Response></Response>';
  }

  /**
   * Public TwiML webhook for the Twilio AI voice conversation loop.
   * Twilio POSTs here on call answer and after each Gather (speech input).
   * Returns TwiML XML — Gemini generates the spoken reply.
   */
  @Public()
  @Post('webhook/twilio/voice')
  @HttpCode(HttpStatus.OK)
  async twilioVoiceWebhook(
    @Body() body: any,
    @Query('tenantId') tenantId: string,
    @Query('agentId') agentId: string | undefined,
    @Res() res: Response,
  ) {
    // body can be undefined when Twilio sends a call-status or redirect callback with no body
    const safeBody = body ?? {};

    // If this is a call-status callback (CallStatus=completed/failed etc.) with no speech,
    // return an empty TwiML response — don't try to run the AI loop
    const callStatus: string = (safeBody.CallStatus || '').toLowerCase();
    if (callStatus && callStatus !== 'in-progress') {
      this.logger.log(`[VoiceWebhook] Status callback (${callStatus}) — returning empty TwiML`);
      res.setHeader('Content-Type', 'text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response></Response>`);
      return;
    }

    const speech: string = (safeBody.SpeechResult || '').trim();
    const callSid: string | undefined = safeBody.CallSid || undefined;
    const confidence = parseFloat((safeBody.Confidence as string) || '1.0') || 1.0;
    const speechDurationSecs = parseFloat((safeBody.SpeechDuration as string) || '0') || 0;
    // LanguageDetected: sent by Twilio when using deepgram_nova-3 + language="multi" on <Gather>
    const detectedLangCode = (safeBody.LanguageDetected || safeBody.Language || '').trim();
    this.logger.log(`[VoiceWebhook] HIT tenantId=${tenantId} agentId=${agentId} callSid=${callSid} speech="${speech.slice(0, 60)}" conf=${confidence.toFixed(2)} lang=${detectedLangCode || 'n/a'}`);
    // Controller-level wall clock — the TRUE time Twilio's request was held (handler + send).
    // Compare to the service's totalServerMs: any gap = framework/serialization overhead.
    const _ctrlT0 = Date.now();
    try {
      const twiml = await this.channelsService.handleTwilioVoiceWebhook(tenantId, speech, agentId, callSid, confidence, speechDurationSecs, detectedLangCode);
      res.setHeader('Content-Type', 'text/xml');
      res.send(twiml);
      this.logger.log(`[VoiceTiming] controllerTotalMs=${Date.now() - _ctrlT0} callSid=${callSid}`);
    } catch (err: any) {
      this.logger.error(`[VoiceWebhook] Unhandled error: ${err?.message ?? err}`);
      res.setHeader('Content-Type', 'text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>I'm sorry, there was a technical issue. Please try again shortly.</Say><Hangup/></Response>`);
    }
  }

  /**
   * POST /api/channels/webhook/twilio/inbound-voice
   * Twilio fires this when an inbound call arrives on a configured number.
   * tenantId + agentId are embedded in the VoiceUrl set via configure-inbound.
   */
  @Public()
  @Post('webhook/twilio/inbound-voice')
  @HttpCode(HttpStatus.OK)
  async twilioInboundVoiceWebhook(
    @Body() body: any,
    @Query('tenantId') tenantId: string,
    @Query('agentId') agentId: string | undefined,
    @Res() res: Response,
  ) {
    const callSid: string = body?.CallSid || '';
    const callerNumber: string = body?.From || '';
    const toNumber: string = body?.To || '';
    this.logger.log(`[InboundVoice] callSid=${callSid} from=${callerNumber} tenantId=${tenantId} agentId=${agentId}`);
    try {
      const twiml = await this.channelsService.handleInboundVoiceCall(
        tenantId, callerNumber, callSid, toNumber, agentId,
      );
      res.setHeader('Content-Type', 'text/xml');
      res.send(twiml);
    } catch (err: any) {
      this.logger.error(`[InboundVoice] Error: ${err?.message ?? err}`);
      res.setHeader('Content-Type', 'text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?><Response><Say>Sorry, we're unable to take your call right now. Please try again later.</Say><Hangup/></Response>`);
    }
  }

  /**
   * POST /api/channels/webhook/twilio/recording-status
   * Twilio RecordingStatusCallback — fires once when the recording MP3 is
   * fully processed (typically 15–90 s after call ends).
   * Stores only the RecordingSid — the raw URL stays server-side.
   */
  @Public()
  @Post('webhook/twilio/recording-status')
  @HttpCode(HttpStatus.OK)
  async twilioRecordingStatus(
    @Body() body: any,
    @Query('tenantId') tenantId: string,
  ) {
    const callSid: string = body?.CallSid || '';
    const recordingSid: string = body?.RecordingSid || '';
    const recordingStatus: string = body?.RecordingStatus || '';
    const recordingDuration: string = body?.RecordingDuration || '0';

    this.logger.log(
      `[RecordingStatus] tenantId=${tenantId} callSid=${callSid} ` +
      `recordingSid=${recordingSid} status=${recordingStatus} duration=${recordingDuration}s`,
    );

    if (tenantId && callSid && recordingSid) {
      await this.channelsService.handleRecordingStatusCallback(
        tenantId, callSid, recordingSid, recordingStatus, recordingDuration,
      );
    }
    // Twilio expects a 200 response — content doesn't matter
    return '<Response></Response>';
  }

  /**
   * POST /api/channels/webhook/twilio/call-status
   * Twilio StatusCallback — fires on initiated/ringing/answered/completed.
   * Updates the activeCall document in Firestore for live monitoring.
   */
  @Public()
  @Post('webhook/twilio/call-status')
  @HttpCode(HttpStatus.OK)
  async twilioCallStatus(
    @Body() body: any,
    @Query('tenantId') tenantId: string,
  ) {
    const callSid: string = body.CallSid || '';
    const callStatus: string = body.CallStatus || '';
    const callDuration: string | undefined = body.CallDuration || undefined;
    if (tenantId && callSid && callStatus) {
      await this.channelsService.handleAiCallStatus(tenantId, callSid, callStatus, callDuration);
    }
    return '<Response></Response>';
  }

  /**
   * GET /api/channels/calls/:callSid/analytics?tenantId=xxx
   * Per-call analytics: aggregates + per-turn sentiment/confidence data.
   */
  @Public()
  @Get('calls/:callSid/analytics')
  async getCallAnalytics(
    @Param('callSid') callSid: string,
    @Query('tenantId') tenantId: string,
  ) {
    if (!tenantId || !callSid) throw new BadRequestException('tenantId and callSid are required');
    try {
      return await this.channelsService.getCallAnalytics(tenantId, callSid);
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Analytics not available');
    }
  }

  /**
   * POST /api/channels/twilio/call/:callSid/barge
   * Agent barges into an active AI call: redirects customer into a conference,
   * returns a browser SDK token for the agent to join the same conference.
   */
  @Post('twilio/call/:callSid/barge')
  @HttpCode(HttpStatus.OK)
  async bargeIntoCall(
    @Param('callSid') callSid: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!callSid) throw new BadRequestException('callSid is required');
    try {
      const result = await this.channelsService.bargeIntoCall(tenantId, callSid);
      return { success: true, ...result };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Could not barge into call');
    }
  }

  /**
   * POST /api/channels/twilio/call/:callSid/cancel
   * Terminate an active call immediately — stops Twilio billing.
   */
  @Post('twilio/call/:callSid/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelTwilioCall(
    @Param('callSid') callSid: string,
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!callSid) throw new BadRequestException('callSid is required');
    try {
      await this.channelsService.cancelTwilioCall(tenantId, callSid);
      return { success: true };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'Could not terminate call');
    }
  }

  /**
   * POST /api/channels/twilio/cleanup-stale
   * Batch-marks all activeCalls older than 90 min that are still ringing/in-progress as ended.
   * Self-heals after missed Twilio StatusCallbacks. Safe to call repeatedly (idempotent).
   */
  @Post('twilio/cleanup-stale')
  @HttpCode(HttpStatus.OK)
  async cleanupStaleCalls(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!tenantId) throw new BadRequestException('tenantId required');
    return this.channelsService.cleanupStaleCalls(tenantId);
  }

  /**
   * GET /api/channels/twilio/call-history?limit=100
   * Returns the full Twilio call log for this tenant (all statuses).
   * Enriches each record with sentiment + agentName from Firestore where available.
   * Sorted by Twilio default: most recent first.
   */
  @Get('twilio/call-history')
  async getTwilioCallHistory(
    @Req() req: AuthRequest,
    @Query('limit') limit?: string,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!tenantId) throw new BadRequestException('tenantId required');
    try {
      // MUST await — without it the promise rejection escapes this try/catch and Nest turns a plain
      // service Error into a 500 (this was the call-history 500 for pool tenants with no BYO creds).
      return await this.channelsService.getTwilioCallHistory(tenantId, limit ? parseInt(limit, 10) : 100);
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(err?.message || 'Could not fetch call history');
    }
  }

  /**
   * GET /api/channels/twilio/call-flow
   * Returns the tenant's active call intelligence flow (nodes + edges JSON).
   */
  @Get('twilio/call-flow')
  async getCallFlow(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!tenantId) throw new BadRequestException('tenantId required');
    return this.channelsService.getCallFlow(tenantId);
  }

  /**
   * POST /api/channels/twilio/call-flow
   * Saves (upserts) the tenant's active call intelligence flow.
   * Body: { name: string; nodes: unknown[]; edges: unknown[] }
   */
  @Post('twilio/call-flow')
  @HttpCode(HttpStatus.OK)
  async saveCallFlow(
    @Body() body: { name: string; nodes: unknown[]; edges: unknown[] },
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!tenantId) throw new BadRequestException('tenantId required');
    if (!Array.isArray(body.nodes)) throw new BadRequestException('nodes array required');
    return this.channelsService.saveCallFlow(tenantId, body);
  }

  /**
   * GET /api/channels/twilio/call-flow/stats
   * Returns today's automation execution counts for the Call Intelligence card.
   */
  @Get('twilio/call-flow/stats')
  async getCallFlowStats(@Req() req: AuthRequest) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!tenantId) throw new BadRequestException('tenantId required');
    return this.channelsService.getCallFlowStats(tenantId);
  }

  /**
   * POST /api/channels/twilio/call
   * Initiate an outbound PSTN voice call via the tenant's own Twilio account.
   * Body: { to: string; twimlUrl: string }
   */
  @Post('twilio/call')
  @HttpCode(HttpStatus.OK)
  async makeTwilioCall(
    @Body() body: { to: string; twimlUrl: string },
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!body.to) throw new BadRequestException('to is required');
    if (!body.twimlUrl) throw new BadRequestException('twimlUrl is required');
    return this.channelsService.makeTwilioCall(tenantId, body.to, body.twimlUrl);
  }

  /**
   * POST /api/channels/twilio/sms
   * Send an SMS via the tenant's own Twilio account.
   * Body: { to: string; body: string }
   */
  @Post('twilio/sms')
  @HttpCode(HttpStatus.OK)
  async sendTwilioSms(
    @Body() body: { to: string; body: string },
    @Req() req: AuthRequest,
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!body.to) throw new BadRequestException('to is required');
    if (!body.body) throw new BadRequestException('body (message text) is required');
    try {
      const result = await this.channelsService.sendTwilioSms(tenantId, body.to, body.body);
      return { success: true, ...result };
    } catch (err: any) {
      throw new BadRequestException(err?.message || 'SMS sending failed');
    }
  }

  /**
   * Twilio inbound SMS webhook
   * Twilio posts to this URL when an SMS arrives on the tenant's number.
   * Body is form-encoded (application/x-www-form-urlencoded).
   */
  @Public()
  @Post('webhook/twilio')
  async twilioWebhook(
    @Body() payload: any,
    @Query('tenantId') tenantId?: string,
    @Headers('x-twilio-signature') signature?: string,
  ) {
    this.logger.debug('Received Twilio webhook');
    const result = await this.channelsService.handleIncomingWebhook(
      ChannelType.TWILIO,
      payload,
      signature,
      tenantId,
    );
    if (!result.success) {
      this.logger.error(`Twilio webhook failed: ${result.error}`);
    }
    // Twilio expects TwiML or empty 200
    return '<Response></Response>';
  }

  /**
   * Webhook receiver for WhatsApp
   */
  @Public()
  @Post('webhook/whatsapp')
  async whatsappWebhook(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature?: string,
    @Query('tenantId') tenantId?: string,
  ) {
    this.logger.log(`Received WhatsApp webhook (tenantId=${tenantId || 'none'})`);

    const result = await this.channelsService.handleIncomingWebhook(
      ChannelType.WHATSAPP,
      payload,
      signature,
      tenantId,
    );

    if (!result.success) {
      this.logger.error(`WhatsApp webhook failed: ${result.error}`);
    }

    // Return 200 to acknowledge receipt
    return { status: 'ok' };
  }

  /**
   * WhatsApp webhook verification (for Meta challenge)
   */
  @Public()
  @Get('webhook/whatsapp')
  async verifyWhatsAppWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
    @Query('tenantId') tenantId?: string,
  ) {
    this.logger.log(`WhatsApp webhook verification request (tenantId=${tenantId || 'none'}, mode=${mode})`);

    // Verify the token matches what we generated
    // In production, you'd check this against stored credentials
    if (mode === 'subscribe' && verifyToken) {
      this.logger.log(`WhatsApp webhook verified successfully, returning challenge`);
      return challenge;
    }

    throw new BadRequestException('Verification failed');
  }

  /**
   * Webhook receiver for Slack
   */
  @Public()
  @Post('webhook/slack')
  async slackWebhook(
    @Body() payload: any,
    @Query('tenantId') tenantId?: string,
  ) {
    this.logger.debug('Received Slack webhook');

    // Handle Slack URL verification challenge
    if (payload.type === 'url_verification') {
      return { challenge: payload.challenge };
    }

    const result = await this.channelsService.handleIncomingWebhook(
      ChannelType.SLACK,
      payload,
      undefined,
      tenantId,
    );
    return { status: 'ok' };
  }

  /**
   * Webhook receiver for Telegram
   */
  @Public()
  @Post('webhook/telegram')
  async telegramWebhook(
    @Body() payload: any,
    @Query('tenantId') tenantId?: string,
  ) {
    this.logger.debug('Received Telegram webhook');

    const result = await this.channelsService.handleIncomingWebhook(
      ChannelType.TELEGRAM,
      payload,
      undefined,
      tenantId,
    );

    if (!result.success) {
      this.logger.error(`Telegram webhook failed: ${result.error}`);
    }

    return { status: 'ok' };
  }

  /**
   * Webhook receiver for Facebook
   */
  @Public()
  @Post('webhook/facebook')
  async facebookWebhook(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const result = await this.channelsService.handleIncomingWebhook(
      ChannelType.FACEBOOK,
      payload,
      signature,
      tenantId,
    );
    return { status: 'ok' };
  }

  /**
   * Facebook webhook verification
   */
  @Public()
  @Get('webhook/facebook')
  async verifyFacebookWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe' && verifyToken) return challenge;
    throw new BadRequestException('Verification failed');
  }

  /**
   * Webhook receiver for Instagram
   */
  @Public()
  @Post('webhook/instagram')
  async instagramWebhook(
    @Body() payload: any,
    @Headers('x-hub-signature-256') signature: string,
    @Query('tenantId') tenantId?: string,
  ) {
    const result = await this.channelsService.handleIncomingWebhook(
      ChannelType.INSTAGRAM,
      payload,
      signature,
      tenantId,
    );
    return { status: 'ok' };
  }

  /**
   * Instagram webhook verification
   */
  @Public()
  @Get('webhook/instagram')
  async verifyInstagramWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyToken: string,
    @Query('hub.challenge') challenge: string,
  ) {
    if (mode === 'subscribe' && verifyToken) return challenge;
    throw new BadRequestException('Verification failed');
  }

  /**
   * Webhook receiver for TikTok
   */
  @Public()
  @Post('webhook/tiktok')
  async tiktokWebhook(
    @Body() payload: any,
    @Query('tenantId') tenantId?: string,
  ) {
    const result = await this.channelsService.handleIncomingWebhook(
      ChannelType.TIKTOK,
      payload,
      undefined,
      tenantId,
    );
    return { status: 'ok' };
  }

  /**
   * Webhook receiver for LinkedIn
   */
  @Public()
  @Post('webhook/linkedin')
  async linkedinWebhook(
    @Body() payload: any,
    @Query('tenantId') tenantId?: string,
  ) {
    const result = await this.channelsService.handleIncomingWebhook(
      ChannelType.LINKEDIN,
      payload,
      undefined,
      tenantId,
    );
    return { status: 'ok' };
  }

  /**
   * Webhook receiver for Snapchat
   */
  @Public()
  @Post('webhook/snapchat')
  async snapchatWebhook(
    @Body() payload: any,
    @Query('tenantId') tenantId?: string,
  ) {
    const result = await this.channelsService.handleIncomingWebhook(
      ChannelType.SNAPCHAT,
      payload,
      undefined,
      tenantId,
    );
    return { status: 'ok' };
  }

  /**
   * Webhook receiver for X (Twitter)
   * Twitter sends both DM events and a CRC challenge (GET) for subscription renewal.
   */
  @Public()
  @Get('webhook/twitter')
  twitterWebhookCrc(@Query('crc_token') crcToken: string) {
    if (!crcToken) return { response_token: '' };
    const consumerSecret = process.env.TWITTER_CLIENT_SECRET ?? '';
    const hmac = require('crypto')
      .createHmac('sha256', consumerSecret)
      .update(crcToken)
      .digest('base64');
    return { response_token: `sha256=${hmac}` };
  }

  @Public()
  @Post('webhook/twitter')
  async twitterWebhook(
    @Body() payload: any,
    @Headers('x-twitter-webhooks-signature') signature: string,
    @Query('tenantId') tenantId?: string,
  ) {
    await this.channelsService.handleIncomingWebhook(
      ChannelType.TWITTER,
      payload,
      signature,
      tenantId,
    );
    return { status: 'ok' };
  }

  /**
   * Webhook receiver for Apple Business Chat
   */
  @Public()
  @Post('webhook/apple')
  async appleWebhook(
    @Body() payload: any,
    @Query('tenantId') tenantId?: string,
  ) {
    const result = await this.channelsService.handleIncomingWebhook(
      ChannelType.APPLE_BUSINESS_CHAT,
      payload,
      undefined,
      tenantId,
    );
    return { status: 'ok' };
  }

  /**
   * Generic Webhook receiver
   */
  @Public()
  @Post('webhook/generic')
  async genericWebhook(
    @Body() payload: any,
    @Query('tenantId') tenantId?: string,
  ) {
    const result = await this.channelsService.handleIncomingWebhook(
      ChannelType.WEBCHAT as any, // Map to WEBCHAT or similar
      payload,
      undefined,
      tenantId,
    );
    return { status: 'ok' };
  }

  /**
   * POST /api/channels/whatsapp/register
   * Completes the Meta Embedded Signup flow by registering the WABA token.
   */
  @Post('whatsapp/register')
  async registerWhatsapp(
    @Req() req: AuthRequest,
    @Body() body: { accessToken: string },
  ) {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    if (!body.accessToken) throw new BadRequestException('accessToken is required');
    return this.channelsService.registerWhatsappWaba(tenantId, body.accessToken);
  }
}
