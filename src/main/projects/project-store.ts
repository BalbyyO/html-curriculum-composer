import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  CapturedPage,
  ProjectMetadata,
  ProjectRecord,
  TrainingManifest
} from '../../shared/types';
import { compileOfflineBundle, writeManifestFile } from '../capture/bundle-compiler';

export function sanitizeProjectSlug(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return cleaned || 'project';
}

function buildMetadataFromManifest(
  projectDir: string,
  manifest: TrainingManifest,
  existing?: Partial<ProjectMetadata>
): ProjectMetadata {
  return {
    projectId: manifest.projectId,
    name: manifest.name || existing?.name || manifest.projectId,
    description: existing?.description,
    createdAt: manifest.createdAt || existing?.createdAt || new Date().toISOString(),
    updatedAt: manifest.updatedAt || existing?.updatedAt || new Date().toISOString(),
    projectDir,
    pageCount: manifest.pages.length,
    stepCount: manifest.steps.length,
    linkCount: manifest.links.length,
    assetCount: Object.keys(manifest.assets || {}).length,
    startPageId: manifest.startPageId ?? null,
    sourceUrl: existing?.sourceUrl ?? manifest.pages[0]?.sourceUrl
  };
}

async function copyDirectoryExcluding(
  srcDir: string,
  destDir: string,
  excludedNames: Set<string>
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });
  const entries = await fs.readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (excludedNames.has(entry.name)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryExcluding(srcPath, destPath, excludedNames);
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

export async function migrateLegacyProjectsIfNeeded(
  legacyRoot: string,
  targetRoot: string
): Promise<string[]> {
  const resolvedLegacy = path.resolve(legacyRoot);
  const resolvedTarget = path.resolve(targetRoot);
  if (resolvedLegacy === resolvedTarget || !existsSync(resolvedLegacy)) {
    return [];
  }

  await fs.mkdir(resolvedTarget, { recursive: true });
  const entries = await fs.readdir(resolvedLegacy, { withFileTypes: true });
  const migratedIds: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const srcDir = path.join(resolvedLegacy, entry.name);
    const destDir = path.join(resolvedTarget, entry.name);
    if (!existsSync(path.join(srcDir, 'manifest.json'))) continue;
    if (existsSync(destDir)) continue;

    try {
      await copyDirectoryExcluding(srcDir, destDir, new Set(['.sanitization-backups']));
      const destMetaPath = path.join(destDir, 'project.json');
      if (existsSync(destMetaPath)) {
        const meta = JSON.parse(await fs.readFile(destMetaPath, 'utf8')) as Record<string, unknown>;
        meta.projectDir = destDir;
        await fs.writeFile(destMetaPath, JSON.stringify(meta, null, 2), 'utf8');
      }
      migratedIds.push(entry.name);
    } catch {
      // Preserve source on partial error and remove incomplete target copy
      await fs.rm(destDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  return migratedIds;
}

export class ProjectStore {
  private readonly projectsRoot: string;

  constructor(projectsRoot: string) {
    this.projectsRoot = path.resolve(projectsRoot);
  }

  getProjectsRoot(): string {
    return this.projectsRoot;
  }

  getProjectDir(projectId: string): string {
    if (!projectId || typeof projectId !== 'string') {
      throw new Error('Project ID is required.');
    }
    if (
      projectId.includes('..') ||
      projectId.includes('/') ||
      projectId.includes('\\') ||
      !/^[a-zA-Z0-9._-]+$/.test(projectId)
    ) {
      throw new Error(`Invalid project ID: "${projectId}"`);
    }
    const resolved = path.resolve(this.projectsRoot, projectId);
    if (!resolved.startsWith(this.projectsRoot + path.sep)) {
      throw new Error(`Project path escapes projects root: "${projectId}"`);
    }
    return resolved;
  }

  async ensureRoot(): Promise<void> {
    await fs.mkdir(this.projectsRoot, { recursive: true });
  }

  async listProjects(): Promise<ProjectMetadata[]> {
    await this.ensureRoot();
    const entries = await fs.readdir(this.projectsRoot, { withFileTypes: true });
    const projects: ProjectMetadata[] = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let projectDir: string;
      try {
        projectDir = this.getProjectDir(entry.name);
      } catch {
        continue;
      }
      const manifestPath = path.join(projectDir, 'manifest.json');
      if (!existsSync(manifestPath)) continue;

      try {
        const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as TrainingManifest;
        let savedMeta: Partial<ProjectMetadata> | undefined;
        const metaPath = path.join(projectDir, 'project.json');
        if (existsSync(metaPath)) {
          savedMeta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as ProjectMetadata;
        }
        projects.push(buildMetadataFromManifest(projectDir, manifest, savedMeta));
      } catch {
        // Ignore corrupted directories cleanly
      }
    }

    projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return projects;
  }

  async openProject(projectId: string): Promise<ProjectRecord> {
    const projectDir = this.getProjectDir(projectId);
    const manifestPath = path.join(projectDir, 'manifest.json');
    if (!existsSync(manifestPath)) {
      throw new Error(`Project "${projectId}" not found.`);
    }

    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as TrainingManifest;
    const metaPath = path.join(projectDir, 'project.json');
    let savedMeta: Partial<ProjectMetadata> | undefined;
    if (existsSync(metaPath)) {
      try {
        savedMeta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as ProjectMetadata;
      } catch {
        savedMeta = undefined;
      }
    }

    const metadata = buildMetadataFromManifest(projectDir, manifest, savedMeta);
    return { metadata, manifest };
  }

  async createProject(
    name: string,
    options?: { projectId?: string; sourceUrl?: string; description?: string }
  ): Promise<ProjectRecord> {
    await this.ensureRoot();
    const trimmedName = name.trim() || 'Untitled Training';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const projectId = options?.projectId || `${sanitizeProjectSlug(trimmedName)}-${stamp}`;
    const projectDir = this.getProjectDir(projectId);
    await fs.mkdir(path.join(projectDir, 'pages'), { recursive: true });
    await fs.mkdir(path.join(projectDir, 'assets'), { recursive: true });

    const now = new Date().toISOString();
    const manifest: TrainingManifest = {
      schemaVersion: '1.0.0',
      projectId,
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
      startPageId: null,
      pages: [],
      links: [],
      steps: [],
      assets: {}
    };

    return this.saveProject(projectId, manifest, {
      name: trimmedName,
      description: options?.description,
      sourceUrl: options?.sourceUrl
    });
  }

  async saveProject(
    projectId: string,
    manifest: TrainingManifest,
    metaPatch?: { name?: string; description?: string; sourceUrl?: string }
  ): Promise<ProjectRecord> {
    const projectDir = this.getProjectDir(projectId);
    await fs.mkdir(projectDir, { recursive: true });

    let existingMeta: Partial<ProjectMetadata> | undefined;
    const metaPath = path.join(projectDir, 'project.json');
    if (existsSync(metaPath)) {
      try {
        existingMeta = JSON.parse(await fs.readFile(metaPath, 'utf8')) as ProjectMetadata;
      } catch {
        existingMeta = undefined;
      }
    }

    const now = new Date().toISOString();
    const normalizedSteps = (manifest.steps || []).map((step, idx) => ({
      ...step,
      order: idx + 1
    }));

    const nextManifest: TrainingManifest = {
      ...manifest,
      projectId,
      name: metaPatch?.name?.trim() || manifest.name || existingMeta?.name || projectId,
      updatedAt: now,
      steps: normalizedSteps
    };

    const metadata = buildMetadataFromManifest(projectDir, nextManifest, {
      ...existingMeta,
      ...metaPatch
    });

    await compileOfflineBundle(projectDir, nextManifest);
    await writeManifestFile(projectDir, nextManifest);
    await fs.writeFile(metaPath, JSON.stringify(metadata, null, 2), 'utf8');

    return { metadata, manifest: nextManifest };
  }

  async duplicateProject(projectId: string, newName?: string): Promise<ProjectRecord> {
    const source = await this.openProject(projectId);
    const sourceDir = this.getProjectDir(projectId);

    const copyName = newName?.trim() || `${source.manifest.name} (Copy)`;
    const baseSlug = sanitizeProjectSlug(copyName);
    let candidateId = `${baseSlug}-${Date.now()}`;
    while (existsSync(path.join(this.projectsRoot, candidateId))) {
      candidateId = `${baseSlug}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    }

    const destDir = this.getProjectDir(candidateId);
    await copyDirectoryExcluding(sourceDir, destDir, new Set(['.sanitization-backups']));

    const now = new Date().toISOString();
    const nextManifest: TrainingManifest = {
      ...structuredClone(source.manifest),
      projectId: candidateId,
      name: copyName,
      createdAt: now,
      updatedAt: now
    };
    delete nextManifest.lastSanitizationBackupId;

    return this.saveProject(candidateId, nextManifest, {
      name: copyName,
      description: source.metadata.description,
      sourceUrl: source.metadata.sourceUrl
    });
  }

  async deleteProject(projectId: string): Promise<boolean> {
    const projectDir = this.getProjectDir(projectId);
    if (!existsSync(projectDir)) {
      return false;
    }
    await fs.rm(projectDir, { recursive: true, force: true });
    return true;
  }

  async duplicatePage(projectId: string, pageId: string): Promise<ProjectRecord> {
    const { manifest } = await this.openProject(projectId);
    const projectDir = this.getProjectDir(projectId);
    const sourcePage = manifest.pages.find((p) => p.id === pageId);
    if (!sourcePage) {
      throw new Error(`Page "${pageId}" not found in project "${projectId}".`);
    }

    if (sourcePage.type === 'hardware3d' || !sourcePage.file) {
      const usedHw = manifest.pages
        .map((p) => /^page-hw-(\d+)$/.exec(p.id)?.[1])
        .filter(Boolean)
        .map((n) => Number(n));
      const nextHwNum = (usedHw.length > 0 ? Math.max(...usedHw) : 0) + 1;
      const newHwId = `page-hw-${String(nextHwNum).padStart(3, '0')}`;
      const copiedHwPage: CapturedPage = {
        ...structuredClone(sourcePage),
        id: newHwId,
        file: '',
        title: `${sourcePage.title} (Copy)`,
        capturedAt: new Date().toISOString()
      };
      return this.saveProject(projectId, {
        ...manifest,
        pages: [...manifest.pages, copiedHwPage]
      });
    }

    const usedNumbers = manifest.pages
      .map((p) => /^page-(\d+)$/.exec(p.id)?.[1])
      .filter(Boolean)
      .map((n) => Number(n));
    let nextNum = (usedNumbers.length > 0 ? Math.max(...usedNumbers) : manifest.pages.length) + 1;
    let newPageId = `page-${String(nextNum).padStart(3, '0')}`;
    while (existsSync(path.join(projectDir, `pages/${newPageId}.html`))) {
      nextNum += 1;
      newPageId = `page-${String(nextNum).padStart(3, '0')}`;
    }

    const newFile = `pages/${newPageId}.html`;
    await fs.copyFile(path.join(projectDir, sourcePage.file), path.join(projectDir, newFile));

    const copiedPage: CapturedPage = {
      ...structuredClone(sourcePage),
      id: newPageId,
      file: newFile,
      title: `${sourcePage.title} (Copy)`,
      capturedAt: new Date().toISOString()
    };

    const nextManifest: TrainingManifest = {
      ...manifest,
      pages: [...manifest.pages, copiedPage]
    };

    return this.saveProject(projectId, nextManifest);
  }

  async deletePage(projectId: string, pageId: string): Promise<ProjectRecord> {
    const { manifest } = await this.openProject(projectId);
    const projectDir = this.getProjectDir(projectId);
    const targetPage = manifest.pages.find((p) => p.id === pageId);
    if (!targetPage) {
      throw new Error(`Page "${pageId}" not found in project "${projectId}".`);
    }

    const remainingPages = manifest.pages.filter((p) => p.id !== pageId);
    const remainingLinks = manifest.links.filter(
      (l) => l.sourcePageId !== pageId && l.targetPageId !== pageId
    );
    const remainingLinkIds = new Set(remainingLinks.map((l) => l.id));
    const remainingSteps = manifest.steps
      .filter((s) => s.pageId !== pageId)
      .map((s) => (s.linkId && !remainingLinkIds.has(s.linkId) ? { ...s, linkId: undefined } : s));

    const nextStartPageId =
      manifest.startPageId === pageId ? (remainingPages[0]?.id ?? null) : manifest.startPageId;

    if (targetPage.type !== 'hardware3d' && targetPage.file) {
      const htmlPath = path.join(projectDir, targetPage.file);
      if (existsSync(htmlPath)) {
        await fs.unlink(htmlPath);
      }
    }

    const nextManifest: TrainingManifest = {
      ...manifest,
      startPageId: nextStartPageId,
      pages: remainingPages,
      links: remainingLinks,
      steps: remainingSteps
    };

    return this.saveProject(projectId, nextManifest);
  }
}
