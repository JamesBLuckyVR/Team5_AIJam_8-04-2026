// ── Payout curve ──────────────────────────────────────────────────────────────
// Maps brick-clear percentage (0–1) to a payout multiplier.
// Power curve: rewards clearing more bricks non-linearly.
function payoutCurve(pct) {
  if (pct <= 0) return 0;
  return Math.pow(pct, 2.5);
}

// ── Brick generation ──────────────────────────────────────────────────────────
// Deterministic from `seed` so rounds can be verified as provably fair.
// Death blocks are placed randomly among all rows except the bottom row.
function generateBricks(deathCount, seed) {
  let rng = seed;
  const next = () => {
    rng = (rng * 1664525 + 1013904223) & 0xffffffff;
    return (rng >>> 0) / 0xffffffff;
  };

  const total    = COLS * ROWS;
  const eligible = Array.from({ length: total - COLS }, (_, i) => i); // exclude bottom row

  // Fisher-Yates shuffle on eligible indices
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }

  const deathSet = new Set(eligible.slice(0, Math.min(deathCount, eligible.length)));

  return Array.from({ length: total }, (_, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    return {
      id: i, row, col,
      x: GRID_LEFT + col * (BRICK_W + BRICK_GAP),
      y: GRID_TOP  + row * (BRICK_H + BRICK_GAP),
      alive: true,
      isDeath: deathSet.has(i),
      revealed: false,
      color: BRICK_COLORS[row % BRICK_COLORS.length],
    };
  });
}

// ── Time formatting ───────────────────────────────────────────────────────────
function formatDuration(ms) {
  const secs = Math.floor(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
