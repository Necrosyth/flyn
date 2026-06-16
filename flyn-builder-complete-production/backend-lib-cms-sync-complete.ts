// backend/lib/cms-sync.ts
/**
 * CMS Auto-Sync Service
 * Automatically syncs ALL builder changes to CMS
 * Default behavior - every update triggers sync
 * No manual action needed from user
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface SyncPayload {
  projectId: string;
  pageId?: string;
  componentId?: string;
  action: 'create' | 'update' | 'delete';
  data: any;
}

interface CMSCollection {
  name: string;
  displayName: string;
  description: string;
  fields: CMSField[];
  entries: CMSEntry[];
}

interface CMSField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

interface CMSEntry {
  id: string;
  data: Record<string, any>;
  status: 'draft' | 'published';
}

/**
 * MAIN ENTRY POINT - Called automatically on every builder change
 * Triggered by: API routes after database update
 * No manual action needed
 */
export async function autoSyncToCMS(payload: SyncPayload): Promise<boolean> {
  try {
    console.log(`🔄 Auto-syncing to CMS:`, {
      projectId: payload.projectId,
      action: payload.action,
      timestamp: new Date().toISOString(),
    });

    // Get project details
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

    // Generate CMS collections from project
    const cmsCollections = generateCMSCollections(project);

    // Sync to CMS API
    await syncToExternalCMS(cmsCollections, project);

    // Log sync
    await logCMSSync(payload.projectId, 'success', payload.action);

    console.log(`✅ CMS sync completed for project ${payload.projectId}`);
    return true;
  } catch (error) {
    console.error(`❌ CMS sync failed:`, error);
    await logCMSSync(payload.projectId, 'failed', payload.action, String(error));
    return false;
  }
}

/**
 * Generate CMS Collections from builder project
 * Converts page structure to CMS-compatible schema
 */
function generateCMSCollections(project: any): CMSCollection[] {
  const collections: CMSCollection[] = [];

  // Create collection for each page
  project.pages.forEach((page: any) => {
    const collection: CMSCollection = {
      name: page.slug,
      displayName: page.name,
      description: `Page: ${page.name}`,
      fields: generateFieldsFromComponents(page.components),
      entries: generateEntriesFromPage(page),
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
      { name: 'pages', type: 'relation', required: false },
    ],
    entries: [
      {
        id: project.id,
        data: {
          title: project.name,
          description: project.description,
        },
        status: 'published',
      },
    ],
  });

  return collections;
}

/**
 * Generate CMS fields from components
 */
function generateFieldsFromComponents(components: any[]): CMSField[] {
  const fields: CMSField[] = [];
  const fieldNames = new Set<string>();

  components.forEach((component: any) => {
    // Extract content fields from component
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

    // Extract props as fields
    if (component.props) {
      Object.keys(component.props).forEach((key) => {
        if (!fieldNames.has(key)) {
          fields.push({
            name: key,
            type: inferFieldType(component.props[key]),
            required: false,
            description: `From component props: ${component.name}`,
          });
          fieldNames.add(key);
        }
      });
    }
  });

  return fields;
}

/**
 * Infer CMS field type from value
 */
function inferFieldType(value: any): string {
  if (value === null || value === undefined) return 'string';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'object') return 'object';
  return 'string';
}

/**
 * Generate CMS entries from page data
 */
function generateEntriesFromPage(page: any): CMSEntry[] {
  const entries: CMSEntry[] = [];

  const pageEntry: CMSEntry = {
    id: page.id,
    data: {
      name: page.name,
      slug: page.slug,
      title: page.seoMetadata?.title || page.name,
      description: page.seoMetadata?.description || '',
      content: page.content || {},
    },
    status: page.status === 'published' ? 'published' : 'draft',
  };

  entries.push(pageEntry);

  // Create entries for each component
  page.components?.forEach((component: any) => {
    entries.push({
      id: component.id,
      data: {
        name: component.name,
        type: component.type,
        content: component.content || {},
        props: component.props || {},
        styles: component.styles || {},
      },
      status: 'draft',
    });
  });

  return entries;
}

/**
 * Sync to external CMS API
 * POST to CMS endpoint with auto-generated schema
 */
async function syncToExternalCMS(
  collections: CMSCollection[],
  project: any
): Promise<void> {
  const cmsUrl = process.env.CMS_API_URL;
  const cmsKey = process.env.CMS_API_KEY;

  if (!cmsUrl || !cmsKey) {
    console.warn('⚠️ CMS sync disabled - missing CMS_API_URL or CMS_API_KEY');
    return;
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
      throw new Error(`CMS API returned ${response.status}: ${await response.text()}`);
    }

    const result = await response.json();
    console.log('✅ CMS sync response:', result);
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
  status: 'success' | 'failed',
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
 * Utility: Trigger manual sync (for troubleshooting)
 */
export async function manualCMSSync(projectId: string): Promise<boolean> {
  return autoSyncToCMS({
    projectId,
    action: 'update',
    data: { manual: true },
  });
}

/**
 * Utility: Get CMS sync status
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
    successCount: logs.filter((l) => l.status === 'success').length,
    failureCount: logs.filter((l) => l.status === 'failed').length,
    logs: logs.map((l) => ({
      timestamp: l.timestamp,
      status: l.status,
      action: l.action,
      error: l.error,
    })),
  };
}

/**
 * Utility: Reset CMS sync (clear logs)
 */
export async function resetCMSSync(projectId: string): Promise<void> {
  await prisma.cmsSyncLog.deleteMany({
    where: { projectId },
  });
}

export default {
  autoSyncToCMS,
  manualCMSSync,
  getCMSSyncStatus,
  resetCMSSync,
};
