import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Mark a route as public — FirebaseAuthGuard will skip token verification.
 * Use on webhook endpoints that are called by external services (Telegram, Slack, etc.)
 * which cannot carry a Firebase Bearer token.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
