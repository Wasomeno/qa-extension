import bridgeFetch from './fetch-bridge';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T | null;
  error?: string;
  message?: string;
  meta?: any;
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  try {
    const url = `http://localhost:3000${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.headers) {
      const h = new Headers(options.headers);
      h.forEach((v, k) => {
        headers[k] = v;
      });
    }

    const resp = await bridgeFetch<T>({
      url,
      init: {
        ...options,
        headers,
      },
      responseType: 'json',
    });

    if (!resp.ok) {
      return {
        success: false,
        error: `GitLab API Error: ${resp.status} ${resp.statusText}`,
        // message: resp.body,
      };
    }

    return {
      success: true,
      data: resp.body,
    };
  } catch (error) {
    return {
      success: false,
      // error: error?.message || 'Network error calling GitLab API',
    };
  }
}

export const api = {
  post: async <T>(endpoint: string, options?: RequestInit) => {
    const resp = await request<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(options?.body),
      ...options,
    });

    return resp;
  },
  get: async <T>(endpoint: string, options: RequestInit = {}) => {
    const resp = await request<T>(endpoint, {
      method: 'GET',
      ...options,
    });

    return resp;
  },
  delete: async <T>(endpoint: string, options: RequestInit = {}) => {
    const resp = await request<T>(endpoint, {
      method: 'DELETE',
      ...options,
    });

    return resp;
  },
  put: async <T>(endpoint: string, options?: RequestInit) => {
    const resp = await request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(options?.body),
      ...options,
    });

    return resp;
  },
  patch: async <T>(endpoint: string, options?: RequestInit) => {
    const resp = await request<T>(endpoint, {
      method: 'PATCH',
      body: JSON.stringify(options?.body),
      ...options,
    });

    return resp;
  },
} as const;
