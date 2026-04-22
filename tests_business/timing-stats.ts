/**
 * Adaptive timing stats — records actual UDAF/ingest wait times across runs
 * and computes an EWMA-based timeout for the next run.
 *
 * Stats file: reports/.timing-stats.json
 * Format: { udafMs: number[], ingestMs: number[] }
 *   - up to 20 samples kept per key
 *   - timeout = ewma(samples) * BUFFER_FACTOR (default 2.5×)
 *
 * Growth detection: if last 3 EWMAs are each > previous, emit a warning.
 */

import * as fs from "fs";
import { fileURLToPath } from "url";
import * as path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATS_FILE = path.resolve(__dirname, "../reports/.timing-stats.json");
const MAX_SAMPLES = 20;
const EWMA_ALPHA  = 0.3;   // weight for newest sample (0.3 = moderately reactive)
const BUFFER_FACTOR = 2.5; // timeout = ewma * 2.5
const MIN_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 120_000;

interface TimingStats {
  udafMs:   number[];  // reserved for future use
  ingestMs: number[];  // ingest propagation time (ms) per run
}

function loadStats(): TimingStats {
  try {
    const raw = fs.readFileSync(STATS_FILE, "utf-8");
    return JSON.parse(raw);
  } catch {
    return { udafMs: [], ingestMs: [] };
  }
}

function saveStats(stats: TimingStats): void {
  try {
    fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  } catch {
    // non-critical — just skip if can't write
  }
}

function ewma(samples: number[]): number {
  if (samples.length === 0) return 0;
  let avg = samples[0];
  for (let i = 1; i < samples.length; i++) {
    avg = EWMA_ALPHA * samples[i] + (1 - EWMA_ALPHA) * avg;
  }
  return avg;
}

/** Record actual observed wait time and return updated EWMA */
export function recordTiming(key: keyof TimingStats, actualMs: number): number {
  const stats = loadStats();
  const samples = stats[key];
  samples.push(actualMs);
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
  stats[key] = samples;
  saveStats(stats);

  const avg = ewma(samples);

  // Growth detection: warn if last 3 EWMAs are monotonically increasing
  if (samples.length >= 5) {
    const ewmas = samples.slice(-5).map((_, i, arr) => ewma(arr.slice(0, i + 1)));
    const last3 = ewmas.slice(-3);
    if (last3[0] < last3[1] && last3[1] < last3[2]) {
      console.warn(`[timing-stats] WARNING: ${key} EWMA is growing (${last3.map(v => Math.round(v)).join(" → ")}ms) — server may be accumulating compute debt`);
    }
  }

  return avg;
}

/** Return recommended timeout for the given key based on historical data */
export function getAdaptiveTimeout(key: keyof TimingStats, fallbackMs = 30_000): number {
  const stats = loadStats();
  const samples = stats[key];
  if (samples.length === 0) return fallbackMs;
  const avg = ewma(samples);
  const timeout = Math.round(avg * BUFFER_FACTOR);
  return Math.min(Math.max(timeout, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS);
}
