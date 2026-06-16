import {
    Injectable,
    CanActivate,
    ExecutionContext,
    UnauthorizedException,
    Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirebaseService } from '../../firebase/firebase.service';
import { isDemoAuthToken } from '../../common/demo-auth';

/**
 * Decorator to mark route as public (no auth required)
 */
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => {
    return (target: object, key?: string | symbol, descriptor?: TypedPropertyDescriptor<unknown>) => {
        if (descriptor) {
            Reflect.defineMetadata(IS_PUBLIC_KEY, true, descriptor.value as object);
        } else {
            Reflect.defineMetadata(IS_PUBLIC_KEY, true, target);
        }
        return descriptor || target;
    };
};

/**
 * Tenant context interface
 */
export interface TenantContext {
    tenantId: string;
    userId: string;
    email?: string;
    roles?: string[];
}

/**
 * Firebase Auth Guard
 * 
 * Validates Firebase ID tokens and extracts tenant context.
 * Use @Public() decorator to skip authentication for specific routes.
 */
@Injectable()
export class FirebaseAuthGuard implements CanActivate {
    private readonly logger = new Logger(FirebaseAuthGuard.name);

    constructor(
        private readonly reflector: Reflector,
        private readonly firebase: FirebaseService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // Check if route is marked as public
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
            context.getHandler(),
            context.getClass(),
        ]);

        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest();
        const authHeader = request.headers.authorization;

        if (!authHeader) {
            throw new UnauthorizedException('No authorization header');
        }

        // Extract token
        const [type, token] = authHeader.split(' ');
        if (type !== 'Bearer' || !token) {
            throw new UnauthorizedException('Invalid authorization format');
        }

        try {
            if (isDemoAuthToken(token)) {
                request.user = {
                    tenantId: 'demo-org',
                    userId: 'demo-user',
                    email: 'demo@flyn.local',
                    roles: ['admin'],
                };
                return true;
            }

            const auth = this.firebase.auth();
            if (!auth) {
                // Firebase not configured - allow in development
                this.logger.warn('Firebase auth not configured, allowing request');
                request.user = this.getDevUser();
                return true;
            }

            // Verify the token
            const decodedToken = await auth.verifyIdToken(token);

            // Extract tenant context
            const tenantContext: TenantContext = {
                tenantId: decodedToken['tenantId'] || decodedToken.uid,
                userId: decodedToken.uid,
                email: decodedToken.email,
                roles: decodedToken['roles'] || [],
            };

            // Attach to request
            request.user = tenantContext;

            return true;
        } catch (error) {
            this.logger.warn(`Auth failed: ${(error as Error).message}`);
            throw new UnauthorizedException('Invalid token');
        }
    }

    private getDevUser(): TenantContext {
        return {
            tenantId: 'dev-tenant',
            userId: 'dev-user',
            email: 'dev@flyn.local',
            roles: ['admin'],
        };
    }
}

/**
 * Tenant Guard
 * 
 * Ensures the user has access to the requested tenant's resources.
 * Must be used after FirebaseAuthGuard.
 */
@Injectable()
export class TenantGuard implements CanActivate {
    private readonly logger = new Logger(TenantGuard.name);

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const request = context.switchToHttp().getRequest();
        const user = request.user as TenantContext;

        if (!user) {
            throw new UnauthorizedException('No user context');
        }

        // Extract tenantId from request (query, params, or body)
        const requestTenantId =
            request.query?.tenantId ||
            request.params?.tenantId ||
            request.body?.tenantId;

        if (!requestTenantId) {
            // No tenant specified, allow (will use user's default tenant)
            return true;
        }

        // Check if user has access to this tenant
        if (user.tenantId !== requestTenantId && !user.roles?.includes('admin')) {
            this.logger.warn(`User ${user.userId} attempted to access tenant ${requestTenantId}`);
            throw new UnauthorizedException('Access denied to this tenant');
        }

        return true;
    }
}
