// =============================================================================
// PAYOUT LOGIC — owned by the Game Engine team
// =============================================================================
// Controls how much the player wins based on bricks cleared, speed and
// death-block count. Change the curve or multiplier math here without
// touching art or physics.
// =============================================================================

// Maps brick-clear percentage (0–1) to a payout multiplier.
// Power curve: rewards clearing more bricks non-linearly.
function payoutCurve(pct) {
  if (pct <= 0) return 0;
  return Math.pow(pct, 2.5);
}

// Number of normal (non-death) bricks in the current round.
function getTotalNormal() {
  return COLS * ROWS - deathCount;
}

// Combined multiplier from speed and death-block bonuses.
function getMultiplier() {
  return +(SPEED_BONUS[speed] * (DEATH_BONUS[deathCount] ?? 1.00)).toFixed(2);
}

// Human-readable elapsed time string (e.g. "1m 23s").
function formatDuration(ms) {
  const secs = Math.floor(ms / 1000);
  return secs < 60 ? `${secs}s` : `${Math.floor(secs / 60)}m ${secs % 60}s`;
}
