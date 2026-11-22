# Security Compliance & Vulnerability Report (`v0.1.2-beta`)

**Assessment Date:** November 21, 2026  
**Application:** HTML Curriculum Composer (`html-curriculum-composer`)  
**Release Version:** `v0.1.2-beta`  
**Authoritative Feeds Queried:**
- **CISA Known Exploited Vulnerabilities (KEV) Catalog:** Version `2026.11.20` (`dateReleased: 2026-11-20T17:48:39.1516Z`, 1,790 catalog entries)
- **CVE.org** Advisories (Electron, Chromium/Blink/V8/Skia/Dawn, Node.js, Microsoft Edge, Vite, React, Cheerio, Playwright, esbuild, JSZip, Three.js)
- **npm Security Advisories (`npm audit`):** Pre-patch vs. post-patch lockfile verification

---

## 1. Executive Summary

| Audit Dimension | Before (`v0.1.1-beta`) | After (`v0.1.2-beta`) | Status |
| --- | --- | --- | --- |
| **`npm audit` Total Advisories** | **11** (`2 Critical`, `2 High`, `7 Moderate`) | **0** (`0 Critical`, `0 High`, `0 Moderate`, `0 Low`) across 406 packages | **Compliant** |
| **Electron Runtime Branch** | `electron@35.7.5` (EOL Sept 2, 2025; Chromium `134`; Node `22.14.0`) | `electron@45.4.1` (Current Stable; Chromium `156.0.8078.100`; Node `24.22.3`; V8 `15.6.75.57`) | **Patched** |
| **CISA KEV Chromium/V8 Exposure** | 15 actively exploited Chromium/V8/Skia/Dawn/Mojo CVEs unpatched | Superseded by Electron `45.4.1` / Chromium `156.0.8078.100` (track Electron 46 stable when promoted from alpha) | **Mitigated** |
| **Test Runner (`vitest`)** | `vitest@3.2.7` (`tinypool` Critical RCE + `@vitest/mocker` Moderate) | `vitest@5.1.1` | **Patched** |
| **Build Glob Matcher (`minimatch`)** | `minimatch@10.2.6` (Moderate ReDoS via `electron-builder`) | `minimatch@11.0.9` (via `package.json` `overrides`; `.msi` packaging verified) | **Patched** |
| **Runtime & Sanitizer Hardening** | Basic `contextIsolation`/`sandbox`, standard URI & path-traversal checks | Permission deny-all, navigation/`<webview>`/popup blocks, isolated SOP PDF partition, obfuscated URI blocking, ZIP symlink/entry/size caps | **Hardened** |

---

## 2. Patched Vulnerabilities in `v0.1.2-beta`

### 2.1 Electron `35.7.5` → `45.4.1` (Shipped Runtime & `.msi` Payload)

1. **Chromium / V8 / Graphics / Mojo CISA KEV Flaws Eliminated:**
   Moving off EOL Chromium `134` (`electron@35.7.5`) onto Chromium `156.0.8078.100` (`electron@45.4.1`, released Nov 18, 2026) remediates 15 actively exploited CISA KEV vulnerabilities published after Electron 35's March 2025 baseline:
   - `CVE-2026-125350` (Chromium XML/`libxslt` Use-After-Free — KEV added `2026-11-10`, due `2026-11-24`; Electron `45.4.1` includes upstream backports past Extended Stable `156.0.8078.96`)
   - `CVE-2026-87491` (V8 Out-of-Bounds Write — KEV added `2026-09-09`, due `2026-09-23`)
   - `CVE-2026-85046` (V8 Type Confusion — KEV added `2026-09-04`, due `2026-09-18`)
   - `CVE-2026-11645` (V8 Out-of-Bounds Read/Write — KEV added `2026-06-09`, due `2026-06-23`)
   - `CVE-2026-5281` (Dawn Use-After-Free — KEV added `2026-04-01`, due `2026-04-15`)
   - `CVE-2026-3910` (V8 Memory Bounds Restriction — KEV added `2026-03-13`, due `2026-03-27`)
   - `CVE-2026-3909` (Skia Out-of-Bounds Write — KEV added `2026-03-13`, due `2026-03-27`)
   - `CVE-2026-2441` (Chromium CSS Use-After-Free — KEV added `2026-02-17`, due `2026-03-10`)
   - `CVE-2025-14174` (Chromium Out-of-Bounds Memory Access — KEV added `2025-12-12`, due `2026-01-02`)
   - `CVE-2025-13223` (V8 Type Confusion — KEV added `2025-11-19`, due `2025-12-10`)
   - `CVE-2025-10585` (V8 Type Confusion — KEV added `2025-09-23`, due `2025-10-14`)
   - `CVE-2025-6558` (ANGLE & GPU Improper Input Validation — KEV added `2025-07-22`, due `2025-08-12`)
   - `CVE-2025-6554` (V8 Type Confusion — KEV added `2025-07-02`, due `2025-07-23`)
   - `CVE-2025-5419` (V8 Out-of-Bounds Read/Write — KEV added `2025-06-05`, due `2025-06-26`)
   - `CVE-2025-2783` (Chromium Mojo Sandbox Escape — KEV added `2025-03-27`, due `2025-04-17`)

2. **Electron Framework & `extract-zip` Advisories (40+ Advisories Resolved):**
   Upgrading from Electron `35.7.5` to `45.4.1` resolves all flagged advisories in `<= 42.11.15`, including High-severity vulnerabilities:
   - `<webview>` Node.js-in-Workers restriction bypass (`GHSA-9qh4-3jw8-366w`, CVSS `8.3`)
   - Inherited HTML sandbox restriction drop for popups / new windows (`GHSA-hq2x-r82h-9wj4`, `GHSA-gr2m-v5gq-v685`, CVSS `8.2`)
   - Offscreen child-window paint Use-After-Free (`GHSA-532v-xpq5-8h95`, CVSS `8.1`)
   - Embedded `extract-zip` symlink path traversal / arbitrary write (`GHSA-jmr9-qjv8-65gv`, `GHSA-7pqw-9j4j-h8q3`, CVSS `8.1`)
   - Renderer command-line switch injection (`GHSA-9wfr-w7mm-pc7f`, CVSS `7.7`)
   - `contextIsolation` bypass via `Function.prototype.bind` (`GHSA-h7rp-cf8h-j98x`, CVSS `7.5`)
   - Custom protocol cross-origin reads (`GHSA-v3j7-r9gq-3gjw`, `GHSA-j84w-jfhq-vhvj`, CVSS `7.4`)
   - Compromised eMudhra intermediate certificate distrust (`GHSA-jr5w-w6x2-84p9`, CVSS `7.4`)
   - Fullscreen/pointer-lock/keyboard-lock & PowerMonitor UAFs (`GHSA-8337-3p73-46f4` CVSS `7.5`, `GHSA-jjp3-mq3x-295m` CVSS `7.0`)

3. **Embedded Node.js `22.14.0` → `24.22.3` Security Advisories:**
   Node.js `24.22.3` inside Electron `45.4.1` incorporates the October and November 2026 Node.js security releases:
   - `CVE-2026-111497` (High/Critical, CVSS `9.2` — Google Brotli C decoder out-of-bounds write in `node:zlib`)
   - `CVE-2026-123864` (High, CVSS `8.1` — `node:https` parser re-entrancy heap disclosure)
   - `CVE-2026-123863`, `CVE-2026-126051` (High — HTTP/2 remote assertion & TLS handshake UAF)
   - `CVE-2026-105482`, `CVE-2026-105483`, `CVE-2026-106069` (High — DNS NUL truncation & TLS hostname bypass)
   - `CVE-2026-123868` (Medium, CVSS `5.9` — HTTP/2 stream memory accounting exhaustion)

### 2.2 Build & Test Toolchain Patches

- **`vitest` `3.2.7` → `5.1.1` (Dev/Test Only):** Eliminates two Critical prototype-pollution-to-RCE advisories in `tinypool <= 2.1.1` (`GHSA-5gmw-xhrv-c9v3`, `GHSA-85c8-ppgw-ccpr`) and two Moderate `@vitest/mocker <= 4.1.11` advisories (`GHSA-82fw-gwwq-j7x9` CVSS `5.9`, `GHSA-qxg6-89mg-rqv8` CVSS `4.7`).
- **`minimatch` `10.2.6` → `11.0.9` (Build Packaging Override):** Eliminates Moderate ReDoS (`GHSA-g3hv-75wg-m249`) in `electron-builder@26.18.1` without downgrading `electron-builder`. Clean `.msi` compilation verified with `electron-builder@26.18.1`.

---

## 3. Currently Unpatched, Residual & Host-Managed Components (Criticality Breakdown)

The following table accounts for every remaining unpatched, externally managed, non-applicable, or major-version-lagged component checked against **CISA KEV `2026.11.20`**, **CVE.org**, and **`npm audit`**:

| Component / Dependency | Current Version | Status & Remediation State | Criticality | Rationale & Mitigations |
| --- | --- | --- | --- | --- |
| **All Bundled npm Dependencies (`npm audit`)** | 406 packages audited | **0 unpatched vulnerabilities** | **None (Compliant)** | `npm audit` returns 0 Critical, 0 High, 0 Moderate, 0 Low after `v0.1.2-beta` patches. |
| **Microsoft Edge (Host Browser launched by Playwright)** | Host `158.0.4370.33` (not bundled in `.msi`) | **Host-Managed** (Operator OS dependency) | **High / CISA KEV** *(if host runs Edge < 157/158)* | Playwright connects via `channel: 'msedge'` during capture sessions against live internal admin portals. Verified build host is patched (`158.0.4370.33`). Operators must keep Edge updated via Windows Update / Edge policy, or enforce Edge `XSLTEnabled=false` until updated. |
| **Chromium Mainline `157.0.8103.50` in Electron (`CVE-2026-125350`)** | Electron `45.4.1` (Chromium `156.0.8078.100`) | **Residual / Upstream Alpha** (`Electron 46` is currently `46.0.0-alpha.12`) | **Low Residual** *(High / CISA KEV on open web browsers)* | Electron `45.4.1` ships Chromium `156.0.8078.100` (> `156.0.8078.96` Extended Stable fix) with backports (`#55907`). Additionally, Electron windows never load untrusted remote websites: Composer UI runs offline `dist/renderer`, external popups/navigations/`<webview>` are blocked, captured HTML strips scripts & runs in `<iframe sandbox="allow-same-origin">`, and SOP PDF rendering sets `javascript: false`. Upgrade to Electron 46 stable once promoted. |
| **Developer Node.js Runtime (`v26.13.1` host / `@types/node` `24.19.2`)** | Host `v26.13.1` | **Patched on Host** | **None on verified host** | Host Node `v26.13.1` contains the November 2026 security fixes (`CVE-2026-123864`, `CVE-2026-123868`, `CVE-2026-123863`, `CVE-2026-126051`) and October `CVE-2026-111497` (Brotli). Contributors building locally should run Node `>= 26.13.1`, `>= 24.22.3`, or `>= 22.23.5`. |
| **Vite (`7.3.8`), React (`19.3.1`), Playwright-Core (`1.65.1`), Cheerio (`1.2.0`), esbuild (`0.25.12`), JSZip (`3.10.2`), Three.js (`0.187.0`), TypeScript (`5.9.3`)** | Latest / Supported Lines | **No Active App CVEs** (Build-only major updates `vite@8`, `esbuild@0.28`, `typescript@7` deferred) | **None / Informational** | Checked CISA KEV & CVE.org: Vite KEV `CVE-2025-31125` patched in `7.3.8`; React KEV `CVE-2025-55182` only affects React Server Components (app is pure client-side Electron React); `CVE-2025-11953` affects React Native CLI (unused); `esbuild` CVEs (`CVE-2026-109595`, `CVE-2026-44594`) apply only to third-party SSG/CDN resolvers (`Hugo`, `esm.sh`), and `esbuild` is never shipped inside runtime `.asar`. Verified `.hccproj` JSZip extraction explicitly rejects traversal (`..`), symlinks, and zip bombs. |

---

## 4. Application Code & Runtime Security Hardening Added in `v0.1.2-beta`

1. **Electron Main Process & Session Locks (`src/main/index.ts`):**
   - Deny-by-default `setPermissionRequestHandler` and `setPermissionCheckHandler` on `session.defaultSession` and on the isolated ephemeral `'sop-pdf'` PDF-rendering session.
   - Global `app.on('web-contents-created')` listener blocking `<webview>` attachment (`will-attach-webview`) and window popups (`setWindowOpenHandler(() => ({ action: 'deny' }))`).
   - Explicit `webviewTag: false` and `allowRunningInsecureContent: false` alongside `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
   - Navigation allowlist (`will-navigate`) restricting `mainWindow` strictly to `dist/renderer` (or `VITE_DEV_SERVER_URL` in dev) and restricting `pdfWindow` strictly to the single temporary SOP HTML `file://` URL.
   - Strict `new URL()` HTTP/HTTPS validation and null-byte rejection in `CAPTURE_START`, `PREVIEW_OPEN`, and `BUNDLE_REVEAL` (limiting `shell.openPath` strictly to verified directories while files use `shell.showItemInFolder`).

2. **DOM Snapshot Sanitizer Hardening (`src/main/capture/html-sanitizer.ts`):**
   - Added `<meta http-equiv="set-cookie">` stripping alongside `refresh` and upstream `content-security-policy`.
   - Strips ASCII control characters (`\u0000-\u001f`) and whitespace before detecting `javascript:`, `vbscript:`, `data:text/html`, and navigational `data:image/svg+xml` payloads on `href`, `src`, `action`, `formaction`, and `xlink:href`.

3. **Portable `.hccproj` Archive Hardening (`src/main/export/project-archive.ts`):**
   - Enforces `MAX_ARCHIVE_ENTRIES = 2000` and `MAX_ARCHIVE_UNCOMPRESSED_BYTES = 250 MiB` limits to mitigate zip-bomb decompression DoS.
   - Rejects UNIX symlink ZIP entries (`(unixMode & 0o170000) === 0o120000`) alongside existing path-traversal and drive-prefix checks.

4. **Local Preview Server Hardening (`src/main/preview-server.ts`):**
   - Rejects requests containing null bytes (`\0` / `%00`) with HTTP `400` and adds `Referrer-Policy: no-referrer` and `Cross-Origin-Resource-Policy: same-origin` headers.

---

## 5. Verification Evidence (`v0.1.2-beta`)

- `npm audit`: **0 vulnerabilities** (`info: 0, low: 0, moderate: 0, high: 0, critical: 0`)
- `npm run typecheck`: Exited `0`
- `npm run build`: Exited `0`
- `npm run test` (`vitest@5.1.1`): **16 / 16 test files passed, 32 / 32 tests passed** (including `tests/unit/security-hardening.test.ts` and Playwright-Edge E2E suites)
- `npm run dist:msi` (`electron-builder@26.18.1` + `electron@45.4.1`): Exited `0` (`release\HTML Curriculum Composer 0.1.2-beta.msi`, `134,394,004` bytes)
