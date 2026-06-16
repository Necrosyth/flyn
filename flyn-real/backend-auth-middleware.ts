// backend/lib/middleware/auth.ts
import { NextRequest } from 'next/server';
import { verifyToken } from '@/lib/services/auth.service';

export async function authenticate(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7);

  try {
    const decoded = verifyToken(token);
    return { id: decoded.id, email: decoded.email, role: decoded.role };
  } catch {
    return null;
  }
}

export function requireAuth(handler: any) {
  return async (request: NextRequest, ...args: any[]) => {
    const user = await authenticate(request);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'content-type': 'application/json' },
      });
    }
    return handler(request, ...args);
  };
}
