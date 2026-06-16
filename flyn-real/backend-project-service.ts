// backend/lib/services/project.service.ts
import { prisma } from '@/lib/database';

export async function getProjectById(projectId: string) {
  return prisma.builderProject.findUnique({
    where: { id: projectId },
    include: { pages: true, components: true },
  });
}

export async function getUserProjects(userId: string) {
  return prisma.builderProject.findMany({
    where: { userId },
    include: { pages: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function createProject(userId: string, data: any) {
  return prisma.builderProject.create({
    data: {
      userId,
      name: data.name,
      description: data.description || '',
      slug: data.slug || data.name.toLowerCase().replace(/\s/g, '-'),
      mode: data.mode || 'WEBSITE',
    },
  });
}

export async function updateProject(projectId: string, data: any) {
  return prisma.builderProject.update({
    where: { id: projectId },
    data,
  });
}

export async function deleteProject(projectId: string) {
  return prisma.builderProject.delete({
    where: { id: projectId },
  });
}
