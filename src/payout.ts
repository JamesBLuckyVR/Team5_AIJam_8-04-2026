import { COLS, ROWS, SPEED_BONUS, DEATH_BONUS } from "./config";

// ─── Types ────────────────────────────────────────────────────────────────────
export type RoundOutcome = "death" | "drop" | "clear";

export interface RoundResult {
  type:    RoundOutcome;
  payout:  number;
  cleared: number;
  pct:     number;
  wager:   number;
}

// ─── Core curve ───────────────────────────────────────────────────────────────
export function payoutCurve(pct: number): number {
  if (pct <= 0) return 0;
  return Math.pow(pct, 2.5);
}

// ─── Multiplier ───────────────────────────────────────────────────────────────
export function calcMultiplier(speed: number, deathCount: number): number {
  const speedMult = SPEED_BONUS[speed] ?? 1;
  const deathMult = DEATH_BONUS[deathCount] ?? 1;
  return Math.round(speedMult * deathMult * 100) / 100;
}

// ─── Live payout (during play) ────────────────────────────────────────────────
export function calcLivePayout(
  wager:      number,
  multiplier: number,
  cleared:    number,
): number {
  const totalBricks = COLS * ROWS;
  return wager * multiplier * payoutCurve(cleared / totalBricks);
}

export function calcBrickGain(
  wager:      number,
  multiplier: number,
  clearedBefore: number,
): number {
  const prev = calcLivePayout(wager, multiplier, clearedBefore);
  const next = calcLivePayout(wager, multiplier, clearedBefore + 1);
  return Math.round((next - prev) * 100) / 100;
}

// ─── Round resolution ─────────────────────────────────────────────────────────
export function resolveRound(
  type:        RoundOutcome,
  wager:       number,
  multiplier:  number,
  cleared:     number,
  totalNormal: number,
): RoundResult {
  let payout = 0;
  if      (type === "death") payout = 0;
  else if (type === "drop")  payout = calcLivePayout(wager, multiplier, cleared);
  else                       payout = wager * multiplier;

  return {
    type,
    payout:  Math.round(payout * 100) / 100,
    cleared,
    pct:     Math.round((cleared / totalNormal) * 100),
    wager,
  };
}
