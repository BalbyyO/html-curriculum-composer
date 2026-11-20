import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import type { ExportResult, TrainingManifest } from '../../shared/types';
import { compileOfflineBundle } from '../capture/bundle-compiler';
import { buildScormImsManifest, type ScormVersion } from './scorm-manifest';

async function copySubdirContents(srcDir: string, destDir: string): Promise<void> {
  if (!existsSync(srcDir)) return;
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copySubdirContents(srcPath, destPath);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function collectBundleStats(
  rootDir: string,
  currentDir = rootDir
): Promise<{ fileCount: number; totalBytes: number; relativePaths: string[] }> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  let fileCount = 0;
  let totalBytes = 0;
  const relativePaths: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      const sub = await collectBundleStats(rootDir, fullPath);
      fileCount += sub.fileCount;
      totalBytes += sub.totalBytes;
      relativePaths.push(...sub.relativePaths);
    } else if (entry.isFile()) {
      const stat = await fs.stat(fullPath);
      fileCount += 1;
      totalBytes += stat.size;
      relativePaths.push(path.relative(rootDir, fullPath).split(path.sep).join('/'));
    }
  }

  return { fileCount, totalBytes, relativePaths };
}

export async function exportOfflineFolder(
  projectDir: string,
  destinationDir: string
): Promise<ExportResult> {
  const manifestPath = path.join(projectDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Cannot export: manifest.json missing in "${projectDir}".`);
  }

  const rawManifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as TrainingManifest;
  const exportManifest: TrainingManifest = structuredClone(rawManifest);
  delete exportManifest.lastSanitizationBackupId;

  const resolvedDest = path.resolve(destinationDir);
  await fs.mkdir(resolvedDest, { recursive: true });

  // Clean managed subdirectories so stale deleted pages/assets are not left behind
  for (const sub of ['pages', 'assets', 'player', 'hardware3d']) {
    await fs.rm(path.join(resolvedDest, sub), { recursive: true, force: true });
  }

  await copySubdirContents(path.join(projectDir, 'pages'), path.join(resolvedDest, 'pages'));
  await copySubdirContents(path.join(projectDir, 'assets'), path.join(resolvedDest, 'assets'));

  await compileOfflineBundle(resolvedDest, exportManifest);

  const stats = await collectBundleStats(resolvedDest);
  return {
    format: 'folder',
    destinationPath: resolvedDest,
    fileCount: stats.fileCount,
    totalBytes: stats.totalBytes
  };
}

async function buildZipArchiveFromDir(
  stagingDir: string,
  zipFilePath: string,
  extraEntries?: Record<string, string>
): Promise<{ fileCount: number; totalBytes: number; destinationPath: string }> {
  const stats = await collectBundleStats(stagingDir);
  const zip = new JSZip();

  for (const relPath of stats.relativePaths) {
    const data = await fs.readFile(path.join(stagingDir, relPath));
    zip.file(relPath, data);
  }

  let extraCount = 0;
  if (extraEntries) {
    for (const [relPath, content] of Object.entries(extraEntries)) {
      zip.file(relPath, content);
      extraCount += 1;
    }
  }

  const resolvedZipPath = path.resolve(zipFilePath);
  await fs.mkdir(path.dirname(resolvedZipPath), { recursive: true });
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 }
  });
  await fs.writeFile(resolvedZipPath, zipBuffer);

  return {
    fileCount: stats.fileCount + extraCount,
    totalBytes: zipBuffer.byteLength,
    destinationPath: resolvedZipPath
  };
}

export async function exportOfflineZip(
  projectDir: string,
  zipFilePath: string
): Promise<ExportResult> {
  const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcc-zip-stage-'));
  try {
    await exportOfflineFolder(projectDir, stagingDir);
    const result = await buildZipArchiveFromDir(stagingDir, zipFilePath);
    return {
      format: 'zip',
      destinationPath: result.destinationPath,
      fileCount: result.fileCount,
      totalBytes: result.totalBytes
    };
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
}

export async function exportScormZip(
  projectDir: string,
  zipFilePath: string,
  version: ScormVersion
): Promise<ExportResult> {
  const stagingDir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcc-scorm-stage-'));
  try {
    await exportOfflineFolder(projectDir, stagingDir);
    const stagedManifest = JSON.parse(
      await fs.readFile(path.join(stagingDir, 'manifest.json'), 'utf8')
    ) as TrainingManifest;
    const stats = await collectBundleStats(stagingDir);
    const imsManifestXml = buildScormImsManifest(
      stagedManifest,
      stats.relativePaths,
      version
    );

    const result = await buildZipArchiveFromDir(stagingDir, zipFilePath, {
      'imsmanifest.xml': imsManifestXml
    });

    return {
      format: version === '1.2' ? 'scorm12' : 'scorm2004',
      destinationPath: result.destinationPath,
      fileCount: result.fileCount,
      totalBytes: result.totalBytes
    };
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true });
  }
}
