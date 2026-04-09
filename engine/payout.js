// =============================================================================
// PAYOUT LOGIC — owned by the Game Engine team
// =============================================================================
// Casino-style linear payout based on fair odds: T / N.
// Each normal brick cleared earns the same profit.
// The house edge comes solely from players hitting death blocks and losing
// their wager — there is no additional discount on the payout.
//
// T = total bricks (COLS × ROWS)
// D = deathCount (player-selected)
// N = normal bricks = T - D
//
// max_multiplier   = T / N
// per_brick_profit = wager × (max_multiplier − 1) / N
// live_payout(k)   = wager + k × per_brick_profit
// =============================================================================

// Number of normal (non-death) bricks in the current round.
function getTotalNormal() {
  return COLS * ROWS - deathCount;
}

// Max payout multiplier: 1 + (D/T) × 10.
// e.g. D=10 → T=50 → 1 + (10/50)×10 = 3.00×  (profit = 2× wager)
// e.g. D=25 → T=50 → 1 + (25/50)×10 = 6.00×  (profit = 5× wager)
function getMultiplier() {
  const T = COLS * ROWS;
  const D = deathCount;
  return +(1 + (D / T) * 10).toFixed(2);
}

// Profit earned per normal brick cleared (same for every brick).
function getPerBrickProfit(w) {
  return w * (getMultiplier() - 1) / getTotalNormal();
}

// Live payout for k bricks cleared: wager returned plus linear profit accrual.
function getLivePayout(w, k) {
  return w + k * getPerBrickProfit(w);
}

// Human-readable elapsed time string (e.g. "1m 23s").
function formatDuration(ms) {
  const secs = Math.floor(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
