/**
 * Inbox Trigger Executor
 *
 * Pulls a conversation (and its full message thread) from the unified inbox
 * (Chatwoot) and emits it as structured output that downstream nodes can use.
 *
 * Output shape:
 * {
 *   conversationId,     // string  — pass to send_reply / status-update
 *   inboxId,            // string
 *   channelType,        // 'email' | 'whatsapp' | 'webchat' | …
 *   contact: { id, name, email, phone },
 *   status,             // 'open' | 'pending' | 'resolved' | 'snoozed'
 *   messageBody,        // full concatenated thread for the AI node
 *   lastMessage,        // only the latest message text
 *   unreadCount,
 * }
 */

import { Injectable, Logger } from '@nestjs/common';
import { BaseExecutor } from '../base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult, NodeType } from '../../types';
import { InboxService, InboxConversation, InboxMessage } from '../../../inbox/inbox.service';

export interface InboxTriggerConfig {
  /** conversationId manual override */
  conversationId?: string;
  /** Filter: only trigger on messages with this status */
  filterStatus?: 'open' | 'resolved' | 'all';
  /** Channel type filter: 'email' | 'whatsapp' | 'all' */
  channelType?: string;
}

@Injectable()
export class InboxTriggerExecutor extends BaseExecutor {
  private readonly logger = new Logger(InboxTriggerExecutor.name);

  readonly nodeType = NodeType.INBOX_TRIGGER;
  readonly displayName = 'Inbox Trigger';
  readonly description =
    'Pulls a conversation from the unified inbox (DynamoDB) and emits contact + message data for downstream AI and action nodes.';

  constructor(
    private readonly inboxService: InboxService,
  ) {
    super();
  }

  async execute(node: CompiledNode, context: NodeExecutionContext): Promise<NodeResult> {
    const config = node.config as unknown as InboxTriggerConfig;
    const tenantId = context.tenantId as string;

    if (!tenantId) {
      return this.failed('MISSING_TENANT', 'tenantId is required for Inbox Trigger', false);
    }

    // ── Mock / test mode ──────────────────────────────────────────────────────
    const mockResult = (node.config as any)._mockResult;
    if (mockResult) {
      return this.completed({ ...mockResult, executedAt: new Date().toISOString() });
    }

    try {
      // Prefer a concrete conversationId (set by webhook or test)
      // Otherwise fall back to "most recent open conversation"
      const conversationId = config.conversationId ?? (context.token.data as any)?.conversationId;

      if (!conversationId) {
        return await this.fetchLatestConversation(tenantId, config, context, node.id);
      }

      return await this.fetchConversationById(String(conversationId), context, node.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`InboxTrigger failed: ${msg}`);
      return this.failed('INBOX_TRIGGER_ERROR', msg, true, { originalError: msg });
    }
  }

  private async fetchConversationById(
    conversationId: string,
    context: NodeExecutionContext,
    nodeId: string,
  ): Promise<NodeResult> {
    // We get messages directly. For conversation details, we might need a getConversation method in InboxService.
    // For now, we list them and find the one.
    const tenantId = context.tenantId!;
    const conversations = await this.inboxService.listConversations(tenantId);
    const conv = conversations.find(c => c.conversationId === conversationId);

    if (!conv) {
      return this.failed('CONVERSATION_NOT_FOUND', `Conversation ${conversationId} not found in DynamoDB.`, false);
    }

    const messages = await this.inboxService.getMessages(conversationId);
    const output = this.buildOutput(conv, messages);
    
    return this.completed({ ...output, executedAt: new Date().toISOString() });
  }

  private async fetchLatestConversation(
    tenantId: string,
    config: InboxTriggerConfig,
    context: NodeExecutionContext,
    nodeId: string,
  ): Promise<NodeResult> {
    const list = await this.inboxService.listConversations(tenantId);

    if (!list.length) {
      return this.failed('NO_CONVERSATIONS', 'No conversations found in inbox.', false);
    }

    // Apply filters
    let filtered = list;
    const status = config.filterStatus ?? 'open';
    if (status !== 'all') {
      filtered = filtered.filter((c) => c.status === status);
    }
    if (config.channelType && config.channelType !== 'all') {
      filtered = filtered.filter((c) =>
        (c.channel ?? '').toLowerCase().includes(config.channelType!.toLowerCase()),
      );
    }

    if (!filtered.length) {
      return this.failed(
        'NO_MATCHING_CONVERSATIONS',
        `No conversations match filters: status=${status}, channel=${config.channelType ?? 'any'}`,
        false,
      );
    }

    // listConversations already returns sorted newest-first
    const conv = filtered[0];

    const messages = await this.inboxService.getMessages(conv.conversationId);
    const output = this.buildOutput(conv, messages);
    return this.completed({ ...output, executedAt: new Date().toISOString() });
  }

  /** Map InboxService data → clean output that other nodes consume. */
  private buildOutput(conv: InboxConversation, messages: InboxMessage[]) {
    // Build full conversation thread text (for the AI node)
    const messageBody = messages
      .filter((m) => m.content)
      .map((m) => {
        const role = m.direction === 'inbound' ? 'Customer' : 'Agent';
        return `[${role}]: ${m.content}`;
      })
      .join('\n');

    const lastMsg = messages.filter((m) => m.content).at(-1);

    return {
      conversationId: conv.conversationId,
      channelType: conv.channel || 'whatsapp',
      status: conv.status || 'open',
      contact: {
        name: conv.contactName || 'Unknown',
        phone: conv.contactPhone || '',
      },
      messageBody,
      lastMessage: lastMsg?.content ?? '',
      unreadCount: conv.unreadCount || 0,
    };
  }
}
