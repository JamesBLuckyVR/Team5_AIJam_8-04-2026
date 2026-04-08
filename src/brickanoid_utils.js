import { COLS, ROWS, BRICK_W, BRICK_H, BRICK_GAP, GRID_LEFT, GRID_TOP, BRICK_COLORS } from "./constants";

export function payoutCurve(pct) {
  if (pct <= 0) return 0;
  return Math.pow(pct, 2.5);
}

export function generateBricks(deathCount, seed) {
  let rng = seed;
  const next = () => {
    rng = (rng * 1664525 + 1013904223) & 0xffffffff;
    return (rng >>> 0) / 0xffffffff;
  };
  const total = COLS * ROWS;
  // Bottom row excluded from death placement
  const eligibleIndices = Array.from({ length: total - COLS }, (_, i) => i);
  for (let i = eligibleIndices.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [eligibleIndices[i], eligibleIndices[j]] = [eligibleIndices[j], eligibleIndices[i]];
  }
  const safeDeathCount = Math.min(deathCount, eligibleIndices.length);
  const deathSet = new Set(eligibleIndices.slice(0, safeDeathCount));
  return Array.from({ length: total }, (_, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    return {
      id: i, row, col,
      x: GRID_LEFT + col * (BRICK_W + BRICK_GAP),
      y: GRID_TOP + row * (BRICK_H + BRICK_GAP),
      alive: true,
      isDeath: deathSet.has(i),
      color: BRICK_COLORS[row % BRICK_COLORS.length],
    };
  });
}

export function formatDuration(ms) {
  const secs = Math.floor(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
