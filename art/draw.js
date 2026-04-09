// =============================================================================
// 3D CANVAS RENDERER — owned by the Game Art team
// =============================================================================
// Renders the game using Three.js WebGL into #game-canvas.
// HUD text (payout splashes, live counter) is drawn on #hud-canvas (2D overlay).
// The drawFrame(...) signature is identical to the 2D version — engine is untouched.
// =============================================================================

// ── 3D Scene state (module-level, initialized once) ───────────────────────────
let _renderer   = null;
let _scene      = null;
let _camera     = null;
let _ballMesh   = null;
let _ballLight  = null;
let _paddleMesh = null;
let _brickMeshes       = new Map();   // brick id → Mesh
let _brickReflections  = new Map();   // brick id → reflected Mesh (below floor)
let _burstParticles = [];       // active death burst particle meshes
let _coin3DParticles = [];      // active coin burst meshes
let _hudCanvas  = null;
let _hudCtx     = null;
let _lastGs     = null;         // previous gs reference to detect new game

// ── 2D → 3D coordinate helpers ────────────────────────────────────────────────
// Game X (0…CANVAS_W) → 3D X (−CW/2 … +CW/2)
// Game Y (0…PLAY_H)   → 3D Z (−PH/2 … +PH/2)  top=far(negative), paddle=near(positive)
function gx(x) { return x - CANVAS_W / 2; }
function gz(y) { return y - PLAY_H  / 2; }

// ── Row materials ─────────────────────────────────────────────────────────────
const ROW_MAT_DEFS = [
  { color: 0x1a2240, emissive: 0x2244aa, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.7 }, // Dark Glass
  { color: 0xb07800, emissive: 0xffcc00, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.9 }, // Gold Coin
  { color: 0x505868, emissive: 0x8899bb, emissiveIntensity: 0.3, roughness: 0.2, metalness: 0.9 }, // Silver Chrome
  { color: 0x0a2260, emissive: 0x2255cc, emissiveIntensity: 0.6, roughness: 0.3, metalness: 0.6 }, // Sapphire
  { color: 0x1e3050, emissive: 0x7aaad8, emissiveIntensity: 0.4, roughness: 0.2, metalness: 0.7 }, // Crystal
];

// ── Lazy scene initialisation ─────────────────────────────────────────────────
function _initScene(canvas) {
  if (_renderer) return;

  const THREE = window.THREE;
  if (!THREE) { console.error("[3D] Three.js not loaded"); return; }

  try {
  // Renderer — attach to the existing #game-canvas
  _renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  _renderer.setSize(CANVAS_W, CANVAS_H, false); // false = don't update CSS, CSS handles it
  _renderer.shadowMap.enabled = true;
  _renderer.shadowMap.type    = THREE.PCFSoftShadowMap;

  // Scene
  _scene = new THREE.Scene();
  _scene.background = new THREE.Color(0x07091a);
  // Light fog — starts much further so bricks are never fogged out
  _scene.fog = new THREE.Fog(0x07091a, 900, 1600);

  // Camera — positioned above and behind the paddle end, tilted to see the full field
  // The game field runs from Z=-343 (bricks, far) to Z=343 (cashout, near).
  // Near-overhead perspective: field reads flat like the 2D version,
  // but brick/paddle height still gives 3D depth.
  _camera = new THREE.PerspectiveCamera(52, CANVAS_W / CANVAS_H, 1, 2500);
  _camera.position.set(0, 1050, 180);
  _camera.lookAt(0, 0, -80);

  // ── Lighting ─────────────────────────────────────────────────────────────
  const ambient = new THREE.AmbientLight(0x112244, 0.8);
  _scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(50, 600, 100);
  dirLight.castShadow = true;
  dirLight.shadow.mapSize.set(1024, 1024);
  _scene.add(dirLight);

  // Subtle fill light from the front
  const fillLight = new THREE.DirectionalLight(0x334466, 0.4);
  fillLight.position.set(0, 100, 400);
  _scene.add(fillLight);

  // ── Floor — dark navy plane + glowing grid ────────────────────────────────
  const floorGeo = new THREE.PlaneGeometry(CANVAS_W + 60, PLAY_H + 60);
  const floorMat = new THREE.MeshStandardMaterial({
    color:       0x080c20,
    roughness:   0.25,
    metalness:   0.75,
    transparent: true,
    opacity:     0.78,   // partial transparency so brick reflections below show through
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  _scene.add(floor);

  // Grid lines — teal/blue glow like the reference image
  const grid = new THREE.GridHelper(Math.max(CANVAS_W, PLAY_H) + 60, 20, 0x0044aa, 0x002266);
  grid.position.y = 0.5;
  _scene.add(grid);

  // ── Cashout zone — green lit plane at the near (paddle) end ──────────────
  const czW = CANVAS_W;
  const czD = CASHOUT_H;
  const czGeo = new THREE.PlaneGeometry(czW, czD);
  const czMat = new THREE.MeshStandardMaterial({
    color:             0x0d3d1a,
    emissive:          0x1a7a35,
    emissiveIntensity: 0.5,
    roughness:         0.8,
  });
  const czMesh = new THREE.Mesh(czGeo, czMat);
  czMesh.rotation.x = -Math.PI / 2;
  czMesh.position.set(0, 0.6, gz(PLAY_H) + czD / 2);
  _scene.add(czMesh);

  // Glowing green edge line separating play area from cashout
  const edgeGeo = new THREE.BoxGeometry(CANVAS_W, 2, 3);
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0x2ecc71, emissive: 0x2ecc71, emissiveIntensity: 1.5,
  });
  const edge = new THREE.Mesh(edgeGeo, edgeMat);
  edge.position.set(0, 2, gz(PLAY_H));
  _scene.add(edge);

  // ── Arena walls — left, right, top ────────────────────────────────────────
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x1a2244, emissive: 0x0a1133, emissiveIntensity: 0.3,
    transparent: true, opacity: 0.55, roughness: 0.4, metalness: 0.5,
  });
  const wallH = 40;

  // Left wall
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(6, wallH, PLAY_H + 60), wallMat);
  leftWall.position.set(gx(0) - 3, wallH / 2, 0);
  _scene.add(leftWall);

  // Right wall
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(6, wallH, PLAY_H + 60), wallMat);
  rightWall.position.set(gx(CANVAS_W) + 3, wallH / 2, 0);
  _scene.add(rightWall);

  // Top wall
  const topWall = new THREE.Mesh(new THREE.BoxGeometry(CANVAS_W + 12, wallH, 6), wallMat);
  topWall.position.set(0, wallH / 2, gz(0) - 3);
  _scene.add(topWall);

  // Wall glow edge strips (emissive lines along the top of each wall)
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, emissive: 0x2244aa, emissiveIntensity: 1.0 });
  const lStrip = new THREE.Mesh(new THREE.BoxGeometry(2, 2, PLAY_H + 60), stripMat);
  lStrip.position.set(gx(0) - 0.5, wallH, 0);
  _scene.add(lStrip);
  const rStrip = new THREE.Mesh(new THREE.BoxGeometry(2, 2, PLAY_H + 60), stripMat.clone());
  rStrip.position.set(gx(CANVAS_W) + 0.5, wallH, 0);
  _scene.add(rStrip);
  const tStrip = new THREE.Mesh(new THREE.BoxGeometry(CANVAS_W + 12, 2, 2), stripMat.clone());
  tStrip.position.set(0, wallH, gz(0) - 0.5);
  _scene.add(tStrip);

  // ── Ball mesh ─────────────────────────────────────────────────────────────
  const ballGeo = new THREE.SphereGeometry(BALL_R + 2, 20, 20);
  const ballMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6,
    roughness: 0.1, metalness: 0.8,
  });
  _ballMesh = new THREE.Mesh(ballGeo, ballMat);
  _ballMesh.castShadow = true;
  _ballMesh.visible    = false;
  _scene.add(_ballMesh);

  // Point light that follows ball for a glow halo effect
  _ballLight = new THREE.PointLight(0xaaccff, 1.2, 180);
  _scene.add(_ballLight);

  // ── Paddle mesh ───────────────────────────────────────────────────────────
  const padGeo = new THREE.BoxGeometry(PADDLE_W, 14, PADDLE_H + 10);
  const padMat = new THREE.MeshStandardMaterial({
    color: 0xffffff, emissive: 0x88ccff, emissiveIntensity: 1.2,
    roughness: 0.1, metalness: 0.9,
  });
  _paddleMesh = new THREE.Mesh(padGeo, padMat);
  _paddleMesh.castShadow = true;
  _scene.add(_paddleMesh);

  // ── HUD canvas ────────────────────────────────────────────────────────────
  _hudCanvas = document.getElementById("hud-canvas");
  _hudCtx    = _hudCanvas ? _hudCanvas.getContext("2d") : null;

  console.log("[3D] Scene initialized successfully");

  } catch (err) {
    console.error("[3D] Scene init failed:", err);
    _renderer = null; // allow retry or fallback
  }
}

// ── Brick mesh management ─────────────────────────────────────────────────────

const BRICK_3D_H = 22; // height of bricks in 3D world units

function _makeBrickMat(row, isDeath) {
  const THREE = window.THREE;
  if (isDeath) {
    // Death bricks look identical to normal ones until revealed
    return _makeBrickMat(row, false);
  }
  const def = ROW_MAT_DEFS[row % ROW_MAT_DEFS.length];
  return new THREE.MeshStandardMaterial({
    color:             def.color,
    emissive:          def.emissive,
    emissiveIntensity: def.emissiveIntensity,
    roughness:         def.roughness,
    metalness:         def.metalness,
  });
}

function _initBricks(bricks) {
  const THREE = window.THREE;

  // Remove old bricks and their reflections
  _brickMeshes.forEach(m => _scene.remove(m));
  _brickMeshes.clear();
  _brickReflections.forEach(m => _scene.remove(m));
  _brickReflections.clear();

  const geo = new THREE.BoxGeometry(BRICK_W - 2, BRICK_3D_H, BRICK_H - 2);

  bricks.forEach(b => {
    // ── Main brick ──────────────────────────────────────────────────────────
    const mat  = _makeBrickMat(b.row, b.isDeath);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow    = true;
    mesh.receiveShadow = true;
    mesh.position.set(gx(b.x + BRICK_W / 2), BRICK_3D_H / 2, gz(b.y + BRICK_H / 2));
    _scene.add(mesh);
    _brickMeshes.set(b.id, mesh);

    // ── Floor reflection — mirrored copy below Y=0 with low opacity ─────────
    const srcDef  = ROW_MAT_DEFS[Math.min(b.row, ROW_MAT_DEFS.length - 1)];
    const refMat  = new THREE.MeshStandardMaterial({
      color:             srcDef.color,
      emissive:          srcDef.emissive,
      emissiveIntensity: srcDef.emissiveIntensity * 0.6,
      roughness:         srcDef.roughness,
      metalness:         srcDef.metalness,
      transparent:       true,
      opacity:           0.28,
      depthWrite:        false,   // avoids z-fighting with the transparent floor
    });
    const refMesh = new THREE.Mesh(geo, refMat);
    refMesh.scale.y  = -1;                         // mirror vertically
    refMesh.position.set(
      gx(b.x + BRICK_W / 2),
      -(BRICK_3D_H / 2),                           // centre sits below the floor
      gz(b.y + BRICK_H / 2)
    );
    _scene.add(refMesh);
    _brickReflections.set(b.id, refMesh);
  });
}

// Reusable red material for revealed death bricks
let _deathRevealMat = null;
function _getDeathRevealMat() {
  if (!_deathRevealMat) {
    _deathRevealMat = new window.THREE.MeshStandardMaterial({
      color: 0x110000, emissive: 0xff2200, emissiveIntensity: 1.2,
      roughness: 0.6, metalness: 0.3,
    });
  }
  return _deathRevealMat;
}

// ── 3D Death burst ────────────────────────────────────────────────────────────

const BURST_COLORS_3D = [0xff2200, 0xff5500, 0xff8800, 0xffcc00, 0xffffff, 0xaaccff];
const BURST_DURATION  = 1200;

function createDeathBurst(x, y) {
  const THREE = window.THREE;
  const particles = [];
  const geo = new THREE.SphereGeometry(2.5, 8, 8);

  for (let i = 0; i < 42; i++) {
    const angle  = Math.random() * Math.PI * 2;
    const vAngle = (Math.random() - 0.3) * Math.PI;
    const speed  = 60 + Math.random() * 140;
    const color  = BURST_COLORS_3D[Math.floor(Math.random() * BURST_COLORS_3D.length)];
    const mat    = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 1.5,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(gx(x), BRICK_3D_H / 2, gz(y));
    _scene.add(mesh);

    particles.push({
      mesh,
      vx:   Math.cos(angle) * Math.cos(vAngle) * speed,
      vy:   Math.abs(Math.sin(vAngle)) * speed + 30,
      vz:   Math.sin(angle) * Math.cos(vAngle) * speed,
      life: 0.55 + Math.random() * 0.45,
    });
  }
  return { x, y, born: performance.now(), particles };
}

function drawDeathBurst(ctx) {
  // 3D particles are updated in _update3DBursts during each drawFrame
  // ctx here is the HUD canvas ctx — draw a screen flash on it
  if (!deathBurst) return;
  const age = (performance.now() - deathBurst.born) / BURST_DURATION;
  if (age >= 1 || !ctx) return;

  const flashAlpha = Math.max(0, 0.42 * (1 - age / 0.22));
  if (flashAlpha > 0) {
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle   = "#aa0000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 1;
  }
}

function _update3DBursts() {
  if (!deathBurst) return;
  const elapsed = (performance.now() - deathBurst.born) / 1000;
  const age     = elapsed / (BURST_DURATION / 1000);

  deathBurst.particles.forEach(p => {
    const pAge = age / p.life;
    if (pAge >= 1) { p.mesh.visible = false; return; }
    const alpha = Math.max(0, 1 - Math.pow(pAge, 1.5));
    p.mesh.position.x = gx(deathBurst.x) + p.vx * elapsed;
    p.mesh.position.y = BRICK_3D_H / 2 + p.vy * elapsed - 0.5 * 120 * elapsed * elapsed;
    p.mesh.position.z = gz(deathBurst.y) + p.vz * elapsed;
    p.mesh.material.opacity       = alpha;
    p.mesh.material.transparent   = alpha < 1;
    p.mesh.material.emissiveIntensity = 1.5 * alpha;
    p.mesh.visible = alpha > 0.01;
  });

  if (age >= 1) {
    deathBurst.particles.forEach(p => _scene.remove(p.mesh));
    deathBurst = null;
  }
}

// ── 3D Coin burst ─────────────────────────────────────────────────────────────

const COIN_DURATION = 680;
const COIN_GRAVITY  = 180;

function createCoinBurst(x, y) {
  const THREE = window.THREE;
  const coins  = [];
  const count  = 7;
  const geo    = new THREE.SphereGeometry(4, 10, 10);

  for (let i = 0; i < count; i++) {
    const spread = ((i / (count - 1)) - 0.5) * (110 * Math.PI / 180);
    const angle  = -Math.PI / 2 + spread;
    const speed  = 90 + Math.random() * 70;
    const mat    = new THREE.MeshStandardMaterial({
      color: 0xffd700, emissive: 0xffaa00, emissiveIntensity: 0.8,
      roughness: 0.2, metalness: 0.9,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(gx(x), BRICK_3D_H / 2 + 4, gz(y));
    _scene.add(mesh);

    coins.push({
      mesh,
      vx:   Math.cos(angle) * speed * 0.4, // spread in X/Z
      vy:   Math.abs(Math.sin(angle)) * speed + 40,
      vz:   Math.cos(angle) * speed * 0.3,
      born: performance.now(),
      life: 0.55 + Math.random() * 0.45,
    });
  }
  return { x, y, born: performance.now(), coins };
}

function _update3DCoins() {
  if (!coinBursts || !coinBursts.length) return;

  const now   = performance.now();
  const alive = [];

  coinBursts.forEach(burst => {
    const elapsed = (now - burst.born) / 1000;
    const age     = (now - burst.born) / COIN_DURATION;

    if (age >= 1) {
      burst.coins.forEach(c => _scene.remove(c.mesh));
      return;
    }

    burst.coins.forEach(c => {
      const pAge = age / c.life;
      if (pAge >= 1) { c.mesh.visible = false; return; }
      const alpha = Math.max(0, 1 - Math.pow(pAge, 1.6));
      c.mesh.position.x = gx(burst.x) + c.vx * elapsed;
      c.mesh.position.y = BRICK_3D_H / 2 + 4 + c.vy * elapsed - 0.5 * COIN_GRAVITY * elapsed * elapsed;
      c.mesh.position.z = gz(burst.y) + c.vz * elapsed;
      c.mesh.material.emissiveIntensity = 0.8 * alpha;
      c.mesh.material.transparent = alpha < 1;
      c.mesh.material.opacity     = alpha;
      c.mesh.visible = alpha > 0.01;
    });

    alive.push(burst);
  });

  coinBursts.length = 0;
  alive.forEach(b => coinBursts.push(b));
}

// ── HUD canvas drawing (text overlays) ────────────────────────────────────────

function _drawHUD(splashes, wager, mult, totalNormal, gs) {
  if (!_hudCtx) return;
  const ctx = _hudCtx;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Floating payout splashes
  const now  = performance.now();
  const live = splashes.filter(sp => now - sp.born < 900);
  splashes.length = 0;
  live.forEach(sp => splashes.push(sp));
  live.forEach(sp => {
    const age = (now - sp.born) / 900;
    ctx.globalAlpha   = 1 - Math.pow(age, 1.4);
    ctx.font          = `bold ${12 + age * 6}px monospace`;
    ctx.textAlign     = "center";
    ctx.textBaseline  = "middle";
    ctx.fillStyle     = "#ffd700";
    ctx.shadowColor   = "#ffaa00";
    ctx.shadowBlur    = 12;
    ctx.fillText(`+$${sp.val}`, sp.x, sp.y - age * 42);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  });

  // Live payout pill
  if (gs && gs.cleared > 0) {
    const pct = gs.cleared / totalNormal;
    const cur = (parseFloat(wager) || 0) * mult * payoutCurve(pct);
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
    ctx.fillText(`$${cur.toFixed(2)}  (${(pct * 100).toFixed(0)}%)`, CANVAS_W / 2, 21);
    ctx.shadowBlur   = 0;
  }

  // Death burst screen flash on HUD canvas
  if (typeof deathBurst !== "undefined" && deathBurst) {
    drawDeathBurst(ctx);
  }
}

// ── Coin burst VFX fallback data builder ──────────────────────────────────────
// (kept so engine/physics.js can still call createCoinBurst — 3D version above is used)

// ── Main drawFrame — called every animation frame by the engine ───────────────

function drawFrame(canvas, gs, paddleX, splashes, wager, mult, totalNormal, phase) {
  if (!window.THREE) {
    // Three.js not loaded yet — draw a minimal dark background so canvas isn't blank
    const ctx2d = canvas ? canvas.getContext("2d") : null;
    if (ctx2d) {
      ctx2d.fillStyle = "#07091a";
      ctx2d.fillRect(0, 0, CANVAS_W, CANVAS_H);
      ctx2d.fillStyle = "#ffd700";
      ctx2d.font = "bold 14px monospace";
      ctx2d.textAlign = "center";
      ctx2d.fillText("Loading 3D engine…", CANVAS_W / 2, CANVAS_H / 2);
    }
    return;
  }

  // One-time scene init
  if (!_renderer) _initScene(canvas);
  if (!_renderer) return; // init failed — silently skip

  // Detect new game (new gs object) → rebuild brick meshes
  if (gs && gs !== _lastGs) {
    _lastGs = gs;
    _initBricks(gs.bricks);
  }

  // ── Sync brick visibility ─────────────────────────────────────────────────
  if (gs) {
    gs.bricks.forEach(b => {
      const mesh = _brickMeshes.get(b.id);
      if (!mesh) return;
      mesh.visible = b.alive;

      // Keep reflection visibility in sync with the brick
      const refMesh = _brickReflections.get(b.id);
      if (refMesh) refMesh.visible = b.alive;

      // While alive, death bricks look identical (handled by same material)
    });
  }

  // ── Ball position ─────────────────────────────────────────────────────────
  const ballVisible = gs && (gs.running || phase === "playing");
  _ballMesh.visible = ballVisible;
  if (ballVisible) {
    _ballMesh.position.set(gx(gs.bx), BALL_R + 3, gz(gs.by));
    _ballLight.position.copy(_ballMesh.position);
  }

  // ── Paddle position ───────────────────────────────────────────────────────
  const padCenterX = paddleX + PADDLE_W / 2;
  const padZ       = PLAY_H - 44;
  _paddleMesh.position.set(gx(padCenterX), 7, gz(padZ));

  // ── Update 3D VFX ─────────────────────────────────────────────────────────
  _update3DBursts();
  _update3DCoins();

  // ── Render 3D scene ───────────────────────────────────────────────────────
  _renderer.render(_scene, _camera);

  // ── HUD canvas (text overlay) ─────────────────────────────────────────────
  _drawHUD(splashes, wager, mult, totalNormal, gs);
}
