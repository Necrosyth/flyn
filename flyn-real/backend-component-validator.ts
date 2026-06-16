// backend/lib/validators/component.ts
export function validateComponent(data: any) {
  const errors: string[] = [];

  if (!data.name || typeof data.name !== 'string') {
    errors.push('Component name is required');
  }

  if (!data.type || typeof data.type !== 'string') {
    errors.push('Component type is required');
  }

  if (!data.pageId || typeof data.pageId !== 'string') {
    errors.push('Page ID is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
