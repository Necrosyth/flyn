import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Headers,
  Query,
  UsePipes,
  ValidationPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { CreateSalesInquiryDto } from './dto/create-sales-inquiry.dto';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';

const PIPE = new ValidationPipe({ whitelist: true, transform: true });

@Controller('chatbot')
export class ChatbotController {
  constructor(private readonly chatbotService: ChatbotService) {}

  // ── Public ────────────────────────────────────────────────────────────────

  @Post('session')
  @UsePipes(PIPE)
  @HttpCode(HttpStatus.CREATED)
  async createSession(@Body() dto: CreateSessionDto) {
    return this.chatbotService.createSession(dto);
  }

  @Post('message')
  @UsePipes(PIPE)
  @HttpCode(HttpStatus.OK)
  async sendMessage(@Body() dto: SendMessageDto) {
    return this.chatbotService.sendMessage(dto);
  }

  @Post('ticket')
  @UsePipes(PIPE)
  @HttpCode(HttpStatus.CREATED)
  async createTicket(@Body() dto: CreateTicketDto) {
    return this.chatbotService.createTicket(dto);
  }

  @Post('sales')
  @UsePipes(PIPE)
  @HttpCode(HttpStatus.CREATED)
  async createSalesInquiry(@Body() dto: CreateSalesInquiryDto) {
    return this.chatbotService.createSalesInquiry(dto);
  }

  // ── Admin (Firebase Auth required) ────────────────────────────────────────

  @Get('admin/sessions')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getSessions() {
    const sessions = await this.chatbotService.getSessions();
    return { sessions };
  }

  @Get('admin/sessions/:sessionId/messages')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getSessionMessages(@Param('sessionId') sessionId: string) {
    const messages = await this.chatbotService.getSessionMessages(sessionId);
    return { messages };
  }

  @Get('admin/tickets')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getTickets() {
    const tickets = await this.chatbotService.getTickets();
    return { tickets };
  }

  @Get('admin/sales')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getSalesInquiries() {
    const inquiries = await this.chatbotService.getSalesInquiries();
    return { inquiries };
  }

  @Get('admin/stats')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getDashboardStats() {
    return this.chatbotService.getDashboardStats();
  }

  // ── Knowledge Base ────────────────────────────────────────────────────────

  @Get('knowledge-base')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async getKBArticles(
    @Query('tenantId') queryTenant: string,
    @Headers('x-tenant-id') headerTenant: string,
  ) {
    const tenantId = headerTenant || queryTenant || undefined;
    const articles = await this.chatbotService.getKBArticles(tenantId);
    return { articles };
  }

  @Post('knowledge-base')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createKBArticle(
    @Body() body: { tenantId?: string; title: string; category: string; content: string; excerpt?: string },
    @Headers('x-tenant-id') headerTenant: string,
  ) {
    const tenantId = headerTenant || body.tenantId || '';
    const article = await this.chatbotService.createKBArticle(tenantId, body);
    return { article };
  }

  @Put('knowledge-base/:id')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async updateKBArticle(
    @Param('id') id: string,
    @Body() body: { tenantId?: string; title?: string; category?: string; content?: string; excerpt?: string; isPublished?: boolean },
    @Headers('x-tenant-id') headerTenant: string,
  ) {
    const tenantId = headerTenant || body.tenantId || '';
    const article = await this.chatbotService.updateKBArticle(tenantId, id, body);
    return { article };
  }

  @Delete('knowledge-base/:id')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteKBArticle(
    @Param('id') id: string,
    @Query('tenantId') queryTenant: string,
    @Headers('x-tenant-id') headerTenant: string,
  ) {
    const tenantId = headerTenant || queryTenant;
    await this.chatbotService.deleteKBArticle(tenantId, id);
    return { success: true };
  }

  /** Public — returns the tenant's chatbot agent config for the widget (no auth required). */
  @Get('public-config/:tenantId')
  async getPublicConfig(@Param('tenantId') tenantId: string) {
    return this.chatbotService.getPublicConfig(tenantId);
  }
}
