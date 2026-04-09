// =============================================================================
// SIDEBAR & OVERLAYS — owned by the Game Art team
// =============================================================================
// Controls what the sidebar shows and how result/overlay screens look.
// Change layouts, copy, colors and card styles here without touching physics.
// =============================================================================

// ── Selector buttons (speed / death-block count) ──────────────────────────────

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

// ── Full sidebar refresh ──────────────────────────────────────────────────────

function updateUI() {
  const m  = getMultiplier();
  const w  = parseFloat(wager) || 0;
  const tn = getTotalNormal();

  multEl.textContent    = `${m.toFixed(2)}×`;
  maxPayEl.textContent  = `$${(w * m).toFixed(2)}`;
  balanceEl.textContent = `$${balance.toFixed(2)}`;

  wagerInput.disabled = phase === "playing";
  halfBtn.disabled    = phase === "playing";
  doubleBtn.disabled  = phase === "playing";

  betBtn.classList.toggle("hidden", phase === "playing");
  if (phase !== "playing") betBtn.textContent = phase === "result" ? "BET AGAIN" : "BET";

  liveBox.classList.toggle("hidden", phase !== "playing");
  if (phase === "playing") {
    const pct = bricksCleared / tn;
    liveVal.textContent      = `$${(w * m * payoutCurve(pct)).toFixed(2)}`;
    bricksProgEl.textContent = `${bricksCleared}/${tn} bricks`;
  }

  resultCard.classList.toggle("hidden", !(phase === "result" && result));
  if (phase === "result" && result) renderResultCard(result);

  splashEl.classList.toggle("hidden",       phase !== "bet");
  cashoutOverlay.classList.toggle("hidden", !(phase === "result" && result?.type === "drop"));

  // Re-trigger CSS animations by removing/re-adding the element on each death show
  const showDeath = phase === "result" && result?.type === "death";
  if (showDeath && deathOverlay.classList.contains("hidden")) {
    deathOverlay.classList.remove("hidden");
    // Force reflow so the animation restarts from the beginning
    void deathOverlay.offsetWidth;
    deathOverlay.style.animation = "none";
    void deathOverlay.offsetWidth;
    deathOverlay.style.animation = "";
    const skull = deathOverlay.querySelector(".death-skull");
    if (skull) {
      skull.style.animation = "none";
      void skull.offsetWidth;
      skull.style.animation = "";
    }
  } else if (!showDeath) {
    deathOverlay.classList.add("hidden");
  }
  if (phase === "result" && result?.type === "drop") renderCashoutCard(result);

  buildSelectors();
  draw();
}

// ── Result card (shown in sidebar after round ends) ───────────────────────────

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

// ── Cashout overlay card (shown on canvas after ball drops) ───────────────────

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
