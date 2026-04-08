import {
  CANVAS_W, CANVAS_H, PLAY_H, CASHOUT_H,
  PADDLE_W, PADDLE_H, BALL_R, BRICK_W, BRICK_H,
} from "./constants";
import { payoutCurve } from "./utils";

export function drawFrame({ canvas, state, paddleX, splashes, wager, multiplier, totalNormal, phase }) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const s = state;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Play area background
  ctx.fillStyle = "#0a0e2a";
  ctx.fillRect(0, 0, CANVAS_W, PLAY_H);

  // Cashout zone
  const czGrad = ctx.createLinearGradient(0, PLAY_H, 0, CANVAS_H);
  czGrad.addColorStop(0, "#1a6b35");
  czGrad.addColorStop(1, "#25a050");
  ctx.fillStyle = czGrad;
  ctx.fillRect(0, PLAY_H, CANVAS_W, CASHOUT_H);

  ctx.font = "bold 22px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillText("CASHOUT ZONE", CANVAS_W / 2 + 1, PLAY_H + CASHOUT_H / 2 + 1);
  ctx.fillStyle = "#fff";
  ctx.fillText("CASHOUT ZONE", CANVAS_W / 2, PLAY_H + CASHOUT_H / 2);

  // Divider glow
  ctx.strokeStyle = "#2ecc71";
  ctx.lineWidth = 2;
  ctx.shadowColor = "#2ecc71";
  ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(0, PLAY_H); ctx.lineTo(CANVAS_W, PLAY_H); ctx.stroke();
  ctx.shadowBlur = 0;

  // Grid dots
  ctx.fillStyle = "rgba(255,255,255,0.04)";
  for (let x = 20; x < CANVAS_W; x += 30)
    for (let y = 20; y < PLAY_H; y += 30) {
      ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
    }

  if (!s) return;

  // Bricks
  s.bricks.forEach(b => {
    if (!b.alive) return;
    const { x, y } = b;
    ctx.fillStyle = b.color;
    ctx.beginPath(); ctx.roundRect(x, y, BRICK_W, BRICK_H, 3); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath(); ctx.roundRect(x + 2, y + 2, BRICK_W - 4, 5, 2); ctx.fill();
    if (b.isDeath && b.revealed) {
      ctx.fillStyle = "rgba(0,0,0,0.75)";
      ctx.beginPath(); ctx.roundRect(x, y, BRICK_W, BRICK_H, 3); ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("☠", x + BRICK_W / 2, y + BRICK_H / 2);
    }
  });

  // Paddle
  const py = PLAY_H - 44;
  const grad = ctx.createLinearGradient(paddleX, py, paddleX + PADDLE_W, py);
  grad.addColorStop(0, "#00e5ff");
  grad.addColorStop(1, "#ff00e5");
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.roundRect(paddleX, py, PADDLE_W, PADDLE_H, 5); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath(); ctx.roundRect(paddleX + 4, py + 2, PADDLE_W - 8, 3, 2); ctx.fill();

  // Ball
  if (s.running || phase === "playing") {
    const bg = ctx.createRadialGradient(s.bx - 2, s.by - 2, 1, s.bx, s.by, BALL_R);
    bg.addColorStop(0, "#ffffff");
    bg.addColorStop(0.4, "#a0cfff");
    bg.addColorStop(1, "#2980b9");
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.arc(s.bx, s.by, BALL_R, 0, Math.PI * 2); ctx.fill();
  }

  // Payout splashes
  const now = performance.now();
  const liveSplashes = splashes.filter(sp => now - sp.born < 900);
  splashes.length = 0;
  liveSplashes.forEach(sp => splashes.push(sp));
  liveSplashes.forEach(sp => {
    const age = (now - sp.born) / 900;
    const spY = sp.y - age * 40;
    ctx.globalAlpha = 1 - Math.pow(age, 1.4);
    ctx.font = `bold ${11 + age * 5}px monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#00ffb3";
    ctx.shadowColor = "#00ffb3";
    ctx.shadowBlur = 10;
    ctx.fillText(`+$${sp.val}`, sp.x, spY);
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;
  });

  // Live payout HUD
  if (s.cleared > 0) {
    const pct = s.cleared / totalNormal;
    const cur = (parseFloat(wager) || 0) * multiplier * payoutCurve(pct);
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.beginPath(); ctx.roundRect(CANVAS_W / 2 - 90, 8, 180, 26, 6); ctx.fill();
    ctx.fillStyle = "#00ffb3";
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`$${cur.toFixed(2)}  (${(pct * 100).toFixed(0)}%)`, CANVAS_W / 2, 21);
  }
}
