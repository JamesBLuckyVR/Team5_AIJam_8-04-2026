// =============================================================================
// CANVAS RENDERER — owned by the Game Art team
// =============================================================================
// Everything you see on the canvas is drawn here. Change colors, shapes,
// effects, and animations without touching any game logic.
// Visual theme: Las Vegas casino — dark glass, gold coins, chrome, crystal.
// =============================================================================

// ── Per-row material definitions ──────────────────────────────────────────────
// Inspired by the Vegas strip aesthetic: dark glass architecture, gold coins,
// silver chrome, deep blue glass, and clear crystal.
const BRICK_MATERIALS = [
  // Row 0 — Dark Glass (like the black glass building facade)
  {
    base:      "#0b0e1c",
    mid:       "#1a2240",
    highlight: "#3a5080",
    specular:  "#8faad0",
    rim:       "#4466aa",
    facet:     "rgba(140,180,240,0.22)",
    shadow:    "rgba(0,0,0,0.70)",
    isGem:     true,
  },
  // Row 1 — Gold Coin (the flying gold coins in the image)
  {
    base:      "#6b4500",
    mid:       "#b07800",
    highlight: "#ffd700",
    specular:  "#fff8cc",
    rim:       "#ffcc00",
    facet:     null,
    shadow:    "rgba(0,0,0,0.50)",
    isGem:     false,
  },
  // Row 2 — Silver Chrome (coin edges, metallic debris)
  {
    base:      "#1c1c28",
    mid:       "#404858",
    highlight: "#b0bcd0",
    specular:  "#eef2ff",
    rim:       "#8899bb",
    facet:     null,
    shadow:    "rgba(0,0,0,0.55)",
    isGem:     false,
  },
  // Row 3 — Sapphire Glass (deep blue glass shards)
  {
    base:      "#040e38",
    mid:       "#0a2260",
    highlight: "#1a66dd",
    specular:  "#88bbff",
    rim:       "#2255cc",
    facet:     "rgba(150,200,255,0.28)",
    shadow:    "rgba(0,0,0,0.65)",
    isGem:     true,
  },
  // Row 4 — Crystal Clear (bright light streaks from the impact)
  {
    base:      "#101828",
    mid:       "#1e3050",
    highlight: "#7aaad8",
    specular:  "#ddeeff",
    rim:       "#99ccee",
    facet:     "rgba(210,235,255,0.32)",
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
    x + w * 0.28, y + h * 0.22, 0,
    x + w * 0.65, y + h * 0.75, w * 0.85
  );
  bodyGrad.addColorStop(0,   mat.highlight);
  bodyGrad.addColorStop(0.4, mat.mid);
  bodyGrad.addColorStop(1,   mat.shadow);
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 3); ctx.fill();

  // 2. Bottom shadow strip
  const shadowGrad = ctx.createLinearGradient(x, y + h - 6, x, y + h);
  shadowGrad.addColorStop(0, "transparent");
  shadowGrad.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = shadowGrad;
  ctx.beginPath(); ctx.roundRect(x, y + h - 6, w, 6, [0, 0, 3, 3]); ctx.fill();

  // 3. Specular highlight — bright triangle in top-left
  const specGrad = ctx.createLinearGradient(x + 2, y + 2, x + w * 0.58, y + h * 0.58);
  specGrad.addColorStop(0,   mat.specular);
  specGrad.addColorStop(0.35, "rgba(255,255,255,0.06)");
  specGrad.addColorStop(1,   "transparent");
  ctx.fillStyle = specGrad;
  ctx.beginPath();
  ctx.moveTo(x + 3,        y + 3);
  ctx.lineTo(x + w * 0.58, y + 3);
  ctx.lineTo(x + 3,        y + h * 0.72);
  ctx.closePath();
  ctx.fill();

  // 4. Top-left rim light
  ctx.strokeStyle = mat.rim;
  ctx.lineWidth   = 0.8;
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(x + 3, y + h - 3);
  ctx.lineTo(x + 3, y + 3);
  ctx.lineTo(x + w - 3, y + 3);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // 5. Diagonal facet line (glass/gem rows)
  if (mat.isGem && mat.facet) {
    ctx.strokeStyle = mat.facet;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.62, y + 2);
    ctx.lineTo(x + w - 2,    y + h * 0.65);
    ctx.stroke();
  }

  // 6. Gold/chrome: wide horizontal sheen band across upper third
  if (!mat.isGem) {
    const sheenGrad = ctx.createLinearGradient(x, y + 4, x, y + 11);
    sheenGrad.addColorStop(0,   "rgba(255,255,220,0.42)");
    sheenGrad.addColorStop(0.5, "rgba(255,255,200,0.58)");
    sheenGrad.addColorStop(1,   "transparent");
    ctx.fillStyle = sheenGrad;
    ctx.beginPath(); ctx.roundRect(x + 2, y + 4, w - 4, 7, 2); ctx.fill();
  }
}

// ── Main draw function ────────────────────────────────────────────────────────

function drawFrame(canvas, gs, paddleX, splashes, wager, totalNormal, phase) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // ── Play area background — deep midnight Vegas navy ───────────────────────
  const bgGrad = ctx.createLinearGradient(0, 0, 0, PLAY_H);
  bgGrad.addColorStop(0, "#07091a");
  bgGrad.addColorStop(1, "#0d1130");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, CANVAS_W, PLAY_H);

  // ── Cashout zone — green gradient ─────────────────────────────────────────
  const czGrad = ctx.createLinearGradient(0, PLAY_H, 0, CANVAS_H);
  czGrad.addColorStop(0, "#003a18");
  czGrad.addColorStop(1, "#005c26");
  ctx.fillStyle = czGrad;
  ctx.fillRect(0, PLAY_H, CANVAS_W, CASHOUT_H);

  // Calculate live payout for display in the cashout zone
  const _czW        = parseFloat(wager) || 0;
  const _czCleared  = gs ? gs.cleared : 0;
  const _czPayout   = getLivePayout(_czW, _czCleared);
  const _showPayout = phase === "playing" || (gs && gs.cleared > 0);

  // "CASHOUT ZONE" label — shift up when payout line is shown
  const _czLabelY = _showPayout ? PLAY_H + 16 : PLAY_H + CASHOUT_H / 2;
  ctx.font          = "bold 18px sans-serif";
  ctx.textAlign     = "center";
  ctx.textBaseline  = "middle";
  ctx.fillStyle     = "rgba(255,255,255,0.15)";
  ctx.fillText("CASHOUT ZONE", CANVAS_W / 2 + 1, _czLabelY + 1);
  ctx.fillStyle     = "#ffffff";
  ctx.shadowColor   = "rgba(255,255,255,0.5)";
  ctx.shadowBlur    = 8;
  ctx.fillText("CASHOUT ZONE", CANVAS_W / 2, _czLabelY);
  ctx.shadowBlur    = 0;

  // Live cashout amount — shown during gameplay
  if (_showPayout) {
    ctx.font          = "bold 14px monospace";
    ctx.textAlign     = "center";
    ctx.textBaseline  = "middle";
    ctx.fillStyle     = "rgba(0,255,120,0.18)";
    ctx.fillText(`$${_czPayout.toFixed(2)}`, CANVAS_W / 2 + 1, PLAY_H + 38 + 1);
    ctx.fillStyle     = "#00ff88";
    ctx.shadowColor   = "#00cc66";
    ctx.shadowBlur    = 7;
    ctx.fillText(`$${_czPayout.toFixed(2)}`, CANVAS_W / 2, PLAY_H + 38);
    ctx.shadowBlur    = 0;
  }

  // Divider green glow line
  ctx.strokeStyle = "#00cc66";
  ctx.lineWidth   = 2;
  ctx.shadowColor = "#00aa44";
  ctx.shadowBlur  = 10;
  ctx.beginPath(); ctx.moveTo(0, PLAY_H); ctx.lineTo(CANVAS_W, PLAY_H); ctx.stroke();
  ctx.shadowBlur  = 0;

  // Background grid dots — subtle gold tint
  ctx.fillStyle = "rgba(255,210,80,0.035)";
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
      ctx.fillStyle = "rgba(0,0,0,0.80)";
      ctx.beginPath(); ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 3); ctx.fill();
      ctx.fillStyle    = "#fff";
      ctx.font         = "bold 13px sans-serif";
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.shadowColor  = "#ff2200";
      ctx.shadowBlur   = 12;
      ctx.fillText("☠", b.x + BRICK_W / 2, b.y + BRICK_H / 2);
      ctx.shadowBlur   = 0;
    }
  });

  // ── Paddle — white chrome ──────────────────────────────────────────────────
  const py      = PLAY_H - 44;
  const pGrad   = ctx.createLinearGradient(paddleX, py, paddleX + PADDLE_W, py + PADDLE_H);
  pGrad.addColorStop(0,   "#ffffff");
  pGrad.addColorStop(0.4, "#d0d8e8");
  pGrad.addColorStop(1,   "#8899aa");
  ctx.fillStyle   = pGrad;
  ctx.shadowColor = "rgba(200,220,255,0.8)";
  ctx.shadowBlur  = 10;
  ctx.beginPath(); ctx.roundRect(paddleX, py, PADDLE_W, PADDLE_H, 5); ctx.fill();
  ctx.shadowBlur  = 0;
  // Sheen
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath(); ctx.roundRect(paddleX + 4, py + 2, PADDLE_W - 8, 3, 2); ctx.fill();

  // ── Ball — bright white chrome ─────────────────────────────────────────────
  if (gs.running || phase === "playing") {
    const bg = ctx.createRadialGradient(gs.bx - 2, gs.by - 2, 0.5, gs.bx, gs.by, BALL_R);
    bg.addColorStop(0,    "#ffffff");
    bg.addColorStop(0.35, "#ddeeff");
    bg.addColorStop(0.75, "#8aadcc");
    bg.addColorStop(1,    "#2a4060");
    ctx.fillStyle   = bg;
    ctx.shadowColor = "rgba(200,230,255,0.7)";
    ctx.shadowBlur  = 10;
    ctx.beginPath(); ctx.arc(gs.bx, gs.by, BALL_R, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur  = 0;
  }

  // ── Floating payout splashes — gold coin style ────────────────────────────
  const now  = performance.now();
  const live = splashes.filter(sp => now - sp.born < 900);
  splashes.length = 0;
  live.forEach(sp => splashes.push(sp));
  live.forEach(sp => {
    const age = (now - sp.born) / 900;
    ctx.globalAlpha   = 1 - Math.pow(age, 1.4);
    ctx.font          = `bold ${11 + age * 6}px monospace`;
    ctx.textAlign     = "center";
    ctx.textBaseline  = "middle";
    ctx.fillStyle     = "#00ff88";
    ctx.shadowColor   = "#00cc66";
    ctx.shadowBlur    = 12;
    ctx.fillText(`+$${sp.val}`, sp.x, sp.y - age * 42);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  });

  // ── Live payout HUD ───────────────────────────────────────────────────────
  if (gs.cleared > 0) {
    const _w  = parseFloat(wager) || 0;
    const cur = getLivePayout(_w, gs.cleared);
    ctx.fillStyle = "rgba(0,0,0,0.60)";
    ctx.beginPath(); ctx.roundRect(CANVAS_W / 2 - 95, 8, 190, 26, 6); ctx.fill();
    ctx.strokeStyle = "rgba(255,210,0,0.35)";
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.roundRect(CANVAS_W / 2 - 95, 8, 190, 26, 6); ctx.stroke();
    ctx.fillStyle    = "#ffd700";
    ctx.font         = "bold 13px monospace";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor  = "#ffaa00";
    ctx.shadowBlur   = 6;
    ctx.fillText(`$${cur.toFixed(2)}  (${(gs.cleared / totalNormal * 100).toFixed(0)}%)`, CANVAS_W / 2, 21);
    ctx.shadowBlur   = 0;
  }

  // ── Coin bursts VFX (Sonic-style) ─────────────────────────────────────────
  if (typeof coinBursts !== "undefined" && coinBursts.length) {
    const now2   = performance.now();
    const alive  = coinBursts.filter(cb => now2 - cb.born < COIN_DURATION);
    coinBursts.length = 0;
    alive.forEach(cb => { coinBursts.push(cb); drawCoinBurst(ctx, cb); });
  }

  // ── Death burst VFX ───────────────────────────────────────────────────────
  if (typeof deathBurst !== "undefined" && deathBurst) {
    drawDeathBurst(ctx);
  }
}

// =============================================================================
// COIN BURST VFX — Sonic-style coins pop out of each brick hit
// =============================================================================

const COIN_DURATION = 680; // ms
const COIN_GRAVITY  = 180; // px / s²

function createCoinBurst(x, y) {
  const coins = [];
  const count = 7;
  for (let i = 0; i < count; i++) {
    // Fan of angles spread mostly upward (-90° ± 55°)
    const spread = ((i / (count - 1)) - 0.5) * (110 * Math.PI / 180);
    const angle  = -Math.PI / 2 + spread;
    const speed  = 90 + Math.random() * 70; // px/s
    coins.push({
      vx:   Math.cos(angle) * speed,
      vy:   Math.sin(angle) * speed,
      spin: (Math.random() > 0.5 ? 1 : -1) * (4 + Math.random() * 5), // rad/s
    });
  }
  return { x, y, born: performance.now(), coins };
}

function drawCoinBurst(ctx, burst) {
  const elapsed = performance.now() - burst.born; // ms
  const t       = elapsed / 1000;                  // seconds
  const age     = elapsed / COIN_DURATION;         // 0 → 1

  burst.coins.forEach(c => {
    const alpha = Math.max(0, 1 - Math.pow(age, 1.6));
    if (alpha <= 0) return;

    // Arc trajectory with gravity
    const px = burst.x + c.vx * t;
    const py = burst.y + c.vy * t + 0.5 * COIN_GRAVITY * t * t;

    // Spinning coin: vary x-radius like a rotating disc
    const xRadius = Math.max(0.8, Math.abs(Math.cos(c.spin * t)) * 5.5);
    const yRadius = 5.5;

    // Green coin radial gradient
    const cx0 = px - xRadius * 0.35;
    const cy0 = py - yRadius * 0.35;
    const coinGrad = ctx.createRadialGradient(cx0, cy0, 0.5, px, py, yRadius);
    coinGrad.addColorStop(0,    "#e0fff2");
    coinGrad.addColorStop(0.35, "#00ff88");
    coinGrad.addColorStop(0.75, "#00aa55");
    coinGrad.addColorStop(1,    "#004d25");

    ctx.globalAlpha = alpha;
    ctx.fillStyle   = coinGrad;
    ctx.shadowColor = "#00ff88";
    ctx.shadowBlur  = 9;
    ctx.beginPath();
    ctx.ellipse(px, py, xRadius, yRadius, 0, 0, Math.PI * 2);
    ctx.fill();

    // Small specular dot on the coin face
    if (xRadius > 2) {
      ctx.fillStyle   = "rgba(255,255,240,0.70)";
      ctx.shadowBlur  = 0;
      ctx.beginPath();
      ctx.ellipse(px - xRadius * 0.3, py - yRadius * 0.3, xRadius * 0.22, yRadius * 0.22, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
}

// =============================================================================
// DEATH BURST VFX
// =============================================================================

const BURST_COLORS   = ["#ff2200", "#ff5500", "#ff8800", "#ffcc00", "#ffffff", "#aaccff"];
const BURST_DURATION = 1200; // ms

function createDeathBurst(x, y) {
  const particles = [];
  for (let i = 0; i < 48; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.5 + Math.random() * 5;
    particles.push({
      vx:    Math.cos(angle) * speed,
      vy:    Math.sin(angle) * speed,
      size:  2 + Math.random() * 5.5,
      color: BURST_COLORS[Math.floor(Math.random() * BURST_COLORS.length)],
      life:  0.55 + Math.random() * 0.45,
    });
  }
  return { x, y, born: performance.now(), particles };
}

function drawDeathBurst(ctx) {
  const now = performance.now();
  const age = (now - deathBurst.born) / BURST_DURATION;
  if (age >= 1) return;

  const { x, y, particles } = deathBurst;

  // Screen flash
  const flashAlpha = Math.max(0, 0.48 * (1 - age / 0.22));
  if (flashAlpha > 0) {
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle   = "#aa0000";
    ctx.fillRect(0, 0, CANVAS_W, PLAY_H);
    ctx.globalAlpha = 1;
  }

  // Shockwave ring
  const ringRadius = age * 140;
  const ringAlpha  = Math.max(0, 1 - age / 0.5);
  if (ringAlpha > 0) {
    ctx.globalAlpha = ringAlpha;
    ctx.strokeStyle = "#ff6600";
    ctx.lineWidth   = 3.5 * (1 - age);
    ctx.shadowColor = "#ff4400";
    ctx.shadowBlur  = 20;
    ctx.beginPath();
    ctx.arc(x, y, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  }

  // Particles
  const elapsed = (now - deathBurst.born) / 1000;
  particles.forEach(p => {
    const pAge   = age / p.life;
    if (pAge >= 1) return;
    const alpha  = Math.max(0, 1 - Math.pow(pAge, 1.5));
    const px     = x + p.vx * elapsed * 95;
    const py     = y + p.vy * elapsed * 95;
    const radius = p.size * (1 - pAge * 0.6);

    ctx.globalAlpha = alpha;
    ctx.fillStyle   = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur  = 8;
    ctx.beginPath();
    ctx.arc(px, py, Math.max(0.5, radius), 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.shadowBlur  = 0;
  ctx.globalAlpha = 1;
}
