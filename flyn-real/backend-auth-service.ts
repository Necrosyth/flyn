// backend/lib/services/auth.service.ts
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '@/lib/database';

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'dev-secret-key';
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days
const ACCESS_TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
}

/**
 * Hash password
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

/**
 * Compare password
 */
export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Register new user
 */
export async function registerUser(email: string, password: string, name: string): Promise<User> {
  // Check if user exists
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    throw new Error('User already exists');
  }

  // Hash password
  const hashedPassword = await hashPassword(password);

  // Create user
  const user = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      name,
      role: 'USER',
    },
  });

  return {
    id: user.id,
    email: user.email,
    name: user.name || undefined,
    role: user.role,
  };
}

/**
 * Login user
 */
export async function loginUser(email: string, password: string): Promise<AuthTokens> {
  // Find user
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new Error('Invalid credentials');
  }

  // Check password
  if (!user.password || !(await comparePassword(password, user.password))) {
    throw new Error('Invalid credentials');
  }

  // Generate tokens
  return generateTokens(user);
}

/**
 * Generate JWT tokens
 */
export function generateTokens(user: any): AuthTokens {
  const accessToken = jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  const refreshToken = jwt.sign(
    {
      id: user.id,
      type: 'refresh',
    },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY,
  };
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): any {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
}

/**
 * Refresh access token
 */
export function refreshAccessToken(refreshToken: string): AuthTokens {
  const decoded = verifyToken(refreshToken);

  if (decoded.type !== 'refresh') {
    throw new Error('Invalid refresh token');
  }

  const user = {
    id: decoded.id,
    email: decoded.email,
    role: decoded.role,
  };

  return generateTokens(user);
}

/**
 * Get user from token
 */
export async function getUserFromToken(token: string): Promise<User | null> {
  try {
    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
    });

    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      name: user.name || undefined,
      role: user.role,
    };
  } catch {
    return null;
  }
}
