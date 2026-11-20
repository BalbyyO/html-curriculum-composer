# Contributing to HTML Curriculum Composer

Thank you for helping improve **HTML Curriculum Composer**.

## Prerequisites

- **OS:** Windows 10 / 11 (x64) for native `.msi` WiX packaging and system Microsoft Edge capture
- **Node.js:** v20+ (LTS or current)
- **Browser:** Microsoft Edge (Playwright connects via `channel: 'msedge'`)

## Development Setup

```bash
npm install
npm run typecheck
npm run build
npm run test
```

To build the Windows `.msi` installer:

```bash
npm run dist:msi
```

## Project Architecture

```text
src/
├── main/           # Electron main process, Playwright capture, sanitization, export, IPC handlers
├── preload/        # Typed contextBridge API exposed to the renderer
├── renderer/       # React + Tailwind Visual Training Composer UI
├── player/         # Standalone 3-mode offline HTML/SCORM player (Guided, Explore, Assessment)
├── hardware3d/     # Bundled Three.js 3D hardware inspector (Dell PowerEdge R630 & faults)
└── shared/         # Shared TypeScript interfaces and IPC channel definitions
tests/
├── unit/           # Vitest unit tests
└── e2e/            # Playwright-Edge capture, player playback, 3D WebGL, SCORM, and SOP PDF tests
```

## Engineering Guidelines

1. **100% Air-Gap & Offline Safe:** Never introduce external CDN dependencies, Google Fonts, external telemetry scripts, or runtime network fetches in the desktop app, exported player bundles, SCORM packages, or SOP outputs.
2. **Electron & DOM Security:**
   - Keep `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true` enabled on desktop windows.
   - Strip `<script>` tags and `on*` inline handlers during DOM snapshotting and render captured pages in `<iframe sandbox="allow-same-origin">`.
   - Escape any dynamic metadata written into HTML, SVG, or XML documents.
   - Validate archive entry paths on `.hccproj` import to prevent ZIP path-traversal attacks.
3. **Verification Required:** Every PR should pass `npm run typecheck`, `npm run build`, and `npm run test` cleanly without skipped assertions.
