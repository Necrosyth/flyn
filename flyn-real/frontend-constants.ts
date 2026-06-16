// frontend/src/utils/constants.ts
export const BUILDER_MODES = [
  { id: 'website', label: '🌐 Website' },
  { id: 'community', label: '👥 Community' },
  { id: 'marketplace', label: '🛍 Marketplace' },
  { id: 'membership', label: '💳 Membership' },
  { id: 'blank', label: '⬜ Blank' },
  { id: 'app', label: '📱 App' },
];

export const CODE_FRAMEWORKS = [
  'nextjs', 'vue', 'html', 'svelte', 'angular',
  'php', 'python', 'go', 'ruby',
  'react-native', 'ios', 'android'
];

export const DEPLOYMENT_PLATFORMS = [
  'cloudflare_pages', 'vercel', 'aws_amplify',
  'netlify', 'heroku', 'docker'
];

export const API_TIMEOUT = 30000;
export const DEBOUNCE_DELAY = 500;
