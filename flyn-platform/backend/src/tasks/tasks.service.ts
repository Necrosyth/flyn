import { Injectable, Logger, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { FirebaseService } from '../firebase/firebase.service';

export interface CreateTaskDto {
  title: string;
  status: 'todo' | 'in-progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
  assignee: string;
  category: string;
}

export interface UpdateTaskDto extends Partial<CreateTaskDto> {}

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  private getDb() {
    const db = this.firebaseService.firestore();
    if (!db) {
       this.logger.error('Firestore is not initialized');
       throw new InternalServerErrorException('Database not configured');
    }
    return db;
  }

  async getTasks(tenantId: string) {
    try {
      const db = this.getDb();
      const snapshot = await db.collection('tenants').doc(tenantId).collection('tasks').get();
      const tasks = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      return { data: tasks };
    } catch (error: any) {
      this.logger.error(`Failed to get tasks for tenant ${tenantId}`, error.stack);
      throw new InternalServerErrorException('Failed to get tasks');
    }
  }

  async createTask(tenantId: string, dto: CreateTaskDto) {
    try {
      const db = this.getDb();
      const taskRef = db.collection('tenants').doc(tenantId).collection('tasks').doc();
      
      const newTask = {
        ...dto,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await taskRef.set(newTask);
      return { id: taskRef.id, ...newTask };
    } catch (error: any) {
      this.logger.error(`Failed to create task for tenant ${tenantId}`, error.stack);
      throw new InternalServerErrorException('Failed to create task');
    }
  }

  async updateTask(tenantId: string, taskId: string, dto: UpdateTaskDto) {
    try {
      const db = this.getDb();
      const taskRef = db.collection('tenants').doc(tenantId).collection('tasks').doc(taskId);
      
      const doc = await taskRef.get();
      if (!doc.exists) {
        throw new NotFoundException('Task not found');
      }

      const updates = {
        ...dto,
        updatedAt: new Date().toISOString(),
      };
      
      await taskRef.update(updates);
      return { id: taskId, ...doc.data(), ...updates };
    } catch (error: any) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Failed to update task ${taskId} for tenant ${tenantId}`, error.stack);
      throw new InternalServerErrorException('Failed to update task');
    }
  }

  async deleteTask(tenantId: string, taskId: string) {
    try {
      const db = this.getDb();
      const taskRef = db.collection('tenants').doc(tenantId).collection('tasks').doc(taskId);
      await taskRef.delete();
      return { success: true };
    } catch (error: any) {
      this.logger.error(`Failed to delete task ${taskId} for tenant ${tenantId}`, error.stack);
      throw new InternalServerErrorException('Failed to delete task');
    }
  }
}
