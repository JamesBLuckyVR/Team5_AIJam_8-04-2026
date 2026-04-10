// =============================================================================
// GAME SETTINGS — owned by the Game Settings team
// =============================================================================
// Change numbers here to tune difficulty, layout, payouts, and visual palette.
// No game logic lives in this file — safe to edit without breaking anything.
// =============================================================================

// ── Brick grid — change COLS and ROWS to resize the playing field ─────────────
const COLS = 10;   // ← number of brick columns
const ROWS = 5;    // ← number of brick rows

// ── Brick dimensions ──────────────────────────────────────────────────────────
const BRICK_W   = 56;
const BRICK_H   = 24;
const BRICK_GAP = 3;

// ── Layout padding — derived canvas size adjusts automatically ────────────────
const GRID_TOP            = 0;    // space above the brick grid (px)
const GRID_PADDING_X      = 16.5; // horizontal margin on each side of the grid (px)
const GRID_PADDING_BOTTOM = 480;  // space below bricks to bottom of play area — ball & paddle room (px)
const CASHOUT_H           = 130;  // height of the cashout zone bar (px)

// ── Derived dimensions — do not edit these directly ───────────────────────────
const CANVAS_W  = COLS * (BRICK_W + BRICK_GAP) - BRICK_GAP + GRID_PADDING_X * 2;
const PLAY_H    = GRID_TOP + ROWS * (BRICK_H + BRICK_GAP) - BRICK_GAP + GRID_PADDING_BOTTOM;
const CANVAS_H  = PLAY_H + CASHOUT_H;
const GRID_LEFT = GRID_PADDING_X;

// ── Paddle / ball ─────────────────────────────────────────────────────────────
const PADDLE_W = 70;
const PADDLE_H = 10;
const BALL_R   = 7;

// ── Game balance ──────────────────────────────────────────────────────────────
// Pixels-per-frame for each speed level (index 0 unused); speed is a gameplay
// preference only and does not affect payout.
const SPEED_PX = [0, 3.2, 4.2, 5.4, 6.8, 8.4];

// ── Available options shown in the sidebar selectors ─────────────────────────
const DEATH_OPTIONS = [5, 10, 15, 20, 25];

// ── Payout distribution ───────────────────────────────────────────────────────
// Exponential base for row value weighting. Row 0 (top) = most valuable,
// row ROWS-1 (bottom) = least valuable. Higher Q = steeper distribution.
const Q_FACTOR = 2.167;   // row 0 (top) = 55% of max profit

// ── Visual palette ────────────────────────────────────────────────────────────
// One color per brick row. Art team: feel free to change these.
const BRICK_COLORS = ["#c0392b", "#e67e22", "#f1c40f", "#27ae60", "#2980b9"];
