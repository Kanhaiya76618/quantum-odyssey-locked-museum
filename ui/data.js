// Helpers for a run: counts keyed by circuit id, bitstrings written qubit 0 first.

export function has(run, id) {
  return Boolean(run && run.counts && run.counts[id]);
}

export function totalShots(counts) {
  let n = 0;
  for (const k in counts) n += counts[k];
  return n;
}

// Draw one shot from a histogram, weighted by its counts.
export function sampleShot(counts) {
  const n = totalShots(counts);
  let r = Math.random() * n;
  for (const k in counts) {
    r -= counts[k];
    if (r < 0) return k;
  }
  return Object.keys(counts)[0];
}

export function pct(x, digits = 1) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return `${(100 * x).toFixed(digits)}%`;
}

export function num(x, digits = 2) {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  return Number(x).toFixed(digits);
}

export function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function runLabel(run) {
  const kind = run.source === 'live' ? 'This session' : 'Recorded';
  return `${kind}: ${run.backend} (${run.shots} shots, ${run.recorded_at})`;
}
