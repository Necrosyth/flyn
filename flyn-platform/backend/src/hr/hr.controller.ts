import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Controller, Get, Post, Put, Delete, Param, Body, Query, UseGuards, Req } from '@nestjs/common';
import { HRService } from './hr.service';
import { AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { Public } from '../billing/guards/public.decorator';

@ApiTags('HR')
@Controller('hr')
@UseGuards(ApiOrFirebaseAuthGuard)
export class HRController {
  constructor(private readonly hrService: HRService) {}

  private tenantId(req: AuthRequest): string {
    return (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '';
  }

  // ── Employees CRUD ─────────────────────────────────────────────────────────

  @Get('employees')
  async getEmployees(
    @Req() req: AuthRequest,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('search') search?: string,
  ) {
    const tenantId = this.tenantId(req);
    return this.hrService.getEmployees({
      tenantId,
      limit: limit ? parseInt(limit) : 200,
      status,
      department,
      search,
    });
  }

  @Get('employees/:id')
  async getEmployee(@Param('id') id: string) {
    return this.hrService.getEmployeeById(id);
  }

  @Post('employees')
  async createEmployee(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    const tenantId = this.tenantId(req);
    return this.hrService.createEmployee({ ...body, tenantId });
  }

  @Put('employees/:id')
  async updateEmployee(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateEmployee(id, body);
  }

  // Also handle POST for update (for compatibility with frontend)
  @Post('employees/:id')
  async updateEmployeePost(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.hrService.updateEmployee(id, body);
  }

  @Delete('employees/:id')
  async deleteEmployee(@Param('id') id: string) {
    return this.hrService.deleteEmployee(id);
  }

  @Get('interviews')
  async getInterviews(@Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.getInterviews(tenantId);
  }

  // ── Stats & Analytics ──────────────────────────────────────────────────────

  @Get('stats')
  async getStats(@Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.getStats(tenantId);
  }

  @Get('analytics')
  async getAnalytics(@Query('range') range?: string) {
    return this.hrService.getAnalytics(range ?? '30d');
  }

  @Get('insights')
  async getInsights() {
    return this.hrService.getInsights();
  }

  // ── Leave & Attendance ────────────────────────────────────────────────────

  @Get('leave-requests')
  async getLeaveRequests(@Req() req: AuthRequest, @Query('employeeId') employeeId?: string) {
    const tenantId = this.tenantId(req);
    return this.hrService.getLeaveRequests({ tenantId, employeeId });
  }

  @Post('leave')
  async createLeaveRequest(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    const tenantId = this.tenantId(req);
    return this.hrService.createLeaveRequest({ ...body, tenantId });
  }

  @Post('attendance')
  async logAttendance(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    const tenantId = this.tenantId(req);
    return this.hrService.logAttendance({ ...body, tenantId });
  }

  // ── Payroll ───────────────────────────────────────────────────────────────

  @Get('payroll/summary')
  async getPayrollSummary(@Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.getPayrollSummary(tenantId);
  }

  // ── AI Policy & General Assistant ─────────────────────────────────────────

  @Post('policies/ask')
  async askPolicy(@Req() req: AuthRequest, @Body() body: { question: string }) {
    const tenantId = this.tenantId(req);
    return this.hrService.askPolicy(body.question, tenantId);
  }

  @Post('ai/respond')
  async aiRespond(@Req() req: AuthRequest, @Body() body: { query: string; category?: string }) {
    const tenantId = this.tenantId(req);
    return this.hrService.runAIRespond(body.query, body.category, tenantId);
  }

  // ── Workforce Forecast ────────────────────────────────────────────────────

  @Get('workforce/forecast')
  async getWorkforceForecast(@Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.getWorkforceForecast(tenantId);
  }

  // ── AI Job Description Generator ─────────────────────────────────────────

  @Post('ai/generate-job-description')
  async generateJobDescription(@Body() body: { title: string; department: string; level?: string; remote?: string }) {
    return this.hrService.generateJobDescription(body);
  }

  @Post('job-descriptions')
  async saveJobDescription(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    const tenantId = this.tenantId(req);
    return this.hrService.saveJobDescription(tenantId, body);
  }

  @Get('job-descriptions')
  async getSavedJobDescriptions(@Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.getSavedJobDescriptions(tenantId);
  }

  @Delete('job-descriptions/:id')
  async deleteJobDescription(@Req() req: AuthRequest, @Param('id') id: string) {
    const tenantId = this.tenantId(req);
    return this.hrService.deleteJobDescription(tenantId, id);
  }

  // ── Talent / CV Parsing & Interviews ─────────────────────────────────────

  @Post('talent/parse-cv')
  async parseCV(@Body() body: { candidateName?: string; email?: string; skills?: string[]; experience?: number; rawText?: string }) {
    return this.hrService.parseCV(body);
  }

  @Post('talent/parse-cv-file')
  async parseCVFile(@Body() body: { fileName: string; content: string }) {
    return this.hrService.parseCVFile(body);
  }

  @Post('talent/schedule-interview')
  async scheduleInterview(
    @Req() req: AuthRequest,
    @Body() body: { candidateName: string; position: string; startTime: string; duration?: number; interviewType?: string; interviewer?: string; candidateEmail?: string },
  ) {
    const tenantId = this.tenantId(req);
    return this.hrService.scheduleInterview({ ...body, tenantId });
  }

  // ── Employee Deep Intelligence ────────────────────────────────────────────

  @Get('employees/:id/digital-twin')
  async getDigitalTwin(@Param('id') id: string) {
    return this.hrService.getDigitalTwin(id);
  }

  @Get('employees/:id/onboarding')
  async getOnboarding(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.getOnboardingProgress(id, tenantId);
  }

  @Post('employees/:id/onboarding/tasks/:taskId')
  async updateOnboardingTask(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() body: { completed: boolean },
  ) {
    return this.hrService.updateOnboardingTask(id, taskId, body.completed);
  }

  @Post('employees/:id/generate-contract')
  async generateContract(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.triggerEmploymentContract(id, tenantId);
  }

  @Post('employees/:id/pulse-survey')
  async sendPulseSurvey(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.sendPulseSurvey(id, tenantId);
  }

  @Public()
  @Post('pulse-surveys/response')
  async submitPulseSurveyResponse(
    @Body() body: {
      employeeId: string;
      tenantId: string;
      scores: {
        overallSatisfaction: number;
        workLifeBalance: number;
        managementRating: number;
        teamCohesion: number;
        growthOpportunities: number;
      };
    },
  ) {
    return this.hrService.submitPulseSurveyResponse(body);
  }

  @Post('employees/:id/welcome-email/generate')
  async generateWelcomeEmail(@Param('id') id: string, @Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.generateWelcomeEmail(id, tenantId);
  }

  @Post('employees/:id/welcome-email/send')
  async sendWelcomeEmail(
    @Param('id') id: string,
    @Body() body: { subject: string; body: string },
    @Req() req: AuthRequest,
  ) {
    const tenantId = this.tenantId(req);
    return this.hrService.sendWelcomeEmailToEmployee(id, body.subject, body.body, tenantId);
  }

  @Post('talent/hire')
  async hireCandidate(@Body() body: any, @Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.hireCandidate(body, tenantId);
  }

  @Post('talent/add-candidate')
  async addAsCandidate(@Body() body: any, @Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.addAsCandidate(body, tenantId);
  }

  @Post('talent/match-job')
  async matchCandidateToJob(@Body() body: { candidate: any; jobTitle: string; department: string; jobDescription?: string }) {
    return this.hrService.matchCandidateToJob(body);
  }

  @Get('employees/:id/performance')
  async getPerformanceReviews(@Param('id') id: string) {
    return this.hrService.getPerformanceReviews(id);
  }

  @Get('employees/:id/skills')
  async getEmployeeSkills(@Param('id') id: string) {
    return this.hrService.getEmployeeSkills(id);
  }

  // ── Company Skill Heatmap ─────────────────────────────────────────────────

  @Get('skills/heatmap')
  async getSkillsHeatmap(@Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.getCompanySkillsHeatmap(tenantId);
  }

  // ── Remote Teams / Timezone Widget ────────────────────────────────────────

  @Get('remote-teams')
  async getRemoteTeams(@Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.getRemoteTeams(tenantId);
  }

  // ── PDF RAG: Policy Documents ─────────────────────────────────────────────

  @Get('policy-docs')
  async getPolicyDocs(@Req() req: AuthRequest) {
    const tenantId = this.tenantId(req);
    return this.hrService.getPolicyDocs(tenantId);
  }

  @Post('policy-docs/upload')
  async uploadPolicyDoc(@Req() req: AuthRequest, @Body() body: { fileName: string; content: string; category?: string }) {
    const tenantId = this.tenantId(req);
    return this.hrService.uploadPolicyDocument({ tenantId, ...body });
  }

  @Delete('policy-docs/:id')
  async deletePolicyDoc(@Req() req: AuthRequest, @Param('id') id: string) {
    const tenantId = this.tenantId(req);
    return this.hrService.deletePolicyDoc(tenantId, id);
  }
}
