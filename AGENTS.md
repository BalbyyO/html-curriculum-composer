# Project: HTML Curriculum Composer (Offline Multi-Page Interactive Training Composer)

## Role & Mission
You are a Senior Desktop & Full-Stack Systems Engineer building a self-contained Windows desktop application ("HTML Curriculum Composer") packaged as an `.msi` installer. The application records live web interfaces (such as VMware vSphere, Dell iDRAC, network appliances, and enterprise admin portals) as interactive DOM snapshots, sanitizes sensitive data, allows inserting interactive 3D hardware views, and exports 100% offline, **multi-file HTML training bundles** (portable folder or `.zip` with separate HTML pages and shared local assets) that simulate real multi-page interface navigation.

## Target Architecture & Tech Stack
- **Desktop Shell & Packaging:** Electron + TypeScript + Vite + React + Tailwind CSS, packaged as a Windows `.msi` using `electron-builder` (WiX target) with `asar` enabled.
- **Capture Engine:** Playwright (`playwright-core`) launching system Microsoft Edge (`channel: 'msedge'`) in headed mode so the app inherits Windows root CAs, proxy settings, and local network access without bundling Chromium.
- **3D Hardware Module:** Three.js (bundled locally—zero external CDN links) supporting procedural and `.glb` 3D hardware scenes (starting with a Dell PowerEdge R630 1U server with clickable ports and removable lid).
- **Local Storage:** SQLite (`better-sqlite3`) or local JSON/filesystem project bundles inside `%APPDATA%/HTMLCurriculumComposer/projects`.

## Core Functional Modules
1. **DOM Step & Page Recorder (Capture Layer)**
   - Opens a controlled headed browser session to any user-provided URL.
   - Injects a lightweight overlay pill (`Record`, `Pause`, `Capture Manual Page`, `Stop`) that is excluded from captured snapshots.
   - On every user click, form input commit, route/URL change, or manual capture trigger:
     - Captures a frozen, self-contained HTML page of the current DOM.
     - Extracts and deduplicates static assets (stylesheets, images, SVGs, fonts, and `<canvas>` snapshots converted to PNG) into a shared local `/assets` directory, rewriting all references to relative local paths.
     - Strips all `<script>` tags, inline `on*` event handlers, and external network beacons so replayed pages never make live HTTP requests.
     - Records interaction and navigation metadata: source page ID, target CSS selector, fallback XPath, bounding box coordinates, action type (`click`, `type`, `select`), entered text value, and the resulting destination page ID (creating a navigable state graph).
2. **Bulk Sanitization Engine**
   - Provides reusable regex and literal find-and-replace rules (e.g., IPv4 addresses, FQDNs, MAC addresses, usernames, serial numbers) applied across all captured HTML pages and metadata simultaneously, with a before/after diff preview.
3. **Visual Training Composer (Multi-Page & Interactive Linking)**
   - **Page & Navigation Map:** View all captured HTML pages and wire interactive hotspots/buttons on any page to open another captured page (e.g., clicking a "Networking" or "Settings" button navigates to the corresponding captured settings page), supporting both linear walkthroughs and non-linear branching menus.
   - **Step & Validation Editor:** Customize spotlight tooltips, step titles, instructions, and validation rules (e.g., exact click target or required text input).
   - **3D Hardware View Injector:** Lets the author insert an interactive 3D hardware inspection page anywhere in the flow—or link a specific button/port inside a captured web page directly to a 3D hardware view (e.g., clicking `vmnic0` in a captured vSphere page opens the 3D Dell PowerEdge R630 rear panel, with a button to return to vSphere).
4. **Multi-File Offline Exporter**
   - Compiles the project into a portable, self-contained directory (with optional `.zip` export) structured like:
     - `index.html` (Player shell)
     - `manifest.json` (Pages, navigation links, walkthrough steps, and validation rules)
     - `/pages/*.html` (Sanitized, individual captured interface pages)
     - `/assets/*` (Deduplicated CSS, images, fonts, icons)
     - `/player/*` & `/hardware3d/*` (Local Player JS/CSS and bundled Three.js runtime/models)
   - Zero external network calls or CDN dependencies. Must run cleanly offline from a local folder, shared network drive, or local static web server.
   - Exported Player supports three modes:
     - **Guided Mode:** Spotlight highlight, tooltip instructions, and next/back navigation across linked pages.
     - **Explore / Free-Roam Mode:** Lets trainees freely click any linked buttons, tabs, and settings menus to navigate between captured pages and 3D views.
     - **Assessment Mode:** No hints; tracks misclicks, validates typed inputs and page navigation paths, and displays a final score summary.

## Engineering Constraints & Standards
- **100% Offline & Air-Gap Safe:** Never reference external CDNs (no unpkg, jsdelivr, Google Fonts, or external telemetry) in either the desktop app or the exported training bundles.
- **Enterprise SPA Resilience:** Handle Shadow DOM traversal, same-origin iframes, and dynamically constructed stylesheets (`adoptedStyleSheets` / CSSOM rules) during DOM snapshotting.
- **Security:** Keep Electron `contextIsolation: true` and `nodeIntegration: false`; expose only typed IPC bridges via `preload.ts`. Render captured HTML pages inside sandboxed iframes (`sandbox="allow-same-origin"`) during preview and playback, with click/navigation events intercepted cleanly by the Player shell.
- **Modular Codebase:** Separate into `/src/main` (Electron + Playwright + IPC), `/src/preload`, `/src/renderer` (React Composer UI), `/src/player` (standalone offline multi-page player), and `/src/hardware3d` (Three.js models).

## Workflow & Verification Rules
- Always follow **Explore → Plan → Execute → Verify**:
  1. Before writing code for a new module, output a concise implementation plan listing files to create/modify.
  2. Implement incrementally in vertical slices (start with working Playwright multi-page DOM capture + asset extraction on a local mock multi-page admin UI before building the full Composer UI).
  3. Include automated tests (Playwright/Vitest) verifying that:
     - Captured HTML pages contain zero `<script>` tags and zero external `http(s)://` asset references.
     - Shared assets are properly extracted to `/assets` with valid relative links.
     - Bulk regex sanitization replaces target strings across all captured pages.
     - Clicking a linked button in the exported multi-page bundle loads the target page cleanly with network disabled.
  4. Verify the Windows `.msi` build configuration (`electron-builder.yml`) builds cleanly without missing native module dependencies.