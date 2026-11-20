import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import JSZip from 'jszip';
import type { ExportResult, ProjectRecord, TrainingManifest } from '../../shared/types';
import { ProjectStore, sanitizeProjectSlug } from '../projects/project-store';

export const HCCPROJ_FORMAT_VERSION = '1.0.0';

interface ArchiveFileItem {
  relPath: string;
  absPath: string;
}

async function collectDirectoryFiles(
  projectDir: string,
  subDir: string,
  filterFn?: (relPath: string) => boolean
): Promise<ArchiveFileItem[]> {
  const startDir = path.join(projectDir, subDir);
  if (!existsSync(startDir)) return [];

  const results: ArchiveFileItem[] = [];
  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.sanitization-backups') continue;
      const absPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absPath);
      } else if (entry.isFile()) {
        const relPath = path.relative(projectDir, absPath).split(path.sep).join('/');
        if (!filterFn || filterFn(relPath)) {
          results.push({ relPath, absPath });
        }
      }
    }
  }

  await walk(startDir);
  return results;
}

function assertSafeArchivePath(rawPath: string): string {
  if (!rawPath || rawPath.includes('\0')) {
    throw new Error(`Invalid archive entry path: "${rawPath}"`);
  }
  const normalized = rawPath.replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) {
    throw new Error(`Absolute path not permitted in .hccproj archive: "${rawPath}"`);
  }
  const segments = normalized.split('/');
  if (segments.some((seg) => seg === '..')) {
    throw new Error(`Path traversal segment not permitted in .hccproj archive: "${rawPath}"`);
  }
  return normalized;
}

function validateImportedManifest(candidate: unknown): asserts candidate is TrainingManifest {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Invalid .hccproj archive: manifest.json must be a JSON object.');
  }
  const obj = candidate as Partial<TrainingManifest>;
  if (obj.schemaVersion !== '1.0.0') {
    throw new Error(`Unsupported manifest schemaVersion "${String(obj.schemaVersion ?? '')}".`);
  }
  if (typeof obj.projectId !== 'string' || !obj.projectId.trim()) {
    throw new Error('Invalid .hccproj archive: manifest.projectId is required.');
  }
  if (!Array.isArray(obj.pages) || !Array.isArray(obj.links) || !Array.isArray(obj.steps)) {
    throw new Error('Invalid .hccproj archive: manifest pages, links, and steps must be arrays.');
  }
  if (!obj.assets || typeof obj.assets !== 'object') {
    throw new Error('Invalid .hccproj archive: manifest.assets object is required.');
  }
}

export async function exportProjectArchive(
  projectDir: string,
  archivePath: string
): Promise<ExportResult> {
  const manifestPath = path.join(projectDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Cannot export .hccproj archive: manifest.json missing in "${projectDir}".`);
  }

  const rawManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as TrainingManifest;
  const exportManifest: TrainingManifest = structuredClone(rawManifest);
  delete exportManifest.lastSanitizationBackupId;

  const projectJsonPath = path.join(projectDir, 'project.json');
  let projectMeta: Record<string, unknown> = {
    projectId: exportManifest.projectId,
    name: exportManifest.name,
    createdAt: exportManifest.createdAt,
    updatedAt: exportManifest.updatedAt,
    pageCount: exportManifest.pages.length,
    stepCount: exportManifest.steps.length,
    linkCount: exportManifest.links.length,
    assetCount: Object.keys(exportManifest.assets || {}).length,
    startPageId: exportManifest.startPageId ?? null,
    sourceUrl: exportManifest.pages[0]?.sourceUrl
  };
  if (existsSync(projectJsonPath)) {
    try {
      const parsedMeta = JSON.parse(await fs.readFile(projectJsonPath, 'utf8')) as Record<
        string,
        unknown
      >;
      projectMeta = { ...parsedMeta };
      delete projectMeta.projectDir;
    } catch {
      // Fall back to synthesized metadata
    }
  }

  const descriptor = {
    format: 'hccproj',
    formatVersion: HCCPROJ_FORMAT_VERSION,
    app: 'HTML Curriculum Composer',
    exportedAt: new Date().toISOString(),
    projectId: exportManifest.projectId,
    name: exportManifest.name
  };

  const zip = new JSZip();
  zip.file('hccproj.json', JSON.stringify(descriptor, null, 2));
  zip.file('project.json', JSON.stringify(projectMeta, null, 2));
  zip.file('manifest.json', JSON.stringify(exportManifest, null, 2));
  let fileCount = 3;

  const [pageFiles, assetFiles, glbFiles] = await Promise.all([
    collectDirectoryFiles(projectDir, 'pages'),
    collectDirectoryFiles(projectDir, 'assets'),
    collectDirectoryFiles(projectDir, 'hardware3d', (rel) => rel.toLowerCase().endsWith('.glb'))
  ]);

  for (const item of [...pageFiles, ...assetFiles, ...glbFiles]) {
    const data = await fs.readFile(item.absPath);
    zip.file(item.relPath, data);
    fileCount += 1;
  }

  const resolvedArchivePath = path.resolve(archivePath);
  await fs.mkdir(path.dirname(resolvedArchivePath), { recursive: true });
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  await fs.writeFile(resolvedArchivePath, zipBuffer);

  return {
    format: 'hccproj',
    destinationPath: resolvedArchivePath,
    fileCount,
    totalBytes: zipBuffer.byteLength
  };
}

export async function importProjectArchive(
  store: ProjectStore,
  archivePath: string,
  options?: { newName?: string }
): Promise<ProjectRecord> {
  const resolvedArchive = path.resolve(archivePath);
  const archiveBytes = await fs.readFile(resolvedArchive);
  const zip = await JSZip.loadAsync(archiveBytes);

  for (const [entryName, entry] of Object.entries(zip.files)) {
    assertSafeArchivePath(entryName);
    if (entry.dir) continue;
  }

  const manifestEntry = zip.file('manifest.json');
  if (!manifestEntry) {
    throw new Error('Invalid .hccproj archive: manifest.json is missing.');
  }

  const importedManifestRaw = JSON.parse(await manifestEntry.async('string')) as unknown;
  validateImportedManifest(importedManifestRaw);

  const importedManifest: TrainingManifest = structuredClone(importedManifestRaw);
  delete importedManifest.lastSanitizationBackupId;

  // Verify every HTML page declared in manifest exists in the archive
  for (const page of importedManifest.pages) {
    if (page.type === 'hardware3d' || !page.file) continue;
    const safeRel = assertSafeArchivePath(page.file);
    if (!safeRel.startsWith('pages/')) {
      throw new Error(`Invalid page path "${page.file}" in manifest.json.`);
    }
    if (!zip.file(safeRel)) {
      throw new Error(`Invalid .hccproj archive: missing page file "${safeRel}".`);
    }
  }

  await store.ensureRoot();
  const baseSlug = sanitizeProjectSlug(
    options?.newName?.trim() || importedManifest.projectId || importedManifest.name
  );
  let targetProjectId = baseSlug;
  if (existsSync(store.getProjectDir(targetProjectId))) {
    const stamp = Date.now();
    targetProjectId = `${baseSlug}-imported-${stamp}`;
    let counter = 1;
    while (existsSync(store.getProjectDir(targetProjectId))) {
      counter += 1;
      targetProjectId = `${baseSlug}-imported-${stamp}-${counter}`;
    }
  }

  const targetDir = store.getProjectDir(targetProjectId);
  await fs.mkdir(path.join(targetDir, 'pages'), { recursive: true });
  await fs.mkdir(path.join(targetDir, 'assets'), { recursive: true });

  try {
    for (const [rawName, zipObj] of Object.entries(zip.files)) {
      if (zipObj.dir) continue;
      const safeRel = assertSafeArchivePath(rawName);
      const isAllowedPayload =
        safeRel.startsWith('pages/') ||
        safeRel.startsWith('assets/') ||
        (safeRel.startsWith('hardware3d/') && safeRel.toLowerCase().endsWith('.glb'));
      if (!isAllowedPayload) continue;

      const destPath = path.resolve(targetDir, safeRel);
      if (!destPath.startsWith(targetDir + path.sep)) {
        throw new Error(`Extracted file escapes project directory: "${safeRel}"`);
      }
      await fs.mkdir(path.dirname(destPath), { recursive: true });
      const content = await zipObj.async('nodebuffer');
      await fs.writeFile(destPath, content);
    }

    let description: string | undefined;
    let sourceUrl: string | undefined;
    const metaEntry = zip.file('project.json');
    if (metaEntry) {
      try {
        const metaParsed = JSON.parse(await metaEntry.async('string')) as Record<string, unknown>;
        if (typeof metaParsed.description === 'string') description = metaParsed.description;
        if (typeof metaParsed.sourceUrl === 'string') sourceUrl = metaParsed.sourceUrl;
      } catch {
        // Ignore malformed optional metadata
      }
    }

    const nextName = options?.newName?.trim() || importedManifest.name || targetProjectId;
    importedManifest.projectId = targetProjectId;
    importedManifest.name = nextName;

    return await store.saveProject(targetProjectId, importedManifest, {
      name: nextName,
      description,
      sourceUrl
    });
  } catch (err) {
    await fs.rm(targetDir, { recursive: true, force: true }).catch(() => undefined);
    throw err;
  }
}
