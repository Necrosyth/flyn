/**
 * CRM Plugin - Type Definitions
 * 
 * Core entity types for the CRM module.
 * These types define the data model for contacts, deals, pipelines, and activities.
 */

// ============================================================================
// CONTACT
// ============================================================================

export type ContactStatus = 'lead' | 'qualified' | 'customer' | 'churned' | 'inactive';

export interface Contact {
    _id?: string;
    id?: number;
    name: string;
    email: string;
    phone?: string;
    company?: string;
    status: ContactStatus;
    tags?: string[];
    source?: string;
    owner?: string;
    score?: number;             // Lead score (0-100)
    customFields?: Record<string, unknown>;
    notes?: string;
    signature?: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt?: Date;           // Soft delete
}

export interface ContactCreateDto {
    name: string;
    email: string;
    phone?: string;
    company?: string;
    status?: ContactStatus;
    tags?: string[];
    source?: string;
    owner?: string;
    notes?: string;
    signature?: string;
    score?: number;
    customFields?: Record<string, unknown>;
}

export interface ContactUpdateDto {
    name?: string;
    email?: string;
    phone?: string;
    company?: string;
    status?: ContactStatus;
    tags?: string[];
    source?: string;
    owner?: string;
    score?: number;
    notes?: string;
    signature?: string;
    customFields?: Record<string, unknown>;
}

// ============================================================================
// DEAL
// ============================================================================

export type DealStage = 'new' | 'qualified' | 'proposal' | 'negotiation' | 'won' | 'lost';

export interface Deal {
    _id?: string;
    id?: number;
    title: string;
    value: number;
    stage: DealStage;
    contactId: string;
    contactName?: string;
    probability?: number;
    expectedCloseDate?: Date;
    owner?: string;
    wonReason?: string;
    lostReason?: string;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface DealCreateDto {
    title: string;
    value: number;
    stage?: DealStage;
    contactId: string;
    contactName?: string;
    probability?: number;
    expectedCloseDate?: string;
    owner?: string;
    notes?: string;
}

export interface DealUpdateDto {
    title?: string;
    value?: number;
    stage?: DealStage;
    probability?: number;
    expectedCloseDate?: string;
    owner?: string;
    notes?: string;
    wonReason?: string;
    lostReason?: string;
}

// ============================================================================
// PIPELINE
// ============================================================================

export interface PipelineStage {
    id: string;
    name: string;
    order: number;
    color?: string;
}

export interface Pipeline {
    _id?: string;
    name: string;
    stages: PipelineStage[];
    isDefault: boolean;
    createdAt: Date;
}

// ============================================================================
// ACTIVITY
// ============================================================================

export type ActivityType = 'email' | 'call' | 'meeting' | 'note' | 'task' | 'deal_update' | 'behavioral' | 'relationship';

export interface Activity {
    _id?: string;
    id?: number;
    type: ActivityType;
    contactId?: string;
    dealId?: string;
    description: string;
    actor: string;
    metadata?: Record<string, unknown>;
    createdAt: Date;
}

export interface ActivityCreateDto {
    type: ActivityType;
    contactId?: string;
    dealId?: string;
    description: string;
    actor?: string;
    metadata?: Record<string, unknown>;
}

// ============================================================================
// DASHBOARD / QUERY
// ============================================================================

export interface CRMDashboardStats {
    totalContacts: number;
    totalLeads: number;
    qualifiedLeads: number;
    totalDeals: number;
    dealsWonValue: number;
    dealsWonCount: number;
    conversionRate: number;     // % of leads converted to customers
    recentActivities: Activity[];
    pipelineBreakdown: { stage: string; count: number; value: number }[];
    leadSources: { source: string; count: number }[];
}

export interface PaginationQuery {
    page?: number;
    limit?: number;
    search?: string;
    status?: ContactStatus;
    sort?: string;
    sortDirection?: 'asc' | 'desc';
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResult<T> {
    data: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
}

// ============================================================================
// ADVANCED CRM — Behavioral Tracking & Customer Intelligence
// (From FLYN_AI_Advanced_CRM_Features.pdf & Enterprise Blueprint)
// ============================================================================

export interface ContactEngagement {
    contactId: string;
    emailOpens: number;
    emailClicks: number;
    pageVisits: number;
    callDuration: number;           // Total minutes
    lastInteraction: Date;
    engagementScore: number;        // 0-100 computed from activity
    channelPreference?: string;     // 'email' | 'whatsapp' | 'phone' | 'sms'
    sentimentScore?: number;        // -1 to 1
}

export interface AILeadScore {
    contactId: string;
    score: number;                  // 0-100
    factors: Array<{
        factor: string;             // e.g. "company_size", "engagement_level"
        weight: number;
        contribution: number;
    }>;
    predictedCloseDate?: string;
    predictedDealValue?: number;
    churnRisk?: number;             // 0-1 probability
    nextBestAction?: string;
    updatedAt: Date;
}

export interface CustomerTimeline {
    contactId: string;
    events: Array<{
        type: string;
        description: string;
        channel?: string;
        actor?: string;
        timestamp: Date;
        metadata?: Record<string, unknown>;
    }>;
}

export interface RevenueForecasting {
    period: string;                 // "2026-Q1", "2026-02"
    pipelineValue: number;
    weightedValue: number;          // pipelineValue * avg probability
    predictedRevenue: number;
    confidence: number;             // 0-1
    dealsContributing: number;
}

export interface CampaignMetrics {
    campaignId: string;
    name: string;
    channelType: string;            // 'email' | 'whatsapp' | 'sms'
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    converted: number;
    roi?: number;
    startDate: Date;
    status: 'draft' | 'active' | 'paused' | 'completed';
}

// ============================================================================
// ADVANCED CRM — Profile Merging, Omnichannel, SLA, Knowledge Graph, AI Memory
// (From FLYN_AI_Advanced_CRM_Features.pdf Sections 1, 6, 8, 10, 13)
// ============================================================================

export interface ProfileMergeResult {
    primaryContactId: string;
    mergedContactIds: string[];
    mergedFields: Record<string, unknown>;
    confidence: number;             // 0-1
    matchedOn: string[];            // e.g. ['email', 'phone']
    status: 'suggested' | 'merged' | 'rejected';
}

export interface OmnichannelFallbackConfig {
    contactId: string;
    channelPriority: string[];      // e.g. ['whatsapp', 'telegram', 'email', 'sms']
    lastSuccessfulChannel?: string;
    fallbackAttempts: Array<{
        channel: string;
        status: 'sent' | 'delivered' | 'failed';
        timestamp: Date;
    }>;
}

export interface SLAConfig {
    id: string;
    name: string;
    responseTimeMinutes: number;
    resolutionTimeMinutes: number;
    priority: 'low' | 'medium' | 'high' | 'critical';
    escalationRules: Array<{
        afterMinutes: number;
        action: 'notify' | 'reassign' | 'escalate';
        targetUserId?: string;
    }>;
    isDefault: boolean;
}

export interface SLAStatus {
    contactId: string;
    dealId?: string;
    slaConfigId: string;
    status: 'within_sla' | 'warning' | 'breached';
    responseTimeRemaining: number;  // minutes
    resolutionTimeRemaining: number;
    breachCount: number;
}

export interface KnowledgeGraphNode {
    contactId: string;
    contactName: string;
    connections: Array<{
        targetContactId: string;
        targetContactName: string;
        relationship: string;       // 'colleague' | 'reports_to' | 'referred_by' | 'same_company' | 'partner'
        strength: number;           // 0-1
        source: string;             // 'company' | 'email_thread' | 'deal' | 'event' | 'manual'
    }>;
    networkScore: number;           // 0-100 influence score
    clusterName?: string;
}

export interface AIMemoryEntry {
    contactId: string;
    key: string;                    // e.g. 'preferred_channel', 'budget_range', 'pain_points'
    value: string;
    source: string;                 // 'conversation' | 'form' | 'ai_inferred' | 'manual'
    confidence: number;             // 0-1
    createdAt: Date;
    updatedAt: Date;
}

export interface CustomerLifetimeValue {
    contactId: string;
    currentValue: number;           // total revenue from this customer
    predictedValue: number;         // AI-predicted future value
    confidence: number;
    factors: Array<{
        factor: string;
        contribution: number;
    }>;
    segment: 'high_value' | 'growth' | 'maintain' | 'at_risk';
}
