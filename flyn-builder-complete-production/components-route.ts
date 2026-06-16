// app/api/builder/[projectId]/components/route.ts
/**
 * Components API Routes
 * Handles component CRUD with real-time preview sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { syncToCMS } from '@/lib/cms-sync';
import { syncToPreview } from '@/lib/preview-sync';
import { authOptions } from '@/lib/auth';

/**
 * POST /api/builder/[projectId]/components
 * Add component to page
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { pageId, name, type, props, styles, content } = body;

    // Verify project ownership
    const project = await prisma.builderProject.findUnique({
      where: { id: params.projectId },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const component = await prisma.builderComponent.create({
      data: {
        pageId,
        name,
        type,
        props: props || {},
        styles: styles || {},
        content: content || {},
      },
    });

    // Real-time sync to preview iframe
    await syncToPreview(params.projectId, pageId, {
      type: 'componentAdd',
      component,
      timestamp: new Date(),
    });

    return NextResponse.json(component);
  } catch (error) {
    console.error('Failed to create component:', error);
    return NextResponse.json(
      { error: 'Failed to create component' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/builder/[projectId]/components
 * Get all components for project
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify project ownership
    const project = await prisma.builderProject.findUnique({
      where: { id: params.projectId },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const components = await prisma.builderComponent.findMany({
      where: {
        page: {
          projectId: params.projectId,
        },
      },
    });

    return NextResponse.json(components);
  } catch (error) {
    console.error('Failed to fetch components:', error);
    return NextResponse.json(
      { error: 'Failed to fetch components' },
      { status: 500 }
    );
  }
}

// app/api/builder/[projectId]/components/[componentId]/route.ts
/**
 * PUT /api/builder/[projectId]/components/[componentId]
 * Update component - Real-time preview sync
 */
export async function PUT_COMPONENT(
  request: NextRequest,
  { params }: { params: { projectId: string; componentId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Verify ownership
    const project = await prisma.builderProject.findUnique({
      where: { id: params.projectId },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const component = await prisma.builderComponent.findUnique({
      where: { id: params.componentId },
      include: {
        page: true,
      },
    });

    if (!component) {
      return NextResponse.json(
        { error: 'Component not found' },
        { status: 404 }
      );
    }

    const updatedComponent = await prisma.builderComponent.update({
      where: { id: params.componentId },
      data: body,
    });

    // REAL-TIME SYNC TO PREVIEW - iframe updates instantly
    await syncToPreview(params.projectId, component.pageId, {
      type: 'componentUpdate',
      component: updatedComponent,
      timestamp: new Date(),
    });

    // Sync to CMS (background)
    await syncToCMS('updateComponent', {
      projectId: params.projectId,
      componentId: params.componentId,
      component: updatedComponent,
    });

    return NextResponse.json(updatedComponent);
  } catch (error) {
    console.error('Failed to update component:', error);
    return NextResponse.json(
      { error: 'Failed to update component' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/builder/[projectId]/components/[componentId]
 * Delete component
 */
export async function DELETE_COMPONENT(
  request: NextRequest,
  { params }: { params: { projectId: string; componentId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Verify ownership
    const project = await prisma.builderProject.findUnique({
      where: { id: params.projectId },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const component = await prisma.builderComponent.findUnique({
      where: { id: params.componentId },
      include: {
        page: true,
      },
    });

    if (!component) {
      return NextResponse.json(
        { error: 'Component not found' },
        { status: 404 }
      );
    }

    await prisma.builderComponent.delete({
      where: { id: params.componentId },
    });

    // Sync deletion to preview
    await syncToPreview(params.projectId, component.pageId, {
      type: 'componentDelete',
      componentId: params.componentId,
      timestamp: new Date(),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete component:', error);
    return NextResponse.json(
      { error: 'Failed to delete component' },
      { status: 500 }
    );
  }
}
