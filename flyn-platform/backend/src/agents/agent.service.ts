/**
 * Agent Service
 * -------------
 * Tenant-scoped CRUD for AI agents in Firestore (with an in-memory fallback when
 * Firestore is unavailable). Agents are consumed by the Twilio call webhook at runtime.
 *
 * TODO: VAPI assistant sync is NOT implemented — agents run through the in-house
 * Twilio/Polly call flow, not VAPI. `vapiAssistantId` stays undefined by design.
 */

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { FirebaseService } from '../firebase/firebase.service';
import {
  Agent,
  CreateAgentDto,
  UpdateAgentDto,
  AgentStatus,
} from './agent.types';

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly COLLECTION = 'agents';

  // In-memory fallback when Firestore is unavailable
  private readonly memoryStore = new Map<string, Agent>();

  constructor(
    private readonly firebase: FirebaseService,
  ) {}

  // ---------------------------------------------------------------------------
  // HELPERS
  // ---------------------------------------------------------------------------

  private collection() {
    const db = this.firebase.firestore();
    return db ? db.collection(this.COLLECTION) : undefined;
  }

  private get useFirestore(): boolean {
    return !!this.collection();
  }

  // ---------------------------------------------------------------------------
  // CREATE
  // ---------------------------------------------------------------------------

  async create(tenantId: string, dto: CreateAgentDto, createdBy = 'api'): Promise<Agent> {
    const id = uuidv4();
    const now = new Date();

    const agent: Agent = {
      id,
      tenantId,
      name: dto.name,
      description: dto.description,
      avatar: dto.avatar || dto.name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2),
      role: dto.role || 'AI Voice Agent',
      vapiAssistantId: undefined,
      firstMessage: dto.firstMessage,
      systemPrompt: dto.systemPrompt,
      modelProvider: dto.modelProvider || 'openai',
      modelName: dto.modelName || 'gpt-4o',
      temperature: dto.temperature ?? 0.7,
      maxTokens: dto.maxTokens,
      voiceProvider: dto.voiceProvider || '11labs',
      voiceId: dto.voiceId || '21m00Tcm4TlvDq8ikWAM',
      twilioVoice: dto.twilioVoice,
      language: dto.language,
      supportedLanguages: dto.supportedLanguages || [],
      multiLanguage: dto.multiLanguage ?? ((dto.supportedLanguages?.length ?? 0) > 1),
      endCallOnSilence: dto.endCallOnSilence ?? true,
      silenceTimeoutSeconds: dto.silenceTimeoutSeconds ?? 30,
      maxDurationSeconds: dto.maxDurationSeconds ?? 600,
      interruptionsEnabled: dto.interruptionsEnabled ?? true,
      // ConversationRelay (streaming voice) — only persist when provided, so existing agents are unchanged.
      ...(dto.voiceEngine ? { voiceEngine: dto.voiceEngine } : {}),
      ...(dto.voiceModel ? { voiceModel: dto.voiceModel } : {}),
      ...(typeof dto.transcriptTurnLimit === 'number' ? { transcriptTurnLimit: dto.transcriptTurnLimit } : {}),
      knowledgeBaseIds: dto.knowledgeBaseIds || [],
      tools: dto.tools || [],
      customVapiConfig: dto.customVapiConfig || {},
      channels: dto.channels || ['Voice'],
      skills: dto.skills || [],
      status: dto.status || 'active',
      createdAt: now,
      updatedAt: now,
      createdBy,
    };

    // 2. Persist
    if (this.useFirestore) {
      try {
        await this.collection()!.doc(id).set(this.serialize(agent));
        this.logger.log(`Agent saved (Firestore): ${id}`);
        return agent;
      } catch (err) {
        this.logger.warn('Firestore save failed, using memory', err);
      }
    }

    this.memoryStore.set(id, agent);
    this.logger.log(`Agent saved (memory): ${id}`);
    return agent;
  }

  // ---------------------------------------------------------------------------
  // READ
  // ---------------------------------------------------------------------------

  /**
   * Fetch an agent. When `tenantId` is provided, enforces ownership — a mismatch
   * throws NotFoundException (never leaks that the doc exists for another tenant).
   */
  async getById(agentId: string, tenantId?: string): Promise<Agent> {
    let agent: Agent | undefined;
    if (this.useFirestore) {
      try {
        const doc = await this.collection()!.doc(agentId).get();
        if (doc.exists) agent = this.deserialize(doc.id, doc.data()!);
      } catch (err) {
        this.logger.warn('Firestore read failed, checking memory', err);
      }
    }
    if (!agent) agent = this.memoryStore.get(agentId);
    if (!agent) throw new NotFoundException(`Agent ${agentId} not found`);
    // Tenant ownership check.
    if (tenantId && agent.tenantId !== tenantId) {
      throw new NotFoundException(`Agent ${agentId} not found`);
    }
    return agent;
  }

  async listByTenant(tenantId: string, limit = 50): Promise<Agent[]> {
    if (this.useFirestore) {
      try {
        const snap = await this.collection()!
          .where('tenantId', '==', tenantId)
          .orderBy('createdAt', 'desc')
          .limit(limit)
          .get();
        return snap.docs.map(d => this.deserialize(d.id, d.data()));
      } catch (err) {
        this.logger.warn('Firestore query failed, checking memory', err);
      }
    }
    return Array.from(this.memoryStore.values())
      .filter(a => a.tenantId === tenantId)
      .slice(0, limit);
  }

  // ---------------------------------------------------------------------------
  // UPDATE
  // ---------------------------------------------------------------------------

  async update(agentId: string, tenantId: string, dto: UpdateAgentDto): Promise<Agent> {
    const existing = await this.getById(agentId, tenantId); // enforces ownership (404 on mismatch)

    const updated: Agent = {
      ...existing,
      ...dto,
      updatedAt: new Date(),
      // Preserve immutable fields
      id: existing.id,
      tenantId: existing.tenantId,
      createdAt: existing.createdAt,
      createdBy: existing.createdBy,
    };

    if (this.useFirestore) {
      try {
        await this.collection()!.doc(agentId).set(this.serialize(updated), { merge: true });
        this.logger.log(`Agent updated (Firestore): ${agentId}`);
        return updated;
      } catch (err) {
        this.logger.warn('Firestore update failed, using memory', err);
      }
    }

    this.memoryStore.set(agentId, updated);
    return updated;
  }

  // ---------------------------------------------------------------------------
  // DELETE
  // ---------------------------------------------------------------------------

  async delete(agentId: string, tenantId: string): Promise<boolean> {
    // Verify ownership first — returns false (→ 404) if missing or another tenant's.
    try {
      await this.getById(agentId, tenantId);
    } catch {
      return false;
    }
    if (this.useFirestore) {
      try {
        await this.collection()!.doc(agentId).delete();
        this.logger.log(`Agent deleted (Firestore): ${agentId}`);
        this.memoryStore.delete(agentId);
        return true;
      } catch (err) {
        this.logger.warn('Firestore delete failed, trying memory', err);
      }
    }
    return this.memoryStore.delete(agentId);
  }

  // ---------------------------------------------------------------------------
  // SERIALIZATION
  // ---------------------------------------------------------------------------

  private serialize(agent: Agent): Record<string, unknown> {
    return {
      ...agent,
      createdAt: agent.createdAt instanceof Date ? agent.createdAt.toISOString() : agent.createdAt,
      updatedAt: agent.updatedAt instanceof Date ? agent.updatedAt.toISOString() : agent.updatedAt,
    };
  }

  private deserialize(id: string, data: Record<string, unknown>): Agent {
    return {
      ...(data as unknown as Agent),
      id,
      createdAt: data.createdAt ? new Date(data.createdAt as string) : new Date(),
      updatedAt: data.updatedAt ? new Date(data.updatedAt as string) : new Date(),
    };
  }
}
