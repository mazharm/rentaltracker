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
const resolvedShares: Record<string, { driveId: string; itemId: string }> = {};

/**
 * Resolve a shared data source and cache the driveId/itemId for file operations.
 *
 * Strategy (in order):
 * 1. If the DataSource already has driveId/itemId, try direct access.
 * 2. If a shareUrl is present, try the /shares/ API with multiple token formats.
 * 3. Cache whichever succeeds so subsequent file operations use /drives/ paths.
 */
export async function redeemShare(source: DataSource): Promise<void> {
  if (source.type === 'own') return;
  if (resolvedShares[source.shareUrl]) return; // Already resolved this session

  // Strategy 1: If driveId/itemId are provided directly, verify access
  if (source.driveId && source.itemId) {
    const verifyResponse = await graphFetch(
      `/drives/${source.driveId}/items/${source.itemId}`
    );
    if (verifyResponse.ok) {
      resolvedShares[source.shareUrl] = {
        driveId: source.driveId,
        itemId: source.itemId,
      };
      return;
    }
    // Direct access didn't work — fall through to /shares/ redemption
  }

  // Strategy 2: Try the /shares/ API to redeem the share and get driveId/itemId
  if (source.shareUrl) {
    const shareErrors: string[] = [];

    // Build a list of tokens to try
    const tokens: string[] = [];
    // If it already looks like a share token, use it directly
    if (source.shareUrl.startsWith('u!')) {
      tokens.push(source.shareUrl);
    }
    // Always try encoding the URL
    if (!source.shareUrl.startsWith('u!')) {
      tokens.push(encodeSharingUrl(source.shareUrl));
    }

    for (const token of tokens) {
      const response = await graphFetch(`/shares/${token}/driveItem`, {
        headers: { 'Prefer': 'redeemSharingLink' },
      });
      if (response.ok) {
        const data = await response.json();
        if (data.parentReference?.driveId && data.id) {
          resolvedShares[source.shareUrl] = {
            driveId: data.parentReference.driveId,
            itemId: data.id,
          };
          return;
        }
      }
      const text = await response.text().catch(() => '');
      shareErrors.push(`Token ${token.substring(0, 20)}...: ${response.status} ${text.substring(0, 100)}`);
    }

    // If /shares/ failed but we have driveId/itemId, we already tried those above.
    // Provide a detailed error.
    throw new Error(
      `Failed to access shared data. ` +
      (source.driveId ? `Direct access to drive also failed. ` : '') +
      `Share API errors: ${shareErrors.join('; ')}`
    );
  }

  throw new Error('Shared data source has no shareUrl or driveId/itemId');
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

/**
 * Create an edit sharing link on the app root folder.
 * Returns an object with the shareUrl (or shareId token), driveId, and itemId.
 */
export async function createShareLink(): Promise<{ shareUrl: string; driveId: string; itemId: string }> {
  // Get the app root folder's drive info
  const appRootResponse = await graphFetch('/me/drive/special/approot');
  if (!appRootResponse.ok) {
    throw new Error(`Failed to get app root: ${appRootResponse.status}`);
  }
  const appRoot = await appRootResponse.json();
  const itemId = appRoot.id;
  const driveId = appRoot.parentReference?.driveId;

  if (!driveId) {
    // Fallback: get driveId from /me/drive
    const driveResponse = await graphFetch('/me/drive');
    if (!driveResponse.ok) {
      throw new Error(`Failed to get drive info: ${driveResponse.status}`);
    }
    const drive = await driveResponse.json();
    if (!drive.id) {
      throw new Error('Could not determine driveId');
    }
    // Use drive.id as driveId
    return await createShareLinkWithDrive(itemId, drive.id);
  }

  return await createShareLinkWithDrive(itemId, driveId);
}

async function createShareLinkWithDrive(itemId: string, driveId: string): Promise<{ shareUrl: string; driveId: string; itemId: string }> {
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
  console.log('[RentalTracker] createLink response keys:', Object.keys(data), 'link keys:', data.link ? Object.keys(data.link) : 'N/A');

  // Prefer shareId (pre-computed token for /shares/ API)
  const shareId: string | undefined = data.shareId ?? data.link?.shareId;
  const shareUrl = shareId || data.link?.webUrl || '';

  if (!shareUrl) {
    throw new Error('Share link created but no shareId or webUrl returned');
  }

  return { shareUrl, driveId, itemId };
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}
