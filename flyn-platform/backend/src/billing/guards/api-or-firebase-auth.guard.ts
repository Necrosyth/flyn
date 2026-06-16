import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirebaseService } from '../../firebase/firebase.service';
import { ApiKeysService } from '../keys/api-keys.service';
import { AuthRequest } from './firebase-auth.guard';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TenantsService } from '../../tenants/tenants.service';
import { MailService } from '../../mail/mail.service';
import { enforceIpPolicy } from './ip-verification.util';
import { getDemoDecodedToken, isDemoAuthToken } from '../../common/demo-auth';

@Injectable()
export class ApiOrFirebaseAuthGuard implements CanActivate {
  constructor(
    private readonly firebase: FirebaseService,
    private readonly apiKeysService: ApiKeysService,
    private readonly reflector: Reflector,
    private readonly tenantsService: TenantsService,
    private readonly mailService: MailService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Respect @Public() — Twilio/external webhooks fire without auth headers
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthRequest>();
    const authHeader = (req.headers as Record<string, string>)['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing Authorization header');
    }
    const token = authHeader.slice(7).trim();

    if (isDemoAuthToken(token)) {
      req.firebaseUser = getDemoDecodedToken() as any;
      return true;
    }

    if (token.startsWith('sk_live_')) {
      return this.handleApiKey(req, token);
    }
    return this.handleFirebaseToken(req, token);
  }

  private async handleApiKey(req: AuthRequest, token: string): Promise<boolean> {
    const keyRecord = await this.apiKeysService.validateKey(token);
    if (!keyRecord) throw new UnauthorizedException('Invalid or revoked API key');

    const method = req.method ?? 'GET';
    const path = req.path ?? req.url ?? '';

    if (!this.isScopeAllowed(keyRecord.scopes, method, path)) {
      throw new UnauthorizedException(
        `API key scope insufficient for ${method} ${path}`,
      );
    }

    // Populate firebaseUser so all controllers work unchanged
    req.firebaseUser = {
      uid: keyRecord.createdByUid ?? keyRecord.tenantId,
      organization_id: keyRecord.tenantId,
      role: keyRecord.creatorRole ?? 'owner',
    } as any;

    return true;
  }

  private async handleFirebaseToken(req: AuthRequest, token: string): Promise<boolean> {
    const auth = this.firebase.auth();
    if (!auth) throw new UnauthorizedException('Auth unavailable');

    try {
      const decoded = await auth.verifyIdToken(token);
      req.firebaseUser = decoded as any;

      // Extract client IP
      const clientIp = (req.headers['x-forwarded-for'] as string) || req.ip || req.socket?.remoteAddress || '';
      let ip = clientIp.trim();
      if (ip.includes(',')) {
        ip = ip.split(',')[0].trim();
      }

      const isLocal = ip === 'localhost' || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('127.') || ip.startsWith('::ffff:127.0.0.1') || ip.startsWith('169.254.') || ip === '';
      if (!isLocal) {
        const tenantId = (decoded['organization_id'] || decoded.uid) as string;
        if (tenantId) {
          const tenant = await this.tenantsService.getTenant(tenantId).catch(() => null);
          if (tenant) {
            await enforceIpPolicy(
              { db: this.firebase.firestore(), sendEmail: (o) => this.mailService.sendEmail(o) },
              { tenant, tenantId, ip, email: decoded.email },
            );
          }
        }
      }

      return true;
    } catch (err) {
      if (err instanceof UnauthorizedException) {
        throw err;
      }
      throw new UnauthorizedException('Invalid or expired Firebase ID token');
    }
  }

  private isScopeAllowed(scopes: string[], method: string, path: string): boolean {
    const isRead = method === 'GET';
    if (scopes.includes('write:all')) return true;
    if (scopes.includes('read:all') && isRead) return true;

    const mod = this.pathToModule(path);
    if (!mod) return false;

    if (isRead) {
      return scopes.includes(`${mod}:read`) || scopes.includes(`${mod}:write`);
    }
    return scopes.includes(`${mod}:write`);
  }

  private pathToModule(path: string): string {
    const match = path.match(/^\/(?:api\/)?([^/?]+)/);
    return match ? match[1].toLowerCase().replace(/-/g, '_') : 'unknown';
  }
}
