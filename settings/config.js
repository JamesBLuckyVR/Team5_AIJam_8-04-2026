// =============================================================================
// GAME SETTINGS — owned by the Game Settings team
// =============================================================================
// Change numbers here to tune difficulty, layout, payouts, and visual palette.
// No game logic lives in this file — safe to edit without breaking anything.
// =============================================================================

// ── Grid / canvas dimensions ──────────────────────────────────────────────────
const COLS      = 10;
const ROWS      = 6;
const CANVAS_W  = 620;
const CANVAS_H  = 740;
const CASHOUT_H = 54;
const PLAY_H    = CANVAS_H - CASHOUT_H;

// ── Brick dimensions ──────────────────────────────────────────────────────────
const BRICK_W   = 56;
const BRICK_H   = 24;
const BRICK_GAP = 3;
const GRID_LEFT = (CANVAS_W - (COLS * (BRICK_W + BRICK_GAP) - BRICK_GAP)) / 2;
const GRID_TOP  = 40;

// ── Paddle / ball ─────────────────────────────────────────────────────────────
const PADDLE_W = 70;
const PADDLE_H = 10;
const BALL_R   = 7;

// ── Game balance ──────────────────────────────────────────────────────────────
// Index = speed level (1–5); index 0 unused
const SPEED_BONUS = [0, 1.00, 1.10, 1.22, 1.38, 1.55];
// Key = death-block count; value = bonus multiplier
const DEATH_BONUS = { 5: 1.00, 10: 1.08, 22: 1.18, 30: 1.28, 38: 1.40 };
// Pixels-per-frame for each speed level (index 0 unused)
const SPEED_PX    = [0, 3.2, 4.2, 5.4, 6.8, 8.4];

// ── Available options shown in the sidebar selectors ─────────────────────────
const DEATH_OPTIONS = [5, 10, 22, 30, 38];

// ── Visual palette ────────────────────────────────────────────────────────────
// One color per brick row. Art team: feel free to change these.
const BRICK_COLORS = ["#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#2980b9"];
