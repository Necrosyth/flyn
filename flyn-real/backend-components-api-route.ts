// backend/app/api/builder/[projectId]/components/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getUserFromToken } from '@/lib/services/auth.service';
import { autoSyncToCMS } from '@/lib/services/cms-sync';

// GET components for project
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const components = await prisma.builderComponent.findMany({
      where: { projectId: params.projectId },
    });

    return NextResponse.json(components);
  } catch (error) {
    console.error('GET components error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST new component
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const data = await request.json();

    const component = await prisma.builderComponent.create({
      data: {
        projectId: params.projectId,
        pageId: data.pageId,
        name: data.name,
        type: data.type,
        props: data.props || {},
        styles: data.styles || {},
        content: data.content || {},
      },
    });

    // Auto-sync to CMS
    await autoSyncToCMS({
      projectId: params.projectId,
      componentId: component.id,
      action: 'create',
    });

    return NextResponse.json(component, { status: 201 });
  } catch (error) {
    console.error('POST component error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
