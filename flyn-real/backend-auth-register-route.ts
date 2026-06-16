// backend/app/api/auth/register/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { registerUser, generateTokens } from '@/lib/services/auth.service';

export async function POST(request: NextRequest) {
  try {
    const { email, password, name } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password required' },
        { status: 400 }
      );
    }

    const user = await registerUser(email, password, name || '');
    const tokens = generateTokens(user);

    const response = NextResponse.json(
      { 
        user,
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn
      },
      { status: 201 }
    );

    response.cookies.set('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (error) {
    console.error('Register error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Registration failed' },
      { status: 400 }
    );
  }
}
