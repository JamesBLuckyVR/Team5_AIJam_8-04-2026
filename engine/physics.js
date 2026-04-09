// =============================================================================
// PHYSICS & GAME LOOP — owned by the Game Engine team
// =============================================================================
// Ball movement, wall bouncing, paddle collision, brick collision, and the
// main animation loop. Edit here to change how the ball and paddle behave.
// =============================================================================

// Convenience wrapper so other files can call draw() without arguments.
function draw() {
  drawFrame(canvas, gs, paddleX, splashes, wager, getMultiplier(), getTotalNormal(), phase);
}

// ── Game lifecycle ────────────────────────────────────────────────────────────

function startGame() {
  const w = parseFloat(wager);
  if (!w || w <= 0 || w > balance) return;

  const spd   = SPEED_PX[speed];
  const angle = (Math.random() * 60 + 60) * Math.PI / 180;

  gs = {
    bx: CANVAS_W / 2, by: PLAY_H - 80,
    vx: Math.cos(angle) * spd * (Math.random() > 0.5 ? 1 : -1),
    vy: -Math.sin(angle) * spd,
    bricks:  generateBricks(deathCount, Math.floor(Math.random() * 0xffffffff)),
    cleared: 0,
    running: true,
  };
  paddleX       = CANVAS_W / 2 - PADDLE_W / 2;
  splashes      = [];
  coinBursts    = [];
  sessionStart  = Date.now();
  bricksCleared = 0;
  result        = null;
  phase         = "playing";

  startBGM();
  addInputListeners();
  updateUI();
  gameLoop();
}

function endRound(type, s) {
  cancelAnimationFrame(animFrame);
  removeInputListeners();

  const pct  = s.cleared / getTotalNormal();
  const w    = parseFloat(wager) || 0;
  const m    = getMultiplier();
  let payout = 0;
  if      (type === "death")                    payout = 0;
  else if (type === "drop") payout = w + w * m * payoutCurve(pct);
  else                                           payout = w * m; // "clear" — all bricks cleared

  payout  = Math.round(payout * 100) / 100;
  balance = Math.round((balance - w + payout) * 100) / 100;

  result = {
    type, payout, wager: w,
    duration: formatDuration(Date.now() - (sessionStart ?? Date.now())),
    cleared:  s.cleared,
    pct:      Math.round(s.cleared / getTotalNormal() * 100),
  };
  bricksCleared = s.cleared;
  phase         = "result";
  updateUI();
}

function manualCashout() {
  if (phase !== "playing" || !gs || !gs.running) return;
  gs.running = false;
  sfxCashout();
  endRound("drop", gs);
}

// ── Main animation loop ───────────────────────────────────────────────────────

function gameLoop() {
  const s = gs;
  if (!s || !s.running) return;

  // Move ball
  s.bx += s.vx;
  s.by += s.vy;

  // Wall bounces
  if (s.bx - BALL_R < 0)        { s.bx = BALL_R;            s.vx =  Math.abs(s.vx); sfxWall(); }
  if (s.bx + BALL_R > CANVAS_W) { s.bx = CANVAS_W - BALL_R; s.vx = -Math.abs(s.vx); sfxWall(); }
  if (s.by - BALL_R < 0)        { s.by = BALL_R;             s.vy =  Math.abs(s.vy); sfxWall(); }

  // Paddle collision
  const py = PLAY_H - 44;
  if (s.by + BALL_R >= py && s.by + BALL_R <= py + PADDLE_H + 6 &&
      s.bx >= paddleX - 4 && s.bx <= paddleX + PADDLE_W + 4 && s.vy > 0) {
    const hit = (s.bx - (paddleX + PADDLE_W / 2)) / (PADDLE_W / 2);
    const spd = SPEED_PX[speed];
    s.vx = Math.sin(hit * 65 * Math.PI / 180) * spd;
    s.vy = -Math.cos(hit * 65 * Math.PI / 180) * spd;
    s.by = py - BALL_R;
    sfxPaddle();
  }

  // Ball dropped into cashout zone
  if (s.by + BALL_R > PLAY_H) {
    s.running = false;
    sfxCashout();
    endRound("drop", s);
    return;
  }

  // Brick collisions
  const w  = parseFloat(wager) || 0;
  const m  = getMultiplier();
  const tn = getTotalNormal();

  for (const b of s.bricks) {
    if (!b.alive) continue;
    const bR = b.x + BRICK_W, bB = b.y + BRICK_H;
    if (s.bx + BALL_R > b.x && s.bx - BALL_R < bR &&
        s.by + BALL_R > b.y && s.by - BALL_R < bB) {

      b.alive = false;

      if (b.isDeath) {
        b.revealed = true;
        s.running  = false;
        sfxDeath();
        deathBurst = createDeathBurst(b.x + BRICK_W / 2, b.y + BRICK_H / 2);
        tickDeathBurst();
        draw();
        endRound("death", s);
        return;
      }

      s.cleared++;

      sfxCoin();

      // Coin burst VFX — Sonic-style coins pop out of the brick
      coinBursts.push(createCoinBurst(b.x + BRICK_W / 2, b.y + BRICK_H / 2));

      // Reflect off nearest edge
      const oL = s.bx - b.x, oR = bR - s.bx, oT = s.by - b.y, oB = bB - s.by;
      if (Math.min(oL, oR) < Math.min(oT, oB)) s.vx *= -1; else s.vy *= -1;

      // Floating payout splash
      const prev = w * m * payoutCurve((s.cleared - 1) / tn);
      const next = w * m * payoutCurve(s.cleared / tn);
      const gain = +(next - prev).toFixed(2);
      if (gain > 0) splashes.push({ x: b.x + BRICK_W / 2, y: b.y + BRICK_H / 2, val: gain, born: performance.now() });

      // Update live payout display
      bricksCleared            = s.cleared;
      liveVal.textContent      = `$${(w + next).toFixed(2)}`;
      bricksProgEl.textContent = `${bricksCleared}/${tn} bricks`;

      if (s.cleared === tn) {
        s.running = false;
        sfxClear();
        endRound("clear", s);
        return;
      }
      break;
    }
  }

  draw();
  animFrame = requestAnimationFrame(gameLoop);
}

// ── Death burst animation loop ────────────────────────────────────────────────
// Runs independently of the main game loop so the explosion plays out even
// after the ball has stopped and endRound() has been called.
function tickDeathBurst() {
  if (!deathBurst) return;
  const age = (performance.now() - deathBurst.born) / 1200;
  if (age >= 1) {
    deathBurst = null;
    draw(); // one final clean frame without the burst
    return;
  }
  draw();
  requestAnimationFrame(tickDeathBurst);
}

// ── Input handlers ────────────────────────────────────────────────────────────

function onMouseMove(e) {
  const rect   = canvas.getBoundingClientRect();
  const scaleX = CANVAS_W / rect.width;
  const cx     = (e.clientX ?? e.touches?.[0]?.clientX) - rect.left;
  paddleX = Math.max(0, Math.min(CANVAS_W - PADDLE_W, cx * scaleX - PADDLE_W / 2));
}
function onKeyDown(e) {
  if (e.key === "ArrowLeft")  paddleX = Math.max(0, paddleX - 18);
  if (e.key === "ArrowRight") paddleX = Math.min(CANVAS_W - PADDLE_W, paddleX + 18);
}
function addInputListeners() {
  window.addEventListener("mousemove", onMouseMove);
  window.addEventListener("touchmove", onMouseMove);
  window.addEventListener("keydown",   onKeyDown);
}
function removeInputListeners() {
  window.removeEventListener("mousemove", onMouseMove);
  window.removeEventListener("touchmove", onMouseMove);
  window.removeEventListener("keydown",   onKeyDown);
}

// ── Boot ──────────────────────────────────────────────────────────────────────

document.addEventListener("DOMContentLoaded", () => {
  canvas         = document.getElementById("game-canvas");
  wagerInput     = document.getElementById("wager-input");
  halfBtn        = document.getElementById("half-btn");
  doubleBtn      = document.getElementById("double-btn");
  betBtn         = document.getElementById("bet-btn");
  balanceEl      = document.getElementById("balance-val");
  multEl         = document.getElementById("mult-val");
  maxPayEl       = document.getElementById("max-payout");
  speedSel       = document.getElementById("speed-sel");
  deathSel       = document.getElementById("death-sel");
  liveBox        = document.getElementById("live-box");
  liveVal        = document.getElementById("live-val");
  bricksProgEl   = document.getElementById("bricks-prog");
  resultCard     = document.getElementById("result-card");
  splashEl          = document.getElementById("splash");
  deathOverlay      = document.getElementById("death-overlay");
  cashoutOverlay    = document.getElementById("cashout-overlay");
  cashoutCard       = document.getElementById("cashout-card");
  cashoutBtn = document.getElementById("cashout-btn");
  cashoutBtn.addEventListener("click", manualCashout);

  paddleX = CANVAS_W / 2 - PADDLE_W / 2;

  wagerInput.addEventListener("input", e => { wager = e.target.value; updateUI(); });

  halfBtn.addEventListener("click", () => {
    wager            = Math.max(0.01, parseFloat(wager || 0) / 2).toFixed(2);
    wagerInput.value = wager;
    updateUI();
  });

  doubleBtn.addEventListener("click", () => {
    wager            = (parseFloat(wager || 0) * 2).toFixed(2);
    wagerInput.value = wager;
    updateUI();
  });

  betBtn.addEventListener("click", startGame);

  buildSelectors();
  updateUI();
});
