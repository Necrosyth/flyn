/**
 * Church Advanced Types
 * ---------------------
 * Extended types for advanced church features:
 * - AI Member Engagement Intelligence
 * - Giving Capacity Prediction
 * - Attendance Analytics & AI
 * - Prayer Request Management
 * - Volunteer Scheduling AI
 * - Family Unit Intelligence
 * - Discipleship Path AI
 */

// ── AI Member Engagement ──────────────────────────────────────────────────────

export interface MemberEngagement {
  memberId: string;
  engagementScore: number;        // 0–100
  attendanceStreak: number;       // consecutive weeks
  lastActivity: string;
  riskLevel: 'healthy' | 'at_risk' | 'disengaged';
  aiRecommendation: string;
  touchpoints: TouchPoint[];
  engagementTrend: 'increasing' | 'stable' | 'declining';
}

export interface TouchPoint {
  type: 'attendance' | 'donation' | 'volunteering' | 'small_group' | 'prayer_request' | 'event';
  date: string;
  details: string;
}

// ── Giving Intelligence ───────────────────────────────────────────────────────

export interface GivingPrediction {
  memberId: string;
  currentCapacity: 'Low' | 'Medium' | 'High' | 'Unknown';
  predictedMonthlyGiving: number;
  givingTrend: 'increasing' | 'stable' | 'declining';
  lifetimeGiving: number;
  aiInsight: string;
  suggestedAsk: number;
  nextLikelyGiftDate: string;
  segment: 'first_time' | 'occasional' | 'regular' | 'champion';
}

// ── Attendance AI ─────────────────────────────────────────────────────────────

export interface AttendanceAI {
  overallRate: number;               // percentage
  predictedNextSunday: number;       // predicted attendance count
  peakDays: string[];
  seasonalTrends: SeasonalTrend[];
  atRiskMembers: AtRiskMember[];
  aiSummary: string;
}

export interface SeasonalTrend {
  period: string;
  averageAttendance: number;
  change: number;
}

export interface AtRiskMember {
  memberId: string;
  name: string;
  lastAttendance: string;
  weeksMissed: number;
  riskScore: number;
  suggestedAction: string;
}

// ── Prayer Requests ───────────────────────────────────────────────────────────

export interface PrayerRequest {
  _id: string;
  memberId?: string;
  memberName: string;
  request: string;
  category: 'health' | 'family' | 'financial' | 'spiritual' | 'guidance' | 'gratitude' | 'other';
  status: 'active' | 'answered' | 'ongoing';
  isAnonymous: boolean;
  prayerCount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ── Volunteer Scheduling ──────────────────────────────────────────────────────

export interface VolunteerSlot {
  _id: string;
  eventId?: string;
  ministry: string;
  role: string;
  date: string;
  time: string;
  volunteerId?: string;
  volunteerName?: string;
  status: 'open' | 'filled' | 'confirmed';
}

export interface VolunteerScheduleAI {
  suggestedSchedule: VolunteerSlot[];
  conflicts: string[];
  coverageGaps: string[];
  aiNotes: string;
}

// ── Family Unit Intelligence ──────────────────────────────────────────────────

export interface FamilyUnit {
  familyId: string;
  familyName: string;
  members: FamilyMemberSummary[];
  totalGiving: number;
  engagementScore: number;
  aiInsight: string;
}

export interface FamilyMemberSummary {
  memberId: string;
  name: string;
  role: 'head' | 'spouse' | 'child' | 'other';
  status: string;
  membershipType: string;
}

// ── Discipleship Path AI ──────────────────────────────────────────────────────

export interface DiscipleshipPath {
  memberId: string;
  currentStage: string;
  nextStage: string;
  readinessScore: number;         // 0–100
  milestones: DiscipleshipMilestone[];
  recommendedActions: string[];
  aiAssessment: string;
  estimatedProgressDate: string;
}

export interface DiscipleshipMilestone {
  name: string;
  completed: boolean;
  completedDate?: string;
}

// ── AI Sermon Suggestions ─────────────────────────────────────────────────────

export interface SermonSuggestion {
  topic: string;
  relevance: string;
  suggestedScripture: string;
  audienceResonance: number;       // 0–100
  basedOn: string;                 // what data drove this suggestion
}
