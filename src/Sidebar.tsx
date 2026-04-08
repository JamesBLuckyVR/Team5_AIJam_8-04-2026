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
