/**
 * Dynamic Voice Agent Executor
 * ----------------------------
 * Runs any user-created voice agent via Twilio AI calls.
 * Loads agent config from the database, then initiates an outbound
 * Twilio call that uses the agent's systemPrompt / firstMessage.
 *
 * Node type: "voice_agent"
 *
 * Required node config:
 *   agentId          — ID of the saved agent (from Agents Builder)
 *   customer_number  — phone number to call (or {{template}})
 */

import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { BaseExecutor } from '../orchestrator/node-executor/base-executor';
import { CompiledNode, NodeExecutionContext, NodeResult } from '../orchestrator/types';
import { ChannelsService } from '../channels/channels.service';
import { AgentService } from './agent.service';

@Injectable()
export class DynamicVoiceAgentExecutor extends BaseExecutor {
  private readonly logger = new Logger(DynamicVoiceAgentExecutor.name);

  readonly nodeType = 'voice_agent';
  readonly displayName = 'Voice Agent';
  readonly description =
    'Execute a user-created voice agent. Loads configuration from the Agents database and triggers a Twilio AI call.';

  constructor(
    @Inject(forwardRef(() => ChannelsService))
    private readonly channelsService: ChannelsService,
    private readonly agentService: AgentService,
  ) {
    super();
  }

  async execute(
    node: CompiledNode,
    context: NodeExecutionContext,
  ): Promise<NodeResult> {
    const { config } = node;
    const agentId = this.resolve(config.agentId || config.agent_id, context) as string;
    const customerNumber = this.resolve(config.customer_number || config.customerNumber, context) as string;

    context.services.log('info', `Executing voice_agent node — agent: ${agentId}`, {
      nodeId: node.id,
      agentId,
      customerNumber,
    });

    if (!agentId) {
      return this.failed(
        'MISSING_AGENT_ID',
        'agentId is required in voice_agent node config',
        false,
      );
    }

    if (!customerNumber) {
      return this.failed(
        'MISSING_CUSTOMER_NUMBER',
        'customer_number is required in voice_agent node config',
        false,
      );
    }

    try {
      // 1. Load agent to get tenantId and persona
      const agent = await this.agentService.getById(agentId);
      const tenantId = agent.tenantId;

      // 2. Initiate Twilio AI call with agent's persona injected via agentId
      const callResult = await this.channelsService.makeTwilioAiCall(tenantId, customerNumber, agentId);

      this.logger.log(`Twilio voice call initiated for agent "${agent.name}" → ${customerNumber}`);

      return this.completed({
        success: true,
        agentId: agent.id,
        agentName: agent.name,
        callSid: callResult.callSid,
        callStatus: callResult.status,
        customerNumber,
        executedAt: new Date().toISOString(),
      });
    } catch (error) {
      const err = error as Error;
      context.services.log('error', `Voice agent execution failed: ${err.message}`, {
        nodeId: node.id,
        agentId,
      });

      return this.failed(
        'VOICE_AGENT_EXECUTION_ERROR',
        err.message,
        true,
        { agentId, originalError: err.message },
      );
    }
  }

  validate(node: CompiledNode) {
    const agentId = node.config.agentId || node.config.agent_id;
    if (!agentId) {
      return {
        valid: false,
        errors: [
          {
            field: 'agentId',
            message: 'Agent ID is required. Select an agent from the Agent Builder.',
            code: 'MISSING_AGENT_ID',
          },
        ],
      };
    }
    return { valid: true };
  }

  private resolve(value: unknown, context: NodeExecutionContext): unknown {
    if (typeof value !== 'string') return value;
    return value.replace(/\{\{([^}]+)\}\}/g, (_, path: string) => {
      const segments = path.trim().split('.');
      let current: unknown = context.previousOutputs;
      for (const seg of segments) {
        if (current == null) return `{{${path}}}`;
        current = (current as Record<string, unknown>)[seg];
      }
      return current != null ? String(current) : `{{${path}}}`;
    });
  }
}
