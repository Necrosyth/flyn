/**
 * HR Module — Frontend Service
 * Talks to the NestJS backend which stores data in NocoBase.
 */
import { authedFetch } from "./authApi";

const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;
const BASE = `${envBaseUrl?.trim() ? envBaseUrl.trim().replace(/\/$/, '') : 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api'}/hr`;

// ── Types ─────────────────────────────────────────────────────────────────────

export interface HREmployee {
  id: string;
  name: string;
  department: string;
  status: string;
  role: string;
  email?: string;
}

export interface HRStats {
  totalEmployees: number;
  activeEmployees: number;
  onLeave: number;
  pendingLeaveRequests: number;
  attendanceLogs: number;
  departmentBreakdown: Array<{ department: string; count: number }>;
}

// ── API calls ─────────────────────────────────────────────────────────────────

export const hrService = {
  getEmployees: async (params?: { search?: string; department?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.department) query.set('department', params.department);
    if (params?.limit) query.set('limit', String(params.limit));
    const res = await authedFetch(`${BASE}/employees?${query.toString()}`);
    if (!res.ok) return [];
    const json = await res.json();
    return Array.isArray(json) ? json : (json.data ?? []);
  },

  createEmployee: async (data: Partial<HREmployee>) => {
    const res = await authedFetch(`${BASE}/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  updateEmployee: async (id: string, data: Partial<HREmployee>) => {
    const res = await authedFetch(`${BASE}/employees/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getStats: async (): Promise<HRStats> => {
    const res = await authedFetch(`${BASE}/stats`);
    if (!res.ok) return { totalEmployees: 0, activeEmployees: 0, onLeave: 0, pendingLeaveRequests: 0, attendanceLogs: 0, departmentBreakdown: [] };
    return res.json();
  },

  getLeaveRequests: async (employeeId?: string) => {
    const query = employeeId ? `?employeeId=${employeeId}` : '';
    const res = await authedFetch(`${BASE}/leave-requests${query}`);
    if (!res.ok) return [];
    return res.json();
  },

  deleteEmployee: async (id: string): Promise<boolean> => {
    try {
      const res = await authedFetch(`${BASE}/employees/${id}`, { method: 'DELETE' });
      if (!res.ok) return false;
      const json = await res.json();
      return json.success !== false;
    } catch {
      return false;
    }
  },

  getAnalytics: async (range = '30d') => {
    try {
      const res = await authedFetch(`${BASE}/analytics?range=${range}`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  getInsights: async () => {
    try {
      const res = await authedFetch(`${BASE}/insights`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  getDigitalTwin: async (id: string) => {
    const res = await authedFetch(`${BASE}/employees/${id}/digital-twin`);
    return res.json();
  },

  getWorkforceForecast: async () => {
    const res = await authedFetch(`${BASE}/workforce/forecast`);
    return res.json();
  },

  askPolicy: async (question: string) => {
    const res = await authedFetch(`${BASE}/policies/ask`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question }),
    });
    return res.json();
  },

  saveJD: async (jd: any) => {
    const res = await authedFetch(`${BASE}/job-descriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(jd),
    });
    return res.json();
  },

  getSavedJDs: async (): Promise<any[]> => {
    try {
      const res = await authedFetch(`${BASE}/job-descriptions`);
      if (!res.ok) return [];
      return res.json();
    } catch { return []; }
  },

  deleteJD: async (id: string) => {
    const res = await authedFetch(`${BASE}/job-descriptions/${id}`, { method: 'DELETE' });
    return res.json();
  },

  generateJD: async (data: { title: string; department: string; level?: string; remote?: string }) => {
    const res = await authedFetch(`${BASE}/ai/generate-job-description`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  parseCV: async (data: { rawText?: string; candidateName?: string; skills?: string[]; experience?: number; jdText?: string }) => {
    const res = await authedFetch(`${BASE}/talent/parse-cv`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  parseCVFile: async (fileName: string, base64Content: string): Promise<{ candidate: any }> => {
    const res = await authedFetch(`${BASE}/talent/parse-cv-file`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName, content: base64Content }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).message || 'Failed to parse CV file');
    }
    return res.json();
  },

  scheduleInterview: async (data: { candidateName: string; position: string; startTime: string; duration?: number; interviewType?: string; interviewer?: string; candidateEmail?: string }) => {
    const res = await authedFetch(`${BASE}/talent/schedule-interview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getPerformanceReviews: async (id: string) => {
    const res = await authedFetch(`${BASE}/employees/${id}/performance`);
    return res.json();
  },

  getEmployeeSkills: async (id: string) => {
    const res = await authedFetch(`${BASE}/employees/${id}/skills`);
    return res.json();
  },

  getPayrollSummary: async () => {
    try {
      const res = await authedFetch(`${BASE}/payroll/summary`);
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },

  runAIRespond: async (query: string, category?: string) => {
    try {
      const res = await authedFetch(`${BASE}/ai/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, category }),
      });
      if (!res.ok) return null;
      return res.json();
    } catch {
      return null;
    }
  },
  
  getOnboarding: async (id: string) => {
    try {
      const res = await authedFetch(`${BASE}/employees/${id}/onboarding`);
      if (!res.ok) return null;
      return res.json();
    } catch (err) {
      console.error("Error fetching onboarding:", err);
      return null;
    }
  },

  updateOnboardingTask: async (id: string, taskId: string, completed: boolean) => {
    const res = await authedFetch(`${BASE}/employees/${id}/onboarding/tasks/${taskId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    return res.json();
  },

  generateContract: async (id: string) => {
    const res = await authedFetch(`${BASE}/employees/${id}/generate-contract`, {
      method: 'POST',
    });
    return res.json();
  },

  sendPulseSurvey: async (id: string) => {
    const res = await authedFetch(`${BASE}/employees/${id}/pulse-survey`, {
      method: 'POST',
    });
    return res.json();
  },

  generateWelcomeEmail: async (id: string) => {
    const res = await authedFetch(`${BASE}/employees/${id}/welcome-email/generate`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to generate welcome email');
    return res.json() as Promise<{ subject: string; body: string; employeeEmail: string; employeeName: string }>;
  },

  sendWelcomeEmail: async (id: string, subject: string, body: string) => {
    const res = await authedFetch(`${BASE}/employees/${id}/welcome-email/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subject, body }),
    });
    if (!res.ok) throw new Error('Failed to send welcome email');
    return res.json() as Promise<{ success: boolean; sentTo: string }>;
  },

  hireCandidate: async (data: any) => {
    const res = await authedFetch(`${BASE}/talent/hire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  addAsCandidate: async (data: any) => {
    const res = await authedFetch(`${BASE}/talent/add-candidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  matchCandidateToJob: async (data: { candidate: any; jobTitle: string; department: string; jobDescription?: string }) => {
    const res = await authedFetch(`${BASE}/talent/match-job`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Job match failed');
    return res.json();
  },

  getSkillsHeatmap: async () => {
    try {
      const res = await authedFetch(`${BASE}/skills/heatmap`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  getRemoteTeams: async () => {
    try {
      const res = await authedFetch(`${BASE}/remote-teams`);
      if (!res.ok) return null;
      return res.json();
    } catch { return null; }
  },

  getPolicyDocs: async () => {
    try {
      const res = await authedFetch(`${BASE}/policy-docs`);
      if (!res.ok) return [];
      return res.json();
    } catch { return []; }
  },

  uploadPolicyDoc: async (data: { fileName: string; content: string; category?: string }) => {
    const res = await authedFetch(`${BASE}/policy-docs/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).message || 'Upload failed');
    }
    return res.json();
  },

  deletePolicyDoc: async (id: string) => {
    const res = await authedFetch(`${BASE}/policy-docs/${id}`, { method: 'DELETE' });
    return res.json();
  },
};
