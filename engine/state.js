// =============================================================================
// GAME STATE — owned by the Game Engine team
// =============================================================================
// All shared mutable variables live here so every other file can read them.
// Only engine/physics.js should write to these during gameplay.
// =============================================================================

// ── Round state ───────────────────────────────────────────────────────────────
let phase         = "bet";   // "bet" | "playing" | "result"
let wager         = "10.00";
let speed         = 3;
let deathCount    = 22;
let balance       = 1000.00;
let result        = null;
let bricksCleared = 0;

// ── Live game objects ─────────────────────────────────────────────────────────
let gs           = null;   // ball + bricks snapshot for the current round
let animFrame    = null;
let paddleX      = 0;
let splashes     = [];
let sessionStart = null;

// ── DOM element references ────────────────────────────────────────────────────
// Assigned once on DOMContentLoaded inside engine/physics.js
let canvas, wagerInput, halfBtn, doubleBtn, betBtn;
let balanceEl, multEl, maxPayEl, speedSel, deathSel;
let liveBox, liveVal, bricksProgEl, resultCard;
let splashEl, deathOverlay, cashoutOverlay, cashoutCard;
