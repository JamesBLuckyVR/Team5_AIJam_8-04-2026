#!/usr/bin/env bash
# scaffold.sh — Brickanoid module split
# Run from the root of the repo: bash scaffold.sh
# Creates src/ files for all five zones + the shell component.

set -e
mkdir -p src

# ─────────────────────────────────────────────────────────────────────────────
echo "Writing src/config.ts..."
cat > src/config.ts << 'ENDOFFILE'
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
ENDOFFILE

# ─────────────────────────────────────────────────────────────────────────────
echo "Writing src/payout.ts..."
cat > src/payout.ts << 'ENDOFFILE'
import { COLS, ROWS, SPEED_BONUS, DEATH_BONUS } from "./config";

// ─── Types ────────────────────────────────────────────────────────────────────
export type RoundOutcome = "death" | "drop" | "clear";

export interface RoundResult {
  type:    RoundOutcome;
  payout:  number;
  cleared: number;
  pct:     number;
  wager:   number;
}

// ─── Core curve ───────────────────────────────────────────────────────────────
export function payoutCurve(pct: number): number {
  if (pct <= 0) return 0;
  return Math.pow(pct, 2.5);
}

// ─── Multiplier ───────────────────────────────────────────────────────────────
export function calcMultiplier(speed: number, deathCount: number): number {
  const speedMult = SPEED_BONUS[speed] ?? 1;
  const deathMult = DEATH_BONUS[deathCount] ?? 1;
  return Math.round(speedMult * deathMult * 100) / 100;
}

// ─── Live payout (during play) ────────────────────────────────────────────────
export function calcLivePayout(
  wager:      number,
  multiplier: number,
  cleared:    number,
): number {
  const totalBricks = COLS * ROWS;
  return wager * multiplier * payoutCurve(cleared / totalBricks);
}

export function calcBrickGain(
  wager:      number,
  multiplier: number,
  clearedBefore: number,
): number {
  const prev = calcLivePayout(wager, multiplier, clearedBefore);
  const next = calcLivePayout(wager, multiplier, clearedBefore + 1);
  return Math.round((next - prev) * 100) / 100;
}

// ─── Round resolution ─────────────────────────────────────────────────────────
export function resolveRound(
  type:        RoundOutcome,
  wager:       number,
  multiplier:  number,
  cleared:     number,
  totalNormal: number,
): RoundResult {
  let payout = 0;
  if      (type === "death") payout = 0;
  else if (type === "drop")  payout = calcLivePayout(wager, multiplier, cleared);
  else                       payout = wager * multiplier;

  return {
    type,
    payout:  Math.round(payout * 100) / 100,
    cleared,
    pct:     Math.round((cleared / totalNormal) * 100),
    wager,
  };
}
ENDOFFILE

# ─────────────────────────────────────────────────────────────────────────────
echo "Writing src/useGameEngine.ts..."
cat > src/useGameEngine.ts << 'ENDOFFILE'
import { useRef, useEffect, useCallback } from "react";
import {
  COLS, ROWS, BRICK_W, BRICK_H, BRICK_GAP,
  CANVAS_W, PLAY_H, PADDLE_W, PADDLE_H, BALL_R,
  GRID_LEFT, GRID_TOP, SPEED_PX, BRICK_COLORS,
} from "./config";
import { resolveRound, calcBrickGain, calcLivePayout, RoundResult } from "./payout";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Brick {
  id:       number;
  row:      number;
  col:      number;
  x:        number;
  y:        number;
  alive:    boolean;
  isDeath:  boolean;
  revealed: boolean;
  color:    string;
}

export interface GameState {
  bx:      number;
  by:      number;
  vx:      number;
  vy:      number;
  bricks:  Brick[];
  cleared: number;
  seed:    number;
  running: boolean;
}

export interface Splash {
  x:    number;
  y:    number;
  val:  number;
  born: number;
}

export interface EngineCallbacks {
  onPayout:   (dollars: number) => void;
  onCleared:  (count: number) => void;
  onRoundEnd: (result: RoundResult) => void;
  draw:       () => void;
}

// ─── Brick generation ─────────────────────────────────────────────────────────
function lcgRng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) & 0xffffffff;
    return (s >>> 0) / 0xffffffff;
  };
}

export function generateBricks(deathCount: number, seed: number): Brick[] {
  const next  = lcgRng(seed);
  const total = COLS * ROWS;
  const eligible = Array.from({ length: total - COLS }, (_, i) => i);
  for (let i = eligible.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [eligible[i], eligible[j]] = [eligible[j], eligible[i]];
  }
  const deathSet = new Set(eligible.slice(0, Math.min(deathCount, eligible.length)));

  return Array.from({ length: total }, (_, i) => {
    const row = Math.floor(i / COLS);
    const col = i % COLS;
    return {
      id: i, row, col,
      x:        GRID_LEFT + col * (BRICK_W + BRICK_GAP),
      y:        GRID_TOP  + row * (BRICK_H + BRICK_GAP),
      alive:    true,
      isDeath:  deathSet.has(i),
      revealed: false,
      color:    BRICK_COLORS[row % BRICK_COLORS.length],
    };
  });
}

// ─── Hook ─────────────────────────────────────────────────────────────────────
export function useGameEngine(
  wager:       number,
  multiplier:  number,
  totalNormal: number,
  speed:       number,
  deathCount:  number,
  callbacks:   EngineCallbacks,
) {
  const stateRef    = useRef<GameState | null>(null);
  const animRef     = useRef<number>(0);
  const paddleXRef  = useRef(CANVAS_W / 2 - PADDLE_W / 2);
  const splashesRef = useRef<Splash[]>([]);
  const refs        = useRef({ stateRef, paddleXRef, splashesRef });

  const endRound = useCallback((type: "death" | "drop" | "clear", s: GameState) => {
    cancelAnimationFrame(animRef.current);
    const result = resolveRound(type, wager, multiplier, s.cleared, totalNormal);
    callbacks.onRoundEnd(result);
    callbacks.draw();
  }, [wager, multiplier, totalNormal, callbacks]);

  const startGame = useCallback((balance: number) => {
    if (!wager || wager <= 0 || wager > balance) return;
    const seed   = Math.floor(Math.random() * 0xffffffff);
    const bricks = generateBricks(deathCount, seed);
    const spd    = SPEED_PX[speed];
    const angle  = (Math.random() * 60 + 60) * Math.PI / 180;
    stateRef.current = {
      bx: CANVAS_W / 2, by: PLAY_H - 80,
      vx: Math.cos(angle) * spd * (Math.random() > 0.5 ? 1 : -1),
      vy: -Math.sin(angle) * spd,
      bricks, cleared: 0, seed, running: true,
    };
    paddleXRef.current  = CANVAS_W / 2 - PADDLE_W / 2;
    splashesRef.current = [];
    callbacks.onPayout(0);
    callbacks.onCleared(0);
  }, [wager, deathCount, speed, callbacks]);

  useEffect(() => {
    const s = stateRef.current;
    if (!s?.running) return;

    const onMove = (e: MouseEvent | TouchEvent) => {
      const canvas = document.querySelector("canvas");
      if (!canvas) return;
      const rect   = canvas.getBoundingClientRect();
      const scaleX = CANVAS_W / rect.width;
      const cx     = ("clientX" in e ? e.clientX : e.touches[0].clientX) - rect.left;
      paddleXRef.current = Math.max(0, Math.min(CANVAS_W - PADDLE_W, cx * scaleX - PADDLE_W / 2));
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  paddleXRef.current = Math.max(0, paddleXRef.current - 18);
      if (e.key === "ArrowRight") paddleXRef.current = Math.min(CANVAS_W - PADDLE_W, paddleXRef.current + 18);
    };
    window.addEventListener("mousemove", onMove as EventListener);
    window.addEventListener("touchmove", onMove as EventListener);
    window.addEventListener("keydown",   onKey);

    const loop = () => {
      const s = stateRef.current;
      if (!s?.running) return;
      s.bx += s.vx; s.by += s.vy;

      if (s.bx - BALL_R < 0)        { s.bx = BALL_R;            s.vx =  Math.abs(s.vx); }
      if (s.bx + BALL_R > CANVAS_W) { s.bx = CANVAS_W - BALL_R; s.vx = -Math.abs(s.vx); }
      if (s.by - BALL_R < 0)        { s.by = BALL_R;             s.vy =  Math.abs(s.vy); }

      const py = PLAY_H - 44;
      const px = paddleXRef.current;
      if (
        s.by + BALL_R >= py && s.by + BALL_R <= py + PADDLE_H + 6 &&
        s.bx >= px - 4 && s.bx <= px + PADDLE_W + 4 && s.vy > 0
      ) {
        const hit = (s.bx - (px + PADDLE_W / 2)) / (PADDLE_W / 2);
        const spd = SPEED_PX[speed];
        s.vx = Math.sin(hit * 65 * Math.PI / 180) * spd;
        s.vy = -Math.cos(hit * 65 * Math.PI / 180) * spd;
        s.by = py - BALL_R;
      }

      if (s.by + BALL_R > PLAY_H) {
        s.running = false;
        endRound("drop", s);
        return;
      }

      for (const b of s.bricks) {
        if (!b.alive) continue;
        const bR = b.x + BRICK_W, bB = b.y + BRICK_H;
        if (s.bx + BALL_R > b.x && s.bx - BALL_R < bR && s.by + BALL_R > b.y && s.by - BALL_R < bB) {
          b.alive = false;
          if (b.isDeath) {
            b.revealed = true;
            s.running  = false;
            callbacks.draw();
            endRound("death", s);
            return;
          }
          s.cleared++;
          const oL = s.bx - b.x, oR = bR - s.bx, oT = s.by - b.y, oB = bB - s.by;
          if (Math.min(oL, oR) < Math.min(oT, oB)) s.vx *= -1; else s.vy *= -1;

          const gain = calcBrickGain(wager, multiplier, s.cleared - 1);
          if (gain > 0) splashesRef.current.push({ x: b.x + BRICK_W / 2, y: b.y + BRICK_H / 2, val: gain, born: performance.now() });
          callbacks.onPayout(+calcLivePayout(wager, multiplier, s.cleared).toFixed(2));
          callbacks.onCleared(s.cleared);

          if (s.cleared === totalNormal) {
            s.running = false;
            endRound("clear", s);
            return;
          }
          break;
        }
      }

      callbacks.draw();
      animRef.current = requestAnimationFrame(loop);
    };
    animRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("mousemove", onMove as EventListener);
      window.removeEventListener("touchmove", onMove as EventListener);
      window.removeEventListener("keydown",   onKey);
    };
  }, [speed, endRound, callbacks, wager, multiplier, totalNormal]);

  return { startGame, refs };
}
ENDOFFILE

# ─────────────────────────────────────────────────────────────────────────────
echo "Writing src/useRenderer.ts..."
cat > src/useRenderer.ts << 'ENDOFFILE'
import { useCallback } from "react";
import {
  CANVAS_W, CANVAS_H, PLAY_H, CASHOUT_H,
  BRICK_W, BRICK_H, PADDLE_W, PADDLE_H, BALL_R,
} from "./config";
import { payoutCurve } from "./payout";
import type { GameState, Splash } from "./useGameEngine";

interface RendererRefs {
  stateRef:    React.MutableRefObject<GameState | null>;
  paddleXRef:  React.MutableRefObject<number>;
  splashesRef: React.MutableRefObject<Splash[]>;
}

interface RendererOptions {
  wager:       number;
  multiplier:  number;
  totalNormal: number;
  phase:       string;
}

export function useRenderer(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  refs:      RendererRefs,
  opts:      RendererOptions,
) {
  const { wager, multiplier, totalNormal, phase } = opts;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const s   = refs.stateRef.current;
    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.fillStyle = "#0a0e2a";
    ctx.fillRect(0, 0, CANVAS_W, PLAY_H);

    const czGrad = ctx.createLinearGradient(0, PLAY_H, 0, CANVAS_H);
    czGrad.addColorStop(0, "#1a6b35");
    czGrad.addColorStop(1, "#25a050");
    ctx.fillStyle = czGrad;
    ctx.fillRect(0, PLAY_H, CANVAS_W, CASHOUT_H);

    ctx.font = "bold 22px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillText("CASHOUT ZONE", CANVAS_W / 2 + 1, PLAY_H + CASHOUT_H / 2 + 1);
    ctx.fillStyle = "#fff";
    ctx.fillText("CASHOUT ZONE", CANVAS_W / 2, PLAY_H + CASHOUT_H / 2);

    ctx.strokeStyle = "#2ecc71"; ctx.lineWidth = 2;
    ctx.shadowColor = "#2ecc71"; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.moveTo(0, PLAY_H); ctx.lineTo(CANVAS_W, PLAY_H); ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = "rgba(255,255,255,0.04)";
    for (let x = 20; x < CANVAS_W; x += 30)
      for (let y = 20; y < PLAY_H; y += 30) {
        ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill();
      }

    if (!s) return;

    for (const b of s.bricks) {
      if (!b.alive) continue;
      ctx.fillStyle = b.color;
      ctx.beginPath(); ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 3); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath(); ctx.roundRect(b.x + 2, b.y + 2, BRICK_W - 4, 5, 2); ctx.fill();
      if (b.isDeath && b.revealed) {
        ctx.fillStyle = "rgba(0,0,0,0.75)";
        ctx.beginPath(); ctx.roundRect(b.x, b.y, BRICK_W, BRICK_H, 3); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillText("☠", b.x + BRICK_W / 2, b.y + BRICK_H / 2);
      }
    }

    const px   = refs.paddleXRef.current;
    const py   = PLAY_H - 44;
    const grad = ctx.createLinearGradient(px, py, px + PADDLE_W, py);
    grad.addColorStop(0, "#00e5ff"); grad.addColorStop(1, "#ff00e5");
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(px, py, PADDLE_W, PADDLE_H, 5); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.3)";
    ctx.beginPath(); ctx.roundRect(px + 4, py + 2, PADDLE_W - 8, 3, 2); ctx.fill();

    if (s.running || phase === "playing") {
      const bg = ctx.createRadialGradient(s.bx - 2, s.by - 2, 1, s.bx, s.by, BALL_R);
      bg.addColorStop(0, "#ffffff"); bg.addColorStop(0.4, "#a0cfff"); bg.addColorStop(1, "#2980b9");
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(s.bx, s.by, BALL_R, 0, Math.PI * 2); ctx.fill();
    }

    const now = performance.now();
    refs.splashesRef.current = refs.splashesRef.current.filter(sp => now - sp.born < 900);
    for (const sp of refs.splashesRef.current) {
      const age = (now - sp.born) / 900;
      ctx.globalAlpha = 1 - Math.pow(age, 1.4);
      ctx.font = `bold ${11 + age * 5}px monospace`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillStyle = "#00ffb3"; ctx.shadowColor = "#00ffb3"; ctx.shadowBlur = 10;
      ctx.fillText(`+$${sp.val}`, sp.x, sp.y - age * 40);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    if (s.cleared > 0) {
      const curPayout = wager * multiplier * payoutCurve(s.cleared / totalNormal);
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.beginPath(); ctx.roundRect(CANVAS_W / 2 - 90, 8, 180, 26, 6); ctx.fill();
      ctx.fillStyle = "#00ffb3"; ctx.font = "bold 13px monospace";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(`$${curPayout.toFixed(2)}  (${(s.cleared / totalNormal * 100).toFixed(0)}%)`, CANVAS_W / 2, 21);
    }
  }, [canvasRef, refs, wager, multiplier, totalNormal, phase]);

  return { draw };
}
ENDOFFILE

# ─────────────────────────────────────────────────────────────────────────────
echo "Writing src/Sidebar.tsx..."
cat > src/Sidebar.tsx << 'ENDOFFILE'
import { DEATH_COUNT_OPTIONS, type DeathCount } from "./config";
import { type RoundResult } from "./payout";

export type Phase = "bet" | "playing" | "result";

interface SidebarProps {
  phase:         Phase;
  wager:         string;
  speed:         number;
  deathCount:    DeathCount;
  balance:       number;
  multiplier:    number;
  projectedMax:  number;
  livePayout:    number;
  bricksCleared: number;
  totalNormal:   number;
  result:        RoundResult | null;
  onWagerChange:      (v: string) => void;
  onSpeedChange:      (v: number) => void;
  onDeathCountChange: (v: DeathCount) => void;
  onBet:         () => void;
}

const chip = (active: boolean, accent: string) => ({
  flex: 1, textAlign: "center" as const, padding: "5px 0", borderRadius: 5,
  fontSize: 12, fontWeight: 700,
  background: active ? `${accent}22` : "#060918",
  border: active ? `1px solid ${accent}` : "1px solid #1e2a5e",
  color: active ? accent : "#556", cursor: "pointer",
});

export function Sidebar({
  phase, wager, speed, deathCount, balance, multiplier,
  projectedMax, livePayout, bricksCleared, totalNormal,
  result, onWagerChange, onSpeedChange, onDeathCountChange, onBet,
}: SidebarProps) {
  const locked = phase === "playing";

  return (
    <div style={{ width: 220, background: "#0d1130", borderRight: "1px solid #1e2a5e", display: "flex", flexDirection: "column", padding: "14px 12px", gap: 12, flexShrink: 0 }}>

      <div style={{ display: "flex", background: "#060918", borderRadius: 8, padding: 3, gap: 3 }}>
        {["Manual", "Auto"].map(t => (
          <div key={t} style={{ flex: 1, textAlign: "center", padding: "5px 0", borderRadius: 6, fontSize: 12, fontWeight: 600, background: t === "Manual" ? "#1e2a5e" : "transparent", color: t === "Manual" ? "#00e5ff" : "#555", cursor: "pointer" }}>{t}</div>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 11, color: "#7c8bc4", marginBottom: 5 }}>Bet Amount</div>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <div style={{ flex: 1, background: "#060918", border: "1px solid #1e2a5e", borderRadius: 6, padding: "6px 8px", fontSize: 13, color: "#fff", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#f1c40f", fontSize: 15 }}>$</span>
            <input value={wager} onChange={e => onWagerChange(e.target.value)} disabled={locked}
              style={{ background: "none", border: "none", outline: "none", color: "#fff", fontFamily: "monospace", fontSize: 13, width: "100%" }} />
          </div>
          <button onClick={() => onWagerChange((Math.max(0.01, parseFloat(wager || "0") / 2)).toFixed(2))} disabled={locked}
            style={{ background: "#1e2a5e", border: "none", borderRadius: 5, color: "#7c8bc4", padding: "6px 7px", cursor: "pointer", fontSize: 11 }}>½</button>
          <button onClick={() => onWagerChange((parseFloat(wager || "0") * 2).toFixed(2))} disabled={locked}
            style={{ background: "#1e2a5e", border: "none", borderRadius: 5, color: "#7c8bc4", padding: "6px 7px", cursor: "pointer", fontSize: 11 }}>2×</button>
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: "#00e5ff", marginBottom: 5, fontWeight: 700 }}>Ball Speed</div>
        <div style={{ display: "flex", gap: 4 }}>
          {[1, 2, 3, 4, 5].map(v => (
            <div key={v} onClick={() => !locked && onSpeedChange(v)} style={chip(speed === v, "#00e5ff")}>{v}</div>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: "#ff4d7d", marginBottom: 5, fontWeight: 700 }}>Deathblocks</div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {DEATH_COUNT_OPTIONS.map(d => (
            <div key={d} onClick={() => !locked && onDeathCountChange(d)} style={{ ...chip(deathCount === d, "#ff4d7d"), minWidth: 36 }}>{d}</div>
          ))}
        </div>
      </div>

      <div style={{ background: "#060918", borderRadius: 8, padding: "10px", border: "1px solid #1e2a5e" }}>
        <div style={{ fontSize: 10, color: "#7c8bc4", marginBottom: 4 }}>Multiplier</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#f1c40f" }}>{multiplier.toFixed(2)}×</div>
        <div style={{ fontSize: 10, color: "#7c8bc4", marginTop: 2 }}>Max payout: <span style={{ color: "#00ffb3" }}>${projectedMax.toFixed(2)}</span></div>
      </div>

      {!locked && (
        <button onClick={onBet} style={{ background: "linear-gradient(135deg,#00c2ff,#ff00e5)", border: "none", borderRadius: 8, padding: "12px 0", color: "#fff", fontWeight: 800, fontSize: 15, cursor: "pointer", letterSpacing: 1 }}>
          {phase === "result" ? "BET AGAIN" : "BET"}
        </button>
      )}

      <div>
        <div style={{ fontSize: 10, color: "#7c8bc4", marginBottom: 4 }}>Balance</div>
        <div style={{ background: "#060918", border: "1px solid #1e2a5e", borderRadius: 6, padding: "7px 10px", fontSize: 13, color: "#00ffb3", fontWeight: 700 }}>${balance.toFixed(2)}</div>
      </div>

      {phase === "playing" && (
        <div style={{ background: "#060918", border: "1px solid #00ffb3", borderRadius: 8, padding: "10px", textAlign: "center" }}>
          <div style={{ fontSize: 10, color: "#7c8bc4", marginBottom: 3 }}>Live Payout</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#00ffb3" }}>${livePayout.toFixed(2)}</div>
          <div style={{ fontSize: 10, color: "#7c8bc4", marginTop: 2 }}>{bricksCleared}/{totalNormal} bricks</div>
        </div>
      )}

      {phase === "result" && result && (
        <div style={{ background: result.type === "death" ? "#3a0a0a" : result.type === "clear" ? "#0a2a1a" : "#0d1a30", border: `1px solid ${result.type === "death" ? "#c0392b" : result.type === "clear" ? "#00ffb3" : "#2980b9"}`, borderRadius: 8, padding: "10px", textAlign: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: result.type === "death" ? "#ff4d4d" : result.type === "clear" ? "#00ffb3" : "#7ec8ff", marginBottom: 4 }}>
            {result.type === "death" ? "☠ DEATHBLOCK!" : result.type === "clear" ? "✓ CLEARED!" : "● DROPPED"}
          </div>
          <div style={{ fontSize: 11, color: "#7c8bc4" }}>{result.pct}% cleared</div>
          <div style={{ fontSize: 17, fontWeight: 700, color: result.payout > 0 ? "#f1c40f" : "#ff4d4d", marginTop: 4 }}>
            {result.payout > 0 ? `+$${result.payout.toFixed(2)}` : `-$${result.wager.toFixed(2)}`}
          </div>
        </div>
      )}

      <div style={{ marginTop: "auto", display: "flex", justifyContent: "center" }}>
        <div style={{ background: "#060918", border: "1px solid #1e2a5e", borderRadius: 20, padding: "5px 14px", fontSize: 11, color: "#7c8bc4", display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: "#00ffb3", fontSize: 13 }}>✓</span> Provably Fair
        </div>
      </div>
    </div>
  );
}
ENDOFFILE

# ─────────────────────────────────────────────────────────────────────────────
echo "Writing src/Brickanoid.tsx..."
cat > src/Brickanoid.tsx << 'ENDOFFILE'
import { useState, useRef, useEffect, useCallback } from "react";
import { CANVAS_W, CANVAS_H, CASHOUT_H, COLS, ROWS, MIN_WAGER } from "./config";
import { calcMultiplier, type RoundResult } from "./payout";
import { useGameEngine } from "./useGameEngine";
import { useRenderer }   from "./useRenderer";
import { Sidebar, type Phase } from "./Sidebar";
import type { DeathCount } from "./config";

const PLAY_H = CANVAS_H - CASHOUT_H;

export default function Brickanoid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [wager,         setWager]         = useState("10.00");
  const [speed,         setSpeed]         = useState(3);
  const [deathCount,    setDeathCount]    = useState<DeathCount>(22);
  const [phase,         setPhase]         = useState<Phase>("bet");
  const [balance,       setBalance]       = useState(1000.00);
  const [result,        setResult]        = useState<RoundResult | null>(null);
  const [livePayout,    setLivePayout]    = useState(0);
  const [bricksCleared, setBricksCleared] = useState(0);

  const wagerNum     = parseFloat(wager) || 0;
  const totalNormal  = COLS * ROWS - deathCount;
  const multiplier   = calcMultiplier(speed, deathCount);
  const projectedMax = wagerNum * multiplier;

  const drawRef = useRef<() => void>(() => {});

  const callbacks = {
    onPayout:  setLivePayout,
    onCleared: setBricksCleared,
    onRoundEnd: useCallback((r: RoundResult) => {
      setBalance(b => Math.round((b - wagerNum + r.payout) * 100) / 100);
      setResult(r);
      setLivePayout(r.payout);
      setBricksCleared(r.cleared);
      setPhase("result");
    }, [wagerNum]),
    draw: useCallback(() => drawRef.current(), []),
  };

  const { startGame, refs } = useGameEngine(
    wagerNum, multiplier, totalNormal, speed, deathCount, callbacks,
  );

  const { draw } = useRenderer(canvasRef, {
    stateRef:    refs.current.stateRef,
    paddleXRef:  refs.current.paddleXRef,
    splashesRef: refs.current.splashesRef,
  }, { wager: wagerNum, multiplier, totalNormal, phase });

  useEffect(() => { drawRef.current = draw; }, [draw]);

  const handleBet = useCallback(() => {
    if (wagerNum < MIN_WAGER || wagerNum > balance) return;
    setPhase("playing");
    setResult(null);
    setBricksCleared(0);
    setLivePayout(0);
    startGame(balance);
  }, [wagerNum, balance, startGame]);

  useEffect(() => {
    if (phase !== "playing") draw();
  }, [phase, draw]);

  return (
    <div style={{ display: "flex", background: "#060918", minHeight: "100vh", fontFamily: "monospace", color: "#cdd6f4", userSelect: "none" }}>
      <Sidebar
        phase={phase} wager={wager} speed={speed} deathCount={deathCount}
        balance={balance} multiplier={multiplier} projectedMax={projectedMax}
        livePayout={livePayout} bricksCleared={bricksCleared} totalNormal={totalNormal}
        result={result}
        onWagerChange={setWager} onSpeedChange={setSpeed}
        onDeathCountChange={setDeathCount} onBet={handleBet}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}>
        <div style={{ position: "relative" }}>
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H}
            style={{ display: "block", borderRadius: 10, border: "1px solid #1e2a5e", maxWidth: "100%" }} />
          {phase === "bet" && <BetOverlay />}
          {phase === "result" && result?.type === "death" && <DeathOverlay />}
          {phase === "result" && result?.type === "drop" && <DropOverlay result={result} onRebet={handleBet} />}
        </div>
        <div style={{ marginTop: 10, fontSize: 11, color: "#2a3a7a" }}>Move mouse or use ← → arrow keys to control paddle</div>
      </div>
    </div>
  );
}

function BetOverlay() {
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(6,9,24,0.82)", borderRadius: 10 }}>
      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 3, background: "linear-gradient(135deg,#00c2ff,#ff00e5)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>BRICKANOID</div>
      <div style={{ fontSize: 13, color: "#7c8bc4", marginTop: 8 }}>Set your wager and hit BET to play</div>
      <div style={{ fontSize: 11, color: "#3a4a8a", marginTop: 16 }}>☠ Hidden deathblocks end your round instantly</div>
      <div style={{ fontSize: 11, color: "#1a6b35", marginTop: 8 }}>Drop ball into the cashout zone to collect winnings</div>
    </div>
  );
}

function DeathOverlay() {
  return (
    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: CASHOUT_H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(40,0,0,0.72)", borderRadius: "10px 10px 0 0", pointerEvents: "none" }}>
      <div style={{ fontSize: 52 }}>☠</div>
      <div style={{ fontSize: 24, fontWeight: 800, color: "#ff4d4d", letterSpacing: 2 }}>DEATHBLOCK HIT</div>
      <div style={{ fontSize: 13, color: "#ff8888", marginTop: 6 }}>Bet lost — better luck next time</div>
    </div>
  );
}

function DropOverlay({ result, onRebet }: { result: RoundResult; onRebet: () => void }) {
  const net = result.payout - result.wager;
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", borderRadius: 10, background: "rgba(6,9,24,0.88)" }}>
      <div style={{ background: "#0d1130", border: "1px solid #2ecc71", borderRadius: 14, padding: "28px 36px", minWidth: 280, textAlign: "center" }}>
        <div style={{ fontSize: 13, color: "#2ecc71", fontWeight: 700, letterSpacing: 3, marginBottom: 18, textTransform: "uppercase" }}>Cashout Summary</div>
        {[
          { label: "Amount Wagered", value: result.wager.toFixed(2),  color: "#7c8bc4" },
          { label: "Amount Won",     value: result.payout.toFixed(2), color: result.payout >= result.wager ? "#00ffb3" : "#f1c40f" },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: "flex", justifyContent: "space-between", borderBottom: "1px solid #1e2a5e", paddingBottom: 10, marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "#7c8bc4" }}>{label}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color }}>${value}</span>
          </div>
        ))}
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: "#7c8bc4" }}>Net</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: net >= 0 ? "#00ffb3" : "#ff4d4d" }}>{net >= 0 ? "+" : ""}${net.toFixed(2)}</span>
        </div>
        <div style={{ fontSize: 11, color: "#3a4a8a", marginBottom: 16 }}>{result.pct}% of bricks cleared</div>
        <button onClick={onRebet} style={{ width: "100%", background: "linear-gradient(135deg,#00c2ff,#ff00e5)", border: "none", borderRadius: 8, padding: "11px 0", color: "#fff", fontWeight: 800, fontSize: 14, cursor: "pointer" }}>
          ↺ REBET ${result.wager.toFixed(2)}
        </button>
      </div>
    </div>
  );
}
ENDOFFILE

# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "✓ Done. Files written to src/:"
echo "   config.ts"
echo "   payout.ts"
echo "   useGameEngine.ts"
echo "   useRenderer.ts"
echo "   Sidebar.tsx"
echo "   Brickanoid.tsx"
echo ""
echo "Next steps:"
echo "  git add src/"
echo "  git commit -m 'chore: split prototype into module zones'"
echo "  git push"