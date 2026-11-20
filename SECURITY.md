# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| `0.1.x-beta` | Yes |

## Security Architecture

**HTML Curriculum Composer** is built for enterprise infrastructure teams operating in air-gapped or restricted environments:

- **Offline Execution:** Zero external CDNs, analytics endpoints, or remote script loading. All Three.js runtime code, styles, images, and fonts are bundled locally.
- **Process Isolation:** The Electron desktop shell enforces `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`, communicating solely through typed `contextBridge` IPC channels defined in `src/preload/index.ts`.
- **Snapshot Sandboxing:** Recorded web pages have `<script>` elements and inline `on*` event handlers stripped during capture (`src/main/capture/html-sanitizer.ts`), and both preview/exported players render pages inside restricted `<iframe sandbox="allow-same-origin">` frames.
- **Bulk Sanitization:** Reusable literal and regex redaction rules allow stripping IPv4 addresses, FQDNs, MAC addresses, credentials, and sensitive metadata before distribution.
- **Archive & SOP Safety:** `.hccproj` imports reject ZIP entry path traversal (`..` / absolute paths) and validate `hccproj.json` schemas, while SOP HTML exports enforce `script-src 'none'` Content Security Policy headers and HTML entity escaping.

## Reporting a Vulnerability

Please **do not** open public GitHub issues for sensitive security vulnerabilities.

Instead, report security issues privately using GitHub Security Advisories at:
https://github.com/BalbyyO/html-curriculum-composer/security/advisories/new

Include reproduction steps, affected version, and potential impact. We aim to acknowledge reports within 72 hours.
