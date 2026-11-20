export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'hcc-theme';
export const TARGET_BOOKMARKS_KEY = 'hcc-target-bookmarks';

export interface TargetBookmark {
  id: string;
  label: string;
  url: string;
}

function getSafeStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function readStoredTheme(): ThemeMode {
  try {
    const storage = getSafeStorage();
    const raw = storage?.getItem(THEME_STORAGE_KEY);
    if (raw === 'dark' || raw === 'light') {
      return raw;
    }
  } catch {
    // Ignore storage access errors and default cleanly to Day Mode.
  }
  return 'light';
}

export function applyTheme(mode: ThemeMode, persist = true): void {
  const normalized: ThemeMode = mode === 'dark' ? 'dark' : 'light';
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root) {
      root.dataset.theme = normalized;
    }
    const meta = document.querySelector('meta[name="color-scheme"]');
    if (meta) {
      meta.setAttribute('content', normalized);
    }
  }
  if (persist) {
    try {
      const storage = getSafeStorage();
      storage?.setItem(THEME_STORAGE_KEY, normalized);
    } catch {
      // Non-fatal if storage is blocked.
    }
  }
}

export function subscribeThemeStorage(onChange: (mode: ThemeMode) => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => undefined;
  }
  const handler = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    if (event.newValue === 'light' || event.newValue === 'dark') {
      applyTheme(event.newValue, false);
      onChange(event.newValue);
    } else if (event.newValue === null) {
      applyTheme('light', false);
      onChange('light');
    }
  };
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

export function loadTargetBookmarks(): TargetBookmark[] {
  try {
    const storage = getSafeStorage();
    const raw = storage?.getItem(TARGET_BOOKMARKS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is TargetBookmark =>
        Boolean(item) &&
        typeof item === 'object' &&
        typeof (item as TargetBookmark).id === 'string' &&
        typeof (item as TargetBookmark).label === 'string' &&
        typeof (item as TargetBookmark).url === 'string'
    );
  } catch {
    return [];
  }
}

export function saveTargetBookmarks(bookmarks: TargetBookmark[]): void {
  try {
    const storage = getSafeStorage();
    storage?.setItem(TARGET_BOOKMARKS_KEY, JSON.stringify(bookmarks));
  } catch {
    // Non-fatal if storage is blocked.
  }
}
