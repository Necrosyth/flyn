// backend/app/api/builder/[projectId]/pages/[pageId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getUserFromToken } from '@/lib/services/auth.service';
import { autoSyncToCMS } from '@/lib/services/cms-sync';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } }
) {
  try {
    const page = await prisma.builderPage.findUnique({
      where: { id: params.pageId },
      include: { components: true },
    });
    return NextResponse.json(page);
  } catch (error) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } }
) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await request.json();

    const page = await prisma.builderPage.update({
      where: { id: params.pageId },
      data,
    });

    // Auto-sync to CMS
    await autoSyncToCMS({
      projectId: params.projectId,
      pageId: params.pageId,
      action: 'update',
    });

    return NextResponse.json(page);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
