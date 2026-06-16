/**
 * useDynamicSchemaFields
 * ----------------------
 * Enriches static nodeSchema fields with runtime data.
 *
 * Handles:
 *  - voice_agent → agent_id       : options from AgentStore
 *  - channel nodes → channel_id   : options from live ChannelService
 */

import { useMemo, useEffect } from 'react';
import { SchemaField } from '@/config/nodeSchemas';
import { useAgentStore } from './useAgentStore';
import { useWorkflowChannels } from './useWorkflowChannels';

const CHANNEL_NODE_TYPES = [
  'send_whatsapp', 'send_email', 'send_sms',
  'send_telegram', 'send_instagram', 'inbox_trigger',
];

export function useDynamicSchemaFields(
  nodeType: string,
  fields: SchemaField[],
): SchemaField[] {
  const agents = useAgentStore((s) => s.agents);
  const fetchAgents = useAgentStore((s) => s.fetchAgents);
  const { channels } = useWorkflowChannels();

  useEffect(() => {
    if (nodeType === 'voice_agent' && agents.length === 0) {
      fetchAgents();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeType]);

  return useMemo(() => {
    let enriched = fields;

    // ── voice_agent: inject agent options ─────────────────────────────────────
    if (nodeType === 'voice_agent') {
      enriched = enriched.map((field) => {
        if (field.name === 'agent_id' && field.type === 'select') {
          return {
            ...field,
            options: agents.map((a) => ({ label: a.name, value: a.id })),
          };
        }
        return field;
      });
    }

    // ── channel nodes: inject live channel list into channel_select fields ─────
    if (CHANNEL_NODE_TYPES.includes(nodeType)) {
      const injectChannels = (f: SchemaField): SchemaField => {
        if (f.type === 'channel_select') {
          const filter = f.channelFilter ?? [];
          const filtered = filter.length === 0
            ? channels
            : channels.filter((c) =>
                filter.some((t) =>
                  c.type?.toLowerCase().includes(t.toLowerCase()),
                ),
              );
          return {
            ...f,
            // Store live channels on the field so the renderer can use them
            options: filtered.map((c) => ({
              value: c.id,
              label: `${c.name}${c.status !== 'active' ? ` (${c.status})` : ''}`,
            })),
          };
        }
        // Recurse into sections
        if (f.type === 'section' && f.fields) {
          return { ...f, fields: f.fields.map(injectChannels) };
        }
        return f;
      };
      enriched = enriched.map(injectChannels);
    }

    return enriched;
  }, [nodeType, fields, agents, channels]);
}
