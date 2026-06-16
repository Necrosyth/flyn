// backend/lib/utils/jwt.ts
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'dev-secret';

export function signJWT(payload: any, expiresIn: string | number = '24h'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
}

export function verifyJWT(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

export function decodeJWT(token: string): any {
  return jwt.decode(token);
}
