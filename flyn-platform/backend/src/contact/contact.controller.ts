import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Query,
  Param,
  UsePipes,
  ValidationPipe,
  Logger,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { FirebaseAuthGuard } from '../guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';
import { ContactService } from './contact.service';
import { SubmitContactDto } from './dto/submit-contact.dto';
import { StartChatDto } from './dto/start-chat.dto';
import { SendMessageDto } from './dto/send-message.dto';
import { SubscribeDto } from './dto/subscribe.dto';
import { UpdateContactFormDto } from './dto/update-contact-form.dto';

const PIPE = new ValidationPipe({ whitelist: true, transform: true });

@Controller('contact')
export class ContactController {
  private readonly logger = new Logger(ContactController.name);

  constructor(private readonly contactService: ContactService) {}

  // ── Locations ──────────────────────────────────────────────────────────────

  @Get('locations/countries')
  async getCountries() {
    const countries = await this.contactService.getCountries();
    return { countries };
  }

  @Get('locations')
  async getLocations(
    @Query('country') country?: string,
    @Query('department') department?: string,
  ) {
    const locations = await this.contactService.getLocations(country, department);
    return { locations };
  }

  // ── Agents ─────────────────────────────────────────────────────────────────

  @Get('agents')
  async getAgents(@Query('department') department?: string) {
    const agents = await this.contactService.getAgents(department);
    return { agents };
  }

  // ── Admin: Location CRUD ──────────────────────────────────────────────────

  @Post('admin/locations')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createLocation(@Body() body: Record<string, unknown>) {
    const loc = await this.contactService.createLocation(body as any);
    return { location: loc };
  }

  @Put('admin/locations/:id')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateLocation(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    await this.contactService.updateLocation(id, body as any);
    return { success: true };
  }

  @Delete('admin/locations/:id')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteLocation(@Param('id') id: string) {
    await this.contactService.deleteLocation(id);
    return { success: true };
  }

  // ── Admin: Agent CRUD ──────────────────────────────────────────────────────

  @Post('admin/agents')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async createAgent(@Body() body: Record<string, unknown>) {
    const agent = await this.contactService.createAgent(body as any);
    return { agent };
  }

  @Put('admin/agents/:id')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async updateAgent(@Param('id') id: string, @Body() body: Record<string, unknown>) {
    await this.contactService.updateAgent(id, body as any);
    return { success: true };
  }

  @Delete('admin/agents/:id')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteAgent(@Param('id') id: string) {
    await this.contactService.deleteAgent(id);
    return { success: true };
  }

  // ── Contact Form ───────────────────────────────────────────────────────────

  @Post('submit')
  @UsePipes(PIPE)
  async submitForm(@Body() dto: SubmitContactDto) {
    return this.contactService.submitContactForm(dto);
  }

  @Get('admin/submissions')
  @UseGuards(ApiOrFirebaseAuthGuard)
  async listSubmissions(
    @Query('status') status?: string,
    @Query('department') department?: string,
    @Query('limit') limit?: string,
  ) {
    const submissions = await this.contactService.listContactForms({ status, department, limit: limit ? Number(limit) : undefined });
    return { submissions };
  }

  @Put('forms/:id')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @UsePipes(PIPE)
  @HttpCode(HttpStatus.OK)
  async updateForm(
    @Param('id') id: string,
    @Body() dto: UpdateContactFormDto,
  ) {
    await this.contactService.updateContactForm(id, dto);
    return { success: true };
  }

  @Delete('forms/:id')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async deleteForm(@Param('id') id: string) {
    await this.contactService.deleteContactForm(id);
    return { success: true };
  }

  @Post('admin/submissions/:id/reply')
  @UseGuards(ApiOrFirebaseAuthGuard)
  @HttpCode(HttpStatus.OK)
  async replyToSubmission(
    @Param('id') id: string,
    @Body() body: { message: string; staffName?: string },
  ) {
    await this.contactService.replyToSubmission(id, body);
    return { success: true };
  }

  // ── Live Chat ──────────────────────────────────────────────────────────────

  @Post('chat/start')
  @UsePipes(PIPE)
  async startChat(@Body() dto: StartChatDto) {
    return this.contactService.startChat(dto);
  }

  @Post('chat/message')
  @UsePipes(PIPE)
  async sendMessage(@Body() dto: SendMessageDto) {
    return this.contactService.sendMessage(dto);
  }

  @Get('chat/:chatId/messages')
  async getChatMessages(@Param('chatId') chatId: string) {
    const messages = await this.contactService.getChatMessages(chatId);
    return { messages };
  }

  // ── Subscribe ──────────────────────────────────────────────────────────────

  @Post('subscribe')
  @UsePipes(PIPE)
  async subscribe(@Body() dto: SubscribeDto) {
    return this.contactService.subscribeNotifications(dto.email);
  }

  // ── Seed ───────────────────────────────────────────────────────────────────

  @Post('seed-data')
  async seedData() {
    return this.contactService.seedData();
  }
}
