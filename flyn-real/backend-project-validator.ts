// backend/lib/validators/project.ts
export function validateProject(data: any) {
  const errors: string[] = [];

  if (!data.name || typeof data.name !== 'string' || data.name.length < 1) {
    errors.push('Project name is required');
  }

  if (data.name && data.name.length > 100) {
    errors.push('Project name must be less than 100 characters');
  }

  if (data.description && data.description.length > 500) {
    errors.push('Description must be less than 500 characters');
  }

  const validModes = ['WEBSITE', 'COMMUNITY', 'MARKETPLACE', 'MEMBERSHIP', 'BLANK', 'APP'];
  if (data.mode && !validModes.includes(data.mode)) {
    errors.push('Invalid builder mode');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
