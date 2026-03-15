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
  return 'u!' + base64.replace(/=+$/, '').replace(/\//g, '_').replace(/\+/g, '-');
}

// --- Share resolution cache ---
// After resolving a share URL via /shares/{token}/driveItem, the accessing user
// gets delegated permissions on the shared folder. We cache the resolved
// driveId/itemId so we can construct standard /drives/ paths.
const resolvedShares: Record<string, { driveId: string; itemId: string }> = {};

/**
 * Resolve a sharing URL or share token from the current user's perspective.
 * This establishes delegated access and caches the driveId/itemId for file operations.
 * Must be called before any file operations on a shared data source.
 *
 * The shareUrl may be either:
 * - A share token (starts with "u!" — from Graph API's shareId field)
 * - A raw sharing URL (legacy — will be base64url-encoded into a token)
 */
export async function redeemShare(source: DataSource): Promise<void> {
  if (source.type === 'own') return;
  if (resolvedShares[source.shareUrl]) return; // Already resolved this session

  // If it already looks like a share token (starts with "u!"), use it directly.
  // Otherwise, encode the raw URL into a token.
  const token = source.shareUrl.startsWith('u!')
    ? source.shareUrl
    : encodeSharingUrl(source.shareUrl);
  const response = await graphFetch(`/shares/${token}/driveItem`);
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Failed to access shared data (${response.status}): ${text || response.statusText}`);
  }
  const data = await response.json();
  if (!data.parentReference?.driveId || !data.id) {
    throw new Error('Shared item resolved but missing driveId or itemId in response');
  }
  resolvedShares[source.shareUrl] = {
    driveId: data.parentReference.driveId,
    itemId: data.id,
  };
}

/** Clear the share resolution cache (e.g., on sign-out) */
export function clearShareCache(): void {
  for (const key of Object.keys(resolvedShares)) {
    delete resolvedShares[key];
  }
}

function getBasePath(source: DataSource): string {
  if (source.type === 'own') return APP_ROOT;

  const resolved = resolvedShares[source.shareUrl];
  if (!resolved) {
    throw new Error('Share not resolved. Call redeemShare() before accessing shared files.');
  }
  return `/drives/${resolved.driveId}/items/${resolved.itemId}:`;
}

export interface OneDriveFile<T> {
  data: T;
  eTag: string | null;
}

export async function readJsonFile<T>(path: string, source: DataSource = { type: 'own' }): Promise<OneDriveFile<T> | null> {
  const base = getBasePath(source);
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
  const base = getBasePath(source);
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
  const base = getBasePath(source);
  const response = await graphFetch(`${base}/${path}`, {
    method: 'DELETE',
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete ${path}: ${response.status}`);
  }
}

export async function listFolder(path: string, source: DataSource = { type: 'own' }): Promise<{ name: string; lastModifiedDateTime: string }[]> {
  const base = getBasePath(source);
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

/** Create an edit sharing link on the app root folder */
export async function createShareLink(): Promise<string> {
  // Get the app root folder's itemId
  const appRootResponse = await graphFetch('/me/drive/special/approot');
  if (!appRootResponse.ok) {
    throw new Error(`Failed to get app root: ${appRootResponse.status}`);
  }
  const appRoot = await appRootResponse.json();
  const itemId = appRoot.id;

  // Create an edit link (try edit first, fall back to view for consumer accounts)
  let response = await graphFetch(`/me/drive/items/${itemId}/createLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'edit', scope: 'anonymous' }),
  });

  if (!response.ok) {
    // Fall back to view-only link
    response = await graphFetch(`/me/drive/items/${itemId}/createLink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'view', scope: 'anonymous' }),
    });
  }

  if (!response.ok) {
    throw new Error(`Failed to create share link: ${response.status}`);
  }

  const data = await response.json();
  // Prefer the shareId token (works directly with /shares/ API) over
  // the webUrl (which requires manual base64url encoding and can break
  // when Microsoft changes the URL format).
  const shareId: string | undefined = data.shareId ?? data.link?.shareId;
  if (shareId) {
    return shareId;
  }
  const shareUrl = data.link?.webUrl;
  if (!shareUrl) {
    throw new Error('Share link created but no shareId or webUrl returned');
  }
  return shareUrl;
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
