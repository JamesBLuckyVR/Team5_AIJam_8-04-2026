// ─── Layout ──────────────────────────────────────────────────────────────────
export const COLS        = 10;
export const ROWS        = 6;
export const BRICK_W     = 56;
export const BRICK_H     = 18;
export const BRICK_GAP   = 3;
export const CANVAS_W    = 620;
export const CANVAS_H    = 740;
export const CASHOUT_H   = 54;
export const PLAY_H      = CANVAS_H - CASHOUT_H;
export const PADDLE_W    = 70;
export const PADDLE_H    = 10;
export const BALL_R      = 7;
export const GRID_LEFT   = (CANVAS_W - (COLS * (BRICK_W + BRICK_GAP) - BRICK_GAP)) / 2;
export const GRID_TOP    = 40;

// ─── Risk tiers ───────────────────────────────────────────────────────────────
/** Index = speed tier (1–5). Index 0 unused. */
export const SPEED_PX: number[]    = [0, 3.2, 4.2, 5.4, 6.8, 8.4];
export const SPEED_BONUS: number[] = [0, 1.00, 1.10, 1.22, 1.38, 1.55];

/** Key = deathblock count. Value = bonus multiplier. */
export const DEATH_BONUS: Record<number, number> = {
  5:  1.00,
  10: 1.08,
  22: 1.18,
  30: 1.28,
  38: 1.40,
};

export const DEATH_COUNT_OPTIONS = [5, 10, 22, 30, 38] as const;
export type  DeathCount = typeof DEATH_COUNT_OPTIONS[number];

// ─── Visuals ─────────────────────────────────────────────────────────────────
/** One color per brick row, cycling. */
export const BRICK_COLORS = [
  "#c0392b",
  "#e67e22",
  "#f1c40f",
  "#27ae60",
  "#2980b9",
] as const;

// ─── Gameplay limits ─────────────────────────────────────────────────────────
export const MIN_WAGER = 0.01;
