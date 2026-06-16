// backend/app/api/builder/[projectId]/components/[componentId]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { autoSyncToCMS } from '@/lib/services/cms-sync';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string; componentId: string } }
) {
  try {
    const component = await prisma.builderComponent.findUnique({
      where: { id: params.componentId },
    });
    return NextResponse.json(component);
  } catch (error) {
    return NextResponse.json({ error: 'Component not found' }, { status: 404 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string; componentId: string } }
) {
  try {
    const data = await request.json();

    const component = await prisma.builderComponent.update({
      where: { id: params.componentId },
      data,
    });

    // Auto-sync to CMS
    await autoSyncToCMS({
      projectId: params.projectId,
      componentId: params.componentId,
      action: 'update',
    });

    return NextResponse.json(component);
  } catch (error) {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
