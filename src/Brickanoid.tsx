import { useState, useRef, useEffect, useCallback } from "react";
import { CANVAS_W, CANVAS_H, CASHOUT_H, COLS, ROWS, MIN_WAGER } from "./config";
import { calcMultiplier, type RoundResult } from "./payout";
import { useGameEngine } from "./useGameEngine";
import { useRenderer }   from "./useRenderer";
import { Sidebar, type Phase } from "./Sidebar";
import type { DeathCount } from "./config";


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
