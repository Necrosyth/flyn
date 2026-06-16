import { prisma } from '@/lib/database';
import { logger } from '@/lib/utils/logging';

interface SyncPayload {
  projectId: string;
  action: 'create' | 'update' | 'delete';
}

export async function syncToCMS(payload: SyncPayload): Promise<boolean> {
  try {
    logger.info('Starting CMS sync', { projectId: payload.projectId });

    const project = await prisma.builderProject.findUnique({
      where: { id: payload.projectId },
      include: {
        pages: { include: { components: true } },
      },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // Generate CMS collections from project structure
    const collections = generateCollections(project);

    // Send to CMS API
    await pushToExternalCMS(collections);

    // Log successful sync
    await prisma.cmsSyncLog.create({
      data: {
        projectId: payload.projectId,
        status: 'SUCCESS',
        action: payload.action,
      },
    });

    logger.info('CMS sync completed', { projectId: payload.projectId });
    return true;
  } catch (error) {
    logger.error('CMS sync failed', { error: String(error) });
    return false;
  }
}

function generateCollections(project: any): any[] {
  return project.pages.map((page: any) => ({
    name: page.slug,
    fields: [
      { name: 'title', type: 'string' },
      { name: 'content', type: 'text' },
      ...Object.keys(page.content || {}).map((key: string) => ({
        name: key,
        type: 'string',
      })),
    ],
    entries: [
      {
        id: page.id,
        data: page.content || {},
        status: page.status,
      },
    ],
  }));
}

async function pushToExternalCMS(collections: any[]): Promise<void> {
  const cmsUrl = process.env.CMS_API_URL;
  const cmsKey = process.env.CMS_API_KEY;

  if (!cmsUrl || !cmsKey) {
    logger.warn('CMS sync disabled: missing credentials');
    return;
  }

  const response = await fetch(`${cmsUrl}/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${cmsKey}`,
    },
    body: JSON.stringify({ collections, timestamp: new Date() }),
  });

  if (!response.ok) {
    throw new Error(`CMS API error: ${response.status}`);
  }
}
ROUTE

# Continue with more files...
echo "✅ Created backend routes and services"

echo ""
echo "Creating actual source code files..."
ls -la $ROOT/ | head -10

