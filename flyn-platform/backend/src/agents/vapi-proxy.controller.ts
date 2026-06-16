/**
 * Vapi Proxy Controller
 * ---------------------
 * Proxies Vapi Web SDK browser requests through the backend
 * to avoid CORS issues.
 *
 * The @vapi-ai/web SDK sends  `POST <baseUrl>/call/web`
 * When pointed at our backend (`<API_BASE_URL>/vapi-proxy`)
 * it becomes  `POST /api/vapi-proxy/call/web`
 *
 * We forward the request to Vapi's real API using the
 * server-side VAPI_API_KEY (which has no CORS restriction).
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Headers,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';

import { VapiService } from '../orchestrator/vapi/vapi.service';

const VAPI_API_URL = 'https://api.vapi.ai';

@Controller('vapi-proxy')
export class VapiProxyController {
  private readonly logger = new Logger(VapiProxyController.name);

  private defaultAssistantId: string | null = null;

  constructor(private readonly vapiService: VapiService) {}

  @Get('default-assistant')
  async getDefaultAssistant() {
    if (this.defaultAssistantId) {
      return { assistantId: this.defaultAssistantId };
    }

    try {
      const created = await this.vapiService.createAssistant({
        name: 'Flyn Default Web Assistant',
        firstMessage: 'Hello! How can I help today?',
        systemPrompt: 'You are a helpful AI assistant for Flyn. Be concise and professional.',
        modelProvider: 'openai',
        modelName: 'gpt-4o',
        voiceProvider: '11labs',
        voiceId: '21m00Tcm4TlvDq8ikWAM',
      });

      const assistantId = (created as any)?.assistantId as string | undefined;
      if (!assistantId) {
        throw new Error('Vapi createAssistant did not return assistantId');
      }

      this.defaultAssistantId = assistantId;
      return { assistantId };
    } catch (err) {
      this.logger.error(`Failed to create default Vapi assistant: ${(err as Error).message}`);
      throw new HttpException(
        {
          statusCode: 500,
          message: `Failed to create default Vapi assistant: ${(err as Error).message}`,
          error: 'Vapi Assistant Error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Proxy for `POST /call/web` — the endpoint the Vapi Web SDK hits
   * to create a web (WebRTC) call.
   */
  @Post('call/web')
  async createWebCall(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization?: string,
  ) {
    // The Vapi Web SDK (and /call/web) expects to be authorized using the PUBLIC key.
    // Using the private/server key here returns "Invalid Key".
    // Priority: 1) VAPI_PUBLIC_KEY env var  2) forwarded Authorization header
    const publicKey = process.env.VAPI_PUBLIC_KEY;
    const authHeader = publicKey ? `Bearer ${publicKey}` : authorization || '';

    if (!authHeader) {
      throw new HttpException(
        'No Vapi authorization available (missing VAPI_API_KEY / VAPI_PUBLIC_KEY and Authorization header).',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    this.logger.log(
      `Proxying web call creation → ${VAPI_API_URL}/call/web  (assistantId: ${body.assistantId || 'inline'})`,
    );

    try {
      const response = await fetch(`${VAPI_API_URL}/call/web`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(body),
      });

      const text = await response.text();

      if (!response.ok) {
        this.logger.error(
          `Vapi /call/web returned ${response.status}: ${text.slice(0, 500)}`,
        );

        // Parse Vapi error for a user-friendly message
        let message = `Vapi API error (${response.status})`;
        try {
          const parsed = JSON.parse(text);
          message = parsed.message || parsed.error || message;
        } catch {
          /* text wasn't JSON */
        }

        throw new HttpException(
          { statusCode: response.status, message, error: 'Vapi API Error' },
          response.status >= 400 && response.status < 600
            ? response.status
            : HttpStatus.BAD_GATEWAY,
        );
      }

      // Stream the successful JSON response back
      const data = JSON.parse(text);
      return data;
    } catch (err) {
      if (err instanceof HttpException) throw err;

      this.logger.error(`Proxy fetch failed: ${(err as Error).message}`);
      throw new HttpException(
        {
          statusCode: 502,
          message: `Could not reach Vapi API: ${(err as Error).message}`,
          error: 'Bad Gateway',
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
