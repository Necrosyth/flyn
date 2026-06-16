// app/api/builder/[projectId]/pages/route.ts
/**
 * Pages API Routes
 * Handles page CRUD with automatic CMS and preview sync
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { syncToCMS } from '@/lib/cms-sync';
import { syncToPreview } from '@/lib/preview-sync';
import { authOptions } from '@/lib/auth';

/**
 * POST /api/builder/[projectId]/pages
 * Create new page
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

    // Verify project ownership
    const project = await prisma.builderProject.findUnique({
      where: { id: params.projectId },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const page = await prisma.builderPage.create({
      data: {
        projectId: params.projectId,
        name: body.name,
        slug: body.slug || body.name.toLowerCase().replace(/\s+/g, '-'),
        status: 'draft',
        sections: [],
        seoMetadata: {},
      },
      include: {
        components: true,
      },
    });

    // Sync to CMS
    await syncToCMS('createPage', {
      projectId: params.projectId,
      pageId: page.id,
      name: page.name,
      slug: page.slug,
    });

    return NextResponse.json(page);
  } catch (error) {
    console.error('Failed to create page:', error);
    return NextResponse.json(
      { error: 'Failed to create page' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/builder/[projectId]/pages
 * Get all pages for project
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

    const pages = await prisma.builderPage.findMany({
      where: { projectId: params.projectId },
      include: {
        components: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json(pages);
  } catch (error) {
    console.error('Failed to fetch pages:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pages' },
      { status: 500 }
    );
  }
}

// app/api/builder/[projectId]/pages/[pageId]/route.ts
/**
 * PUT /api/builder/[projectId]/pages/[pageId]
 * Update page - AUTO-SYNCS to CMS and preview iframe
 */
export async function PUT_PAGE(
  request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } }
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

    const updatedPage = await prisma.builderPage.update({
      where: { id: params.pageId },
      data: body,
      include: {
        components: true,
      },
    });

    // 1. SYNC TO CMS - Auto-sync happens here
    await syncToCMS('updatePage', {
      projectId: params.projectId,
      pageId: params.pageId,
      content: updatedPage.sections,
      metadata: updatedPage.seoMetadata,
      status: updatedPage.status,
    });

    // 2. SYNC TO PREVIEW - iframe gets real-time update
    await syncToPreview(params.projectId, params.pageId, {
      type: 'pageUpdate',
      page: updatedPage,
      timestamp: new Date(),
    });

    return NextResponse.json(updatedPage);
  } catch (error) {
    console.error('Failed to update page:', error);
    return NextResponse.json(
      { error: 'Failed to update page' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/builder/[projectId]/pages/[pageId]
 * Delete page
 */
export async function DELETE_PAGE(
  request: NextRequest,
  { params }: { params: { projectId: string; pageId: string } }
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

    await prisma.builderPage.delete({
      where: { id: params.pageId },
    });

    // Sync deletion to CMS
    await syncToCMS('deletePage', {
      projectId: params.projectId,
      pageId: params.pageId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete page:', error);
    return NextResponse.json(
      { error: 'Failed to delete page' },
      { status: 500 }
    );
  }
}
