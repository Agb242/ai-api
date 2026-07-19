import { getAuthToken } from '../auth-token';
import { useAuthStore } from '../stores/auth.store';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
  message?: string;
}

function handleAuthFailure(code: string, status: number, endpoint: string) {
  if (typeof window === 'undefined') return;
  if (status !== 401) return;
  if (code !== 'INVALID_SESSION' && code !== 'UNAUTHORIZED') return;
  // Login endpoints return 401 for bad OTP — do not wipe session there
  if (
    endpoint.includes('/auth/request-otp') ||
    endpoint.includes('/auth/verify-otp') ||
    endpoint.includes('/auth/google')
  ) {
    return;
  }
  useAuthStore.getState().clearAll();
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3018/api/v1') {
    this.baseUrl = baseUrl;
  }

  protected async getAuthToken(): Promise<string | null> {
    if (typeof window !== 'undefined') {
      return getAuthToken();
    }
    return null;
  }

  protected async getOrgId(): Promise<string | null> {
    if (typeof window !== 'undefined') {
      return useAuthStore.getState().org?.id || null;
    }
    return null;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = await this.getAuthToken();
    const orgId = await this.getOrgId();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    if (orgId && !headers['X-Org-ID']) {
      headers['X-Org-ID'] = orgId;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const json = await response.json();

      if (!response.ok) {
        const code = json.error?.code || 'UNKNOWN_ERROR';
        handleAuthFailure(code, response.status, endpoint);
        return {
          success: false,
          error: {
            message:
              (typeof json.error === 'string' ? json.error : json.error?.message) ||
              json.message ||
              'An error occurred',
            code,
          },
        };
      }

      const payload = json?.data !== undefined ? json.data : json;
      return { success: true, data: payload };
    } catch {
      return {
        success: false,
        error: {
          message: 'Server connection error',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  private async requestWithApiKey<T>(
    endpoint: string,
    apiKey: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    };

    // Merge additional headers if provided
    if (options.headers) {
      Object.assign(headers, options.headers);
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const json = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            message:
              (typeof json.error === 'string' ? json.error : json.error?.message) ||
              json.message ||
              'An error occurred',
            code: json.error?.code || 'UNKNOWN_ERROR',
          },
        };
      }

      const payload = json?.data !== undefined ? json.data : json;
      return { success: true, data: payload };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Server connection error',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  // GET request
  async get<T>(endpoint: string, options?: { params?: Record<string, any>; headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    let url = endpoint;
    if (options?.params) {
      const searchParams = new URLSearchParams();
      Object.entries(options.params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          searchParams.append(key, String(value));
        }
      });
      const queryString = searchParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    
    return this.request<T>(url, { 
      method: 'GET',
      headers: options?.headers,
    });
  }

  // POST request
  async post<T>(endpoint: string, data?: any, options?: { headers?: Record<string, string>; responseType?: 'blob' }): Promise<ApiResponse<T>> {
    if (options?.responseType === 'blob') {
      // Special handling for blob responses (file downloads)
      const url = `${this.baseUrl}${endpoint}`;
      const token = await this.getAuthToken();
      const orgId = await this.getOrgId();

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options?.headers,
      };

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      if (orgId && !headers['X-Org-ID']) {
        headers['X-Org-ID'] = orgId;
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: data ? JSON.stringify(data) : undefined,
        });

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            error: {
              message: `HTTP ${response.status}: ${errorText}`,
              code: 'HTTP_ERROR',
            },
          };
        }

        const blob = await response.blob();
        return { success: true, data: blob as T };
      } catch (error) {
        return {
          success: false,
          error: {
            message: 'Server connection error',
            code: 'NETWORK_ERROR',
          },
        };
      }
    }

    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
      headers: options?.headers,
    });
  }

  // POST request returning the full raw JSON (no unwrapping of json.data)
  async postRaw<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = await this.getAuthToken();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: data ? JSON.stringify(data) : undefined,
      });

      const json = await response.json();

      if (!response.ok) {
        const code = json.error?.code || 'UNKNOWN_ERROR';
        handleAuthFailure(code, response.status, endpoint);
        return {
          success: false,
          error: {
            message:
              (typeof json.error === 'string' ? json.error : json.error?.message) ||
              json.message ||
              'An error occurred',
            code,
          },
        };
      }

      return { success: true, data: json as T };
    } catch {
      return {
        success: false,
        error: {
          message: 'Server connection error',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  // PATCH request
  async patch<T>(endpoint: string, data?: any, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PATCH',
      body: data ? JSON.stringify(data) : undefined,
      headers: options?.headers,
    });
  }

  // PUT request
  async put<T>(endpoint: string, data?: any, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
      headers: options?.headers,
    });
  }

  // DELETE request
  async delete<T>(endpoint: string, options?: { headers?: Record<string, string> }): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { 
      method: 'DELETE',
      headers: options?.headers,
    });
  }

  // POST with API Key (for noabi checks)
  async postWithApiKey<T>(
    endpoint: string,
    apiKey: string,
    data?: any
  ): Promise<ApiResponse<T>> {
    return this.requestWithApiKey<T>(endpoint, apiKey, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  // GET with API Key (for noabi usage)
  async getWithApiKey<T>(
    endpoint: string,
    apiKey: string
  ): Promise<ApiResponse<T>> {
    return this.requestWithApiKey<T>(endpoint, apiKey, { method: 'GET' });
  }

  // DELETE with API Key
  async deleteWithApiKey<T>(
    endpoint: string,
    apiKey: string
  ): Promise<ApiResponse<T>> {
    return this.requestWithApiKey<T>(endpoint, apiKey, { method: 'DELETE' });
  }

  // Upload file with custom field name
  async uploadFile<T>(endpoint: string, file: File, fieldName: string = 'file'): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = await this.getAuthToken();
    const orgId = await this.getOrgId();

    const formData = new FormData();
    formData.append(fieldName, file);

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    if (orgId) {
      headers['X-Org-ID'] = orgId;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      const json = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            message:
              (typeof json.error === 'string' ? json.error : json.error?.message) ||
              json.message ||
              'An error occurred',
            code: json.error?.code || 'UNKNOWN_ERROR',
          },
        };
      }

      const payload = json?.data !== undefined ? json.data : json;
      return { success: true, data: payload };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Server connection error',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }

  // Upload file (legacy - avatar)
  async upload<T>(endpoint: string, file: File): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const token = await this.getAuthToken();

    const formData = new FormData();
    formData.append('avatar', file);

    const headers: Record<string, string> = {};
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: formData,
      });

      const json = await response.json();

      if (!response.ok) {
        return {
          success: false,
          error: {
            message:
              (typeof json.error === 'string' ? json.error : json.error?.message) ||
              json.message ||
              'An error occurred',
            code: json.error?.code || 'UNKNOWN_ERROR',
          },
        };
      }

      const payload = json?.data !== undefined ? json.data : json;
      return { success: true, data: payload };
    } catch (error) {
      return {
        success: false,
        error: {
          message: 'Server connection error',
          code: 'NETWORK_ERROR',
        },
      };
    }
  }
}

export const apiClient = new ApiClient();
