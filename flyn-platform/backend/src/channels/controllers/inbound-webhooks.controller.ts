import { Controller, Post, Body, Query, Logger, BadRequestException } from '@nestjs/common';
import { ChannelsService } from '../channels.service';
import { ChannelType } from '../types/channel.types';

@Controller('webhooks')
export class InboundWebhooksController {
  private readonly logger = new Logger(InboundWebhooksController.name);

  constructor(
    private readonly channelsService: ChannelsService,
  ) {}

  /**
   * Twilio SMS Webhook
   */
  @Post('twilio/sms')
  async handleTwilioSms(
    @Body() body: any,
    @Query('tenantId') tenantId: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId query parameter is required');
    // Route through main webhook handler which saves to DynamoDB
    await this.channelsService.handleIncomingWebhook(ChannelType.SMS, body);
    return { success: true };
  }

  /**
   * WhatsApp (Meta) Webhook — additional path (main path is channels.controller)
   */
  @Post('whatsapp/meta')
  async handleWhatsAppMeta(
    @Body() body: any,
    @Query('tenantId') tenantId: string,
  ) {
    this.logger.log(`Received WhatsApp Meta webhook for tenant ${tenantId}`);
    if (!tenantId) throw new BadRequestException('tenantId query parameter is required');

    const value = body.entry?.[0]?.changes?.[0]?.value;
    const statuses: any[] = value?.statuses || [];
    if (statuses.length > 0) {
      // Status updates — log only
      this.logger.log(`WhatsApp status updates: ${statuses.map((s) => s.status).join(', ')}`);
      return { success: true };
    }

    await this.channelsService.handleIncomingWebhook(ChannelType.WHATSAPP, body, undefined, tenantId);
    return { success: true };
  }

  /**
   * Facebook Webhook
   */
  @Post('facebook')
  async handleFacebook(
    @Body() body: any,
    @Query('tenantId') tenantId: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    await this.channelsService.handleIncomingWebhook(ChannelType.FACEBOOK, body, undefined, tenantId);
    return { success: true };
  }

  /**
   * Instagram Webhook
   */
  @Post('instagram')
  async handleInstagram(
    @Body() body: any,
    @Query('tenantId') tenantId: string,
  ) {
    if (!tenantId) throw new BadRequestException('tenantId is required');
    await this.channelsService.handleIncomingWebhook(ChannelType.INSTAGRAM, body, undefined, tenantId);
    return { success: true };
  }

  /**
   * Slack Webhook
   */
  @Post('slack')
  async handleSlack(
    @Body() body: any,
    @Query('tenantId') tenantId: string,
  ) {
    if (body.type === 'url_verification') return { challenge: body.challenge };
    if (!tenantId) throw new BadRequestException('tenantId is required');
    await this.channelsService.handleIncomingWebhook(ChannelType.SLACK, body, undefined, tenantId);
    return { success: true };
  }
}
