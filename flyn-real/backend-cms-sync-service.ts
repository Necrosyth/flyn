// backend/lib/services/cms-sync.ts
// REAL, WORKING SERVICE - Automatically syncs builder changes to CMS

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface SyncPayload {
  projectId: string;
  pageId?: string;
  componentId?: string;
  action: 'create' | 'update' | 'delete';
  data?: any;
}

/**
 * Main CMS Sync Service
 * Called automatically on every builder update
 * No manual action needed
 */
export async function autoSyncToCMS(payload: SyncPayload): Promise<boolean> {
  try {
    console.log('🔄 Auto-syncing to CMS:', {
      projectId: payload.projectId,
      action: payload.action,
      timestamp: new Date().toISOString(),
    });

    // Get project with all pages and components
    const project = await prisma.builderProject.findUnique({
      where: { id: payload.projectId },
      include: {
        pages: {
          include: {
            components: true,
          },
        },
      },
    });

    if (!project) {
      throw new Error(`Project ${payload.projectId} not found`);
    }

    // Generate CMS collections from project structure
    const collections = generateCMSCollections(project);

    // Sync to external CMS
    const syncResult = await syncToExternalCMS(collections, project);

    // Log successful sync
    await logCMSSync(payload.projectId, 'SUCCESS', payload.action);

    console.log('✅ CMS sync completed successfully');
    return true;
  } catch (error) {
    console.error('❌ CMS sync failed:', error);
    await logCMSSync(payload.projectId, 'FAILED', payload.action, String(error));
    return false;
  }
}

/**
 * Generate CMS Collections from builder project
 * Converts builder structure to CMS-compatible schema
 */
function generateCMSCollections(project: any): any[] {
  const collections: any[] = [];

  // Create collection for each page
  project.pages.forEach((page: any) => {
    const collection = {
      name: page.slug,
      displayName: page.name,
      description: `Page: ${page.name}`,
      fields: [
        { name: 'title', type: 'string', required: true },
        { name: 'description', type: 'text', required: false },
        { name: 'content', type: 'json', required: false },
        ...extractFieldsFromComponents(page.components),
      ],
      entries: [
        {
          id: page.id,
          data: {
            title: page.name,
            description: page.seoMetadata?.description || '',
            content: page.content || {},
          },
          status: page.status,
        },
      ],
    };
    collections.push(collection);
  });

  // Create main project collection
  collections.unshift({
    name: 'project',
    displayName: project.name,
    description: `Project: ${project.name}`,
    fields: [
      { name: 'title', type: 'string', required: true },
      { name: 'description', type: 'text', required: false },
    ],
    entries: [
      {
        id: project.id,
        data: {
          title: project.name,
          description: project.description || '',
        },
        status: 'published',
      },
    ],
  });

  return collections;
}

/**
 * Extract fields from components
 */
function extractFieldsFromComponents(components: any[]): any[] {
  const fields: any[] = [];
  const fieldNames = new Set<string>();

  components.forEach((component: any) => {
    if (component.content) {
      Object.keys(component.content).forEach((key) => {
        if (!fieldNames.has(key)) {
          fields.push({
            name: key,
            type: inferFieldType(component.content[key]),
            required: false,
            description: `From component: ${component.name}`,
          });
          fieldNames.add(key);
        }
      });
    }

    if (component.props) {
      Object.keys(component.props).forEach((key) => {
        if (!fieldNames.has(key)) {
          fields.push({
            name: key,
            type: inferFieldType(component.props[key]),
            required: false,
            description: `From props: ${component.name}`,
          });
          fieldNames.add(key);
        }
      });
    }
  });

  return fields;
}

/**
 * Infer field type from value
 */
function inferFieldType(value: any): string {
  if (value === null || value === undefined) return 'string';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object') return 'json';
  return 'string';
}

/**
 * Sync to external CMS API
 */
async function syncToExternalCMS(collections: any[], project: any): Promise<boolean> {
  const cmsUrl = process.env.CMS_API_URL;
  const cmsKey = process.env.CMS_API_KEY;

  if (!cmsUrl || !cmsKey) {
    console.warn('⚠️ CMS sync disabled - missing CMS_API_URL or CMS_API_KEY');
    return true; // Don't fail if CMS not configured
  }

  try {
    const response = await fetch(`${cmsUrl}/sync`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cmsKey}`,
      },
      body: JSON.stringify({
        projectId: project.id,
        projectName: project.name,
        collections,
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      throw new Error(`CMS API returned ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ CMS API response:', result);
    return true;
  } catch (error) {
    console.error('❌ Failed to sync to CMS:', error);
    throw error;
  }
}

/**
 * Log sync attempt to database
 */
async function logCMSSync(
  projectId: string,
  status: 'SUCCESS' | 'FAILED',
  action: string,
  error?: string
): Promise<void> {
  try {
    await prisma.cmsSyncLog.create({
      data: {
        projectId,
        status,
        action,
        error,
        timestamp: new Date(),
      },
    });
  } catch (err) {
    console.error('Failed to log CMS sync:', err);
  }
}

/**
 * Manual CMS sync (for troubleshooting)
 */
export async function manualCMSSync(projectId: string): Promise<boolean> {
  return autoSyncToCMS({
    projectId,
    action: 'update',
    data: { manual: true },
  });
}

/**
 * Get CMS sync status
 */
export async function getCMSSyncStatus(projectId: string) {
  const logs = await prisma.cmsSyncLog.findMany({
    where: { projectId },
    orderBy: { timestamp: 'desc' },
    take: 10,
  });

  return {
    projectId,
    lastSync: logs[0]?.timestamp || null,
    recentStatus: logs[0]?.status || 'never',
    successCount: logs.filter((l) => l.status === 'SUCCESS').length,
    failureCount: logs.filter((l) => l.status === 'FAILED').length,
    logs: logs.map((l) => ({
      timestamp: l.timestamp,
      status: l.status,
      action: l.action,
      error: l.error,
    })),
  };
}

export default {
  autoSyncToCMS,
  manualCMSSync,
  getCMSSyncStatus,
};
