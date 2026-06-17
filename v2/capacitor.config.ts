import type { CapacitorConfig } from '@capacitor/cli';

// App id is immutable once uploaded to Play — confirmed as com.nesro.nova (V2_HANDOFF.md §6).
const config: CapacitorConfig = {
  appId: 'com.nesro.nova',
  appName: 'Nesro Nova',
  webDir: 'dist',
};

export default config;
