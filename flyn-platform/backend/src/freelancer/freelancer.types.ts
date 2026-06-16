/**
 * Freelancer Types
 */

export interface Project {
    _id: string;
    title: string;
    clientName: string;
    clientEmail?: string;
    budget?: number;
    deadline?: string;
    status: 'draft' | 'active' | 'paused' | 'completed';
    description?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface TimeEntry {
    _id: string;
    projectId: string;
    hours: number;
    description: string;
    date: string;
    billable: boolean;
    createdAt: Date;
}

export interface Invoice {
    _id: string;
    projectId: string;
    invoiceNumber?: string;
    amount: number;
    dueDate?: string;
    description?: string;
    status: 'draft' | 'sent' | 'paid' | 'overdue';
    paidDate?: string;
    createdAt?: Date;
}

// ============================================================================
// ADVANCED FREELANCER — Milestones, Talent Matching, Risk Analysis
// (From FLYN_AI_Advanced_Freelancer_Module.pdf)
// ============================================================================

export interface ProjectMilestone {
    _id: string;
    projectId: string;
    title: string;
    description?: string;
    dueDate: string;
    deliverables?: string[];
    amountDue?: number;
    status: 'pending' | 'in_progress' | 'completed' | 'overdue';
    completedAt?: string;
    order: number;
}

export interface FreelancerProfile {
    _id: string;
    name: string;
    email: string;
    skills: string[];
    hourlyRate: number;
    currency: string;
    availability: 'available' | 'busy' | 'unavailable';
    rating: number;                     // 1-5
    totalProjects: number;
    totalEarnings: number;
    portfolio?: string[];
    timezone?: string;
    bio?: string;
}

export interface TalentMatchResult {
    freelancerId: string;
    freelancerName: string;
    matchScore: number;                 // 0-100
    matchingSkills: string[];
    missingSkills: string[];
    hourlyRate: number;
    availability: string;
    rating: number;
    aiReason: string;
}

export interface ProjectRiskAssessment {
    projectId: string;
    overallRisk: 'low' | 'medium' | 'high' | 'critical';
    riskScore: number;                  // 0-100
    factors: Array<{
        category: string;               // 'timeline' | 'budget' | 'scope' | 'resource'
        severity: 'low' | 'medium' | 'high';
        description: string;
    }>;
    recommendations: string[];
    projectedDeliveryDate?: string;
    budgetVariance?: number;            // percentage over/under budget
}

export interface ClientSatisfaction {
    projectId: string;
    clientName: string;
    overallScore: number;               // 1-5
    responsiveness: number;
    quality: number;
    communication: number;
    timeliness: number;
    wouldRehire: boolean;
    feedback?: string;
}
