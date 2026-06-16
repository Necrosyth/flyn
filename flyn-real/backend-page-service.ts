// backend/lib/services/page.service.ts
import { prisma } from '@/lib/database';

export async function getPageById(pageId: string) {
  return prisma.builderPage.findUnique({
    where: { id: pageId },
    include: { components: true },
  });
}

export async function getProjectPages(projectId: string) {
  return prisma.builderPage.findMany({
    where: { projectId },
    include: { components: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createPage(projectId: string, data: any) {
  return prisma.builderPage.create({
    data: {
      projectId,
      name: data.name,
      slug: data.slug,
      content: data.content || {},
      status: 'DRAFT',
    },
  });
}

export async function updatePage(pageId: string, data: any) {
  return prisma.builderPage.update({
    where: { id: pageId },
    data,
  });
}

export async function deletePage(pageId: string) {
  return prisma.builderPage.delete({
    where: { id: pageId },
  });
}
