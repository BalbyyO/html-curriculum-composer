import type { SanitizationRule } from './types';

export const BUILTIN_SANITIZATION_PRESETS: SanitizationRule[] = [
  {
    id: 'preset-ipv4',
    name: 'IPv4 Addresses',
    pattern:
      '\\b(?:(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\.){3}(?:25[0-5]|2[0-4]\\d|1?\\d?\\d)\\b',
    replacement: '192.0.2.10',
    isRegex: true,
    caseInsensitive: false,
    enabled: true,
    isPreset: true
  },
  {
    id: 'preset-fqdn',
    name: 'Internal FQDNs',
    pattern:
      '\\b[a-zA-Z0-9-]+(?:\\.[a-zA-Z0-9-]+)*\\.(?:corp|local|internal|lan|ad|intra)\\b',
    replacement: 'host.example.lab',
    isRegex: true,
    caseInsensitive: true,
    enabled: true,
    isPreset: true
  },
  {
    id: 'preset-mac',
    name: 'MAC Addresses',
    pattern: '\\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\\b',
    replacement: '02:00:00:00:00:01',
    isRegex: true,
    caseInsensitive: false,
    enabled: true,
    isPreset: true
  },
  {
    id: 'preset-email',
    name: 'Email Addresses',
    pattern: '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}\\b',
    replacement: 'admin@example.lab',
    isRegex: true,
    caseInsensitive: false,
    enabled: true,
    isPreset: true
  }
];
