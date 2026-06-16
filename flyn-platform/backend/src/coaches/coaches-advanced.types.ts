/**
 * Coaches Advanced Types
 * ----------------------
 * Extended types for advanced coaching features:
 * - AI Session Intelligence
 * - Client Churn Prediction
 * - Workload Balancing
 * - Coach-Client AI Matching
 * - Goal Tracking AI
 * - Revenue Intelligence
 * - Resource Recommendations
 */

// ── AI Session Intelligence ───────────────────────────────────────────────────

export interface SessionSummary {
  sessionId: string;
  clientId: string;
  clientName: string;
  date: string;
  duration: number;
  keyTopics: string[];
  actionItems: ActionItem[];
  sentiment: 'positive' | 'neutral' | 'challenging';
  progressRating: number;         // 1–10
  aiSummary: string;
  nextSteps: string[];
  followUpDate: string;
}

export interface ActionItem {
  task: string;
  owner: 'coach' | 'client';
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
}

// ── Client Churn Prediction ───────────────────────────────────────────────────

export interface ChurnPrediction {
  clientId: string;
  clientName: string;
  churnRisk: number;              // 0–100
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  riskFactors: RiskFactor[];
  retentionActions: string[];
  lastEngagement: string;
  sessionFrequencyTrend: 'increasing' | 'stable' | 'declining';
  aiAssessment: string;
}

export interface RiskFactor {
  factor: string;
  impact: 'low' | 'medium' | 'high';
  details: string;
}

// ── Workload Balancing ────────────────────────────────────────────────────────

export interface WorkloadAnalysis {
  totalClients: number;
  totalSessionsThisWeek: number;
  capacityUtilization: number;    // percentage
  peakDays: string[];
  quietDays: string[];
  suggestedRebalance: RebalanceSuggestion[];
  aiSummary: string;
  burnoutRisk: 'low' | 'medium' | 'high';
}

export interface RebalanceSuggestion {
  action: string;
  fromDay: string;
  toDay: string;
  clientName: string;
  reason: string;
}

// ── Coach-Client AI Matching ──────────────────────────────────────────────────

export interface CoachMatchResult {
  clientId: string;
  clientName: string;
  matchScore: number;             // 0–100
  matchReasons: string[];
  suggestedProgram: string;
  estimatedSuccessProbability: number;
  coachingStyleFit: string;
}

// ── Goal Tracking AI ──────────────────────────────────────────────────────────

export interface GoalTracker {
  clientId: string;
  goals: GoalProgress[];
  overallProgress: number;        // percentage
  aiAssessment: string;
  suggestedNewGoals: string[];
  nextMilestone: string;
  estimatedCompletionDate: string;
}

export interface GoalProgress {
  goalId: string;
  title: string;
  description: string;
  progress: number;               // 0–100
  status: 'not_started' | 'in_progress' | 'completed' | 'at_risk';
  startDate: string;
  targetDate: string;
  milestones: GoalMilestone[];
}

export interface GoalMilestone {
  name: string;
  completed: boolean;
  completedDate?: string;
}

// ── Revenue Intelligence ──────────────────────────────────────────────────────

export interface RevenueIntelligence {
  totalRevenueMTD: number;
  projectedMonthend: number;
  averageSessionRate: number;
  topClients: TopClient[];
  revenueByProgram: ProgramRevenue[];
  renewalForecast: RenewalForecast[];
  aiInsight: string;
  growthOpportunities: string[];
}

export interface TopClient {
  clientId: string;
  clientName: string;
  totalSpend: number;
  sessionCount: number;
}

export interface ProgramRevenue {
  program: string;
  revenue: number;
  clientCount: number;
  trend: 'up' | 'flat' | 'down';
}

export interface RenewalForecast {
  clientId: string;
  clientName: string;
  renewalDate: string;
  renewalProbability: number;
  suggestedAction: string;
}

// ── Resource Recommendations ──────────────────────────────────────────────────

export interface ResourceRecommendation {
  clientId: string;
  recommendations: Resource[];
  aiRationale: string;
}

export interface Resource {
  title: string;
  type: 'article' | 'video' | 'exercise' | 'assessment' | 'book' | 'worksheet';
  relevance: number;              // 0–100
  description: string;
  url?: string;
}
