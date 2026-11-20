import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProjectStore } from '../../src/main/projects/project-store';

const tempDirs: string[] = [];

async function makeTempRoot(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'hcc-project-store-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('ProjectStore', () => {
  it('supports create, list, open, save, duplicate, page CRUD, delete, and path traversal checks', async () => {
    const root = await makeTempRoot();
    const store = new ProjectStore(root);

    // Reject path traversal attempts
    expect(() => store.getProjectDir('../escape')).toThrow();
    expect(() => store.getProjectDir('a/b')).toThrow();
    expect(() => store.getProjectDir('')).toThrow();

    // Create project & seed two captured pages + link + step
    const created = await store.createProject('ESXi Training', {
      projectId: 'esxi-01',
      sourceUrl: 'https://vcenter.corp.local/ui'
    });
    expect(created.metadata.projectId).toBe('esxi-01');
    expect(existsSync(path.join(root, 'esxi-01/manifest.json'))).toBe(true);
    expect(existsSync(path.join(root, 'esxi-01/project.json'))).toBe(true);

    await fs.writeFile(
      path.join(root, 'esxi-01/pages/page-001.html'),
      '<!DOCTYPE html><html><body>Page 1</body></html>',
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'esxi-01/pages/page-002.html'),
      '<!DOCTYPE html><html><body>Page 2</body></html>',
      'utf8'
    );

    const saved = await store.saveProject('esxi-01', {
      ...created.manifest,
      startPageId: 'page-001',
      pages: [
        {
          id: 'page-001',
          file: 'pages/page-001.html',
          title: 'Dashboard',
          sourceUrl: 'https://vcenter.corp.local/ui',
          capturedAt: '2026-11-19T00:00:00.000Z',
          contentHash: 'h1',
          viewport: { width: 1280, height: 800 },
          assetRefs: []
        },
        {
          id: 'page-002',
          file: 'pages/page-002.html',
          title: 'Networking',
          sourceUrl: 'https://vcenter.corp.local/ui/net',
          capturedAt: '2026-11-19T00:01:00.000Z',
          contentHash: 'h2',
          viewport: { width: 1280, height: 800 },
          assetRefs: []
        }
      ],
      links: [
        {
          id: 'link-001',
          sourcePageId: 'page-001',
          targetPageId: 'page-002',
          actionType: 'click',
          selector: '#nav-net',
          fallbackXPath: '//*[@id="nav-net"]',
          recordedAt: '2026-11-19T00:01:00.000Z'
        }
      ],
      steps: [
        {
          id: 'step-001',
          order: 99,
          pageId: 'page-001',
          linkId: 'link-001',
          title: 'Open Networking',
          instruction: 'Click Networking',
          actionType: 'click',
          selector: '#nav-net'
        }
      ]
    });

    expect(saved.manifest.steps[0].order).toBe(1);
    expect(saved.metadata.pageCount).toBe(2);
    expect(saved.metadata.linkCount).toBe(1);

    // Duplicate project
    const dup = await store.duplicateProject('esxi-01', 'ESXi Training Copy');
    expect(dup.metadata.projectId).not.toBe('esxi-01');
    expect(dup.manifest.name).toBe('ESXi Training Copy');
    expect(existsSync(path.join(dup.metadata.projectDir, 'pages/page-002.html'))).toBe(true);

    // List projects sorted by updatedAt descending
    const listed = await store.listProjects();
    expect(listed).toHaveLength(2);
    expect(listed[0].projectId).toBe(dup.metadata.projectId);

    // Duplicate a page inside esxi-01
    const withPageCopy = await store.duplicatePage('esxi-01', 'page-001');
    expect(withPageCopy.manifest.pages).toHaveLength(3);
    expect(withPageCopy.manifest.pages[2].id).toBe('page-003');
    expect(existsSync(path.join(root, 'esxi-01/pages/page-003.html'))).toBe(true);

    // Delete page-002 and verify dangling link cleanup
    const afterPageDelete = await store.deletePage('esxi-01', 'page-002');
    expect(afterPageDelete.manifest.pages.map((p) => p.id)).toEqual(['page-001', 'page-003']);
    expect(afterPageDelete.manifest.links).toHaveLength(0);
    expect(afterPageDelete.manifest.steps[0].linkId).toBeUndefined();
    expect(existsSync(path.join(root, 'esxi-01/pages/page-002.html'))).toBe(false);

    // Open & delete projects
    const reopened = await store.openProject('esxi-01');
    expect(reopened.manifest.pages).toHaveLength(2);

    expect(await store.deleteProject('esxi-01')).toBe(true);
    expect(await store.deleteProject('esxi-01')).toBe(false);
    expect(await store.listProjects()).toHaveLength(1);
  });
});
