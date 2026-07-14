// Installs an in-memory localStorage shim for plain `tsx` runs. `SaveManager.ts`
// calls `localStorage.getItem/setItem/removeItem` inside function bodies only (never
// at module scope), so this only needs to exist by the time those functions run —
// but import it as the *first* import in any entrypoint that uses SaveManager, since
// import order across separate files runs top-to-bottom (unlike statements within a
// single file, where hoisted imports would defeat a same-file ordering trick).

class MemoryStorage {
  private readonly store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }
}

if (typeof globalThis.localStorage === 'undefined') {
  // SaveManager.ts only ever calls getItem/setItem/removeItem — this deliberately
  // doesn't implement the rest of the real Storage interface (length/clear/key).
  globalThis.localStorage = new MemoryStorage() as unknown as Storage;
}
