export const DEMO_AUTH_TOKEN = 'flyn-demo-token';

export const isDemoModeEnabled = (): boolean => {
  return process.env.NODE_ENV !== 'production' || process.env.DEMO_MODE === 'true' || process.env.DEMO_AUTH_ENABLED === 'true';
};

export const isDemoAuthToken = (token?: string): boolean => {
  return isDemoModeEnabled() && token === DEMO_AUTH_TOKEN;
};

export const getDemoDecodedToken = () => ({
  uid: 'demo-user',
  email: 'demo@flyn.local',
  organization_id: 'demo-org',
  role: 'owner',
  name: 'Demo Admin',
  plan: 'enterprise',
  tenantId: 'demo-org',
  roles: ['admin'],
});
