import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { FirebaseAuthGuard, AuthRequest } from '../guards/firebase-auth.guard';
import { ApiOrFirebaseAuthGuard } from '../guards/api-or-firebase-auth.guard';
import { ApiKeysService, ApiKeyResponse, UserRole } from './api-keys.service';

class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  scopes?: string[];
}

/**
 * ApiKeysController
 *
 * Manages developer API keys for a tenant's external integrations.
 * These are distinct from internal payment-gateway credentials.
 *
 * Routes:
 *  GET    /api/billing/keys          — List all keys for the tenant
 *  POST   /api/billing/keys          — Create a new key (full key returned once)
 *  DELETE /api/billing/keys/:id      — Revoke a key
 *
 * Tenant identity is always sourced from the verified Firebase token,
 * never from query params or request body.
 */
@Controller('billing/keys')
@UseGuards(ApiOrFirebaseAuthGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  private callerInfo(req: AuthRequest): { tenantId: string; uid: string; role: UserRole } {
    const tenantId = (req.firebaseUser?.['organization_id'] as string) ?? req.firebaseUser?.uid;
    const uid = req.firebaseUser?.uid ?? '';
    const role = ((req.firebaseUser?.['role'] as string) ?? 'agent') as UserRole;
    return { tenantId, uid, role };
  }

  @Get()
  listKeys(@Req() req: AuthRequest): Promise<ApiKeyResponse[]> {
    const { tenantId, uid, role } = this.callerInfo(req);
    return this.apiKeysService.listKeys(tenantId, uid, role);
  }

  @Post()
  @HttpCode(201)
  @UsePipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  )
  createKey(
    @Body() dto: CreateApiKeyDto,
    @Req() req: AuthRequest,
  ): Promise<ApiKeyResponse> {
    const { tenantId, uid, role } = this.callerInfo(req);
    return this.apiKeysService.createKey(tenantId, uid, role, dto.name, dto.scopes ?? ['read:all']);
  }

  @Delete(':id')
  @HttpCode(204)
  async revokeKey(
    @Param('id') id: string,
    @Req() req: AuthRequest,
  ): Promise<void> {
    const { tenantId, uid, role } = this.callerInfo(req);
    await this.apiKeysService.revokeKey(id, tenantId, uid, role);
  }
}
