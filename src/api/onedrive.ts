import { msalInstance } from '../auth/AuthProvider';
import { graphScopes } from '../auth/msalConfig';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const APP_ROOT = '/me/drive/special/approot:';

async function getAccessToken(): Promise<string> {
  const account = msalInstance.getActiveAccount();
  if (!account) throw new Error('No active account. Please sign in.');

  const response = await msalInstance.acquireTokenSilent({
    ...graphScopes,
    account,
  });
  return response.accessToken;
}

async function graphFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken();
  const response = await fetch(`${GRAPH_BASE}${url}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  return response;
}

export interface OneDriveFile<T> {
  data: T;
  eTag: string | null;
}

export async function readJsonFile<T>(path: string): Promise<OneDriveFile<T> | null> {
  const response = await graphFetch(`${APP_ROOT}/${path}:/content`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to read ${path}: ${response.status} ${response.statusText}`);
  }
  const eTag = response.headers.get('ETag');
  const data = await response.json();
  return { data, eTag };
}

export async function writeJsonFile<T>(path: string, data: T, expectedETag?: string | null): Promise<string | null> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (expectedETag) {
    headers['If-Match'] = expectedETag;
  }

  const response = await graphFetch(`${APP_ROOT}/${path}:/content`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(data, null, 2),
  });

  if (response.status === 412) {
    throw new ConflictError(`File ${path} was modified externally. Please refresh and try again.`);
  }
  if (!response.ok) {
    throw new Error(`Failed to write ${path}: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  return result.eTag || null;
}

export async function deleteFile(path: string): Promise<void> {
  const response = await graphFetch(`${APP_ROOT}/${path}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete ${path}: ${response.status}`);
  }
}

export async function listFolder(path: string): Promise<{ name: string; lastModifiedDateTime: string }[]> {
  const response = await graphFetch(`${APP_ROOT}/${path}:/children`);
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`Failed to list ${path}: ${response.status}`);
  }
  const result = await response.json();
  return result.value.map((item: { name: string; lastModifiedDateTime: string }) => ({
    name: item.name,
    lastModifiedDateTime: item.lastModifiedDateTime,
  }));
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
