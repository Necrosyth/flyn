/**
 * Agent Types
 * -----------
 * Data model for user-created AI voice agents.
 * Agents are stored in Firestore and synced with Vapi assistants.
 */

// ============================================================================
// CORE AGENT INTERFACE
// ============================================================================

export interface Agent {
  id: string;
  tenantId: string;

  // Identity
  name: string;
  description?: string;
  avatar?: string; // 2-char initials or image URL
  role?: string; // e.g. "Sales Agent", "Support Agent"

  // Voice / Vapi Configuration
  vapiAssistantId?: string; // Created by Vapi API
  firstMessage: string;
  systemPrompt?: string;

  // Model
  modelProvider: string; // 'openai' | 'anthropic' | 'groq' | 'deepinfra'
  modelName: string; // 'gpt-4o' | 'claude-3-opus' etc.
  temperature?: number; // 0..2
  maxTokens?: number;

  // Voice
  voiceProvider: string; // '11labs' | 'playht' | 'deepgram' | 'rime-ai'
  voiceId: string;
  twilioVoice?: string; // Amazon Polly voice for Twilio <Say>, e.g. 'Polly.Joanna', 'Polly.Matthew', 'Polly.Amy'
  language?: string; // BCP-47 code for Twilio STT + TTS, e.g. 'en-US', 'hi-IN', 'es-US'
  supportedLanguages?: string[]; // If 2+ entries, agent asks caller language preference on first turn
  multiLanguage?: boolean; // explicit multi-language toggle (mirrors supportedLanguages.length > 1)

  // Behaviour
  endCallOnSilence?: boolean;
  silenceTimeoutSeconds?: number;
  maxDurationSeconds?: number;
  interruptionsEnabled?: boolean;

  // ConversationRelay (streaming voice)
  voiceEngine?: 'gather' | 'relay';
  voiceModel?: string;
  transcriptTurnLimit?: number;

  // Knowledge & Tools
  knowledgeBaseIds?: string[]; // future: references to uploaded docs
  tools?: AgentTool[];

  // Calendar booking (optional)
  enableCalendarBooking?: boolean; // Whether this agent can book appointments
  calendarId?: string; // Which calendar to book into (tenant's default if omitted)

  // Custom Vapi fields (pass-through)
  customVapiConfig?: Record<string, unknown>;

  // Channels this agent is available on
  channels: AgentChannel[];

  // Skills / tags
  skills?: string[];

  // Status
  status: AgentStatus;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
}

export type AgentStatus = 'active' | 'idle' | 'draft' | 'archived';
export type AgentChannel = 'Voice' | 'Web Chat' | 'SMS' | 'Email' | 'WhatsApp';

export interface AgentTool {
  type: 'function' | 'transferCall' | 'endCall';
  name: string;
  description?: string;
  parameters?: Record<string, unknown>;
}

// ============================================================================
// DTOs  (class-validator — runtime-validated; ValidationPipe strips unknown props)
// ============================================================================

import {
  IsString, IsNotEmpty, IsOptional, IsBoolean, IsInt, IsNumber,
  Min, Max, IsArray, IsObject, IsIn,
} from 'class-validator';

export class CreateAgentDto {
  @IsString() @IsNotEmpty()
  name!: string;

  @IsString() @IsNotEmpty()
  firstMessage!: string;

  // Optional (webhook supplies a default; the workflow-builder create path may omit it).
  @IsOptional() @IsString()
  systemPrompt?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  avatar?: string;

  @IsOptional() @IsString()
  role?: string;

  // ── Twilio voice / language (READ by the call webhook — do not remove) ──
  @IsOptional() @IsString()
  twilioVoice?: string;

  @IsOptional() @IsString()
  language?: string;

  @IsOptional() @IsArray() @IsString({ each: true })
  supportedLanguages?: string[];

  @IsOptional() @IsBoolean()
  multiLanguage?: boolean;

  // ── Call behaviour (honoured by the webhook TwiML) ──
  @IsOptional() @IsBoolean()
  endCallOnSilence?: boolean;

  @IsOptional() @IsInt() @Min(5) @Max(300)
  silenceTimeoutSeconds?: number;

  @IsOptional() @IsInt() @Min(30) @Max(7200)
  maxDurationSeconds?: number;

  @IsOptional() @IsBoolean()
  interruptionsEnabled?: boolean;

  // ── ConversationRelay (streaming voice) ──
  @IsOptional() @IsIn(['gather', 'relay'])
  voiceEngine?: 'gather' | 'relay';

  @IsOptional() @IsString()
  voiceModel?: string; // relay LLM override (default gemini-2.5-flash-lite); set 'gemini-2.5-flash' to revert

  @IsOptional() @IsInt() @Min(4) @Max(20)
  transcriptTurnLimit?: number;

  @IsOptional() @IsArray() @IsString({ each: true })
  channels?: AgentChannel[];

  @IsOptional() @IsArray() @IsString({ each: true })
  skills?: string[];

  @IsOptional() @IsString()
  status?: AgentStatus;

  // ── Calendar Booking ──
  @IsOptional() @IsBoolean()
  enableCalendarBooking?: boolean;

  @IsOptional() @IsString()
  calendarId?: string;

  // ── Legacy/VAPI fields — accepted (optional) so older callers don't break,
  //    but unused by the Twilio call flow. ──
  @IsOptional() @IsString() modelProvider?: string;
  @IsOptional() @IsString() modelName?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(2) temperature?: number;
  @IsOptional() @IsInt() maxTokens?: number;
  @IsOptional() @IsString() voiceProvider?: string;
  @IsOptional() @IsString() voiceId?: string;
  @IsOptional() @IsArray() knowledgeBaseIds?: string[];
  @IsOptional() @IsArray() tools?: AgentTool[];
  @IsOptional() @IsObject() customVapiConfig?: Record<string, unknown>;
}

/** All fields optional for partial updates. */
export class UpdateAgentDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsString() @IsNotEmpty() firstMessage?: string;
  @IsOptional() @IsString() systemPrompt?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() avatar?: string;
  @IsOptional() @IsString() role?: string;
  @IsOptional() @IsString() twilioVoice?: string;
  @IsOptional() @IsString() language?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) supportedLanguages?: string[];
  @IsOptional() @IsBoolean() multiLanguage?: boolean;
  @IsOptional() @IsBoolean() endCallOnSilence?: boolean;
  @IsOptional() @IsInt() @Min(5) @Max(300) silenceTimeoutSeconds?: number;
  @IsOptional() @IsInt() @Min(30) @Max(7200) maxDurationSeconds?: number;
  @IsOptional() @IsBoolean() interruptionsEnabled?: boolean;
  @IsOptional() @IsIn(['gather', 'relay']) voiceEngine?: 'gather' | 'relay';
  @IsOptional() @IsString() voiceModel?: string;
  @IsOptional() @IsInt() @Min(4) @Max(20) transcriptTurnLimit?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) channels?: AgentChannel[];
  @IsOptional() @IsArray() @IsString({ each: true }) skills?: string[];
  @IsOptional() @IsString() status?: AgentStatus;
  @IsOptional() @IsBoolean() enableCalendarBooking?: boolean;
  @IsOptional() @IsString() calendarId?: string;
  @IsOptional() @IsString() modelProvider?: string;
  @IsOptional() @IsString() modelName?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(2) temperature?: number;
  @IsOptional() @IsInt() maxTokens?: number;
  @IsOptional() @IsString() voiceProvider?: string;
  @IsOptional() @IsString() voiceId?: string;
  @IsOptional() @IsArray() knowledgeBaseIds?: string[];
  @IsOptional() @IsArray() tools?: AgentTool[];
  @IsOptional() @IsObject() customVapiConfig?: Record<string, unknown>;
}

export interface AgentListQuery {
  tenantId: string;
  status?: AgentStatus;
  limit?: number;
}
