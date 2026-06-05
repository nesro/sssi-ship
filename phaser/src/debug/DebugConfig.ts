// debug/DebugConfig.ts
// Lightweight singleton that controls whether the debug overlay is visible.
// Persists the toggle in localStorage so it survives page reloads.
// Toggle in-game with F1, or from the browser console: DebugConfig.toggle()

const STORAGE_KEY = 'nesro-nova-debug';

function readFromStorage(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeToStorage(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, String(value));
  } catch {
    // Silently ignore — storage may be unavailable in some environments.
  }
}

export const DebugConfig = {
  enabled: readFromStorage(),

  toggle(): void {
    this.enabled = !this.enabled;
    writeToStorage(this.enabled);
    console.info(`[DebugConfig] overlay ${this.enabled ? 'ON' : 'OFF'}`);
  },

  enable(): void {
    this.enabled = true;
    writeToStorage(true);
  },

  disable(): void {
    this.enabled = false;
    writeToStorage(false);
  },
};

// Expose on window so developers can toggle from the browser console:
//   window.__debug.toggle()
(window as unknown as Record<string, unknown>).__debug = DebugConfig;
