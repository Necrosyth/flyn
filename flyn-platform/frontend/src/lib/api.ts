const envBaseUrl = import.meta.env.VITE_API_BASE_URL as string | undefined;

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

export const API_BASE_URL = envBaseUrl?.trim()
  ? envBaseUrl.trim().replace(/\/$/, '')
  : (isLocalhost ? 'http://localhost:3000/api' : 'https://pjpmzvu7wn.us-east-1.awsapprunner.com/api');

console.log('[API Lib] Using API_BASE_URL:', API_BASE_URL);
