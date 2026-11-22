# Code Signing Policy

## Signing Attribution

Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## Signed Artifacts & Build Provenance

- **What is signed:** Official Windows x64 installer packages (`HTML Curriculum Composer <version>.msi`) and bundled desktop application binaries (`HTML Curriculum Composer.exe`) for **HTML Curriculum Composer**.
- **Trusted Build Origin:** Eligible release artifacts are built solely from public source code in `https://github.com/BalbyyO/html-curriculum-composer` on GitHub-hosted `windows-latest` runners via [.github/workflows/build-msi.yml](.github/workflows/build-msi.yml). Binaries built locally on developer workstations are never submitted for SignPath Foundation signing.
- **Approval Gate:** Release signing requests require explicit approval from designated project approvers in SignPath before certificates are applied.
- **Integrity Verification:** Each CI run also outputs `SHA256SUMS.txt` alongside the `.msi` artifact.

## Team Roles

- **Authors / Committers:** `Matheus Oliveira` (`@BalbyyO`)
- **Reviewers:** `Matheus Oliveira` (`@BalbyyO`) *(external pull requests reviewed prior to merge into `main`)*
- **Approvers:** `Matheus Oliveira` (`@BalbyyO`)

All repository maintainers, reviewers, and signing approvers enforce Multi-Factor Authentication (MFA / 2FA) on both GitHub and SignPath.

## Privacy Policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

- **Offline-First Design:** HTML Curriculum Composer contains zero telemetry, zero analytics endpoints, zero automatic update pings, and zero external CDN dependencies.
- **User-Initiated Connections Only:** Network traffic only leaves the local machine when the operator explicitly starts a browser capture session against a user-specified Target URL (via local Microsoft Edge). Exported training bundles, SCORM packages, and SOP HTML/PDF exports operate 100% offline.

## Security & Verification Links

- Vulnerability Disclosure & Security Architecture: [SECURITY.md](SECURITY.md)
- Live CISA KEV & CVE.org Dependency Report: [SECURITY_REPORT.md](SECURITY_REPORT.md)
- CI Build & Signing Workflow: [.github/workflows/build-msi.yml](.github/workflows/build-msi.yml)
