// frontend/src/services/api.ts
import axios, { AxiosInstance, AxiosError, AxiosRequestConfig } from 'axios';

const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface RequestConfig extends AxiosRequestConfig {
  retries?: number;
}

let apiClient: AxiosInstance | null = null;
let authToken: string | null = null;

/**
 * Initialize API client
 */
export function initializeAPI(token?: string) {
  if (token) {
    authToken = token;
    localStorage.setItem('authToken', token);
  }

  apiClient = axios.create({
    baseURL: BASE_URL,
    timeout: 30000,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  // Add request interceptor for auth
  apiClient.interceptors.request.use((config) => {
    const token = authToken || localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  // Add response interceptor for error handling
  apiClient.interceptors.response.use(
    (response) => response,
    async (error: AxiosError) => {
      // Handle 401 - token expired
      if (error.response?.status === 401) {
        authToken = null;
        localStorage.removeItem('authToken');
        window.location.href = '/login';
      }
      return Promise.reject(error);
    }
  );
}

/**
 * Make GET request with retry logic
 */
export async function get<T = any>(url: string, config?: RequestConfig): Promise<T> {
  if (!apiClient) initializeAPI();

  const maxRetries = config?.retries || 3;
  let lastError: any;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await apiClient!.get<T>(url, config);
      return response.data;
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
      }
    }
  }

  throw lastError;
}

/**
 * Make POST request
 */
export async function post<T = any>(url: string, data?: any, config?: RequestConfig): Promise<T> {
  if (!apiClient) initializeAPI();

  try {
    const response = await apiClient!.post<T>(url, data, config);
    return response.data;
  } catch (error) {
    console.error('POST error:', error);
    throw error;
  }
}

/**
 * Make PUT request
 */
export async function put<T = any>(url: string, data?: any, config?: RequestConfig): Promise<T> {
  if (!apiClient) initializeAPI();

  try {
    const response = await apiClient!.put<T>(url, data, config);
    return response.data;
  } catch (error) {
    console.error('PUT error:', error);
    throw error;
  }
}

/**
 * Make DELETE request
 */
export async function del<T = any>(url: string, config?: RequestConfig): Promise<T> {
  if (!apiClient) initializeAPI();

  try {
    const response = await apiClient!.delete<T>(url, config);
    return response.data;
  } catch (error) {
    console.error('DELETE error:', error);
    throw error;
  }
}

/**
 * Login
 */
export async function login(email: string, password: string) {
  const response = await post('/api/auth/login', { email, password });
  if (response.accessToken) {
    initializeAPI(response.accessToken);
  }
  return response;
}

/**
 * Logout
 */
export function logout() {
  authToken = null;
  localStorage.removeItem('authToken');
  localStorage.clear();
}

/**
 * Get auth token
 */
export function getAuthToken(): string | null {
  return authToken || localStorage.getItem('authToken');
}

export const api = {
  get,
  post,
  put,
  delete: del,
  login,
  logout,
  getAuthToken,
  initialize: initializeAPI,
};

export default api;
