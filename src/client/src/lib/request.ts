/**
 * Shared HTTP request utility
 * Centralized request logic with authentication and error handling
 */

export class ApiError extends Error {
  status: number;
  data?: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

/**
 * Make authenticated HTTP request
 */
export async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('authToken');

  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  // JSON bodies only: FormData sets its own multipart Content-Type (with boundary)
  if (options.body && !(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`/api${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorData: unknown;
    const text = await response.text();
    try {
      errorData = JSON.parse(text);
    } catch {
      errorData = text;
    }

    throw new ApiError(
      response.status,
      `API Error: ${response.statusText}`,
      errorData
    );
  }

  // Handle 204 No Content
  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
