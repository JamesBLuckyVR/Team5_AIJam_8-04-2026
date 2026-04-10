// =============================================================================
// BRICK GENERATION — owned by the Game Engine team
// =============================================================================
// Deterministic layout from a seed so rounds can be verified as provably fair.
// Death blocks are scattered randomly among all rows except the bottom row.
// =============================================================================

function generateBricks(deathCount, seed) {
  let rng = seed;
  const next = () => {
    rng = (rng * 1664525 + 1013904223) & 0xffffffff;
    return (rng >>> 0) / 0xffffffff;
  };

  const total    = COLS * ROWS;
  // Exclude the bottom row (row ROWS-1) from death block placement
  const eligible = Array.from({ length: total }, (_, i) => i)
    .filter(i => Math.floor(i / COLS) < ROWS - 1);

  // Fisher-Yates shuffle to distribute death blocks fairly
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
      alive:    true,
      isDeath:  deathSet.has(i),
      revealed: false,
      color:    BRICK_COLORS[row % BRICK_COLORS.length],
    };
  });
}
