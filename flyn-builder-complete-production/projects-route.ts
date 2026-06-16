// app/api/builder/projects/route.ts
/**
 * Next.js API Routes for FlyNAI Builder
 * 
 * Handles builder project CRUD operations
 * Integrates with CMS system
 * Syncs with iframe preview
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { syncToCMS } from '@/lib/cms-sync';
import { authOptions } from '@/lib/auth';

/**
 * POST /api/builder/projects
 * Create new builder project
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      name,
      mode, // 'website' | 'community' | 'marketplace' | 'membership' | 'blank' | 'app'
      template,
      domain,
    } = body;

    // Create project in database
    const project = await prisma.builderProject.create({
      data: {
        name,
        mode,
        template,
        domain,
        userId: session.user.id,
        primaryColor: '#6366f1',
        currency: 'USD',
        metadata: {
          createdBy: session.user.id,
          createdAt: new Date(),
        },
      },
      include: {
        pages: true,
        features: true,
      },
    });

    // Sync to CMS
    await syncToCMS('createProject', {
      flynaiProjectId: project.id,
      name: project.name,
      mode: project.mode,
      domain: project.domain,
      userId: session.user.id,
    });

    return NextResponse.json(project);
  } catch (error) {
    console.error('Failed to create project:', error);
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/builder/projects
 * Get all projects for user
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const projects = await prisma.builderProject.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        pages: {
          select: {
            id: true,
            name: true,
            status: true,
          },
        },
        features: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(projects);
  } catch (error) {
    console.error('Failed to fetch projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
      { status: 500 }
    );
  }
}

// app/api/builder/projects/[projectId]/route.ts
/**
 * GET /api/builder/projects/[projectId]
 * Get project details
 */
export async function GET_PROJECT(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const project = await prisma.builderProject.findUnique({
      where: { id: params.projectId },
      include: {
        pages: {
          include: {
            components: true,
          },
        },
        features: true,
      },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error('Failed to fetch project:', error);
    return NextResponse.json(
      { error: 'Failed to fetch project' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/builder/projects/[projectId]
 * Update project
 */
export async function PUT_PROJECT(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();

    // Verify ownership
    const existingProject = await prisma.builderProject.findUnique({
      where: { id: params.projectId },
    });

    if (!existingProject || existingProject.userId !== session.user.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    const updatedProject = await prisma.builderProject.update({
      where: { id: params.projectId },
      data: body,
      include: {
        pages: true,
        features: true,
      },
    });

    // Sync to CMS
    await syncToCMS('updateProject', {
      projectId: params.projectId,
      ...body,
    });

    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error('Failed to update project:', error);
    return NextResponse.json(
      { error: 'Failed to update project' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/builder/projects/[projectId]
 * Delete project
 */
export async function DELETE_PROJECT(
  request: NextRequest,
  { params }: { params: { projectId: string } }
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
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 403 }
      );
    }

    await prisma.builderProject.delete({
      where: { id: params.projectId },
    });

    // Sync deletion to CMS
    await syncToCMS('deleteProject', {
      projectId: params.projectId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Failed to delete project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' },
      { status: 500 }
    );
  }
}
