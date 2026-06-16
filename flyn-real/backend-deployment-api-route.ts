// backend/app/api/builder/[projectId]/deploy/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/database';
import { getUserFromToken } from '@/lib/services/auth.service';

export async function POST(
  request: NextRequest,
  { params }: { params: { projectId: string } }
) {
  try {
    const token = request.headers.get('authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await getUserFromToken(token);
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { platform, domain } = await request.json();

    const deployment = await prisma.deployment.create({
      data: {
        projectId: params.projectId,
        platform,
        domain,
        status: 'DEPLOYING',
      },
    });

    // In real implementation, trigger actual deployment
    console.log('🚀 Starting deployment:', { platform, projectId: params.projectId });

    return NextResponse.json(deployment, { status: 201 });
  } catch (error) {
    console.error('Deploy error:', error);
    return NextResponse.json({ error: 'Deployment failed' }, { status: 500 });
  }
}
