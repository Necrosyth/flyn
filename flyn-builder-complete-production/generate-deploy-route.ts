// app/api/builder/[projectId]/generate-code/route.ts
/**
 * Code Generation API
 * Generates production-ready code for 9 frameworks + 3 mobile platforms
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth/next';
import { prisma } from '@/lib/prisma';
import { generateCode } from '@/lib/code-generator';
import { authOptions } from '@/lib/auth';

/**
 * POST /api/builder/[projectId]/generate-code
 * Generate code in selected framework
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
    const { framework } = body;

    // Verify project ownership
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Supported frameworks
    const supportedFrameworks = [
      'nextjs',
      'vue',
      'html',
      'svelte',
      'angular',
      'php',
      'python',
      'go',
      'ruby',
      'react-native',
      'ios',
      'android',
    ];

    if (!supportedFrameworks.includes(framework)) {
      return NextResponse.json(
        { error: `Framework ${framework} not supported` },
        { status: 400 }
      );
    }

    // Generate code
    const code = await generateCode(project, framework);

    return NextResponse.json({
      projectId: params.projectId,
      framework,
      code,
      language: getLanguageForFramework(framework),
      generatedAt: new Date(),
      status: 'success',
    });
  } catch (error) {
    console.error('Failed to generate code:', error);
    return NextResponse.json(
      { error: 'Failed to generate code' },
      { status: 500 }
    );
  }
}

function getLanguageForFramework(framework: string): string {
  const languages: Record<string, string> = {
    nextjs: 'typescript',
    vue: 'typescript',
    html: 'html',
    svelte: 'typescript',
    angular: 'typescript',
    php: 'php',
    python: 'python',
    go: 'go',
    ruby: 'ruby',
    'react-native': 'javascript',
    ios: 'swift',
    android: 'kotlin',
  };
  return languages[framework] || 'typescript';
}

// app/api/builder/[projectId]/deploy/route.ts
/**
 * Deployment API
 * Deploy to 6 web platforms + App Store + Google Play
 */

import { deployToCloudflare } from '@/lib/deployment/cloudflare';
import { deployToVercel } from '@/lib/deployment/vercel';
import { deployToAWS } from '@/lib/deployment/aws';
import { deployToNetlify } from '@/lib/deployment/netlify';
import { deployToAppStore } from '@/lib/deployment/appstore';
import { deployToGooglePlay } from '@/lib/deployment/googleplay';
import { syncToCMS } from '@/lib/cms-sync';

/**
 * POST /api/builder/[projectId]/deploy
 * Deploy project to selected platform
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
    const { platform, domain, credentials } = body;

    // Verify project ownership
    const project = await prisma.builderProject.findUnique({
      where: { id: params.projectId },
    });

    if (!project || project.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    let deploymentResult;

    // Deploy based on platform
    switch (platform) {
      case 'cloudflare':
        deploymentResult = await deployToCloudflare(project, domain);
        break;
      case 'vercel':
        deploymentResult = await deployToVercel(project, domain);
        break;
      case 'aws':
        deploymentResult = await deployToAWS(project, domain);
        break;
      case 'netlify':
        deploymentResult = await deployToNetlify(project, domain);
        break;
      case 'appstore':
        deploymentResult = await deployToAppStore(project, credentials);
        break;
      case 'googleplay':
        deploymentResult = await deployToGooglePlay(project, credentials);
        break;
      default:
        return NextResponse.json(
          { error: `Platform ${platform} not supported` },
          { status: 400 }
        );
    }

    // Update project with deployment info
    const updatedProject = await prisma.builderProject.update({
      where: { id: params.projectId },
      data: {
        domain: platform !== 'appstore' && platform !== 'googleplay' ? domain : project.domain,
        metadata: {
          ...project.metadata,
          lastDeployment: {
            platform,
            domain,
            status: deploymentResult.status,
            deployedAt: new Date(),
            url: deploymentResult.url,
          },
        },
      },
    });

    // Sync deployment to CMS
    await syncToCMS('deployProject', {
      projectId: params.projectId,
      platform,
      domain,
      status: deploymentResult.status,
      url: deploymentResult.url,
    });

    return NextResponse.json({
      projectId: params.projectId,
      platform,
      domain,
      status: deploymentResult.status,
      url: deploymentResult.url,
      deployedAt: new Date(),
    });
  } catch (error) {
    console.error('Failed to deploy:', error);
    return NextResponse.json(
      { error: 'Failed to deploy' },
      { status: 500 }
    );
  }
}

// app/api/builder/[projectId]/sync-cms/route.ts
/**
 * Manual CMS Sync
 * Sync all project data to CMS
 */
export async function POST_SYNC(
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Sync entire project to CMS
    await syncToCMS('fullSync', {
      projectId: params.projectId,
      project,
    });

    return NextResponse.json({
      projectId: params.projectId,
      synced: true,
      pages: project.pages.length,
      components: project.pages.reduce((sum, p) => sum + p.components.length, 0),
      features: project.features.length,
      timestamp: new Date(),
    });
  } catch (error) {
    console.error('Failed to sync:', error);
    return NextResponse.json(
      { error: 'Failed to sync to CMS' },
      { status: 500 }
    );
  }
}
