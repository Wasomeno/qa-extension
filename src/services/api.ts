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
    const url = `https://playground-qa-extension.online/api${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (options.headers) {
      const h = new Headers(options.headers);
      h.forEach((v, k) => {
        headers[k] = v;
      });
    }

    const finalBody: any = options.body;
    const finalHeaders = { ...headers };

    const resp = await bridgeFetch<T>({
      url,
      init: {
        ...options,
        headers: finalHeaders,
        credentials: 'include',
        body: finalBody,
      },
      responseType: 'json',
    });

    if (!resp.ok) {
      console.error(
        `[API Service] Error for ${endpoint}:`,
        resp.status,
        resp.statusText,
        resp.body
      );
      return {
        success: false,
        error:
          (resp.body as any)?.error ||
          (resp.body as any)?.message ||
          `API Error: ${resp.status} ${resp.statusText}`,
      };
    }

    return {
      success: true,
      data: resp.body,
    };
  } catch (error) {
    console.error(`[API Service] Network error for ${endpoint}:`, error);
    return {
      success: false,
      error: (error as Error)?.message || 'Network error calling API',
    };
  }
}

export const api = {
  post: async <T>(endpoint: string, options?: RequestInit) => {
    const { body, ...rest } = options || {};

    // Check if body is FormData
    const isFormData = body instanceof FormData;

    const resp = await request<T>(endpoint, {
      method: 'POST',
      ...rest,
      body: isFormData ? body : body ? JSON.stringify(body) : undefined,
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
    const { body, ...rest } = options || {};
    const resp = await request<T>(endpoint, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      ...rest,
    });

    return resp;
  },
  patch: async <T>(endpoint: string, options?: RequestInit) => {
    const { body, ...rest } = options || {};
    const resp = await request<T>(endpoint, {
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      ...rest,
    });

    return resp;
  },
} as const;
