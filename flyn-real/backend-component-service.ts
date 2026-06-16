// backend/lib/services/component.service.ts
import { prisma } from '@/lib/database';

export async function getComponentById(componentId: string) {
  return prisma.builderComponent.findUnique({
    where: { id: componentId },
  });
}

export async function getPageComponents(pageId: string) {
  return prisma.builderComponent.findMany({
    where: { pageId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createComponent(data: any) {
  return prisma.builderComponent.create({
    data: {
      projectId: data.projectId,
      pageId: data.pageId,
      name: data.name,
      type: data.type,
      props: data.props || {},
      styles: data.styles || {},
      content: data.content || {},
    },
  });
}

export async function updateComponent(componentId: string, data: any) {
  return prisma.builderComponent.update({
    where: { id: componentId },
    data,
  });
}

export async function deleteComponent(componentId: string) {
  return prisma.builderComponent.delete({
    where: { id: componentId },
  });
}
