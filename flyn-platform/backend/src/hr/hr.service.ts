import { Injectable, Logger, Optional } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';
import { AIProviderService } from '../orchestrator/ai-provider/ai-provider.service';
import { CalendarService } from '../calendar/calendar.service';
import { ContractsService } from '../contracts/contracts.service';
import { MailService } from '../mail/mail.service';
import { ChannelsService } from '../channels/channels.service';
import { AssistantTool } from '../orchestrator/ai-provider/ai-provider.interface';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse');
import * as mammoth from 'mammoth';

type EventBusFn = (tenantId: string, eventName: string, data: Record<string, unknown>) => void;

@Injectable()
export class HRService {
  private readonly logger = new Logger(HRService.name);
  private readonly COLLECTION = 'hr_employees';
  private eventBus: EventBusFn | null = null;

  /** Called by WorkflowEventService at startup — avoids circular DI. */
  setEventBus(fn: EventBusFn): void { this.eventBus = fn; }

  constructor(
    private readonly firebase: FirebaseService,
    private readonly mail: MailService,
    private readonly channels: ChannelsService,
    @Optional() private readonly ai?: AIProviderService,
    @Optional() private readonly calendarService?: CalendarService,
    @Optional() private readonly contractsService?: ContractsService,
  ) {}

  private db() {
    return this.firebase.firestore();
  }

  async createEmployee(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = this.db();
    if (!db) throw new Error('Firestore not initialised');
    const ref = db.collection(this.COLLECTION).doc();
    const employee = {
      id: ref.id,
      ...data,
      status: data.status ?? 'active',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await ref.set(employee);
    const tenantId = String(data.tenantId ?? 'default');
    this.eventBus?.(tenantId, 'hr.employee.created', { employee, tenantId });
    return employee;
  }

  async updateEmployee(id: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = this.db();
    if (!db) throw new Error('Firestore not initialised');
    const ref = db.collection(this.COLLECTION).doc(id);
    await ref.update({ ...data, updatedAt: Date.now() });
    const snap = await ref.get();
    const employee = { id: snap.id, ...snap.data() };
    const tenantId = String(data.tenantId ?? snap.data()?.tenantId ?? 'default');
    this.eventBus?.(tenantId, 'hr.employee.updated', { employee, tenantId });
    return employee;
  }

  async deleteEmployee(id: string): Promise<{ success: boolean }> {
    const db = this.db();
    if (!db) throw new Error('Firestore not initialised');
    await db.collection(this.COLLECTION).doc(id).delete();
    return { success: true };
  }

  async getEmployeeById(id: string): Promise<Record<string, unknown> | null> {
    const db = this.db();
    if (!db) return null;
    const snap = await db.collection(this.COLLECTION).doc(id).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  }

  async getEmployees(opts: {
    tenantId?: string;
    limit?: number;
    filter?: string;
    status?: string;
    search?: string;
    department?: string;
  }): Promise<Record<string, unknown>[]> {
    const db = this.db();
    if (!db) return [];
    let query: FirebaseFirestore.Query = db.collection(this.COLLECTION);
    if (opts.tenantId) query = query.where('tenantId', '==', opts.tenantId);
    if (opts.status && opts.status !== 'all') {
      query = query.where('status', '==', opts.status);
    }
    if (opts.department) query = query.where('department', '==', opts.department);
    const snap = await query.limit(opts.limit ?? 50).get();
    let results: Record<string, unknown>[] = snap.docs.map(d => ({ id: d.id, ...d.data() as Record<string, unknown> }));
    if (opts.search) {
      const s = opts.search.toLowerCase();
      results = results.filter(r =>
        String(r['name'] ?? '').toLowerCase().includes(s) ||
        String(r['email'] ?? '').toLowerCase().includes(s) ||
        String(r['department'] ?? '').toLowerCase().includes(s),
      );
    }
    return results;
  }

  async getStats(tenantId?: string): Promise<Record<string, unknown>> {
    const db = this.db();
    if (!db) return { totalEmployees: 0, activeEmployees: 0, onLeave: 0, pendingLeaveRequests: 0, attendanceLogs: 0, departmentBreakdown: [] };

    let query: FirebaseFirestore.Query = db.collection(this.COLLECTION);
    if (tenantId) query = query.where('tenantId', '==', tenantId);
    const snap = await query.get();
    const employees = snap.docs.map(d => d.data());

    const total = employees.length;
    const active = employees.filter(e => ((e as Record<string, unknown>)['status'] ?? 'active') === 'active').length;
    const onLeave = employees.filter(e => (e as Record<string, unknown>)['status'] === 'on_leave').length;

    let leaveQuery: FirebaseFirestore.Query = db.collection('hr_leave_requests');
    if (tenantId) leaveQuery = leaveQuery.where('tenantId', '==', tenantId);
    const leaveSnap = await leaveQuery.where('status', '==', 'pending').get();

    let attendQuery: FirebaseFirestore.Query = db.collection('hr_attendance');
    if (tenantId) attendQuery = attendQuery.where('tenantId', '==', tenantId);
    const attendSnap = await attendQuery.limit(1).get();

    const deptMap: Record<string, number> = {};
    for (const e of employees) {
      const emp = e as Record<string, unknown>;
      const dept = String(emp['department'] ?? 'Other');
      deptMap[dept] = (deptMap[dept] ?? 0) + 1;
    }

    // Count saved job descriptions as open positions
    let openPositions = 0;
    try {
      let jdQuery: FirebaseFirestore.Query = db.collection('hr_job_descriptions');
      if (tenantId) jdQuery = jdQuery.where('tenantId', '==', tenantId);
      const jdSnap = await jdQuery.get();
      openPositions = jdSnap.size;
    } catch { /* ignore */ }

    return {
      totalEmployees: total,
      activeEmployees: active,
      onLeave,
      pendingLeaveRequests: leaveSnap.size,
      attendanceLogs: attendSnap.size > 0 ? active : 0,
      attendanceRate: total > 0 ? `${Math.round((active / total) * 100)}%` : '0%',
      departmentBreakdown: Object.entries(deptMap).map(([department, count]) => ({ department, count })),
      openPositions,
    };
  }

  async getAnalytics(_range = '30d'): Promise<{ charts: any[] }> {
    const db = this.db();
    const employees = db ? (await db.collection(this.COLLECTION).limit(200).get()).docs.map(d => d.data() as Record<string, unknown>) : [];

    const deptCounts: Record<string, number> = {};
    for (const e of employees) {
      const dept = String(e['department'] ?? 'Other');
      deptCounts[dept] = (deptCounts[dept] ?? 0) + 1;
    }

    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const base = employees.length || 0;

    return {
      charts: [
        {
          title: 'Headcount by Department',
          type: 'bar',
          data: Object.entries(deptCounts).map(([name, value]) => ({ name, value })),
        },
        {
          title: 'Employee Growth',
          type: 'line',
          data: months.map((m, i) => ({ name: m, value: Math.max(0, base - (5 - i) * Math.ceil(base * 0.05)) })),
        },
        {
          title: 'Status Breakdown',
          type: 'pie',
          data: [
            { name: 'Active', value: employees.filter(e => (e['status'] ?? 'active') === 'active').length },
            { name: 'On Leave', value: employees.filter(e => e['status'] === 'on_leave').length },
            { name: 'Terminated', value: employees.filter(e => e['status'] === 'terminated').length },
          ].filter(d => d.value > 0),
        },
      ],
    };
  }

  async getInsights(): Promise<{ insights: any[] }> {
    const db = this.db();
    const employees = db ? (await db.collection(this.COLLECTION).limit(200).get()).docs.map(d => d.data()) : [];

    const total = employees.length;
    const active = employees.filter(e => (e.status ?? 'active') === 'active').length;
    const attritionRate = total > 0 ? Math.round(((total - active) / total) * 100) : 0;

    if (this.ai?.isAvailable() && total > 0) {
      try {
        const deptSummary = Object.entries(
          employees.reduce((acc, e) => {
            const d = String(e.department ?? 'Other');
            acc[d] = (acc[d] ?? 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        ).map(([d, c]) => `${d}: ${c}`)
          .join(', ');

        const res = await this.ai.chat([
          {
            role: 'system',
            content: 'You are an HR Analytics AI. Return exactly 3 concise, data-driven insights as JSON array: [{"title":"...","description":"...","type":"positive|warning|neutral"}]',
          },
          {
            role: 'user',
            content: `Company has ${total} employees. Active: ${active}. Departments: ${deptSummary}. Attrition rate: ${attritionRate}%. Generate 3 HR insights.`,
          },
        ]);
        let parsed: any[] = [];
        try {
          let text = res.content.trim();
          if (text.startsWith('```')) text = text.replace(/```json?|```/g, '').trim();
          parsed = JSON.parse(text);
        } catch { /* use fallback */ }
        if (Array.isArray(parsed) && parsed.length > 0) {
          return { insights: parsed };
        }
      } catch (err) {
        this.logger.warn('AI insights failed, using fallback');
      }
    }

    return {
      insights: [
        { title: 'Workforce Overview', description: `You have ${total} employees across departments. ${active} are currently active.`, type: 'neutral' },
        { title: 'Attrition Tracking', description: attritionRate > 15 ? `Attrition rate of ${attritionRate}% is above the 15% benchmark — review retention strategies.` : `Attrition rate of ${attritionRate}% is within healthy range.`, type: attritionRate > 15 ? 'warning' : 'positive' },
        { title: 'Action Required', description: 'Schedule quarterly performance reviews and ensure all employee profiles are up to date.', type: 'neutral' },
      ],
    };
  }

  async askPolicy(question: string, tenantId?: string): Promise<{ answer: string; question: string }> {
    const result = await this.runAIRespond(question, 'policy', tenantId);
    return { answer: result.response, question };
  }

  async getHRContextForAI(tenantId: string): Promise<string> {
    try {
      const [stats, forecast, leaveRequests, payroll] = await Promise.all([
        this.getStats(tenantId).catch(() => ({} as any)),
        this.getWorkforceForecast(tenantId).catch(() => ({} as any)),
        this.getLeaveRequests({ tenantId }).catch(() => [] as any[]),
        this.getPayrollSummary(tenantId).catch(() => ({} as any)),
      ]) as [any, any, any[], any];

      return `
CURRENT HR OPERATIONAL CONTEXT:
- Active Employees: ${stats.activeEmployees || 0} (Total: ${stats.totalEmployees || 0})
- Departments: ${JSON.stringify(stats.departmentBreakdown || [])}
- Payroll Cycle: Next run on ${payroll.nextPayrollDate || 'not set'} (${payroll.currency || 'USD'})
- Financials: Estimated monthly payroll is ${payroll.estimatedMonthlyPayroll || 0} ${payroll.currency || 'USD'} (annual: ${payroll.estimatedTotalPayroll || 0})
- Workforce Health: ${stats.onLeave || 0} employees currently on leave. ${Array.isArray(leaveRequests) ? leaveRequests.filter((l: any) => l.status === 'pending').length : 0} pending leave requests.
- Strategic Forecast: ${JSON.stringify(forecast)}

Use this data to answer accurately if the user asks about company-specific HR metrics or status.
`;
    } catch (err) {
      return "Context unavailable.";
    }
  }

  async runAIRespond(query: string, category?: string, tenantId?: string): Promise<{ response: string; category: string }> {
    // Retrieve relevant policy document chunks for RAG
    const ragContext = tenantId ? await this.searchPolicyDocs(tenantId, query).catch(() => '') : '';

    const basePrompt = category === 'policy'
      ? `You are a professional HR Policy Advisor with deep knowledge of employment law, company policies, leave management, payroll, and HR best practices. Provide clear, accurate, and actionable answers to HR policy questions. Format your response with clear sections when appropriate. Be specific and helpful.`
      : `You are an expert HR Assistant. Help with HR management, employee relations, recruitment, performance management, payroll, compliance, and workforce planning. Provide practical, actionable guidance.`;

    const systemPrompt = ragContext
      ? `${basePrompt}\n\nIMPORTANT — The following are excerpts from this company's actual policy documents. Prioritize this information when answering:${ragContext}`
      : basePrompt;


    if (this.ai?.isAvailable()) {
      try {
        const hrTools: AssistantTool[] = [
          {
            name: 'get_employee_stats',
            description: 'Get high-level statistics about the workforce (total employees, active/inactive counts, department breakdown).',
            input_schema: { type: 'object', properties: {} }
          },
          {
            name: 'get_payroll_data',
            description: 'Get payroll summary including next run date, currency, and estimated monthly costs.',
            input_schema: { type: 'object', properties: {} }
          },
          {
            name: 'get_leave_summary',
            description: 'Get summary of leave requests and currently absent employees.',
            input_schema: { 
              type: 'object', 
              properties: { 
                status: { type: 'string', enum: ['pending', 'approved', 'rejected'], description: 'Filter by status' } 
              } 
            }
          },
          {
            name: 'search_employees',
            description: 'Search for specific employees by name, department, or email to get their details.',
            input_schema: {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'Search term (name, email, or dept)' }
              },
              required: ['query']
            }
          },
          {
            name: 'get_workforce_forecast',
            description: 'Get AI-driven workforce growth and attrition forecasts.',
            input_schema: { type: 'object', properties: {} }
          }
        ];

        const toolExecutor = async (name: string, input: Record<string, unknown>) => {
          if (!tenantId) return "No tenant context available.";
          switch (name) {
            case 'get_employee_stats':
              return JSON.stringify(await this.getStats(tenantId));
            case 'get_payroll_data':
              return JSON.stringify(await this.getPayrollSummary(tenantId));
            case 'get_leave_summary': {
              const all = await this.getLeaveRequests({ tenantId });
              const filtered = input.status
                ? all.filter((l: any) => l.status === input.status)
                : all;
              return JSON.stringify(filtered);
            }
            case 'search_employees':
              return JSON.stringify(await this.getEmployees({ tenantId, search: input.query as string }));
            case 'get_workforce_forecast':
              return JSON.stringify(await this.getWorkforceForecast(tenantId));
            default:
              return `Tool ${name} not implemented.`;
          }
        };

        const result = await this.ai.chatWithTools(
          systemPrompt,
          [{ role: 'user', content: query }],
          hrTools,
          toolExecutor,
          { maxIterations: 5 }
        );

        return { response: result.content, category: category ?? 'general' };
      } catch (err) {
        this.logger.warn(`AI tool-calling failed in HR runAIRespond: ${(err as Error).message}`);
        // Fallback to plain chat if tool-calling fails
        const res = await this.ai.chat([
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ]);
        return { response: res.content, category: category ?? 'general' };
      }
    }

    const fallbackPolicies: Record<string, string> = {
      leave: `**Leave Policy Overview**\n\nEmployees are entitled to:\n• **Annual Leave:** 20 working days per year (pro-rated for partial years)\n• **Sick Leave:** 10 days per year with medical certification required after 3 consecutive days\n• **Personal Leave:** 5 days per year for personal matters\n• **Maternity/Paternity:** 90 days maternity, 14 days paternity\n\n**Process:** Submit leave requests at least 5 business days in advance through the HR module. Emergency leaves require notification within 24 hours.`,
      payroll: `**Payroll Policy**\n\nPayroll is processed on the last business day of each month. Employees should ensure timesheets are submitted by the 25th. Direct deposits are processed within 2 business days. Pay stubs are available digitally. Any payroll discrepancies must be reported within 7 days.`,
      performance: `**Performance Review Process**\n\nPerformance reviews are conducted quarterly. The process includes:\n1. Self-assessment submission by employee\n2. Manager review and rating (1-5 scale)\n3. One-on-one meeting to discuss results\n4. Goal setting for next quarter\n\nEmployees scoring below 3.0 are placed on a Performance Improvement Plan (PIP).`,
    };

    const queryLower = query.toLowerCase();
    for (const [key, content] of Object.entries(fallbackPolicies)) {
      if (queryLower.includes(key)) return { response: content, category: category ?? 'general' };
    }

    return {
      response: `**HR Policy Guidance**\n\nThank you for your question about "${query}".\n\nAs a general HR policy principle:\n• All employee matters are handled confidentially and in accordance with company policy\n• Employees have the right to a fair and transparent process\n• All policies are reviewed annually and updated as needed\n\nFor specific policy details, please consult your employee handbook or contact the HR department directly. For immediate assistance, open a support ticket through the HR module.`,
      category: category ?? 'general',
    };
  }



  async getWorkforceForecast(tenantId?: string): Promise<Record<string, unknown>> {
    const db = this.db();
    let employees: Record<string, unknown>[] = [];
    if (db) {
      let q: FirebaseFirestore.Query = db.collection(this.COLLECTION);
      if (tenantId) q = q.where('tenantId', '==', tenantId);
      employees = (await q.get()).docs.map(d => ({ id: d.id, ...d.data() }));
    }

    const total = employees.length;
    const deptMap: Record<string, Record<string, unknown>[]> = {};
    for (const e of employees) {
      const dept = String((e as Record<string, unknown>)['department'] ?? 'General');
      if (!deptMap[dept]) deptMap[dept] = [];
      deptMap[dept].push(e);
    }

    if (this.ai?.isAvailable() && total > 0) {
      try {
        const deptSummary = Object.entries(deptMap)
          .map(([dept, emps]) => `${dept}(${emps.length})`)
          .join(', ');

        const prompt = `You are an HR Workforce Analytics AI. Analyze this company's workforce and generate a detailed forecast.

Company Data:
- Total Employees: ${total}
- Departments: ${deptSummary}
- Active: ${employees.filter(e => (e.status ?? 'active') === 'active').length}
- On Leave: ${employees.filter(e => e.status === 'on_leave').length}

Generate a workforce gap analysis and 6-month forecast. Return JSON:
{
  "totalEmployees": number,
  "totalHiringNeed": number,
  "overallAttritionRate": "X%",
  "forecastPeriod": "Next 6 months",
  "departmentForecasts": [{"department":"","currentHeadcount":0,"atRiskPositions":0,"hiringNeed":0,"priority":"low|medium|high|critical","trend":"growing|stable|shrinking"}],
  "recommendations": ["string","string","string"]
}`;

        const res = await this.ai.chat([
          { role: 'system', content: 'You are an HR workforce analytics expert. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ]);
        let text = res.content.trim();
        if (text.startsWith('```')) text = text.replace(/```json?|```/g, '').trim();
        const parsed = JSON.parse(text);
        if (parsed.totalEmployees !== undefined) return parsed;
      } catch (err) {
        this.logger.warn(`Workforce forecast AI failed: ${(err as Error).message}`);
      }
    }

    // Fallback: generate from real data
    const deptForecasts = Object.entries(deptMap).map(([dept, emps]) => {
      const headcount = emps.length;
      const atRisk = Math.max(0, Math.floor(headcount * 0.1));
      const hiringNeed = Math.max(0, Math.floor(headcount * 0.15));
      const priority = headcount < 2 ? 'critical' : headcount < 5 ? 'high' : headcount < 10 ? 'medium' : 'low';
      return { department: dept, currentHeadcount: headcount, atRiskPositions: atRisk, hiringNeed, priority, trend: 'stable' };
    });

    return {
      totalEmployees: total,
      totalHiringNeed: deptForecasts.reduce((s, d) => s + d.hiringNeed, 0),
      overallAttritionRate: total > 0 ? `${Math.round((employees.filter(e => { const s = (e as Record<string, unknown>)['status']; return s === 'on_leave' || s === 'terminated'; }).length / total) * 100)}%` : '0%',
      forecastPeriod: 'Next 6 months',
      departmentForecasts: deptForecasts,
      recommendations: [
        total === 0
          ? 'Add employees to the HR module to generate a workforce forecast.'
          : `Focus recruitment on departments with critical headcount gaps.`,
        'Implement quarterly performance reviews to identify and retain top talent.',
        'Consider cross-training programs to reduce single points of failure in small departments.',
      ],
    };
  }

  async generateJobDescription(data: { title: string; department: string; level?: string; remote?: string }): Promise<{ jobDescription: any }> {
    const { title, department, level = 'Mid-level', remote = 'Hybrid' } = data;

    if (this.ai?.isAvailable()) {
      try {
        const expYears = level === 'Junior' || level === 'Intern' ? '0-2' : level === 'Senior' ? '5+' : level === 'Lead' || level === 'Principal' ? '7+' : level === 'Director' || level === 'VP' ? '10+' : '3-5';

        const prompt = `You are a senior HR recruiter at a tech company. Write a professional, specific job description.

Role: ${title}
Department: ${department}
Level: ${level} (${expYears} years experience expected)
Work Policy: ${remote}

Return ONLY a valid JSON object with these exact fields — make the content specific and realistic for this exact role, NOT generic:
{
  "title": "${title}",
  "department": "${department}",
  "level": "${level}",
  "remote": "${remote}",
  "location": "${remote === 'On-site' ? 'Office — specify city' : remote}",
  "employmentType": "Full-time",
  "salaryRange": "market-rate range for ${level} ${department} in USD",
  "summary": "2-3 sentences describing the role impact and team context — specific to ${title}",
  "responsibilities": [
    "5-7 specific, action-verb led responsibilities relevant to ${title} in ${department}"
  ],
  "requirements": [
    "${expYears} years of experience in...",
    "3-5 hard requirements with specific technologies/skills for this role"
  ],
  "preferredQualifications": [
    "2-3 nice-to-have qualifications relevant to ${title}"
  ],
  "benefits": [
    "4-5 real company benefits"
  ]
}`;

        const res = await this.ai.chat([
          { role: 'system', content: 'You are an expert HR recruiter writing real job descriptions. Return only valid JSON, no markdown.' },
          { role: 'user', content: prompt },
        ]);
        let text = res.content.trim();
        if (text.startsWith('```')) text = text.replace(/```json?|```/g, '').trim();
        const jd = JSON.parse(text);
        // Normalise field names — keep both aliases for safety
        if (jd.niceToHave && !jd.preferredQualifications) jd.preferredQualifications = jd.niceToHave;
        return { jobDescription: jd };
      } catch (err) {
        this.logger.warn(`JD generation AI failed: ${(err as Error).message}`);
      }
    }

    const expYears = level === 'Junior' || level === 'Intern' ? '1-2' : level === 'Senior' ? '5+' : level === 'Lead' || level === 'Principal' ? '7+' : '3-5';
    return {
      jobDescription: {
        title,
        department,
        level,
        remote,
        location: remote,
        employmentType: 'Full-time',
        summary: `We are seeking a ${level} ${title} to join our ${department} team. This is an exciting opportunity to contribute to a fast-growing organization and make a meaningful impact in a ${remote.toLowerCase()} environment.`,
        responsibilities: [
          `Lead and execute ${department.toLowerCase()} initiatives aligned with company objectives`,
          `Collaborate cross-functionally with stakeholders to deliver high-quality outcomes`,
          `Analyze data and metrics to drive informed decision-making`,
          `Mentor junior team members and contribute to team culture`,
          `Stay current with industry trends and best practices in ${department}`,
        ],
        requirements: [
          `${expYears} years of relevant experience in ${department}`,
          `Strong communication and interpersonal skills`,
          `Proven ability to manage multiple priorities in a fast-paced environment`,
          `Bachelor's degree or equivalent practical experience`,
        ],
        preferredQualifications: [`Experience in a SaaS or tech company`, `Relevant certifications in ${department}`],
        niceToHave: [`Experience in a SaaS or tech company`, `Relevant certifications in ${department}`],
        benefits: ['Competitive salary and equity', 'Health, dental, and vision insurance', 'Flexible working hours and remote options', 'Learning and development budget'],
        salaryRange: level === 'Senior' || level === 'Lead' || level === 'Principal' ? '$90,000 – $140,000'
          : level === 'Junior' || level === 'Intern' ? '$45,000 – $65,000'
          : level === 'Director' || level === 'VP' ? '$140,000 – $200,000'
          : '$65,000 – $95,000',
      },
    };
  }

  async parseCV(data: { candidateName?: string; email?: string; skills?: string[]; experience?: number; rawText?: string; jdText?: string }): Promise<{ candidate: any }> {
    const { candidateName = 'Candidate', email = '', skills = [], experience = 0 } = data;
    const isFullCV = data.rawText && data.rawText.length > 200;
    const hasJD = data.jdText && data.jdText.trim().length > 50;

    if (this.ai?.isAvailable()) {
      try {
        const content = data.rawText || `Candidate: ${candidateName}. Skills: ${skills.join(', ')}. Experience: ${experience} years.`;

        const prompt = hasJD
          ? `You are an expert ATS (Applicant Tracking System) engine used by top-tier companies like Google, Amazon, and McKinsey. Your job is to objectively score a candidate's CV against a specific job description.

JOB DESCRIPTION:
---
${(data.jdText ?? '').slice(0, 4000)}
---

CANDIDATE CV:
---
${content.slice(0, 8000)}
---

INSTRUCTIONS:
1. Extract from the JD: required skills, preferred skills, minimum experience, education requirement, key responsibilities
2. Extract from the CV: real name, contact info, all skills, actual work history, education
3. Compare CV against JD requirements systematically
4. Compute atsScore (0–100) based on:
   - Skills match: required skills found vs total required (40% weight)
   - Experience: years in CV vs years required in JD (25% weight)
   - Education: degree match (15% weight)
   - Keyword density: JD keywords appearing in CV (20% weight)
   - CRITICAL: Score 90-100 only if almost all required skills match + experience exceeds requirement
   - Score 70-89 if most required skills match
   - Score 50-69 if some required skills match but gaps exist
   - Score 30-49 if few required skills match
   - Score below 30 if major mismatch

Return ONLY a valid JSON object, no markdown fences:
{
  "name": "candidate full name from CV",
  "email": "from CV",
  "phone": "from CV or empty string",
  "currentRole": "most recent job title from CV",
  "experienceYears": <integer from CV work history>,
  "skills": ["ALL skills from CV"],
  "education": "degree + institution from CV",
  "department": "department inferred from JD",
  "atsScore": <integer 0-100 — the primary ATS match score>,
  "overallScore": <same as atsScore>,
  "requiredSkillsFound": ["JD required skills that appear in the CV"],
  "requiredSkillsMissing": ["JD required skills NOT found in the CV"],
  "preferredSkillsFound": ["nice-to-have JD skills found in CV"],
  "experienceMatch": "exceeds" | "meets" | "below",
  "educationMatch": true | false,
  "keywordMatchRate": <integer 0-100 — % of JD keywords found in CV>,
  "strengths": ["specific strength relevant to this JD", "another", "third"],
  "gaps": ["specific gap vs this JD", "second gap if any"],
  "atsRecommendation": "Strong Match" | "Good Match" | "Partial Match" | "Poor Match",
  "recommendation": "Recommend for interview | Consider | Pass",
  "fitAnalysis": "2-3 sentences about fit for THIS specific role using candidate's real name",
  "suggestedRoles": ["role matching their background", "second role"],
  "salaryExpectation": "market range based on experience and JD",
  "hiringStatus": "In Review",
  "_atsMode": true
}`
          : isFullCV
          ? `You are a world-class HR talent acquisition specialist with 20 years of experience. You MUST extract EVERY detail from the CV below. Do NOT make up data. Do NOT use generic placeholders. Every field must come directly from the document or be a carefully reasoned inference.

CV DOCUMENT:
---
${content.slice(0, 12000)}
---

STRICT RULES:
1. Extract the candidate's REAL name, email, phone from the document
2. List ALL skills mentioned anywhere in the CV — technical tools, languages, frameworks, soft skills, certifications
3. Count actual years of experience from the work history dates
4. Strengths must reference specific achievements or projects from their CV
5. Suggested roles must match their actual background
6. SCORING — compute overallScore using this exact rubric, DO NOT default to 70-75:
   - Internship/student with <1 yr real work: 30-50
   - 1-2 yrs junior: 45-60
   - 2-4 yrs mid-level: 55-70
   - 4-7 yrs senior: 65-82
   - 7+ yrs with leadership: 80-95
   - Add up to 10pts for notable quantified achievements (%, $, scale)
   - Add up to 8pts for 10+ distinct technical skills
   - Subtract 5-10pts for gaps, unexplained jumps, or very short tenures
   - The score MUST reflect the actual profile — a fresh grad should NOT score 75
7. NEVER output "Communication" and "Problem Solving" as the only skills — extract the real ones

Return ONLY a valid JSON object, no markdown fences:
{
  "name": "candidate full name from CV header",
  "email": "email from CV or empty string",
  "phone": "phone from CV or empty string",
  "experienceYears": <integer: count years from work history>,
  "currentRole": "most recent job title from CV",
  "skills": ["ALL skills extracted from CV — technical and soft"],
  "education": "degree + institution + year from CV",
  "department": "best-fit department: Engineering/Marketing/Sales/Finance/HR/Operations/Design/Product/Legal/Data",
  "strengths": ["strength tied to a specific achievement in their CV", "another specific strength", "third specific strength"],
  "gaps": ["genuine gap based on their actual profile", "second gap if any"],
  "overallScore": <integer 0-100 — must follow rubric above, not a round default>,
  "hiringStatus": "In Review",
  "recommendation": "Recommend for interview | Consider | Pass",
  "fitAnalysis": "2-3 sentences using the candidate's ACTUAL name and referencing specific experience or projects from their CV",
  "suggestedRoles": ["specific role matching their background", "second role"],
  "salaryExpectation": "market salary range based on their actual experience and skills"
}`
          : `You are a senior HR talent acquisition specialist. Evaluate the following candidate and return a complete JSON analysis.

Candidate: ${candidateName}
Experience: ${experience} years
Skills: ${skills.join(', ')}

Return ONLY a JSON object (no markdown) with real, thoughtful values based on the candidate above:
{
  "name": "${candidateName}",
  "email": "${email}",
  "experienceYears": ${experience},
  "currentRole": "infer most likely current role based on their skills and experience",
  "department": "infer the most fitting department (Engineering, Marketing, Sales, Finance, HR, Operations, Design, Product)",
  "skills": ${JSON.stringify(skills.length > 0 ? skills : [])},
  "strengths": ["specific strength based on their actual skills", "another specific strength", "third specific strength"],
  "gaps": ["real gap based on their profile", "second gap"],
  "overallScore": <integer 0-100 computed objectively: base 40 + up to 30 for experience + up to 20 for skill breadth + up to 10 for seniority>,
  "hiringStatus": "In Review",
  "recommendation": "one of: Recommend for interview | Consider | Pass",
  "fitAnalysis": "2-3 sentences analysing this specific candidate's fit for technical and leadership roles",
  "suggestedRoles": ["specific role title 1 matching their profile", "specific role title 2"],
  "salaryExpectation": "market salary range for their experience level and skills"
}`;

        const res = await this.ai.chat([
          { role: 'system', content: 'You are an expert HR talent acquisition specialist. Evaluate candidates objectively. Return only valid JSON, no markdown.' },
          { role: 'user', content: prompt },
        ]);
        let text = res.content.trim();
        if (text.startsWith('```')) text = text.replace(/```json?|```/g, '').trim();
        const candidate = JSON.parse(text);
        return { candidate };
      } catch (err) {
        this.logger.warn(`CV parsing AI failed: ${(err as Error).message}`);
      }
    }

    // Fallback — AI was unavailable. Flag this so the UI can warn the user.
    const skillsList = skills.length > 0 ? skills : ['Communication', 'Problem Solving'];
    const score = Math.min(95, 50 + experience * 5 + skillsList.length * 3);

    return {
      candidate: {
        _fallback: true,
        name: candidateName,
        email,
        experienceYears: experience,
        skills: skillsList,
        strengths: [
          `${experience} years of relevant experience`,
          skillsList.length > 2 ? `Diverse skill set including ${skillsList.slice(0, 2).join(' and ')}` : 'Focused technical skills',
          'Clear career progression evident',
        ],
        gaps: experience < 2 ? ['Limited industry experience', 'May need mentoring'] : ['Certifications could strengthen profile'],
        overallScore: score,
        recommendation: score >= 70 ? 'Recommend for interview' : score >= 50 ? 'Consider' : 'Pass',
        fitAnalysis: `${candidateName} brings ${experience} years of experience with skills in ${skillsList.join(', ')}. ${score >= 70 ? 'Strong candidate fit for technical roles.' : 'Consider for junior or entry-level positions.'}`,
        suggestedRoles: [`${skillsList[0] ?? 'General'} Specialist`, `${experience > 3 ? 'Senior' : 'Junior'} ${skillsList[0] ?? 'Team'} Member`],
        salaryExpectation: experience > 5 ? '$80,000 – $110,000' : experience > 2 ? '$55,000 – $75,000' : '$40,000 – $55,000',
      },
    };
  }

  async parseCVFile(data: { fileName: string; content: string }): Promise<{ candidate: any }> {
    let rawText: string;
    try {
      rawText = await this.extractText(data.fileName, data.content);
    } catch (err) {
      throw new Error(`Could not read file "${data.fileName}": ${(err as Error).message}`);
    }

    if (!rawText.trim()) throw new Error('The uploaded file appears to be empty or unreadable.');

    return this.parseCV({ rawText });
  }

  async scheduleInterview(data: {
    candidateName: string;
    position: string;
    startTime: string;
    duration?: number;
    interviewType?: string;
    interviewer?: string;
    candidateEmail?: string;
    tenantId?: string;
  }): Promise<{ success: boolean; event: any; notified: boolean }> {
    const duration = data.duration ?? 60;
    const startDate = new Date(data.startTime);
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

    const formattedTime = startDate.toLocaleString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
    });

    const calendarEvent = {
      id: `hr_interview_${Date.now()}`,
      title: `${data.interviewType ?? 'Interview'}: ${data.candidateName} — ${data.position}`,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      description: `Interview scheduled for ${data.candidateName} for the ${data.position} role. Duration: ${duration} minutes.${data.interviewer ? ` Interviewer: ${data.interviewer}.` : ''}`,
      type: 'interview',
      module: 'hr',
      color: '#6366f1',
      source: 'hr',
      metadata: {
        candidateName: data.candidateName,
        position: data.position,
        interviewType: data.interviewType ?? 'Interview',
        interviewer: data.interviewer,
        duration,
        candidateEmail: data.candidateEmail,
      },
    };

    // Save to internal calendar store
    if (this.calendarService && data.tenantId) {
      try {
        this.calendarService.createEvent(data.tenantId, calendarEvent);
        this.logger.log(`Calendar event created for interview: ${data.candidateName}`);
      } catch (err) {
        this.logger.warn(`Failed to save interview to calendar: ${(err as Error).message}`);
      }
    }

    // Also save to Firestore for persistence
    const db = this.db();
    if (db) {
      const ref = db.collection('hr_interviews').doc();
      await ref.set({ id: ref.id, ...calendarEvent, createdAt: Date.now(), tenantId: data.tenantId });
    }

    // Send confirmation email to candidate
    let notified = false;
    if (data.candidateEmail) {
      try {
        const emailSubject = `Interview Scheduled: ${data.interviewType ?? 'Interview'} for ${data.position}`;
        const emailBody = `Dear ${data.candidateName},

We are pleased to inform you that your interview has been scheduled.

Interview Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━
Position:       ${data.position}
Interview Type: ${data.interviewType ?? 'Interview'}
Date & Time:    ${formattedTime}
Duration:       ${duration} minutes${data.interviewer ? `\nInterviewer:    ${data.interviewer}` : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━

Please ensure you are available at the scheduled time. If you need to reschedule or have any questions, please contact our HR team promptly.

We look forward to speaking with you.

Best regards,
HR Team`;

        await this.mail.sendEmail({
          to: data.candidateEmail,
          subject: emailSubject,
          text: emailBody,
          html: `<div style="font-family:sans-serif;line-height:1.7;color:#333;max-width:600px;margin:0 auto;padding:32px 24px">
            <h2 style="color:#6366f1;margin-bottom:4px">Interview Scheduled</h2>
            <p style="color:#666;margin-top:0">Dear <strong>${data.candidateName}</strong>,</p>
            <p>We are pleased to inform you that your interview has been scheduled.</p>
            <div style="background:#f8f7ff;border:1px solid #e0e0ff;border-radius:12px;padding:20px;margin:24px 0">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:6px 0;color:#888;font-size:13px;width:140px">Position</td><td style="padding:6px 0;font-weight:600">${data.position}</td></tr>
                <tr><td style="padding:6px 0;color:#888;font-size:13px">Interview Type</td><td style="padding:6px 0;font-weight:600">${data.interviewType ?? 'Interview'}</td></tr>
                <tr><td style="padding:6px 0;color:#888;font-size:13px">Date &amp; Time</td><td style="padding:6px 0;font-weight:600">${formattedTime}</td></tr>
                <tr><td style="padding:6px 0;color:#888;font-size:13px">Duration</td><td style="padding:6px 0;font-weight:600">${duration} minutes</td></tr>
                ${data.interviewer ? `<tr><td style="padding:6px 0;color:#888;font-size:13px">Interviewer</td><td style="padding:6px 0;font-weight:600">${data.interviewer}</td></tr>` : ''}
              </table>
            </div>
            <p style="color:#555;font-size:14px">Please ensure you are available at the scheduled time. If you need to reschedule or have any questions, contact our HR team promptly.</p>
            <p style="color:#555;font-size:14px">We look forward to speaking with you.</p>
            <p style="color:#888;font-size:13px;margin-top:32px;border-top:1px solid #eee;padding-top:16px">Best regards,<br/><strong>HR Team</strong></p>
          </div>`,
        });
        notified = true;
        this.logger.log(`Interview confirmation email sent to ${data.candidateEmail}`);
      } catch (err) {
        this.logger.warn(`Failed to send interview confirmation email: ${(err as Error).message}`);
      }
    }

    return { success: true, event: calendarEvent, notified };
  }

  async getDigitalTwin(employeeId: string): Promise<Record<string, unknown>> {
    const db = this.db();
    let employee: Record<string, unknown> | null = null;
    if (db && employeeId && employeeId !== 'active_employee') {
      employee = await this.getEmployeeById(employeeId);
    }

    const name = String(employee?.name ?? 'Employee');

    // Check for real pulse survey responses before generating AI data
    let realPulseResults: Record<string, unknown> | null = null;
    if (db && employeeId && employeeId !== 'active_employee') {
      try {
        const responseSnap = await db.collection('hr_pulse_responses').doc(employeeId).get();
        if (responseSnap.exists) {
          realPulseResults = responseSnap.data() as Record<string, unknown>;
        }
      } catch (err) {
        this.logger.warn(`Failed to fetch real pulse responses: ${(err as Error).message}`);
      }
    }

    const pulseSurveyBlock = realPulseResults
      ? `REAL PULSE DATA (use exactly, do not modify): overallSatisfaction=${realPulseResults['overallSatisfaction']}, workLifeBalance=${realPulseResults['workLifeBalance']}, managementRating=${realPulseResults['managementRating']}, teamCohesion=${realPulseResults['teamCohesion']}, growthOpportunities=${realPulseResults['growthOpportunities']}, lastSurveyDate="${realPulseResults['respondedAt'] ? new Date(Number(realPulseResults['respondedAt'])).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}"`
      : `Generate realistic numbers for pulseSurveyResults (overallSatisfaction, workLifeBalance, managementRating, teamCohesion, growthOpportunities, lastSurveyDate)`;

    if (this.ai?.isAvailable()) {
      try {
        const prompt = `Generate a realistic AI Digital Twin profile for ${name}, an employee${employee?.department ? ` in ${employee.department}` : ''}.

${pulseSurveyBlock}

Return JSON:
{
  "employeeId": "${employeeId}",
  "employeeName": "${name}",
  "productivityScore": 82,
  "attritionRisk": 0.15,
  "sentimentTrend": "improving",
  "location": "UTC+5:30",
  "topSkills": ["skill1", "skill2", "skill3"],
  "growthAreas": ["area1", "area2"],
  "predictedCareerPath": "role in 1-2 years",
  "aiRecommendations": ["recommendation1", "recommendation2", "recommendation3"],
  "pulseSurveyResults": {
    "overallSatisfaction": 78,
    "workLifeBalance": 72,
    "managementRating": 80,
    "teamCohesion": 85,
    "growthOpportunities": 70,
    "lastSurveyDate": "${new Date().toISOString().split('T')[0]}"
  },
  "hasRealSurveyData": ${realPulseResults !== null},
  "onboardingChecklist": [
    {"item": "Complete HR paperwork", "completed": true},
    {"item": "Set up workstation & accounts", "completed": true},
    {"item": "Meet team & manager", "completed": true},
    {"item": "Complete compliance training", "completed": false},
    {"item": "30-day performance check-in", "completed": false}
  ]
}`;

        const res = await this.ai.chat([
          { role: 'system', content: 'You are an HR AI generating employee digital twin profiles. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ]);
        let text = res.content.trim();
        if (text.startsWith('```')) text = text.replace(/```json?|```/g, '').trim();
        const parsed = JSON.parse(text);
        // Always override pulseSurveyResults with real data if it exists
        if (realPulseResults) {
          parsed.pulseSurveyResults = {
            overallSatisfaction: realPulseResults['overallSatisfaction'],
            workLifeBalance: realPulseResults['workLifeBalance'],
            managementRating: realPulseResults['managementRating'],
            teamCohesion: realPulseResults['teamCohesion'],
            growthOpportunities: realPulseResults['growthOpportunities'],
            lastSurveyDate: realPulseResults['respondedAt']
              ? new Date(Number(realPulseResults['respondedAt'])).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0],
          };
          parsed.hasRealSurveyData = true;
        }
        return parsed;
      } catch (err) {
        this.logger.warn(`Digital twin AI failed: ${(err as Error).message}`);
      }
    }

    const fallback: Record<string, unknown> = {
      employeeId,
      employeeName: name,
      productivityScore: 78,
      attritionRisk: 0.12,
      sentimentTrend: 'stable',
      location: 'UTC+5:30',
      topSkills: employee?.department ? [String(employee.department), 'Communication', 'Problem Solving'] : ['Communication', 'Problem Solving', 'Teamwork'],
      growthAreas: ['Leadership', 'Advanced Analytics'],
      predictedCareerPath: 'Senior Team Lead',
      aiRecommendations: [
        'Schedule a career development conversation in the next 30 days',
        'Enroll in a leadership development program',
        'Assign mentorship responsibilities to accelerate growth',
      ],
      pulseSurveyResults: realPulseResults
        ? {
            overallSatisfaction: realPulseResults['overallSatisfaction'],
            workLifeBalance: realPulseResults['workLifeBalance'],
            managementRating: realPulseResults['managementRating'],
            teamCohesion: realPulseResults['teamCohesion'],
            growthOpportunities: realPulseResults['growthOpportunities'],
            lastSurveyDate: realPulseResults['respondedAt']
              ? new Date(Number(realPulseResults['respondedAt'])).toISOString().split('T')[0]
              : new Date().toISOString().split('T')[0],
          }
        : {
            overallSatisfaction: 76,
            workLifeBalance: 70,
            managementRating: 80,
            teamCohesion: 82,
            growthOpportunities: 65,
            lastSurveyDate: new Date().toISOString().split('T')[0],
          },
      hasRealSurveyData: realPulseResults !== null,
      onboardingChecklist: [
        { item: 'Complete HR paperwork', completed: true },
        { item: 'Set up workstation & accounts', completed: true },
        { item: 'Meet team & manager', completed: true },
        { item: 'Complete compliance training', completed: false },
        { item: '30-day performance check-in', completed: false },
      ],
    };
    return fallback;
  }

  async saveJobDescription(tenantId: string, jd: Record<string, unknown>): Promise<{ id: string }> {
    const db = this.db();
    if (!db) throw new Error('Firestore not initialised');
    const ref = db.collection('hr_job_descriptions').doc();
    await ref.set({ id: ref.id, tenantId, ...jd, savedAt: Date.now() });
    return { id: ref.id };
  }

  async getSavedJobDescriptions(tenantId: string): Promise<any[]> {
    const db = this.db();
    if (!db) return [];
    const snap = await db.collection('hr_job_descriptions')
      .where('tenantId', '==', tenantId)
      .limit(50)
      .get()
      .catch(() => null);
    if (!snap) return [];
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  }

  async deleteJobDescription(tenantId: string, id: string): Promise<{ success: boolean }> {
    const db = this.db();
    if (!db) return { success: false };
    const ref = db.collection('hr_job_descriptions').doc(id);
    const snap = await ref.get().catch(() => null);
    if (!snap?.exists || snap.data()?.tenantId !== tenantId) return { success: false };
    await ref.delete();
    return { success: true };
  }

  async submitPulseSurveyResponse(data: {
    employeeId: string;
    tenantId: string;
    scores: {
      overallSatisfaction: number;
      workLifeBalance: number;
      managementRating: number;
      teamCohesion: number;
      growthOpportunities: number;
    };
  }): Promise<{ success: boolean }> {
    const db = this.db();
    if (!db) return { success: false };

    // Validate scores are 0-100
    const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
    const scores = {
      overallSatisfaction: clamp(data.scores.overallSatisfaction),
      workLifeBalance: clamp(data.scores.workLifeBalance),
      managementRating: clamp(data.scores.managementRating),
      teamCohesion: clamp(data.scores.teamCohesion),
      growthOpportunities: clamp(data.scores.growthOpportunities),
      respondedAt: Date.now(),
      employeeId: data.employeeId,
      tenantId: data.tenantId,
    };

    // Upsert into hr_pulse_responses keyed by employeeId — latest response wins
    await db.collection('hr_pulse_responses').doc(data.employeeId).set(scores);

    // Also log to audit trail
    await db.collection('hr_pulse_surveys').add({
      employeeId: data.employeeId,
      tenantId: data.tenantId,
      status: 'completed',
      scores,
      respondedAt: Date.now(),
      type: 'engagement',
    });

    this.logger.log(`Pulse survey response saved for employee ${data.employeeId}`);
    return { success: true };
  }

  // ── Onboarding Management ─────────────────────────────────────────────────

  async getOnboardingProgress(employeeId: string, tenantId?: string): Promise<any> {
    const db = this.db();
    if (!db) return null;

    const ref = db.collection('hr_onboarding').doc(employeeId);
    const snap = await ref.get();

    if (snap.exists) {
      return { employeeId, ...snap.data() };
    }

    // Fetch employee details for personalization
    const employee = await this.getEmployeeById(employeeId);
    const name = String(employee?.name ?? 'Employee');
    const department = String(employee?.department ?? 'General');
    const position = String(employee?.position ?? 'Employee');

    const fallbackChecklist = [
      { id: 'paperwork', item: 'Complete HR paperwork', completed: false, category: 'Admin' },
      { id: 'workstation', item: 'Set up workstation & accounts', completed: false, category: 'IT' },
      { id: 'team_intro', item: 'Meet team & manager', completed: false, category: 'Culture' },
      { id: 'compliance', item: 'Complete compliance training', completed: false, category: 'Legal' },
      { id: 'checkin_30', item: '30-day performance check-in', completed: false, category: 'Performance' },
      { id: 'checkin_60', item: '60-day project integration review', completed: false, category: 'Performance' },
      { id: 'checkin_90', item: '90-day goal setting & career discussion', completed: false, category: 'Performance' },
    ];

    let checklist = fallbackChecklist;

    if (this.ai?.isAvailable()) {
      try {
        const res = await this.ai.chat([
          {
            role: 'system',
            content: 'You are an HR onboarding specialist. Generate a 7-step personalized onboarding checklist as a JSON array. Each item must have: {"id": "short_snake_case_id", "item": "Task title (max 60 chars)", "completed": false, "category": "Admin|IT|Culture|Legal|Performance|Role"}. Return ONLY the JSON array, no explanation.',
          },
          {
            role: 'user',
            content: `Generate a personalized 7-step onboarding checklist for ${name}, a ${position} in the ${department} department. Make the tasks specific to their role — for example a Developer should get tasks like "Set up GitHub access & dev environment", while an HR Manager should get tasks like "Review current HR policies & handbook". Use the fallback generic tasks only for items that truly apply to all roles (compliance, 30/60/90-day check-ins).`,
          },
        ]);
        let text = res.content.trim();
        if (text.startsWith('```')) text = text.replace(/```json?|```/g, '').trim();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed) && parsed.length >= 5) {
          checklist = parsed.map((item: any, idx: number) => ({
            id: String(item.id || `task_${idx}`),
            item: String(item.item ?? ''),
            completed: false,
            category: String(item.category ?? 'General'),
          }));
        }
      } catch (err) {
        this.logger.warn(`AI onboarding personalization failed, using default checklist: ${(err as Error).message}`);
      }
    }

    const onboardingData = {
      employeeId,
      tenantId,
      employeeName: name,
      department,
      position,
      status: 'active',
      progress: 0,
      checklist,
      aiPersonalized: checklist !== fallbackChecklist,
      startDate: new Date().toISOString(),
      updatedAt: Date.now(),
    };

    await ref.set(onboardingData);
    return onboardingData;
  }

  async updateOnboardingTask(employeeId: string, taskId: string, completed: boolean): Promise<any> {
    const db = this.db();
    if (!db) return null;

    const ref = db.collection('hr_onboarding').doc(employeeId);
    const snap = await ref.get();
    if (!snap.exists) return null;

    const data = snap.data() as any;
    const checklist = (data.checklist || []).map((item: any) => 
      item.id === taskId ? { ...item, completed, completedAt: completed ? Date.now() : null } : item
    );

    const completedCount = checklist.filter((i: any) => i.completed).length;
    const progress = Math.round((completedCount / checklist.length) * 100);

    await ref.update({ checklist, progress, updatedAt: Date.now() });
    return { ...data, checklist, progress };
  }

  async triggerEmploymentContract(employeeId: string, tenantId?: string): Promise<any> {
    if (!this.contractsService) throw new Error('Contracts service not available');

    const employee = await this.getEmployeeById(employeeId);
    if (!employee) throw new Error('Employee not found');

    // Dynamically fetch the tenant's actual company name
    let employerName = 'Your Company';
    const db = this.db();
    if (db && tenantId) {
      try {
        const tenantSnap = await db.collection('tenants').doc(tenantId).get();
        if (tenantSnap.exists) {
          const tenantData = tenantSnap.data();
          employerName = String(tenantData?.name || tenantData?.companyName || employerName);
        }
      } catch (err) {
        this.logger.warn(`Could not fetch tenant company name: ${(err as Error).message}`);
      }
    }

    const contract = await this.contractsService.createContract({
      title: `Employment Agreement — ${employee.name}`,
      type: 'employment',
      organizationId: tenantId,
      sourceModule: 'hr',
      sourceEntityId: employeeId,
      templateVariables: {
        employeeName: String(employee.name),
        employerName,
        position: String(employee.position || 'Specialist'),
        startDate: new Date().toLocaleDateString(),
        salary: 'As per offer letter',
        currency: 'USD'
      },
      signers: [
        { name: String(employee.name), email: String(employee.email || ''), role: 'employee', phone: String((employee as any).phone || '') }
      ]
    });

    // Send the contract immediately (this triggers notifications in ContractsService)
    await this.contractsService.sendContract(contract._id);

    // Log in audit trail
    await this.logAttendance({
      employeeId,
      tenantId,
      type: 'contract_generated',
      contractId: contract._id,
      note: 'Employment contract generated and sent via AI Onboarding Assistant'
    });

    return contract;
  }

  async generateWelcomeEmail(employeeId: string, tenantId?: string): Promise<{ subject: string; body: string; employeeEmail: string; employeeName: string }> {
    const employee = await this.getEmployeeById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const name = String(employee.name ?? 'New Hire');
    const dept = String(employee.department ?? '');
    const position = String(employee.position ?? '');
    const email = String(employee.email ?? '');

    // Fetch company name for personalisation
    let companyName = 'the team';
    const db = this.db();
    if (db && tenantId) {
      try {
        const snap = await db.collection('tenants').doc(tenantId).get();
        if (snap.exists) companyName = String(snap.data()?.name || companyName);
      } catch { /* ignore */ }
    }

    const contextHint = [position, dept].filter(Boolean).join(' in ');
    const prompt = `Write a warm, professional onboarding welcome email for ${name}${contextHint ? `, a ${contextHint}` : ''}, joining ${companyName}.
The email should:
- Welcome them enthusiastically
- Briefly describe what to expect in their first week (team intros, tool setup, first project)
- Encourage them to ask any questions
- End with a warm sign-off from the HR team

Return ONLY a JSON object with two fields:
{"subject": "...", "body": "..."}
The body should be plain text (not HTML), with clear paragraphs separated by blank lines.`;

    let subject = `Welcome to ${companyName}, ${name}!`;
    let body = `Dear ${name},\n\nWelcome to ${companyName}! We're thrilled to have you join us${contextHint ? ` as our new ${contextHint}` : ''}.\n\nYour first week will include team introductions, setting up your tools and workspace, and an overview of your role and our processes. We've planned a smooth onboarding experience to help you settle in quickly.\n\nPlease don't hesitate to reach out if you have any questions — we're here to help every step of the way.\n\nWarm regards,\nThe HR Team`;

    if (this.ai?.isAvailable()) {
      try {
        const res = await this.ai.chat([
          { role: 'system', content: 'You are an HR email writer. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ]);
        let text = res.content.trim();
        if (text.startsWith('```')) text = text.replace(/```json?|```/g, '').trim();
        const parsed = JSON.parse(text);
        if (parsed.subject && parsed.body) {
          subject = parsed.subject;
          body = parsed.body;
        }
      } catch (err) {
        this.logger.warn(`Welcome email AI generation failed: ${(err as Error).message}`);
      }
    }

    return { subject, body, employeeEmail: email, employeeName: name };
  }

  async sendWelcomeEmailToEmployee(employeeId: string, subject: string, body: string, tenantId?: string): Promise<{ success: boolean; sentTo: string }> {
    const employee = await this.getEmployeeById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const email = String(employee.email ?? '');
    if (!email) throw new Error('Employee has no email address on file');

    await this.mail.sendEmail({
      to: email,
      subject,
      text: body,
      html: `<div style="font-family:sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px">${body.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br/>')}</div>`,
    });

    // Log in audit trail
    const db = this.db();
    if (db) {
      await db.collection('hr_attendance').add({
        employeeId,
        tenantId,
        type: 'welcome_email_sent',
        sentTo: email,
        subject,
        note: 'Welcome email sent via AI Onboarding Assistant',
        createdAt: Date.now(),
      });
    }

    this.logger.log(`Welcome email sent to ${email} for employee ${employeeId}`);
    return { success: true, sentTo: email };
  }

  async sendPulseSurvey(employeeId: string, tenantId?: string): Promise<any> {
    const employee = await this.getEmployeeById(employeeId);
    if (!employee) throw new Error('Employee not found');

    const hasEmail = Boolean(employee.email);
    const hasPhone = Boolean((employee as any).phone);

    if (!hasEmail && !hasPhone) {
      throw new Error(`${employee.name} has no email or phone number on file. Add contact info before sending a pulse survey.`);
    }

    this.logger.log(`Pulse survey triggered for ${employee.name} (${employeeId})`);

    const surveyUrl = `https://app.myflynai.com/surveys/pulse?id=${employeeId}&tid=${tenantId}`;
    const message = `Hi ${employee.name}, we'd love to hear how you're doing. Please take 1 minute to fill out our pulse survey: ${surveyUrl}`;

    const channels: string[] = [];

    // 1. Send Email
    if (hasEmail) {
      this.mail.sendNotification(
        String(employee.email),
        'Quick Pulse Survey — 1 Minute Check-In',
        message
      ).catch(err => this.logger.error(`Failed to send pulse survey email: ${err.message}`));
      channels.push('Email');
    }

    // 2. Send WhatsApp
    if (hasPhone && tenantId) {
      this.channels.broadcastWhatsApp(
        tenantId,
        [{ phone: String((employee as any).phone), name: String(employee.name) }],
        message
      ).catch(err => this.logger.error(`Failed to send pulse survey WhatsApp: ${err.message}`));
      channels.push('WhatsApp');
    }

    // Record the event
    const db = this.db();
    if (db) {
      await db.collection('hr_pulse_surveys').add({
        employeeId,
        tenantId,
        status: 'sent',
        sentAt: Date.now(),
        channels,
        type: 'engagement',
      });
    }

    return {
      success: true,
      channels,
      message: `Pulse survey sent to ${employee.name} via ${channels.join(' and ')}.`,
    };
  }

  async hireCandidate(candidateData: any, tenantId?: string): Promise<any> {
    const employee = await this.createEmployee({
      name: candidateData.name,
      email: candidateData.email,
      role: candidateData.currentRole || candidateData.positionApplied || candidateData.suggestedRoles?.[0] || 'Employee',
      position: candidateData.currentRole || candidateData.positionApplied || candidateData.suggestedRoles?.[0] || 'Employee',
      department: candidateData.department || 'General',
      skills: candidateData.skills || [],
      phone: candidateData.phone || '',
      education: candidateData.education || '',
      experienceYears: candidateData.experienceYears || 0,
      salaryExpectation: candidateData.salaryExpectation || '',
      startDate: new Date().toISOString().split('T')[0],
      status: 'active',
      tenantId,
    });

    const employeeId = String(employee.id || employee._id);

    // Start Onboarding
    await this.getOnboardingProgress(employeeId, tenantId);

    // Trigger Contract
    await this.triggerEmploymentContract(employeeId, tenantId);

    return { success: true, employee };
  }

  async addAsCandidate(candidateData: any, tenantId?: string): Promise<any> {
    const employee = await this.createEmployee({
      name: candidateData.name,
      email: candidateData.email,
      role: candidateData.currentRole || candidateData.suggestedRoles?.[0] || 'Candidate',
      position: candidateData.currentRole || candidateData.suggestedRoles?.[0] || 'Candidate',
      department: candidateData.department || 'General',
      skills: candidateData.skills || [],
      phone: candidateData.phone || '',
      education: candidateData.education || '',
      experienceYears: candidateData.experienceYears || 0,
      salaryExpectation: candidateData.salaryExpectation || '',
      status: 'In Review',
      tenantId,
    });

    return { success: true, employee };
  }

  async matchCandidateToJob(data: {
    candidate: any;
    jobTitle: string;
    department: string;
    jobDescription?: string;
  }): Promise<{ matchScore: number; matchedSkills: string[]; missingSkills: string[]; interviewQuestions: string[]; fitSummary: string }> {
    const { candidate, jobTitle, department, jobDescription } = data;

    if (this.ai?.isAvailable()) {
      try {
        const prompt = `You are a senior HR recruiter. Analyse how well this candidate matches the job opening and return a JSON evaluation.

CANDIDATE:
- Name: ${candidate.name}
- Current Role: ${candidate.currentRole || 'N/A'}
- Experience: ${candidate.experienceYears || 0} years
- Skills: ${(candidate.skills || []).join(', ')}
- Education: ${candidate.education || 'N/A'}
- Department: ${candidate.department || 'N/A'}

JOB OPENING:
- Title: ${jobTitle}
- Department: ${department}
${jobDescription ? `- Description: ${jobDescription}` : ''}

Return ONLY a JSON object:
{
  "matchScore": <integer 0-100 based on how well candidate skills/experience match this specific role>,
  "matchedSkills": ["skills the candidate has that are relevant to this role"],
  "missingSkills": ["important skills for this role the candidate lacks"],
  "interviewQuestions": ["tailored question 1 based on their background?", "tailored question 2?", "tailored question 3?"],
  "fitSummary": "2-3 sentence honest assessment of this candidate's fit for THIS specific role"
}`;

        const res = await this.ai.chat([
          { role: 'system', content: 'You are a senior HR recruiter. Return only valid JSON, no markdown.' },
          { role: 'user', content: prompt },
        ]);
        let text = res.content.trim();
        if (text.startsWith('```')) text = text.replace(/```json?|```/g, '').trim();
        return JSON.parse(text);
      } catch (err) {
        this.logger.warn(`Job match AI failed: ${(err as Error).message}`);
      }
    }

    const candidateSkills: string[] = candidate.skills || [];
    return {
      matchScore: 65,
      matchedSkills: candidateSkills.slice(0, 3),
      missingSkills: ['Domain certification', 'Advanced tooling experience'],
      interviewQuestions: [
        `Tell me about a project where you applied ${candidateSkills[0] || 'your skills'} to solve a real problem.`,
        `How do you approach challenges in a ${department} environment?`,
        'Describe a time you had to quickly learn a new skill or process.',
      ],
      fitSummary: `${candidate.name} has ${candidate.experienceYears || 0} years of experience which partially aligns with the ${jobTitle} role. Their background shows potential but some skill gaps exist.`,
    };
  }

  async getPerformanceReviews(employeeId: string): Promise<any[]> {
    const db = this.db();
    if (db) {
      const snap = await db.collection('hr_performance_reviews')
        .where('employeeId', '==', employeeId)
        .orderBy('createdAt', 'desc')
        .limit(5)
        .get()
        .catch(() => null);
      if (snap && !snap.empty) {
        return snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
    }

    return [
      { period: 'Q1 2026', overallRating: 4.2, summary: 'Consistently exceeds expectations. Strong technical skills and collaboration.', status: 'acknowledged' },
      { period: 'Q4 2025', overallRating: 3.8, summary: 'Met all targets. Shows initiative in problem-solving. Good communication.', status: 'acknowledged' },
      { period: 'Q3 2025', overallRating: 4.0, summary: 'Delivered key project milestones. Team player with positive attitude.', status: 'acknowledged' },
    ];
  }

  async getEmployeeSkills(employeeId: string): Promise<{ skills: any[] }> {
    const db = this.db();
    if (db) {
      const emp = await this.getEmployeeById(employeeId);
      if (emp?.skills && Array.isArray(emp.skills)) {
        return { skills: emp.skills };
      }
    }

    return {
      skills: [
        { name: 'Project Management', level: 'Advanced', years: 4 },
        { name: 'Communication', level: 'Expert', years: 6 },
        { name: 'Data Analysis', level: 'Intermediate', years: 2 },
        { name: 'Leadership', level: 'Advanced', years: 3 },
      ],
    };
  }

  async getPayrollSummary(tenantId?: string): Promise<Record<string, unknown>> {
    const db = this.db();
    let employees: Record<string, unknown>[] = [];
    if (db) {
      let q: FirebaseFirestore.Query = db.collection(this.COLLECTION);
      if (tenantId) q = q.where('tenantId', '==', tenantId);
      employees = (await q.get()).docs.map(d => d.data());
    }

    const active = employees.filter(e => ((e as Record<string, unknown>)['status'] ?? 'active') === 'active');

    // Sum real monthly salaries; flag employees missing salary data
    let totalMonthly = 0;
    const missingPayData: Record<string, unknown>[] = [];
    for (const e of active) {
      const monthlySalary = Number((e as Record<string, unknown>)['salary'] ?? 0);
      if (monthlySalary > 0) {
        totalMonthly += monthlySalary;
      } else {
        missingPayData.push(e);
      }
    }
    const totalAnnual = totalMonthly * 12;

    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const nextPayrollDate = nextMonth.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    const deptMap: Record<string, { headcount: number; monthlyCost: number }> = {};
    for (const e of employees) {
      const emp = e as Record<string, unknown>;
      const dept = String(emp['department'] ?? 'General');
      if (!deptMap[dept]) deptMap[dept] = { headcount: 0, monthlyCost: 0 };
      deptMap[dept].headcount++;
      deptMap[dept].monthlyCost += Number(emp['salary'] ?? 0);
    }

    return {
      activeEmployees: active.length,
      estimatedTotalPayroll: totalAnnual,
      estimatedMonthlyPayroll: totalMonthly,
      missingPayData,
      nextPayrollDate,
      currency: 'USD',
      departmentCosts: Object.entries(deptMap).map(([department, { headcount, monthlyCost }]) => ({
        department,
        headcount,
        estimatedMonthlyCost: monthlyCost,
        estimatedCost: monthlyCost * 12,
      })),
    };
  }

  async getLeaveRequests(opts: { employeeId?: string; tenantId?: string }): Promise<Record<string, unknown>[]> {
    const db = this.db();
    if (!db) return [];
    let query: FirebaseFirestore.Query = db.collection('hr_leave_requests');
    if (opts.tenantId) query = query.where('tenantId', '==', opts.tenantId);
    if (opts.employeeId) query = query.where('employeeId', '==', opts.employeeId);
    const snap = await query.orderBy('createdAt', 'desc').limit(50).get().catch(() => null);
    if (!snap) return [];
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async getInterviews(tenantId?: string): Promise<Record<string, unknown>[]> {
    const db = this.db();
    if (!db) return [];
    let query: FirebaseFirestore.Query = db.collection('hr_interviews');
    if (tenantId) query = query.where('tenantId', '==', tenantId);
    const snap = await query.orderBy('createdAt', 'desc').limit(100).get().catch(() => null);
    if (!snap) return [];
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async createLeaveRequest(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = this.db();
    if (!db) throw new Error('Firestore not initialised');
    const ref = db.collection('hr_leave_requests').doc();
    const record = { id: ref.id, ...data, status: 'pending', createdAt: Date.now() };
    await ref.set(record);

    // Sync leave period to calendar
    if (this.calendarService && data.tenantId && data.startDate) {
      try {
        const startDate = String(data.startDate).slice(0, 10);
        const endDate = data.endDate ? String(data.endDate).slice(0, 10) : startDate;
        const employeeName = String(data.employeeId ?? data.employee ?? 'Employee');
        const leaveType = String(data.type ?? 'Leave');
        this.calendarService.createEvent(String(data.tenantId), {
          id: `hr_leave_${ref.id}`,
          title: `${employeeName} — ${leaveType}`,
          start: new Date(`${startDate}T09:00:00`).toISOString(),
          end: new Date(`${endDate}T18:00:00`).toISOString(),
          description: `${leaveType} request for ${employeeName}. Status: pending.${data.reason ? ` Reason: ${data.reason}` : ''}`,
          type: 'leave',
          module: 'hr',
          color: '#f59e0b',
          source: 'hr',
          allDay: true,
          metadata: { leaveId: ref.id, employeeId: data.employeeId, leaveType, status: 'pending' },
        });
      } catch (err: any) {
        this.logger.warn(`Calendar sync failed for leave request: ${err.message}`);
      }
    }

    return record;
  }

  async logAttendance(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    const db = this.db();
    if (!db) throw new Error('Firestore not initialised');
    const ref = db.collection('hr_attendance').doc();
    const record = { id: ref.id, ...data, createdAt: Date.now() };
    await ref.set(record);
    return record;
  }

  // ── Skill Heatmap ────────────────────────────────────────────────────────────

  async getCompanySkillsHeatmap(tenantId?: string): Promise<{
    skills: Array<{ name: string; category: string; count: number; avgLevel: number; employees: string[] }>;
    departments: string[];
    matrix: Record<string, Record<string, number>>;
  }> {
    const db = this.db();
    const LEVEL_MAP: Record<string, number> = { Beginner: 1, Intermediate: 2, Advanced: 3, Expert: 4 };

    if (db) {
      let q: FirebaseFirestore.Query = db.collection(this.COLLECTION);
      if (tenantId) q = q.where('tenantId', '==', tenantId);
      const snap = await q.limit(200).get().catch(() => null);

      if (snap && !snap.empty) {
        const skillMap: Record<string, { count: number; totalLevel: number; employees: string[]; category: string }> = {};
        const deptSkillMatrix: Record<string, Record<string, number>> = {};
        const departments = new Set<string>();

        for (const doc of snap.docs) {
          const emp = doc.data() as any;
          const dept = String(emp.department ?? 'General');
          departments.add(dept);
          if (!deptSkillMatrix[dept]) deptSkillMatrix[dept] = {};

          const skills: any[] = Array.isArray(emp.skills) ? emp.skills : [];
          for (const skill of skills) {
            const name = String(skill.name ?? skill);
            const level = LEVEL_MAP[String(skill.level ?? 'Intermediate')] ?? 2;
            const cat = String(skill.category ?? 'General');
            if (!skillMap[name]) skillMap[name] = { count: 0, totalLevel: 0, employees: [], category: cat };
            skillMap[name].count++;
            skillMap[name].totalLevel += level;
            skillMap[name].employees.push(String(emp.name ?? 'Unknown'));
            deptSkillMatrix[dept][name] = Math.max(deptSkillMatrix[dept][name] ?? 0, level);
          }
        }

        return {
          skills: Object.entries(skillMap).map(([name, v]) => ({
            name,
            category: v.category,
            count: v.count,
            avgLevel: Math.round((v.totalLevel / v.count) * 10) / 10,
            employees: v.employees.slice(0, 5),
          })).sort((a, b) => b.count - a.count),
          departments: [...departments],
          matrix: deptSkillMatrix,
        };
      }
    }

    // Fallback sample data
    return {
      skills: [
        { name: 'JavaScript', category: 'Engineering', count: 8, avgLevel: 3.2, employees: ['Alice', 'Bob', 'Carol'] },
        { name: 'Project Management', category: 'Management', count: 6, avgLevel: 3.5, employees: ['Dave', 'Eve'] },
        { name: 'Python', category: 'Engineering', count: 5, avgLevel: 2.8, employees: ['Frank', 'Grace'] },
        { name: 'UI/UX Design', category: 'Design', count: 4, avgLevel: 3.0, employees: ['Heidi', 'Ivan'] },
        { name: 'Data Analysis', category: 'Analytics', count: 7, avgLevel: 2.5, employees: ['Judy', 'Karl'] },
        { name: 'Communication', category: 'Soft Skills', count: 12, avgLevel: 3.8, employees: ['Alice', 'Dave', 'Eve'] },
        { name: 'Leadership', category: 'Management', count: 4, avgLevel: 3.0, employees: ['Judy'] },
        { name: 'SQL', category: 'Engineering', count: 6, avgLevel: 2.6, employees: ['Karl', 'Grace'] },
        { name: 'Customer Success', category: 'Sales', count: 3, avgLevel: 3.3, employees: ['Mallory'] },
        { name: 'TypeScript', category: 'Engineering', count: 5, avgLevel: 2.9, employees: ['Alice', 'Bob'] },
      ],
      departments: ['Engineering', 'Design', 'Marketing', 'HR', 'Sales'],
      matrix: {
        Engineering: { JavaScript: 4, Python: 3, TypeScript: 3, SQL: 3 },
        Design: { 'UI/UX Design': 4, Communication: 3 },
        Marketing: { Communication: 4, 'Data Analysis': 3 },
        HR: { Leadership: 4, 'Project Management': 3, Communication: 4 },
        Sales: { 'Customer Success': 4, Communication: 3 },
      },
    };
  }

  // ── Remote Teams / Timezone Widget ──────────────────────────────────────────

  async getRemoteTeams(tenantId?: string): Promise<{
    teams: Array<{ timezone: string; offset: string; region: string; employees: Array<{ name: string; role: string; status: string }> }>;
    totalTimezones: number;
  }> {
    const db = this.db();

    if (db) {
      let q: FirebaseFirestore.Query = db.collection(this.COLLECTION);
      if (tenantId) q = q.where('tenantId', '==', tenantId);
      const snap = await q.limit(200).get().catch(() => null);

      if (snap && !snap.empty) {
        const tzMap: Record<string, { offset: string; region: string; employees: any[] }> = {};

        for (const doc of snap.docs) {
          const emp = doc.data() as any;
          const tz = String(emp.timezone ?? emp.location ?? 'UTC');
          const offset = String(emp.timezoneOffset ?? 'UTC+0');
          const region = String(emp.country ?? emp.region ?? 'Global');
          if (!tzMap[tz]) tzMap[tz] = { offset, region, employees: [] };
          tzMap[tz].employees.push({
            name: String(emp.name ?? 'Team Member'),
            role: String(emp.position ?? emp.role ?? 'Employee'),
            status: String(emp.status ?? 'active'),
          });
        }

        const teams = Object.entries(tzMap).map(([timezone, v]) => ({ timezone, ...v }));
        return { teams, totalTimezones: teams.length };
      }
    }

    // Fallback representative global teams
    return {
      totalTimezones: 6,
      teams: [
        { timezone: 'America/New_York', offset: 'UTC-5', region: 'North America', employees: [
          { name: 'Alex Johnson', role: 'Engineering Lead', status: 'active' },
          { name: 'Sarah Chen', role: 'Product Manager', status: 'active' },
          { name: 'Mark Davis', role: 'Sales Director', status: 'on_leave' },
        ]},
        { timezone: 'Europe/London', offset: 'UTC+0', region: 'Europe', employees: [
          { name: 'Emma Wilson', role: 'UX Designer', status: 'active' },
          { name: 'James Brown', role: 'Backend Engineer', status: 'active' },
        ]},
        { timezone: 'Asia/Dubai', offset: 'UTC+4', region: 'Middle East', employees: [
          { name: 'Aisha Al-Rashid', role: 'HR Manager', status: 'active' },
          { name: 'Omar Hassan', role: 'Finance Analyst', status: 'active' },
        ]},
        { timezone: 'Asia/Kolkata', offset: 'UTC+5:30', region: 'South Asia', employees: [
          { name: 'Priya Sharma', role: 'Full Stack Developer', status: 'active' },
          { name: 'Rahul Gupta', role: 'DevOps Engineer', status: 'active' },
          { name: 'Neha Patel', role: 'Data Scientist', status: 'active' },
        ]},
        { timezone: 'Asia/Singapore', offset: 'UTC+8', region: 'Southeast Asia', employees: [
          { name: 'Li Wei', role: 'Growth Marketer', status: 'active' },
          { name: 'Tan Ming', role: 'Customer Success', status: 'active' },
        ]},
        { timezone: 'Australia/Sydney', offset: 'UTC+10', region: 'Pacific', employees: [
          { name: 'Jack Thompson', role: 'Account Manager', status: 'active' },
        ]},
      ],
    };
  }

  // ── PDF RAG: Policy Documents ─────────────────────────────────────────────

  /** Extract plain text from uploaded file — handles PDF, DOCX, and plain text. */
  private async extractText(fileName: string, base64Content: string): Promise<string> {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
    const buf = Buffer.from(base64Content, 'base64');

    if (ext === 'pdf') {
      try {
        const result = await pdfParse(buf);
        return result.text;
      } catch (e: any) {
        this.logger.warn(`pdf-parse failed for ${fileName}: ${e.message}`);
        throw new Error('Could not parse PDF. Ensure it contains selectable text (not a scanned image).');
      }
    }

    if (ext === 'docx' || ext === 'doc') {
      try {
        const result = await mammoth.extractRawText({ buffer: buf });
        return result.value;
      } catch (e: any) {
        this.logger.warn(`mammoth failed for ${fileName}: ${e.message}`);
        throw new Error('Could not parse Word document.');
      }
    }

    // Plain text / markdown — just decode
    return buf.toString('utf-8');
  }

  async uploadPolicyDocument(data: { tenantId: string; fileName: string; content: string; category?: string }): Promise<{ id: string; success: boolean }> {
    const db = this.db();
    if (!db) return { id: '', success: false };

    // content is a base64-encoded file sent from the browser
    let text: string;
    try {
      text = await this.extractText(data.fileName, data.content);
    } catch (e: any) {
      this.logger.error(`Text extraction failed: ${e.message}`);
      throw e;
    }

    if (!text.trim()) throw new Error('Document appears to be empty or unreadable.');

    // Chunk into overlapping segments for retrieval
    const chunkSize = 1500;
    const overlap = 200;
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      chunks.push(text.slice(i, i + chunkSize));
      if (chunks.length >= 200) break; // hard cap
    }

    const docRef = db.collection('hr_policy_docs').doc();
    await docRef.set({
      id: docRef.id,
      tenantId: data.tenantId,
      fileName: data.fileName,
      category: data.category ?? 'General',
      chunks,
      fullText: text.slice(0, 10000),
      uploadedAt: Date.now(),
    });

    this.logger.log(`Policy doc uploaded: ${data.fileName} (${chunks.length} chunks) for tenant ${data.tenantId}`);
    return { id: docRef.id, success: true };
  }

  async getPolicyDocs(tenantId: string): Promise<any[]> {
    const db = this.db();
    if (!db) return [];
    // No orderBy — avoids composite index requirement. Sort in memory instead.
    const snap = await db.collection('hr_policy_docs')
      .where('tenantId', '==', tenantId)
      .limit(50)
      .get()
      .catch(() => null);
    if (!snap) return [];
    return snap.docs
      .map(d => ({ id: d.id, fileName: d.data().fileName, category: d.data().category, uploadedAt: d.data().uploadedAt }))
      .sort((a, b) => (b.uploadedAt ?? 0) - (a.uploadedAt ?? 0));
  }

  async deletePolicyDoc(tenantId: string, docId: string): Promise<{ success: boolean }> {
    const db = this.db();
    if (!db) return { success: false };
    const ref = db.collection('hr_policy_docs').doc(docId);
    const snap = await ref.get().catch(() => null);
    if (!snap?.exists || snap.data()?.tenantId !== tenantId) return { success: false };
    await ref.delete();
    return { success: true };
  }

  async searchPolicyDocs(tenantId: string, query: string): Promise<string> {
    const db = this.db();
    if (!db) return '';
    const snap = await db.collection('hr_policy_docs')
      .where('tenantId', '==', tenantId)
      .limit(20)
      .get()
      .catch(() => null);
    if (!snap || snap.empty) return '';

    const queryLower = query.toLowerCase();
    // Split into meaningful keywords (length > 2, not stop words)
    const stopWords = new Set(['the','and','for','are','but','not','you','all','can','had','her','was','one','our','out','day','get','has','him','his','how','its','who','did','let','put','too','use','way']);
    const words = queryLower.split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w));

    type ScoredChunk = { score: number; fileName: string; category: string; chunk: string };
    const scored: ScoredChunk[] = [];

    for (const doc of snap.docs) {
      const data = doc.data() as any;
      const chunks: string[] = data.chunks ?? [];
      for (const chunk of chunks) {
        const chunkLower = chunk.toLowerCase();
        let score = 0;
        for (const word of words) {
          // Exact word match scores higher than substring match
          const exactRe = new RegExp(`\\b${word}\\b`);
          if (exactRe.test(chunkLower)) score += 2;
          else if (chunkLower.includes(word)) score += 1;
        }
        // Boost for phrase proximity (query words appearing close together)
        if (words.length >= 2 && chunkLower.includes(words.slice(0, 2).join(' '))) score += 3;
        if (score > 0) scored.push({ score, fileName: data.fileName, category: data.category ?? 'General', chunk });
      }
    }

    if (scored.length === 0) return '';

    // Sort by score descending, deduplicate by fileName, take top 4
    scored.sort((a, b) => b.score - a.score);
    const seen = new Set<string>();
    const top: ScoredChunk[] = [];
    for (const s of scored) {
      if (top.length >= 4) break;
      const key = `${s.fileName}::${s.chunk.slice(0, 50)}`;
      if (!seen.has(key)) { seen.add(key); top.push(s); }
    }

    const sections = top.map(s => `[Policy: ${s.fileName} | Category: ${s.category}]\n${s.chunk}`);
    return `\n\nRELEVANT POLICY DOCUMENTS:\n${sections.join('\n\n---\n\n')}`;
  }
}
