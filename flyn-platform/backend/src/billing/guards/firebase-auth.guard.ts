import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { FirebaseService } from '../../firebase/firebase.service';
import type { DecodedIdToken } from 'firebase-admin/auth';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TenantsService } from '../../tenants/tenants.service';
import { MailService } from '../../mail/mail.service';
import { enforceIpPolicy } from './ip-verification.util';

/** Extends Express Request with the decoded Firebase token. */
export interface AuthRequest extends Request {
  firebaseUser: DecodedIdToken;
}

/**
 * FirebaseAuthGuard
 *
 * Verifies the Firebase ID token sent as a Bearer token in the
 * Authorization header.  Attaches the decoded token to `req.firebaseUser`
 * so controllers can safely read `uid`, `email`, and custom claims.
 *
 * Usage: @UseGuards(FirebaseAuthGuard) on any controller / route.
 *
 * Security notes:
 *  - Tokens are verified against Firebase's public keys (RS256).
 *  - We do NOT trust any `tenantId` claim from the client; it must come from
 *    the verified token's custom claims set at provisioning time.
 *  - Clock-skew is handled by the firebase-admin SDK (5-minute leeway).
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(
    private readonly firebase: FirebaseService,
    private readonly reflector: Reflector,
    private readonly tenantsService: TenantsService,
    private readonly mailService: MailService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Skip auth for routes marked @Public() (e.g. inbound webhooks from external services)
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthRequest>();

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const idToken = authHeader.slice(7).trim();
    if (!idToken) {
      throw new UnauthorizedException('Empty Bearer token');
    }

    try {
      const decoded = await this.firebase.verifyIdToken(idToken);
      req.firebaseUser = decoded;

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
      this.logger.warn(`Invalid Firebase ID token: ${(err as Error).message}`);
      throw new UnauthorizedException('Invalid or expired Firebase ID token');
    }
  }
}
