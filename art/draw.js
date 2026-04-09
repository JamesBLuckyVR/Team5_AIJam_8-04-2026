// =============================================================================
// CANVAS RENDERER — owned by the Game Art team
// =============================================================================
// Everything you see on the canvas is drawn here. Change colors, shapes,
// effects, and animations without touching any game logic.
// =============================================================================

// ── Per-row material definitions ──────────────────────────────────────────────
// Each entry controls the glossy gem/metal look for one brick row.
// isDeath blocks use the same material as normal bricks (location stays hidden).
const BRICK_MATERIALS = [
  // Row 0 — Ruby
  {
    base:      "#9b0a0a",
    highlight: "#ff6666",
    specular:  "#ffcccc",
    rim:       "#ff2222",
    facet:     "rgba(255,200,200,0.35)",
    shadow:    "rgba(0,0,0,0.55)",
    isGem:     true,
  },
  // Row 1 — Amber
  {
    base:      "#b84c00",
    highlight: "#ff9933",
    specular:  "#ffe0a0",
    rim:       "#ffaa00",
    facet:     "rgba(255,220,120,0.30)",
    shadow:    "rgba(0,0,0,0.50)",
    isGem:     true,
  },
  // Row 2 — Gold Metal
  {
    base:      "#7a6000",
    highlight: "#ffe066",
    specular:  "#fffacc",
    rim:       "#ffd700",
    facet:     null,
    shadow:    "rgba(0,0,0,0.45)",
    isGem:     false,
  },
  // Row 3 — Emerald
  {
    base:      "#064d1e",
    highlight: "#00e070",
    specular:  "#ccffe8",
    rim:       "#00ff88",
    facet:     "rgba(160,255,210,0.30)",
    shadow:    "rgba(0,0,0,0.55)",
    isGem:     true,
  },
  // Row 4 — Sapphire
  {
    base:      "#0b1e6b",
    highlight: "#4499ff",
    specular:  "#c0d8ff",
    rim:       "#2266ff",
    facet:     "rgba(180,210,255,0.28)",
    shadow:    "rgba(0,0,0,0.55)",
    isGem:     true,
  },
];

// ── Draw a single glossy brick ────────────────────────────────────────────────
function drawGlossyBrick(ctx, b) {
  const mat = BRICK_MATERIALS[b.row % BRICK_MATERIALS.length];
  const { x, y } = b;
  const w = BRICK_W, h = BRICK_H;

  // 1. Body — radial gradient: bright top-left → dark base color
  const bodyGrad = ctx.createRadialGradient(
    x + w * 0.3, y + h * 0.25, 0,
    x + w * 0.6, y + h * 0.7,  w * 0.8
  );
  bodyGrad.addColorStop(0,   mat.highlight);
  bodyGrad.addColorStop(0.5, mat.base);
  bodyGrad.addColorStop(1,   mat.shadow);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.fill();

  // 2. Bottom shadow strip
  const shadowGrad = ctx.createLinearGradient(x, y + h - 5, x, y + h);
  shadowGrad.addColorStop(0, "transparent");
  shadowGrad.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = shadowGrad;
  ctx.beginPath(); ctx.roundRect(x, y + h - 5, w, 5, [0, 0, 3, 3]); ctx.fill();

  // 3. Specular highlight — bright triangle in top-left
  const specGrad = ctx.createLinearGradient(x + 2, y + 2, x + w * 0.55, y + h * 0.55);
  specGrad.addColorStop(0,   mat.specular);
  specGrad.addColorStop(0.4, "rgba(255,255,255,0.08)");
  specGrad.addColorStop(1,   "transparent");
  ctx.fillStyle = specGrad;
  ctx.beginPath();
  ctx.moveTo(x + 3,        y + 3);
  ctx.lineTo(x + w * 0.55, y + 3);
  ctx.lineTo(x + 3,        y + h * 0.75);
  ctx.closePath();
  ctx.fill();

  // 4. Top-left rim light stroke
  ctx.strokeStyle = mat.rim;
  ctx.lineWidth   = 0.8;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + h - 3);
  ctx.lineTo(x + 3, y + 3);
  ctx.lineTo(x + w - 3, y + 3);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 5. Diagonal facet line (gems only)
  if (mat.isGem && mat.facet) {
    ctx.strokeStyle = mat.facet;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.65, y + 2);
    ctx.lineTo(x + w - 2,    y + h * 0.6);
    ctx.stroke();
  }

  // 6. Gold metal: wide horizontal sheen band
  if (!mat.isGem) {
    const sheenGrad = ctx.createLinearGradient(x, y + 4, x, y + 10);
    sheenGrad.addColorStop(0,   "rgba(255,255,200,0.40)");
    sheenGrad.addColorStop(0.5, "rgba(255,255,200,0.55)");
    sheenGrad.addColorStop(1,   "transparent");
    ctx.fillStyle = sheenGrad;
    ctx.beginPath(); ctx.roundRect(x + 2, y + 4, w - 4, 6, 2); ctx.fill();
  }
}

// ── Main draw function ────────────────────────────────────────────────────────

function drawFrame(canvas, gs, paddleX, splashes, wager, mult, totalNormal, phase) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // ── Play area background ──────────────────────────────────────────────────
  ctx.fillStyle = "#0a0e2a";
  ctx.fillRect(0, 0, CANVAS_W, PLAY_H);

  // ── Cashout zone ──────────────────────────────────────────────────────────
  const czGrad = ctx.createLinearGradient(0, PLAY_H, 0, CANVAS_H);
  czGrad.addColorStop(0, "#1a6b35");
  czGrad.addColorStop(1, "#25a050");
  ctx.fillStyle = czGrad;
  ctx.fillRect(0, PLAY_H, CANVAS_W, CASHOUT_H);

  ctx.font          = "bold 22px sans-serif";
  ctx.textAlign     = "center";
  ctx.textBaseline  = "middle";
  ctx.fillStyle     = "rgba(255,255,255,0.22)";
  ctx.fillText("CASHOUT ZONE", CANVAS_W / 2 + 1, PLAY_H + CASHOUT_H / 2 + 1);
  ctx.fillStyle = "#fff";
  ctx.fillText("CASHOUT ZONE", CANVAS_W / 2, PLAY_H + CASHOUT_H / 2);

  // Divider glow line
  ctx.strokeStyle = "#2ecc71";
  ctx.lineWidth   = 2;
  ctx.shadowColor = "#2ecc71";
  ctx.shadowBlur  = 8;
  ctx.beginPath(); ctx.moveTo(0, PLAY_H); ctx.lineTo(CANVAS_W, PLAY_H); ctx.stroke();
  ctx.shadowBlur  = 0;

  // Background grid dots
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let x = 20; x < CANVAS_W; x += 30)
    for (let y = 20; y < PLAY_H; y += 30) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    }

  if (!gs) return;

  // ── Bricks ────────────────────────────────────────────────────────────────
  gs.bricks.forEach(b => {
    if (!b.alive) return;

    drawGlossyBrick(ctx, b);

    // Death brick skull revealed only after hit — location stays hidden
    if (b.isDeath && b.revealed) {
      ctx.fillStyle = "rgba(0,0,0,0.78)";
      ctx.beginPath(); ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 3); ctx.fill();
      ctx.fillStyle    = "#fff";
      ctx.font         = "bold 13px sans-serif";
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor  = "#ff2200";
      ctx.shadowBlur   = 10;
      ctx.fillText("☠", b.x + BRICK_W / 2, b.y + BRICK_H / 2);
      ctx.shadowBlur   = 0;
    }
  });

  // ── Paddle ────────────────────────────────────────────────────────────────
  const py   = PLAY_H - 44;
  const grad = ctx.createLinearGradient(paddleX, py, paddleX + PADDLE_W, py);
  grad.addColorStop(0, "#00e5ff");
  grad.addColorStop(1, "#ff00e5");
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.roundRect(paddleX, py, PADDLE_W, PADDLE_H, 5); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath(); ctx.roundRect(paddleX + 4, py + 2, PADDLE_W - 8, 3, 2); ctx.fill();

  // ── Ball ──────────────────────────────────────────────────────────────────
  if (gs.running || phase === "playing") {
    const bg = ctx.createRadialGradient(gs.bx - 2, gs.by - 2, 1, gs.bx, gs.by, BALL_R);
    bg.addColorStop(0,   "#ffffff");
    bg.addColorStop(0.4, "#a0cfff");
    bg.addColorStop(1,   "#2980b9");
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(gs.bx, gs.by, BALL_R, 0, Math.PI * 2); ctx.fill();
  }

  // ── Floating payout splashes ──────────────────────────────────────────────
  const now  = performance.now();
  const live = splashes.filter(sp => now - sp.born < 900);
  splashes.length = 0;
  live.forEach(sp => splashes.push(sp));
  live.forEach(sp => {
    const age = (now - sp.born) / 900;
    ctx.globalAlpha   = 1 - Math.pow(age, 1.4);
    ctx.font          = `bold ${11 + age * 5}px monospace`;
    ctx.textAlign     = "center";
    ctx.textBaseline  = "middle";
    ctx.fillStyle     = "#00ffb3";
    ctx.shadowColor   = "#00ffb3";
    ctx.shadowBlur    = 10;
    ctx.fillText(`+$${sp.val}`, sp.x, sp.y - age * 40);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  });

  // ── Live payout HUD ───────────────────────────────────────────────────────
  if (gs.cleared > 0) {
    const pct = gs.cleared / totalNormal;
    const cur = (parseFloat(wager) || 0) * mult * payoutCurve(pct);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath(); ctx.roundRect(CANVAS_W / 2 - 90, 8, 180, 26, 6); ctx.fill();
    ctx.fillStyle    = "#00ffb3";
    ctx.font         = "bold 13px monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`$${cur.toFixed(2)}  (${(pct * 100).toFixed(0)}%)`, CANVAS_W / 2, 21);
  }

  // ── Death burst VFX ───────────────────────────────────────────────────────
  if (typeof deathBurst !== "undefined" && deathBurst) {
    drawDeathBurst(ctx);
  }
}

// =============================================================================
// DEATH BURST VFX
// =============================================================================

const BURST_COLORS = ["#ff2200", "#ff5500", "#ff8800", "#ffcc00", "#ffffff"];
const BURST_DURATION = 1200; // ms

function createDeathBurst(x, y) {
  const particles = [];
  for (let i = 0; i < 42; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const speed  = 1.5 + Math.random() * 4.5;
    particles.push({
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed,
      size:  2 + Math.random() * 5,
      color: BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
      life:  0.6 + Math.random() * 0.4, // fraction of BURST_DURATION to stay alive
    });
  }
  return { x, y, born: performance.now(), particles };
}

function drawDeathBurst(ctx) {
  const now = performance.now();
  const age = (now - deathBurst.born) / BURST_DURATION; // 0 → 1
  if (age >= 1) return;

  const { x, y, particles } = deathBurst;

  // Screen flash — red wash that fades in the first quarter
  const flashAlpha = Math.max(0, 0.45 * (1 - age / 0.25));
  if (flashAlpha > 0) {
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle   = "#cc0000";
    ctx.fillRect(0, 0, CANVAS_W, PLAY_H);
    ctx.globalAlpha = 1;
  }

  // Shockwave ring
  const ringRadius = age * 130;
  const ringAlpha  = Math.max(0, 1 - age / 0.5);
  if (ringAlpha > 0) {
    ctx.globalAlpha = ringAlpha;
    ctx.strokeStyle = "#ff6600";
    ctx.lineWidth   = 3 * (1 - age);
    ctx.shadowColor = "#ff4400";
    ctx.shadowBlur  = 18;
    ctx.beginPath();
    ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  // Particles
  const elapsed = (now - deathBurst.born) / 1000; // seconds
  particles.forEach(p => {
    const pAge   = age / p.life;
    if (pAge >= 1) return;
    const alpha  = Math.max(0, 1 - Math.pow(pAge, 1.5));
    const px     = x + p.vx * elapsed * 90;
    const py     = y + p.vy * elapsed * 90;
    const radius = p.size * (1 - pAge * 0.6);

    ctx.globalAlpha = alpha;
    ctx.fillStyle   = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 7;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.5, radius), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
}
