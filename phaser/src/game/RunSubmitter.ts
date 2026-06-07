// RunSubmitter.ts
// Optional fire-and-forget POST to a validation backend.
// Set SUBMIT_ENDPOINT to a real URL when the server is ready.
// While the endpoint is empty this is a no-op and never throws.

import type { RunRecord } from '../SaveManager.js';

const SUBMIT_ENDPOINT = '';

export async function submitRun(record: RunRecord): Promise<void> {
  if (!SUBMIT_ENDPOINT) return;
  try {
    const res = await fetch(SUBMIT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    if (!res.ok) {
      console.warn(`[RunSubmitter] Server rejected run (${res.status})`);
    }
  } catch (err) {
    console.warn('[RunSubmitter] Submission failed:', err);
  }
}
