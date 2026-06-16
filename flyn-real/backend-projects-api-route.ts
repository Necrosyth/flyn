// backend/app/api/builder/projects/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getUserFromToken } from '@/lib/services/auth.service';

// GET /api/builder/projects
export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const projects = await prisma.builderProject.findMany({
      where: { userId: user.id },
      include: { pages: true },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error('GET projects error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/builder/projects
export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await request.json();

    if (!data.name || typeof data.name !== 'string') {
      return NextResponse.json({ error: 'Invalid project name' }, { status: 400 });
    }

    const project = await prisma.builderProject.create({
      data: {
        name: data.name,
        description: data.description || '',
        slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
        mode: data.mode || 'WEBSITE',
        userId: user.id,
      },
    });

    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('POST projects error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
