# HTML Curriculum Composer

![Version](https://img.shields.io/badge/version-0.1.1--beta-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Platform](https://img.shields.io/badge/platform-Windows%20x64%20(.msi)-lightgrey)

**HTML Curriculum Composer** is an offline-first Windows desktop application for capturing live enterprise web interfaces (VMware vSphere, Dell iDRAC, network appliances, and internal admin portals) as sanitized, interactive multi-page HTML training simulations — complete with interactive 3D hardware fault labs, SCORM 1.2/2004 LMS export, portable project archives, and printable Standard Operating Procedures (SOPs).

---

## Key Features

- **Playwright + Microsoft Edge DOM Capture:** Launches system Microsoft Edge (`channel: 'msedge'`) so enterprise root CAs, proxies, self-signed HTTPS certificates (`ignoreHTTPSErrors: true`), and Shadow DOM / `adoptedStyleSheets` SPAs work out of the box without bundling Chromium.
- **Configurable 16:9 & Custom Resolutions:** Record at `1920×1080 Full HD`, `1600×900`, `1366×768`, `2560×1440 QHD`, or custom dimensions with proportional `Fit to Screen` / `100% Actual Size` scaling in both the Composer and exported Player.
- **Append & Single-Page Re-Record Workflows:** Incrementally append new pages into existing projects or re-record a single captured page in place while preserving its `pageId`, incoming/outgoing links, step title, instructions, and validation rules.
- **Zero-Script Offline Snapshots:** Automatically strips `<script>` tags and `on*` inline handlers, extracts/deduplicates static CSS, fonts, images, SVGs, and `<canvas>` snapshots into shared `/assets`, and renders pages inside restricted `<iframe sandbox="allow-same-origin">` frames.
- **Bulk Sanitization Engine:** Apply reusable literal and regex find-and-replace rules (with presets for IPv4 addresses, FQDNs, MAC addresses, and emails) across all pages and metadata with match previews.
- **Visual Training Composer:** Reorder pages/steps, wire clickable DOM elements or custom hotspots to create branching multi-page workflows, configure input validation, and inspect live stage previews.
- **3D Hardware Labs (Bundled Three.js):** Embed interactive **Dell PowerEdge R630** 1U server modules anywhere in a curriculum, link web hotspots (`vmnic0`–`vmnic3`, `iDRAC8`, PSUs) directly to 3D views, toggle exploded internals/cables, and inject hardware fault scenarios (`PSU Loss`, `Link Down`, `Thermal Overheat`).
- **Target Bookmarks & Session Telemetry:** Store quick-load portal URLs alongside live page/link/asset session telemetry and an architectural Day/Night workspace theme (`#F2F0EF`, `#BBBDBC`, `#245F73`, `#733E24` + Deep Petrol Night).
- **3-Mode Offline Player (Dual `http://` & `file://` Playback):** Export portable folders or `.zip` packages supporting **Guided**, **Explore**, and **Assessment** modes with built-in Day/Night switching that run both on static web servers (`manifest.json` + `/pages/*.html`) and via direct double-click over `file://` (`bundle-data.js` + `srcdoc` fallback) with zero external network calls.
- **SCORM 1.2 & SCORM 2004 Export:** Generate LMS-ready ZIP packages with `imsmanifest.xml` and local SCORM API bridges (`window.HCCScormBridge`) reporting scores, completion, success status, and session duration.
- **Portable Project Archives (`.hccproj`) & Printable SOPs:** Package full editable projects as `.hccproj` archives with schema and path-traversal validation, or export air-gapped printable `@media print` HTML and native PDF job-aids.

---

## Architecture

| Module | Directory | Responsibility |
| --- | --- | --- |
| **Desktop Shell & Capture** | `src/main` | Electron main process, Edge capture engine, asset deduplication, bulk sanitization, `.hccproj` & SOP exporters, SCORM bundler |
| **Preload Bridge** | `src/preload` | Typed `contextBridge` API (`window.hccApi`) with `contextIsolation: true` and `sandbox: true` |
| **Composer UI** | `src/renderer` | React + Tailwind CSS visual timeline, hotspot linker, sanitization panel, 3D inspector, and export controls |
| **Offline Player** | `src/player` | Standalone zero-dependency HTML/JS/CSS 3-mode runtime with SCORM bridge and `file://` dual-mode support |
| **3D Hardware Engine** | `src/hardware3d` | Locally bundled Three.js Dell PowerEdge R630 procedural assembly, cable animations, fault simulation, and `.glb` loader interface |
| **Shared Types** | `src/shared` | Shared TypeScript types and IPC channel contracts |

---

## Air-Gap & Security Guarantees

1. **Zero External Dependencies at Runtime:** Exported HTML bundles, SCORM packages, 3D hardware labs, and SOP exports contain zero CDN URLs, external fonts, or remote analytics.
2. **Automatic Project Storage Migration:** Projects are stored in `%APPDATA%/HTMLCurriculumComposer/projects`, with automatic non-destructive migration from legacy `%APPDATA%/SuperStepRecorder/projects` directories.
3. **Enterprise Windows Deployment:** Signed/standard WiX MSI packaging with a static `upgradeCode` for clean enterprise upgrades and silent installation:

```powershell
msiexec /i "HTML Curriculum Composer 0.1.1-beta.msi" /qn
```

---

## Development & Building

### Prerequisites

- Windows 10 / 11 (x64)
- Node.js v20+
- Microsoft Edge installed (used by Playwright via `channel: 'msedge'`)

### Commands

```bash
# Install dependencies
npm install

# Type-check all TypeScript sources
npm run typecheck

# Build main, preload, renderer, and 3D hardware runtime bundles
npm run build

# Run full Vitest + Playwright-Edge unit and E2E test suites
npm run test

# Package the Windows x64 .msi installer into release/
npm run dist:msi
```

---

## Contributing & Security

- Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for codebase structure and development guidelines.
- Security model and vulnerability disclosure instructions are documented in [SECURITY.md](SECURITY.md).
- Released under the [MIT License](LICENSE).
