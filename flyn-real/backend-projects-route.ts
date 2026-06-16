import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { authenticate } from '@/lib/middleware/auth';
import { validateProject } from '@/lib/validators/project';

// GET /api/builder/projects - List all projects for user
export async function GET(request: NextRequest) {
  try {
    const user = await authenticate(request);
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

// POST /api/builder/projects - Create new project
export async function POST(request: NextRequest) {
  try {
    const user = await authenticate(request);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await request.json();
    const validation = validateProject(data);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.errors }, { status: 400 });
    }

    const project = await prisma.builderProject.create({
      data: {
        name: data.name,
        description: data.description,
        slug: data.slug || data.name.toLowerCase().replace(/\s/g, '-'),
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
