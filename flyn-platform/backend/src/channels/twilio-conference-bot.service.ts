/**
 * TwilioConferenceBotService
 * --------------------------
 * Placeholder for Media Streams-based AI bot in conference calls.
 * Current implementation uses TwiML Conference verb directly.
 * Future: WebSocket Media Streams for real-time Gemini STT/TTS in conference.
 */

import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class TwilioConferenceBotService {
  private readonly logger = new Logger(TwilioConferenceBotService.name);

  /**
   * Generate TwiML for a bot participant joining a conference.
   * Bot joins unmuted and participates via standard conference audio.
   */
  generateBotConferenceTwiml(conferenceName: string): string {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference
      name="${conferenceName}"
      startConferenceOnEnter="false"
      endConferenceOnExit="false"
      beep="false"
      muted="false"
    />
  </Dial>
</Response>`;
  }
}
