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
