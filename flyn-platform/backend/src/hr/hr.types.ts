/**
 * HR Types
 */

export interface Employee {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    department: string;
    position?: string;
    status: 'active' | 'on_leave' | 'terminated';
    startDate?: string;
    notes?: string;
    signature?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface LeaveRequest {
    _id: string;
    employeeId: string;
    leaveType: 'vacation' | 'sick' | 'personal' | 'maternity';
    startDate: string;
    endDate: string;
    reason?: string;
    status: 'pending' | 'approved' | 'rejected';
    createdAt: Date;
}

export interface AttendanceLog {
    _id: string;
    employeeId: string;
    type: 'check_in' | 'check_out';
    timestamp: Date;
    notes?: string;
}

// ============================================================================
// ADVANCED HR — Performance, Skills, Payroll, AI Insights
// (From FLYN_AI_Advanced_HR_Module.pdf)
// ============================================================================

export interface PerformanceReview {
    _id: string;
    employeeId: string;
    reviewerId: string;
    reviewerName?: string;
    period: string;                     // "Q1 2026", "H1 2026"
    overallRating: number;              // 1-5
    ratings: Array<{
        category: string;               // e.g. "Technical Skills", "Communication"
        score: number;                  // 1-5
        feedback?: string;
    }>;
    goals: Array<{
        title: string;
        status: 'not_started' | 'in_progress' | 'completed';
        progress: number;               // 0-100
    }>;
    strengths?: string[];
    improvementAreas?: string[];
    aiSummary?: string;                 // AI-generated performance summary
    status: 'draft' | 'submitted' | 'acknowledged';
    createdAt: Date;
    updatedAt: Date;
}

export interface EmployeeSkill {
    _id: string;
    employeeId: string;
    skillName: string;
    proficiencyLevel: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    yearsOfExperience?: number;
    certifications?: string[];
    lastAssessed?: Date;
    endorsements?: number;
}

export interface PayrollRecord {
    _id: string;
    employeeId: string;
    period: string;                     // "2026-03"
    baseSalary: number;
    allowances: number;
    deductions: number;
    tax: number;
    netPay: number;
    currency: string;
    status: 'pending' | 'processed' | 'paid';
    paidAt?: Date;
    createdAt: Date;
}

export interface EmployeeDigitalTwin {
    employeeId: string;
    productivityScore: number;          // 0-100
    engagementLevel: 'high' | 'medium' | 'low' | 'critical';
    attritionRisk: number;              // 0-1
    workloadBalance: number;            // 0-100 (100 = perfectly balanced)
    topSkills: string[];
    growthAreas: string[];
    sentimentTrend: 'improving' | 'stable' | 'declining';
    predictedCareerPath?: string;
    aiRecommendations: string[];
}

export interface HRDashboardAdvanced {
    totalEmployees: number;
    activeEmployees: number;
    onLeave: number;
    pendingLeaveRequests: number;
    attendanceLogs: number;
    departmentBreakdown: Array<{ department: string; count: number }>;
    avgPerformanceRating?: number;
    avgProductivityScore?: number;
    attritionRiskHigh?: number;
    totalPayrollCost?: number;
    openPositions?: number;
    newHiresThisMonth?: number;
}
