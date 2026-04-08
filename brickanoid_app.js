// ── Game state ────────────────────────────────────────────────────────────────
let phase         = "bet";   // "bet" | "playing" | "result"
let wager         = "10.00";
let speed         = 3;
let deathCount    = 22;
let balance       = 1000.00;
let result        = null;
let bricksCleared = 0;

let gs           = null;   // live game state (ball, bricks, etc.)
let animFrame    = null;
let paddleX      = 0;
let splashes     = [];
let sessionStart = null;

// ── DOM references (assigned on DOMContentLoaded) ────────────────────────────
let canvas, wagerInput, halfBtn, doubleBtn, betBtn;
let balanceEl, multEl, maxPayEl, speedSel, deathSel;
let liveBox, liveVal, bricksProgEl, resultCard;
let splashEl, deathOverlay, cashoutOverlay, cashoutCard;

// ── Computed helpers ──────────────────────────────────────────────────────────
function getTotalNormal() { return COLS * ROWS - deathCount; }
function getMultiplier()  { return +(SPEED_BONUS[speed] * (DEATH_BONUS[deathCount] ?? 1.00)).toFixed(2); }
function draw() {
  drawFrame(canvas, gs, paddleX, splashes, wager, getMultiplier(), getTotalNormal(), phase);
}

// ── Selector buttons ──────────────────────────────────────────────────────────
function buildSelectors() {
  speedSel.innerHTML = "";
  for (let s = 1; s <= 5; s++) {
    const btn = document.createElement("div");
    btn.className   = "sel-btn" + (speed === s ? " on-speed" : "");
    btn.textContent = s;
    btn.addEventListener("click", () => { if (phase !== "playing") { speed = s; updateUI(); } });
    speedSel.appendChild(btn);
  }

  deathSel.innerHTML = "";
  for (const d of DEATH_OPTIONS) {
    const btn = document.createElement("div");
    btn.className   = "sel-btn death-opt" + (deathCount === d ? " on-death" : "");
    btn.textContent = d;
    btn.addEventListener("click", () => { if (phase !== "playing") { deathCount = d; updateUI(); } });
    deathSel.appendChild(btn);
  }
}

// ── Full UI refresh ───────────────────────────────────────────────────────────
function updateUI() {
  const m  = getMultiplier();
  const w  = parseFloat(wager) || 0;
  const tn = getTotalNormal();

  // Static displays
  multEl.textContent    = `${m.toFixed(2)}×`;
  maxPayEl.textContent  = `$${(w * m).toFixed(2)}`;
  balanceEl.textContent = `$${balance.toFixed(2)}`;

  // Disable controls while playing
  wagerInput.disabled = phase === "playing";
  halfBtn.disabled    = phase === "playing";
  doubleBtn.disabled  = phase === "playing";

  // Bet button
  betBtn.classList.toggle("hidden", phase === "playing");
  if (phase !== "playing") betBtn.textContent = phase === "result" ? "BET AGAIN" : "BET";

  // Live payout panel
  liveBox.classList.toggle("hidden", phase !== "playing");
  if (phase === "playing") {
    const pct = bricksCleared / tn;
    liveVal.textContent      = `$${(w * m * payoutCurve(pct)).toFixed(2)}`;
    bricksProgEl.textContent = `${bricksCleared}/${tn} bricks`;
  }

  // Result card
  resultCard.classList.toggle("hidden", !(phase === "result" && result));
  if (phase === "result" && result) renderResultCard(result, w, m);

  // Canvas overlays
  splashEl.classList.toggle("hidden",       phase !== "bet");
  deathOverlay.classList.toggle("hidden",   !(phase === "result" && result?.type === "death"));
  cashoutOverlay.classList.toggle("hidden", !(phase === "result" && result?.type === "drop"));
  if (phase === "result" && result?.type === "drop") renderCashoutCard(result);

  buildSelectors();
  draw();
}

function renderResultCard(r) {
  let bg, border, titleColor, title;
  if      (r.type === "death") { bg = "#3a0a0a"; border = "#c0392b"; titleColor = "#ff4d4d"; title = "☠ DEATHBLOCK!"; }
  else if (r.type === "clear") { bg = "#0a2a1a"; border = "#00ffb3"; titleColor = "#00ffb3"; title = "✓ CLEARED!"; }
  else                         { bg = "#0d1a30"; border = "#2980b9"; titleColor = "#7ec8ff"; title = "● DROPPED"; }

  const payColor = r.payout > 0 ? "#f1c40f" : "#ff4d4d";
  const payText  = r.payout > 0 ? `+$${r.payout.toFixed(2)}` : `-$${r.wager.toFixed(2)}`;

  resultCard.style.background = bg;
  resultCard.style.border     = `1px solid ${border}`;
  resultCard.innerHTML = `
    <div style="font-size:13px;font-weight:700;margin-bottom:4px;color:${titleColor}">${title}</div>
    <div style="font-size:11px;color:#7c8bc4">${r.pct}% cleared</div>
    <div style="font-size:17px;font-weight:700;margin-top:4px;color:${payColor}">${payText}</div>
  `;
}

function renderCashoutCard(r) {
  const net      = r.payout - r.wager;
  const netColor = net >= 0 ? "#00ffb3" : "#ff4d4d";
  const netSign  = net >= 0 ? "+" : "";
  const payColor = r.payout >= r.wager ? "#00ffb3" : "#f1c40f";

  cashoutCard.innerHTML = `
    <div class="co-title">Cashout Summary</div>
    <div class="co-rows">
      <div class="co-row">
        <span class="co-lbl">Amount Wagered</span>
        <span class="co-val" style="color:#7c8bc4">$${r.wager.toFixed(2)}</span>
      </div>
      <div class="co-row">
        <span class="co-lbl">Amount Won</span>
        <span class="co-val" style="color:${payColor}">$${r.payout.toFixed(2)}</span>
      </div>
      <div class="co-row">
        <span class="co-lbl">Session Time</span>
        <span class="co-val" style="color:#7c8bc4">${r.duration}</span>
      </div>
      <div class="co-net">
        <span class="co-net-lbl">Net</span>
        <span class="co-net-val" style="color:${netColor}">${netSign}$${net.toFixed(2)}</span>
      </div>
    </div>
    <div class="co-pct">${r.pct}% of bricks cleared</div>
    <button id="rebet-btn">↺ REBET $${r.wager.toFixed(2)}</button>
  `;
  document.getElementById("rebet-btn").addEventListener("click", startGame);
}

// ── Game logic ────────────────────────────────────────────────────────────────
function startGame() {
  const w = parseFloat(wager);
  if (!w || w <= 0 || w > balance) return;

  const spd   = SPEED_PX[speed];
  const angle = (Math.random() * 60 + 60) * Math.PI / 180;

  gs = {
    bx: CANVAS_W / 2, by: PLAY_H - 80,
    vx: Math.cos(angle) * spd * (Math.random() > 0.5 ? 1 : -1),
    vy: -Math.sin(angle) * spd,
    bricks: generateBricks(deathCount, Math.floor(Math.random() * 0xffffffff)),
    cleared: 0, running: true,
  };
  paddleX      = CANVAS_W / 2 - PADDLE_W / 2;
  splashes     = [];
  sessionStart = Date.now();
  bricksCleared = 0;
  result       = null;
  phase        = "playing";

  addInputListeners();
  updateUI();
  gameLoop();
}

function endRound(type, s) {
  cancelAnimationFrame(animFrame);
  removeInputListeners();

  const pct    = s.cleared / getTotalNormal();
  const w      = parseFloat(wager) || 0;
  const m      = getMultiplier();
  let payout   = 0;
  if      (type === "death") payout = 0;
  else if (type === "drop")  payout = w * m * payoutCurve(pct);
  else                       payout = w * m; // "clear" — all bricks cleared

  payout  = Math.round(payout * 100) / 100;
  balance = Math.round((balance - w + payout) * 100) / 100;

  result = {
    type, payout, wager: w,
    duration: formatDuration(Date.now() - (sessionStart ?? Date.now())),
    cleared: s.cleared,
    pct: Math.round(s.cleared / getTotalNormal() * 100),
  };
  bricksCleared = s.cleared;
  phase = "result";
  updateUI();
}

// ── Game loop ─────────────────────────────────────────────────────────────────
function gameLoop() {
  const s = gs;
  if (!s || !s.running) return;

  s.bx += s.vx;
  s.by += s.vy;

  // Wall bounces
  if (s.bx - BALL_R < 0)        { s.bx = BALL_R;            s.vx =  Math.abs(s.vx); }
  if (s.bx + BALL_R > CANVAS_W) { s.bx = CANVAS_W - BALL_R; s.vx = -Math.abs(s.vx); }
  if (s.by - BALL_R < 0)        { s.by = BALL_R;             s.vy =  Math.abs(s.vy); }

  // Paddle collision
  const py = PLAY_H - 44;
  if (s.by + BALL_R >= py && s.by + BALL_R <= py + PADDLE_H + 6 &&
      s.bx >= paddleX - 4 && s.bx <= paddleX + PADDLE_W + 4 && s.vy > 0) {
    const hit = (s.bx - (paddleX + PADDLE_W / 2)) / (PADDLE_W / 2);
    const spd = SPEED_PX[speed];
    s.vx = Math.sin(hit * 65 * Math.PI / 180) * spd;
    s.vy = -Math.cos(hit * 65 * Math.PI / 180) * spd;
    s.by = py - BALL_R;
  }

  // Ball dropped into cashout zone
  if (s.by + BALL_R > PLAY_H) {
    s.running = false;
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
        draw();
        endRound("death", s);
        return;
      }

      s.cleared++;

      // Reflect ball off nearest edge
      const oL = s.bx - b.x, oR = bR - s.bx, oT = s.by - b.y, oB = bB - s.by;
      if (Math.min(oL, oR) < Math.min(oT, oB)) s.vx *= -1; else s.vy *= -1;

      // Floating payout splash
      const prev = w * m * payoutCurve((s.cleared - 1) / tn);
      const next = w * m * payoutCurve(s.cleared / tn);
      const gain = +(next - prev).toFixed(2);
      if (gain > 0) splashes.push({ x: b.x + BRICK_W / 2, y: b.y + BRICK_H / 2, val: gain, born: performance.now() });

      // Update live payout display
      bricksCleared            = s.cleared;
      liveVal.textContent      = `$${next.toFixed(2)}`;
      bricksProgEl.textContent = `${bricksCleared}/${tn} bricks`;

      if (s.cleared === tn) {
        s.running = false;
        endRound("clear", s);
        return;
      }
      break;
    }
  }

  draw();
  animFrame = requestAnimationFrame(gameLoop);
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
function addInputListeners()    {
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
  canvas        = document.getElementById("game-canvas");
  wagerInput    = document.getElementById("wager-input");
  halfBtn       = document.getElementById("half-btn");
  doubleBtn     = document.getElementById("double-btn");
  betBtn        = document.getElementById("bet-btn");
  balanceEl     = document.getElementById("balance-val");
  multEl        = document.getElementById("mult-val");
  maxPayEl      = document.getElementById("max-payout");
  speedSel      = document.getElementById("speed-sel");
  deathSel      = document.getElementById("death-sel");
  liveBox       = document.getElementById("live-box");
  liveVal       = document.getElementById("live-val");
  bricksProgEl  = document.getElementById("bricks-prog");
  resultCard    = document.getElementById("result-card");
  splashEl      = document.getElementById("splash");
  deathOverlay  = document.getElementById("death-overlay");
  cashoutOverlay = document.getElementById("cashout-overlay");
  cashoutCard   = document.getElementById("cashout-card");

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
