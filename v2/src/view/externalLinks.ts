// Opens a URL outside the game. Plain `window.open()` — correct for the web build, but
// a Capacitor-wrapped build should route this through `@capacitor/browser`'s
// `Browser.open()` instead (see docs/known-issues.md's Discord-link entry for why); this
// is the one call site to change when that dependency is added.
export function openExternalLink(url: string): void {
  window.open(url, '_blank', 'noopener');
}

export const DISCORD_URL = 'https://discord.com/channels/1512167269080367104';
export const DISCORD_LABEL = '💬 JOIN OUR DISCORD — FEEDBACK & HELP WANTED';
