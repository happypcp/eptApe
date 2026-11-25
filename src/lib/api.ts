import { auth } from './firebase';

export class ApiError extends Error {
  status: number;
  data?: Record<string, unknown>;
  constructor(message: string, status: number, data?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

export async function getAuthToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    return await user.getIdToken();
  } catch {
    return null;
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit & { requireToken?: boolean } = {}
): Promise<T> {
  const { requireToken = false, headers: customHeaders, ...rest } = options;
  const token = await getAuthToken();
  if (requireToken && !token) {
    throw new ApiError('Please sign in to continue.', 401);
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders as Record<string, string>),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const resp = await fetch(url, {
    ...rest,
    headers,
  });

  const text = await resp.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = { error: text };
    }
  }

  if (!resp.ok) {
    const msg =
      typeof json.error === 'string'
        ? json.error
        : typeof json.message === 'string'
        ? json.message
        : `Request failed (${resp.status})`;
    throw new ApiError(msg, resp.status, json);
  }

  return json as T;
}
