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
let _explosionTex  = null;      // texture for the death burst sprite
let _deathSprite   = null;      // active explosion sprite mesh
let _coinSparkTex  = null;      // texture for coin burst sprites

// ── 2D → 3D coordinate helpers ────────────────────────────────────────────────
// Game X (0…CANVAS_W) → 3D X (−CW/2 … +CW/2)
// Game Y (0…PLAY_H)   → 3D Z (−PH/2 … +PH/2)  top=far(negative), paddle=near(positive)
function gx(x) { return x - CANVAS_W / 2; }
function gz(y) { return y - PLAY_H  / 2; }

// ── Row gem materials — mirrors BRICK_COLORS in config.js so 3D hues match 2D ─
// Cycles with the same 5-entry length so row % 5 produces the same pattern.
const ROW_MAT_DEFS = [
  { color: 0xc0392b, emissive: 0xe84040, emissiveIntensity: 0.9 }, // Crimson  (#c0392b)
  { color: 0xe67e22, emissive: 0xff9933, emissiveIntensity: 0.9 }, // Orange   (#e67e22)
  { color: 0xf1c40f, emissive: 0xffdd00, emissiveIntensity: 1.0 }, // Yellow   (#f1c40f)
  { color: 0x27ae60, emissive: 0x2ecc71, emissiveIntensity: 0.9 }, // Green    (#27ae60)
  { color: 0x2980b9, emissive: 0x3498db, emissiveIntensity: 0.9 }, // Blue     (#2980b9)
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
  // Fog tuned to the field depth — starts past the far wall, fades distant geometry.
  _scene.fog = new THREE.Fog(0x07091a, 700, 1300);

  // Camera — near-overhead with a gentle ~11° tilt toward the bricks.
  // Camera is centred in X/Z over the full canvas and elevated high enough
  // that the frustum covers the entire field in one shot:
  //   - Top    of frame → bricks  (Z ≈ -PLAY_H/2)
  //   - Bottom of frame → cashout (Z ≈ PLAY_H/2 + CASHOUT_H/2)
  // FOV 65° is the key: at 55° the bottom frustum ray misses the cashout
  // zone; 65° extends it far enough to include the full cashout strip.
  _camera = new THREE.PerspectiveCamera(65, CANVAS_W / CANVAS_H, 1, 2500);
  _camera.position.set(0, 800, CASHOUT_H / 2);
  _camera.lookAt(0, 0, -PLAY_H / 6);

  // ── Lighting — tuned for vivid gem reflections ────────────────────────────
  // Neutral ambient so gem colors read accurately without colour shift
  const ambient = new THREE.AmbientLight(0x222233, 0.6);
  _scene.add(ambient);

  // Key light — bright white from above-front for sharp gem highlights
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
  keyLight.position.set(80, 700, 200);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  _scene.add(keyLight);

  // Rim light — cool blue from the opposite side for depth on gem edges
  const rimLight = new THREE.DirectionalLight(0x88aaff, 0.9);
  rimLight.position.set(-200, 300, -300);
  _scene.add(rimLight);

  // Fill light — warm from below-front to catch the gem undersides
  const fillLight = new THREE.DirectionalLight(0xffeedd, 0.5);
  fillLight.position.set(0, -100, 500);
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

  // ── Cashout zone — prominent green plane at the near (paddle) end ────────
  // 3D depth scaled proportionally to CASHOUT_H but capped so perspective
  // distortion stays reasonable when the camera is close.
  const czW = CANVAS_W;
  const czD = Math.min(CASHOUT_H, 100);
  const czGeo = new THREE.PlaneGeometry(czW, czD);
  const czMat = new THREE.MeshStandardMaterial({
    color:             0x0c3a1c,
    emissive:          0x16743a,
    emissiveIntensity: 0.40,
    roughness:         0.85,
  });
  const czMesh = new THREE.Mesh(czGeo, czMat);
  czMesh.rotation.x = -Math.PI / 2;
  czMesh.position.set(0, 0.6, gz(PLAY_H) + czD / 2);
  _scene.add(czMesh);

  // "CASHOUT ZONE" text baked into a canvas texture so it sits exactly on
  // the 3D green plane regardless of camera angle.
  const czTxtCanvas = document.createElement('canvas');
  czTxtCanvas.width  = 1024;
  czTxtCanvas.height = 256;
  const czTxtCtx = czTxtCanvas.getContext('2d');
  czTxtCtx.clearRect(0, 0, 1024, 256);
  czTxtCtx.font         = 'bold 110px monospace';
  czTxtCtx.textAlign    = 'center';
  czTxtCtx.textBaseline = 'middle';
  czTxtCtx.shadowColor  = '#00ff88';
  czTxtCtx.shadowBlur   = 28;
  czTxtCtx.fillStyle    = '#ffffff';
  czTxtCtx.fillText('CASHOUT ZONE', 512, 128);
  const czTxtTex = new THREE.CanvasTexture(czTxtCanvas);
  const czTxtMat = new THREE.MeshBasicMaterial({
    map:         czTxtTex,
    transparent: true,
    depthWrite:  false,
  });
  const czTxtMesh = new THREE.Mesh(new THREE.PlaneGeometry(czW, czD), czTxtMat);
  czTxtMesh.rotation.x = -Math.PI / 2;
  czTxtMesh.position.set(0, 1.2, gz(PLAY_H) + czD / 2);  // just above the green plane
  _scene.add(czTxtMesh);

  // Thin glowing green edge line separating play area from cashout
  const edgeGeo = new THREE.BoxGeometry(CANVAS_W, 1.5, 2);
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0x27ae60, emissive: 0x27ae60, emissiveIntensity: 0.9,
  });
  const edge = new THREE.Mesh(edgeGeo, edgeMat);
  edge.position.set(0, 1.5, gz(PLAY_H));
  _scene.add(edge);

  // ── Arena walls — left, right, top ────────────────────────────────────────
  // Kept short and very transparent so they frame the field without creating
  // a hard cage outline from the overhead camera angle.
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x101830, emissive: 0x060c22, emissiveIntensity: 0.15,
    transparent: true, opacity: 0.35, roughness: 0.5, metalness: 0.4,
  });
  const wallH = 24;

  // Left wall
  const leftWall = new THREE.Mesh(new THREE.BoxGeometry(5, wallH, PLAY_H + 40), wallMat);
  leftWall.position.set(gx(0) - 2.5, wallH / 2, 0);
  _scene.add(leftWall);

  // Right wall
  const rightWall = new THREE.Mesh(new THREE.BoxGeometry(5, wallH, PLAY_H + 40), wallMat);
  rightWall.position.set(gx(CANVAS_W) + 2.5, wallH / 2, 0);
  _scene.add(rightWall);

  // Top wall
  const topWall = new THREE.Mesh(new THREE.BoxGeometry(CANVAS_W + 10, wallH, 5), wallMat);
  topWall.position.set(0, wallH / 2, gz(0) - 2.5);
  _scene.add(topWall);

  // Subtle glow strips along the top edges of each wall — dimmed so they
  // read as atmosphere rather than a hard outline.
  const stripMat = new THREE.MeshStandardMaterial({ color: 0x1a3366, emissive: 0x1a3366, emissiveIntensity: 0.55 });
  const lStrip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, PLAY_H + 40), stripMat);
  lStrip.position.set(gx(0) - 0.5, wallH, 0);
  _scene.add(lStrip);
  const rStrip = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, PLAY_H + 40), stripMat.clone());
  rStrip.position.set(gx(CANVAS_W) + 0.5, wallH, 0);
  _scene.add(rStrip);
  const tStrip = new THREE.Mesh(new THREE.BoxGeometry(CANVAS_W + 10, 1.5, 1.5), stripMat.clone());
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

  // ── Explosion texture (death burst) ──────────────────────────────────────
  _explosionTex = new THREE.TextureLoader().load('art/explosion.png');

  // ── Coin spark texture (brick hit reward) ─────────────────────────────────
  _coinSparkTex = new THREE.TextureLoader().load('art/coin_spark.png');

  // ── HUD canvas ────────────────────────────────────────────────────────────
  _hudCanvas = document.getElementById("hud-canvas");
  if (_hudCanvas) {
    _hudCanvas.width  = CANVAS_W;
    _hudCanvas.height = CANVAS_H;
  }
  _hudCtx = _hudCanvas ? _hudCanvas.getContext("2d") : null;

  console.log("[3D] Scene initialized successfully");

  } catch (err) {
    console.error("[3D] Scene init failed:", err);
    _renderer = null; // allow retry or fallback
  }
}

// ── Brick mesh management ─────────────────────────────────────────────────────

const BRICK_3D_H = 30; // height of bricks in 3D world units — chunkier = more gem-like

function _makeBrickMat(row, isDeath) {
  const THREE = window.THREE;
  if (isDeath) return _makeBrickMat(row, false);

  const def = ROW_MAT_DEFS[row % ROW_MAT_DEFS.length];

  // MeshPhysicalMaterial with clearcoat gives a polished gem/crystal surface:
  // the clearcoat layer adds a separate shiny coat on top of the base gem color,
  // catching highlights independently and giving real depth to the surface.
  return new THREE.MeshPhysicalMaterial({
    color:              def.color,
    emissive:           def.emissive,
    emissiveIntensity:  def.emissiveIntensity,
    roughness:          0.05,   // nearly mirror-smooth
    metalness:          0.05,   // gems aren't metallic — keep low for true color
    clearcoat:          1.0,    // full polished coating
    clearcoatRoughness: 0.05,   // smooth clearcoat = sharp reflections
    reflectivity:       1.0,    // max reflectivity
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
    const srcDef  = ROW_MAT_DEFS[b.row % ROW_MAT_DEFS.length];
    const refMat  = new THREE.MeshStandardMaterial({
      color:             srcDef.color,
      emissive:          srcDef.emissive,
      emissiveIntensity: srcDef.emissiveIntensity * 0.5,
      roughness:         0.1,
      metalness:         0.05,
      transparent:       true,
      opacity:           0.22,
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

// ── 3D Death burst — sprite explosion ─────────────────────────────────────────

const BURST_DURATION = 1200;

function createDeathBurst(x, y) {
  const THREE = window.THREE;

  // Remove any leftover sprite from a previous round
  if (_deathSprite) {
    _scene.remove(_deathSprite);
    _deathSprite.material.dispose();
    _deathSprite = null;
  }

  if (_explosionTex) {
    const mat = new THREE.SpriteMaterial({
      map:         _explosionTex,
      transparent: true,
      opacity:     1,
      blending:    THREE.AdditiveBlending,  // fire colors add onto the dark scene
      depthWrite:  false,
    });
    const sprite = new THREE.Sprite(mat);
    // Position at the struck brick, slightly above the floor
    sprite.position.set(gx(x), BRICK_3D_H + 10, gz(y));
    sprite.scale.set(1, 1, 1);               // starts tiny, grows in _update3DBursts
    sprite.userData.born = performance.now();
    _scene.add(sprite);
    _deathSprite = sprite;
  }

  // Return the standard burst object (born/particles) so physics.js is unaffected
  return { x, y, born: performance.now(), particles: [] };
}

function drawDeathBurst(ctx) {
  // Draw a brief red screen flash on the HUD canvas to complement the 3D sprite
  if (!deathBurst || !ctx) return;
  const age = (performance.now() - deathBurst.born) / BURST_DURATION;
  if (age >= 1) return;

  const flashAlpha = Math.max(0, 0.5 * (1 - age / 0.25));
  if (flashAlpha > 0) {
    ctx.globalAlpha = flashAlpha;
    ctx.fillStyle   = "#cc0000";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.globalAlpha = 1;
  }
}

function _update3DBursts() {
  // Animate the explosion sprite: quick scale-up then fade out
  if (_deathSprite) {
    const age     = (performance.now() - _deathSprite.userData.born) / BURST_DURATION;
    const maxSize = 220;
    // Rapid expansion in the first 40% of the animation, then holds size
    const scale   = maxSize * Math.min(1, age / 0.4);
    // Opacity: stays full until ~30% then fades out
    const opacity = Math.max(0, 1 - Math.pow(Math.max(0, (age - 0.3) / 0.7), 0.6));

    _deathSprite.scale.set(scale, scale, 1);
    _deathSprite.material.opacity = opacity;

    if (age >= 1) {
      _scene.remove(_deathSprite);
      _deathSprite.material.dispose();
      _deathSprite = null;
    }
  }

  // Keep deathBurst in sync so physics.js tickDeathBurst works unchanged
  if (deathBurst) {
    const age = (performance.now() - deathBurst.born) / BURST_DURATION;
    if (age >= 1) deathBurst = null;
  }
}

// ── 3D Coin burst — green spark sprites ───────────────────────────────────────

const COIN_DURATION = 750;
const COIN_GRAVITY  = 160;

let _coinSparkTex = null;   // loaded once in _initScene

function createCoinBurst(x, y) {
  const THREE = window.THREE;
  const coins  = [];
  const count  = 6;

  for (let i = 0; i < count; i++) {
    // Fan upward with random spread
    const angle = (-Math.PI / 2) + ((Math.random() - 0.5) * Math.PI * 0.9);
    const speed = 70 + Math.random() * 90;
    const size  = 28 + Math.random() * 22;

    const mat = new THREE.SpriteMaterial({
      map:         _coinSparkTex,
      transparent: true,
      opacity:     1,
      blending:    THREE.AdditiveBlending,
      depthWrite:  false,
    });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(size, size, 1);
    sprite.position.set(gx(x), BRICK_3D_H / 2 + 6, gz(y));
    _scene.add(sprite);

    coins.push({
      mesh: sprite,       // keep 'mesh' key so existing cleanup code works
      vx:   Math.cos(angle) * speed * 0.5,
      vy:   Math.abs(Math.sin(angle)) * speed + 50,
      vz:   (Math.random() - 0.5) * speed * 0.4,
      born: performance.now(),
      life: 0.5 + Math.random() * 0.5,
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
      burst.coins.forEach(c => { _scene.remove(c.mesh); c.mesh.material.dispose(); });
      return;
    }

    burst.coins.forEach(c => {
      const pAge = age / c.life;
      if (pAge >= 1) { c.mesh.visible = false; return; }
      const alpha = Math.max(0, 1 - Math.pow(pAge, 1.4));
      c.mesh.position.x = gx(burst.x) + c.vx * elapsed;
      c.mesh.position.y = BRICK_3D_H / 2 + 6 + c.vy * elapsed - 0.5 * COIN_GRAVITY * elapsed * elapsed;
      c.mesh.position.z = gz(burst.y) + c.vz * elapsed;
      c.mesh.material.opacity = alpha;
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
    const pct = totalNormal > 0 ? gs.cleared / totalNormal : 0;
    const cur = getLivePayout(parseFloat(wager) || 0);
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
