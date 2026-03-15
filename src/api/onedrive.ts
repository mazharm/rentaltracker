import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { msalInstance } from '../auth/AuthProvider';
import { graphScopes, loginRequest } from '../auth/msalConfig';
import { DataSource } from '../models/types';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
const APP_ROOT = '/me/drive/special/approot:';

async function getAccessToken(): Promise<string> {
  const account = msalInstance.getActiveAccount();
  if (!account) throw new Error('No active account. Please sign in.');

  try {
    const response = await msalInstance.acquireTokenSilent({
      ...graphScopes,
      account,
    });
    return response.accessToken;
  } catch (e) {
    // If silent acquisition fails (e.g. scope change requiring re-consent), use popup
    if (e instanceof InteractionRequiredAuthError) {
      const response = await msalInstance.acquireTokenPopup(loginRequest);
      return response.accessToken;
    }
    throw e;
  }
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

/** Encode a OneDrive sharing URL into a share token for the /shares/ API */
export function encodeSharingUrl(sharingUrl: string): string {
  const base64 = btoa(sharingUrl);
  const encoded = base64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
  return `u!${encoded}`;
}

/** Cache resolved share tokens to avoid extra API calls */
const resolvedShares = new Map<string, { driveId: string; itemId: string }>();

async function resolveShare(sharingUrl: string): Promise<{ driveId: string; itemId: string }> {
  const token = encodeSharingUrl(sharingUrl);
  const cached = resolvedShares.get(token);
  if (cached) return cached;

  const response = await graphFetch(`/shares/${token}/driveItem?$select=id,parentReference`);
  if (!response.ok) {
    throw new Error(`Failed to resolve shared folder: ${response.status} ${response.statusText}`);
  }
  const data = await response.json();
  const resolved = { driveId: data.parentReference.driveId, itemId: data.id };
  resolvedShares.set(token, resolved);
  return resolved;
}

async function getBasePath(source: DataSource): Promise<string> {
  if (source.type === 'own') return APP_ROOT;
  const { driveId, itemId } = await resolveShare(source.sharingUrl);
  return `/drives/${driveId}/items/${itemId}:`;
}

export interface OneDriveFile<T> {
  data: T;
  eTag: string | null;
}

export async function readJsonFile<T>(path: string, source: DataSource = { type: 'own' }): Promise<OneDriveFile<T> | null> {
  const base = await getBasePath(source);
  const response = await graphFetch(`${base}/${path}:/content`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Failed to read ${path}: ${response.status} ${response.statusText}`);
  }
  const eTag = response.headers.get('ETag');
  const data = await response.json();
  return { data, eTag };
}

export async function writeJsonFile<T>(path: string, data: T, expectedETag?: string | null, source: DataSource = { type: 'own' }): Promise<string | null> {
  const base = await getBasePath(source);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (expectedETag) {
    headers['If-Match'] = expectedETag;
  }

  const response = await graphFetch(`${base}/${path}:/content`, {
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

export async function deleteFile(path: string, source: DataSource = { type: 'own' }): Promise<void> {
  const base = await getBasePath(source);
  const response = await graphFetch(`${base}/${path}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete ${path}: ${response.status}`);
  }
}

export async function listFolder(path: string, source: DataSource = { type: 'own' }): Promise<{ name: string; lastModifiedDateTime: string }[]> {
  const base = await getBasePath(source);
  const response = await graphFetch(`${base}/${path}:/children`);
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

/** Get the driveItem ID of the app root folder (needed for creating share links) */
export async function getAppRootItemId(): Promise<string> {
  const response = await graphFetch('/me/drive/special/approot');
  if (!response.ok) {
    throw new Error(`Failed to get app root: ${response.status}`);
  }
  const data = await response.json();
  return data.id;
}

/** Create an edit sharing link on the app root folder */
export async function createShareLink(): Promise<string> {
  const itemId = await getAppRootItemId();
  const response = await graphFetch(`/me/drive/items/${itemId}/createLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'edit', scope: 'anonymous' }),
  });
  if (!response.ok) {
    throw new Error(`Failed to create share link: ${response.status}`);
  }
  const data = await response.json();
  return data.link.webUrl;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
