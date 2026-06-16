// backend/app/api/builder/[projectId]/pages/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getUserFromToken } from '@/lib/services/auth.service';
import { autoSyncToCMS } from '@/lib/services/cms-sync';

// GET pages for project
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const pages = await prisma.builderPage.findMany({
      where: { projectId: params.projectId },
      include: { components: true },
    });

    return NextResponse.json(pages);
  } catch (error) {
    console.error('GET pages error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST new page
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await request.json();

    const page = await prisma.builderPage.create({
      data: {
        projectId: params.projectId,
        name: data.name,
        slug: data.slug || data.name.toLowerCase().replace(/\s+/g, '-'),
        content: data.content || {},
        status: 'DRAFT',
      },
    });

    // Auto-sync to CMS
    await autoSyncToCMS({
      projectId: params.projectId,
      pageId: page.id,
      action: 'create',
    });

    return NextResponse.json(page, { status: 201 });
  } catch (error) {
    console.error('POST page error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
