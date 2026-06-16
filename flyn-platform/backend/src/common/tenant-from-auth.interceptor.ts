import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * TenantFromAuthInterceptor
 *
 * For controllers that historically took `tenantId` as a path/body param, this
 * overwrites that value with the AUTHENTICATED tenant (set by
 * ApiOrFirebaseAuthGuard as `req.firebaseUser.organization_id`). This guarantees
 * a caller can only ever act on their own tenant — they can't pass an arbitrary
 * `tenantId` — without rewriting every handler.
 *
 * Runs before the route handler, so `@Param('tenantId')` / `@Body()` /
 * `@Query('tenantId')` read the corrected value. Public routes (no firebaseUser)
 * are left untouched.
 */
@Injectable()
export class TenantFromAuthInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req: any = context.switchToHttp().getRequest();
    const orgId = req?.firebaseUser?.organization_id || req?.firebaseUser?.uid;
    if (orgId) {
      if (req.params && typeof req.params === 'object' && 'tenantId' in req.params) {
        req.params.tenantId = orgId;
      }
      if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
        req.body.tenantId = orgId;
      }
      // Express 5's req.query is a getter-only property — a plain assignment is
      // silently dropped. Redefine it as an own data property so @Query('tenantId')
      // reads the authenticated tenant, never a client-supplied one.
      if (req.query && typeof req.query === 'object' && 'tenantId' in req.query) {
        try {
          Object.defineProperty(req, 'query', {
            value: { ...req.query, tenantId: orgId },
            writable: true, configurable: true, enumerable: true,
          });
        } catch { /* extremely defensive — leave as-is */ }
      }
      // Some controllers read the tenant from the x-tenant-id header — force it too.
      if (req.headers && typeof req.headers === 'object') {
        req.headers['x-tenant-id'] = orgId;
      }
    }
    return next.handle();
  }
}
