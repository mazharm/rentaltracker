import { readJsonFile, writeJsonFile, listFolder, deleteFile } from './onedrive';

const ARCHIVE_DIR = 'archives';
const MAX_AGE_DAYS = 90;
const MIN_KEEP = 10;

function archiveFileName(originalName: string): string {
  const baseName = originalName.replace('.json', '');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${baseName}_${timestamp}.json`;
}

export async function writeWithArchive<T>(path: string, data: T, expectedETag?: string | null): Promise<string | null> {
  // Step 1: Read current file to archive it
  const existing = await readJsonFile<T>(path);

  // Step 2: Archive the current version if it exists
  if (existing) {
    const fileName = path.split('/').pop() || path;
    const archiveName = archiveFileName(fileName);
    await writeJsonFile(`${ARCHIVE_DIR}/${archiveName}`, existing.data);
  }

  // Step 3: Write the updated file
  const newETag = await writeJsonFile(path, data, expectedETag);

  // Step 4: Prune old archives (fire and forget — don't block the write)
  const baseName = path.split('/').pop()?.replace('.json', '') || '';
  pruneArchives(baseName).catch(console.error);

  return newETag;
}

async function pruneArchives(baseName: string): Promise<void> {
  const files = await listFolder(ARCHIVE_DIR);

  const matching = files
    .filter((f) => f.name.startsWith(baseName + '_'))
    .sort((a, b) => b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime));

  if (matching.length <= MIN_KEEP) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

  for (let i = MIN_KEEP; i < matching.length; i++) {
    const fileDate = new Date(matching[i].lastModifiedDateTime);
    if (fileDate < cutoff) {
      await deleteFile(`${ARCHIVE_DIR}/${matching[i].name}`);
    }
  }
}
