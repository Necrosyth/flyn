/**
 * Smart Agent Addons — Shared Types
 * Spec: FLYN_AI_Smart_Agent_Addons_Spec.pdf
 */

export type AgentType = 'marketing' | 'content' | 'social' | 'frontdesk';
export type AgentModel = 'gemini' | 'gpt-4o' | 'deepseek';

// ─── Agent Config ─────────────────────────────────────────────────────────────

export interface AgentConfig {
  tenantId: string;
  agentType: AgentType;
  active: boolean;
  model: AgentModel;
  onboardingComplete: boolean;
  companyData: AgentCompanyData;
  updatedAt: string;
}

export interface AgentCompanyData {
  // Shared
  businessName?: string;
  industry?: string;
  niche?: string;
  targetAudience?: string;
  tone?: string;
  language?: string;
  website?: string;
  // Marketing
  uniqueValueProp?: string;
  mainProducts?: string;
  priceRange?: string;
  whatsappNumber?: string;
  objectionKeywords?: string;
  // Content
  contentGoals?: string;          // leads / awareness / loyalty / education
  signaturePhrases?: string;
  avoidPhrases?: string;
  upcomingPromotions?: string;
  contentFormats?: string;        // whatsapp, blog, short posts
  industryKeywords?: string;
  toneAdjectives?: string;        // e.g. bold, warm, professional
  // Social
  connectedPlatforms?: string;    // facebook, instagram, linkedin, telegram
  postingFrequency?: string;      // daily, 3x/week
  bestPostingTimes?: string;
  brandHashtag?: string;
  industryHashtags?: string;
  competitors?: string;
  communityTone?: string;
  avoidTopics?: string;
  escalationWhatsapp?: string;
  telegramChannel?: string;
  // Front Desk
  businessHours?: string;         // JSON: { mon: '9-17', ... }
  services?: string;
  orderPlatform?: string;         // shopify / woocommerce / manual
  orderApiKey?: string;
  reviewLink?: string;
}

// ─── Activity Log ─────────────────────────────────────────────────────────────

export interface AgentActivity {
  id: string;
  tenantId: string;
  agentType: AgentType;
  action: string;
  detail: string;
  outcome: 'success' | 'pending' | 'failed';
  timestamp: string;
}

// ─── Performance Metrics ──────────────────────────────────────────────────────

export interface AgentMetrics {
  agentType: AgentType;
  // Marketing
  leadsScored?: number;
  hotLeads?: number;
  conversions?: number;
  campaignsSent?: number;
  // Content
  piecesCreated?: number;
  calendarDays?: number;
  faqsWritten?: number;
  // Social
  postsPublished?: number;
  postsScheduled?: number;
  sentimentAlerts?: number;
  // Front Desk
  casesResolved?: number;
  casesEscalated?: number;
  bookingsCreated?: number;
  avgResponseTime?: number;
}

// ─── Marketing Agent ──────────────────────────────────────────────────────────

export interface LeadScoringRequest {
  tenantId: string;
  leadInfo: {
    name: string;
    email?: string;
    phone?: string;
    budget?: string;
    timeline?: string;
    message?: string;
    source?: string;
    isDecisionMaker?: boolean;
    repliedWithinHour?: boolean;
    clickedLink?: boolean;
    askedSpecificQuestion?: boolean;
  };
}

export interface LeadScore {
  score: number;          // 1–10
  tier: 'hot' | 'warm' | 'cold';
  reasoning: string;
  nextAction: string;
}

export interface DripStep {
  step: number;
  delayHours: number;
  channel: 'whatsapp' | 'sms' | 'email';
  message: string;
}

export interface Campaign {
  id: string;
  tenantId: string;
  name: string;
  channel: 'email' | 'whatsapp' | 'sms' | 'voice';
  status: 'draft' | 'scheduled' | 'running' | 'completed' | 'paused';
  audienceSegment: string;
  sentCount: number;
  openRate: number;
  createdAt: string;
  scheduledAt?: string;
}

export interface ObjectionDetection {
  detected: boolean;
  keyword?: string;
  suggestedResponse?: string;
}

// ─── Content Agent ────────────────────────────────────────────────────────────

export type ContentType =
  | 'campaign'
  | 'blog_outline'
  | 'faq'
  | 'description'
  | 'calendar'
  | 'whatsapp_copy'
  | 'testimonial'
  | 'seasonal'
  | 'ab_variants'
  | 'repurposed';

export interface ContentLibraryEntry {
  id: string;
  tenantId: string;
  contentType: ContentType;
  title: string;
  body: string;
  status: 'draft' | 'approved' | 'published';
  createdAt: string;
  scheduledAt?: string;
}

export interface ContentCalendarEntry {
  day: number;
  date: string;
  platform: string;
  contentType: string;
  topic: string;
  caption: string;
  hashtags: string[];
  status: 'planned' | 'draft' | 'published';
}

export interface ABVariant {
  versionA: string;
  versionB: string;
  topic: string;
}

// ─── Social Agent ─────────────────────────────────────────────────────────────

export type SocialPlatform = 'instagram' | 'linkedin' | 'facebook' | 'twitter' | 'telegram';

export interface SocialPost {
  id?: string;
  tenantId?: string;
  platform: SocialPlatform;
  caption: string;
  hashtags: string[];
  scheduledAt?: string;
  publishedAt?: string;
  status?: 'draft' | 'scheduled' | 'publishing' | 'published' | 'failed';
  reach?: number;
  likes?: number;
  comments?: number;
  // ─ Real-publishing fields ─
  channelId?: string;          // connected channel used to publish
  mediaUrls?: string[];        // publicly-reachable image URLs (required for IG)
  publishedId?: string;        // platform post id returned on success
  publishedUrl?: string;       // live link to the post
  error?: string;              // last failure reason
  attempts?: number;           // publish attempts (for backoff/give-up)
  claimedAt?: number;          // scheduler claim timestamp (double-send guard)
}

export interface SentimentResult {
  sentiment: 'positive' | 'neutral' | 'negative';
  score: number;
  shouldEscalate: boolean;
  detectedKeywords?: string[];
}

export interface TrendAlert {
  topic: string;
  relevanceScore: number;
  platform: string;
  draftPost: string;
  detectedAt: string;
}

export interface CompetitorDigest {
  competitor: string;
  recentPosts: string[];
  engagementSummary: string;
  differentiationAngle: string;
}

// ─── Front Desk Agent ─────────────────────────────────────────────────────────

export type CaseType = 'enquiry' | 'complaint' | 'refund' | 'booking' | 'escalation';
export type CaseStatus = 'open' | 'resolved' | 'escalated';

export interface SupportCase {
  id: string;
  tenantId: string;
  contactId?: string;
  caseType: CaseType;
  status: CaseStatus;
  attempts: number;
  summary: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface FAQEntry {
  id: string;
  tenantId: string;
  question: string;
  answer: string;
  category: string;
  createdAt: string;
}

export interface BookingRequest {
  tenantId: string;
  customerName: string;
  customerPhone?: string;
  service?: string;
  requestedDate: string;
  requestedTime: string;
  notes?: string;
}

export interface BookingRecord {
  id: string;
  tenantId: string;
  customerName: string;
  customerPhone?: string;
  service?: string;
  date: string;
  time: string;
  status: 'pending' | 'confirmed' | 'reminded' | 'completed' | 'cancelled';
  notes?: string;
  reminderSent: boolean;
  createdAt: string;
}

export interface OrderStatusRequest {
  orderId: string;
  customerPhone?: string;
  platform: 'shopify' | 'woocommerce' | 'manual';
}

export interface EscalationPayload {
  tenantId: string;
  customerName: string;
  caseId: string;
  summary: string;
  attempts: number;
  lastMessages: string[];
  requiredAction: string;
}
