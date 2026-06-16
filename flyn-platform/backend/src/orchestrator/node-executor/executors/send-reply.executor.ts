/**
 * Send Reply Executor
 *
 * Sends a message back to a conversation in the unified inbox (via Chatwoot).
 * Can also optionally update the conversation status after sending.
 *
 * Expects these context variables (set by earlier nodes in the flow):
 *   context.token.data.conversationId  — from InboxTriggerExecutor
 *   context.token.data.aiReply         — from AI node (custom task output)
 *
 * Config fields (set in the visual builder node):
 *   messageContent   — static text OR a template using {{variables}}
 *   useAiReply       — boolean: use aiReply from context instead of static text
 *   updateStatus     — optional: set conversation status after sending
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType } from '../../types';
import { InboxService } from '../../../inbox/inbox.service';
import { ChannelsService } from '../../../channels/channels.service';
import { ChannelType } from '../../../channels/types/channel.types';

export interface SendReplyConfig {
  /** Conversation id — can be hardcoded or leave blank to inherit from token data */
  conversationId?: string;
  /** Static message text.  Supports {{variable}} interpolation from token data. */
  messageContent?: string;
  /**
   * When true, the executor reads `aiReply` (or `draftReply`) from token data
   * instead of messageContent.  The AI node must have run before this node.
   */
  useAiReply?: boolean;
  /** Optionally change the conversation status after sending */
  updateStatusAfterSend?: 'open' | 'resolved' | 'none';
}

@Injectable()
export class SendReplyExecutor extends BaseExecutor {
  private readonly logger = new Logger(SendReplyExecutor.name);

  readonly nodeType = NodeType.SEND_REPLY;
  readonly displayName = 'Send Reply';
  readonly description =
    'Sends a reply message to a conversation in the unified inbox (DynamoDB) and optionally updates its status.';

  constructor(
    private readonly inboxService: InboxService,
    private readonly channelsService: ChannelsService,
  ) {
    super();
  }

  async execute(node: CompiledNode, context: NodeExecutionContext): Promise<NodeResult> {
    const config = node.config as unknown as SendReplyConfig;
    const tenantId = context.tenantId as string;

    if (!tenantId) {
      return this.failed('MISSING_TENANT', 'tenantId is required', false);
    }

    // ── Resolve the conversation id ───────────────────────────────────────────
    const tokenData = context.token.data as Record<string, any>;
    const previousOutputs = context.previousOutputs as Record<string, any>;

    const resolveAcrossOutputs = (field: string): unknown => {
      if (tokenData[field] !== undefined && tokenData[field] !== null && tokenData[field] !== '')
        return tokenData[field];
      for (const nodeOut of Object.values(previousOutputs)) {
        if (nodeOut && typeof nodeOut === 'object') {
          const v = (nodeOut as Record<string, unknown>)[field];
          if (v !== undefined && v !== null && v !== '') return v;
        }
      }
      return undefined;
    };

    const resolveTemplate = (raw: string): string => {
      return raw.replace(/\{\{([^}]+)\}\}/g, (_, path) => {
        const parts = path.trim().split('.');
        let cur: unknown = previousOutputs;
        for (const part of parts) {
          if (cur == null || typeof cur !== 'object') return _;
          cur = (cur as Record<string, unknown>)[part];
        }
        return cur !== undefined && cur !== null ? String(cur) : _;
      });
    };

    const rawConvId = String(config.conversationId ?? '');
    const conversationId = rawConvId && !rawConvId.includes('{{')
      ? rawConvId
      : String(resolveTemplate(rawConvId).replace(/\{\{[^}]+\}\}/g, '').trim()
          || resolveAcrossOutputs('conversationId')
          || '');

    if (!conversationId) {
      return this.failed(
        'MISSING_CONVERSATION_ID',
        'No conversationId found. Connect an Inbox Trigger node before Send Reply.',
        false,
      );
    }

    // ── Resolve the message text ──────────────────────────────────────────────
    let messageContent: string;

    if (config.useAiReply) {
      messageContent = String(
        resolveAcrossOutputs('aiReply') ??
        resolveAcrossOutputs('draftReply') ??
        resolveAcrossOutputs('generatedText') ??
        resolveAcrossOutputs('reply') ??
        resolveAcrossOutputs('response') ??
        (tokenData.extractedData as any)?.response ??
        (tokenData.extractedData as any)?.aiReply ??
        '',
      );

      if (!messageContent) {
        return this.failed(
          'MISSING_AI_REPLY',
          'useAiReply is true but no aiReply/draftReply was found in context.',
          false,
        );
      }
    } else {
      messageContent = this.interpolate(config.messageContent ?? '', tokenData);
      if (!messageContent.trim()) {
        return this.failed('EMPTY_MESSAGE', 'messageContent is empty.', false);
      }
    }

    try {
      // 1. Send the message via ChannelsService
      // Split conversationId to get channel and recipient: tenantId:channel:recipient
      const parts = conversationId.split(':');
      if (parts.length < 3) throw new Error('Invalid conversationId format');
      
      const channelTypeStr = parts[1];
      const recipientPhone = parts[2];
      
      // Find the active channel of this type for this tenant
      const channels = await this.channelsService.getTenantChannels(tenantId);
      const channel = channels.find(c => c.type === channelTypeStr && c.status === 'active');
      
      if (!channel) {
        throw new Error(`No active ${channelTypeStr} channel found for tenant ${tenantId}`);
      }

      const sendResult = await this.channelsService.sendChannelMessage(
        tenantId,
        channel.id,
        recipientPhone,
        messageContent
      );

      if (!sendResult.success) {
        throw new Error(`Failed to send message via ${channelTypeStr}: ${sendResult.error}`);
      }

      // 2. Save result to DynamoDB using InboxService
      await this.inboxService.saveOutboundMessage({
        tenantId,
        channel: channelTypeStr,
        recipientPhone,
        recipientName: 'Customer', // Fallback or resolution needed?
        content: messageContent,
      });

      // 3. Mark as read
      await this.inboxService.markRead(tenantId, conversationId);

      return this.completed({
        conversationId,
        messageSent: messageContent,
        executedAt: new Date().toISOString(),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`SendReply failed: ${msg}`);
      return this.failed('SEND_REPLY_ERROR', msg, true, { originalError: msg });
    }
  }

  /** Replace {{key}} placeholders with values from context token data. */
  private interpolate(template: string, data: Record<string, any>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const val = data[key];
      return val !== undefined && val !== null ? String(val) : `{{${key}}}`;
    });
  }
}
