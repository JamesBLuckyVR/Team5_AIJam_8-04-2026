// =============================================================================
// CANVAS RENDERER — owned by the Game Art team
// =============================================================================
// Everything you see on the canvas is drawn here. Change colors, shapes,
// effects, and animations without touching any game logic.
// =============================================================================

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

    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 3); ctx.fill();

    // Highlight sheen
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath(); ctx.roundRect(b.x + 2, b.y + 2, BRICK_W - 4, 5, 2); ctx.fill();

    // Death brick skull (revealed after hit)
    if (b.isDeath && b.revealed) {
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.beginPath(); ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 3); ctx.fill();
      ctx.fillStyle    = "#fff";
      ctx.font         = "bold 13px sans-serif";
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("☠", b.x + BRICK_W / 2, b.y + BRICK_H / 2);
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
}
