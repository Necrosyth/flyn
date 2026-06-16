import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Req, UnauthorizedException } from '@nestjs/common';
import { TasksService, CreateTaskDto, UpdateTaskDto } from './tasks.service';
import { FirebaseAuthGuard, AuthRequest } from '../billing/guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../billing/guards/api-or-firebase-auth.guard';

@ApiTags('Tasks')
@Controller('tasks')
@UseGuards(ApiOrFirebaseAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  private getTenantId(req: AuthRequest): string {
    const id = ((req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid ?? '').toString();
    if (!id) throw new UnauthorizedException('Tenant ID not found in token');
    return id;
  }

  @Get()
  async getTasks(@Req() req: AuthRequest) {
    return this.tasksService.getTasks(this.getTenantId(req));
  }

  @Post()
  async createTask(@Req() req: AuthRequest, @Body() dto: CreateTaskDto) {
    return this.tasksService.createTask(this.getTenantId(req), dto);
  }

  @Patch(':id')
  async updateTask(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateTaskDto) {
    return this.tasksService.updateTask(this.getTenantId(req), id, dto);
  }

  @Delete(':id')
  async deleteTask(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.tasksService.deleteTask(this.getTenantId(req), id);
  }
}
