// =============================================================================
// PAYOUT LOGIC — owned by the Game Engine team
// =============================================================================
// Exponential row-based payout: bricks in higher rows (closer to top) are worth
// more. Max profit is the same as the flat model — only the distribution changes.
//
// T = total bricks (COLS × ROWS)
// D = deathCount (player-selected)
// N = normal bricks = T - D
//
// max_profit = wager × (getMultiplier() - 1)
//
// Row weight:   getBrickWeight(row) = Q_FACTOR ^ ((ROWS - 1) - row)
//               row 0 = top (most valuable), row ROWS-1 = bottom (least valuable)
//
// brickValueScale = max_profit / Σ getBrickWeight(b.row) for all normal bricks
// (computed at game start from actual brick layout)
//
// Per-brick profit: brickValueScale × getBrickWeight(b.row)
// Live payout:      wager + accumulatedProfit
// =============================================================================

// Number of normal (non-death) bricks in the current round.
function getTotalNormal() {
  return COLS * ROWS - deathCount;
}

// Relative value weight for a brick in the given row.
// Row 0 = top (highest weight); row ROWS-1 = bottom (lowest weight).
function getBrickWeight(row) {
  return Math.pow(Q_FACTOR, (ROWS - 1) - row);
}

// Max payout multiplier: 1 + (D/T) × 10.
// e.g. D=10 → T=50 → 1 + (10/50)×10 = 3.00×  (profit = 2× wager)
// e.g. D=25 → T=50 → 1 + (25/50)×10 = 6.00×  (profit = 5× wager)
function getMultiplier() {
  const T = COLS * ROWS;
  const D = deathCount;
  return +(1 + (D / T) * 15).toFixed(2);
}

// Current live payout: wager returned plus profit accumulated so far.
function getLivePayout(w) {
  return w + accumulatedProfit;
}

// Human-readable elapsed time string (e.g. "1m 23s").
function formatDuration(ms) {
  const secs = Math.floor(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
