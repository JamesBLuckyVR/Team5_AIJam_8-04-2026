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
let _brickShadows      = new Map();   // brick id → shadow plane on floor
let _ballShadow        = null;        // shadow circle under the ball
let _paddleShadow      = null;        // shadow plane under the paddle
let _shadowMat         = null;        // shared material for all blob shadows
let _gridMat           = null;        // ShaderMaterial for animated rainbow grid
let _burstParticles = [];       // active death burst particle meshes
let _coin3DParticles = [];      // active coin burst meshes
let _hudCanvas  = null;
let _hudCtx     = null;
let _lastGs     = null;         // previous gs reference to detect new game
let _explosionTex  = null;      // (kept for compat — no longer used for sprites)
let _deathSprite   = null;      // (kept for compat — no longer used)
let _czAmountDiv   = null;      // persistent div showing live payout on cashout zone (unused, kept for compat)
let _czTxtCtx      = null;      // 2D context of the cashout zone canvas texture
let _czTxtTex      = null;      // Three.js CanvasTexture — set needsUpdate each frame

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
  _camera.position.set(0, 800, 124);
  _camera.lookAt(0, 0, PLAY_H / 6);

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

  // ── Floor — clamped exactly to play area so nothing is visible past the walls
  const floorGeo = new THREE.PlaneGeometry(CANVAS_W, PLAY_H);
  const floorMat = new THREE.MeshStandardMaterial({
    color:       0x1a2440,
    roughness:   0.25,
    metalness:   0.75,
    transparent: true,
    opacity:     0.88,
  });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  _scene.add(floor);

  // ── Rainbow grid — ShaderMaterial, 20 cells each direction, colour lerps ──
  _gridMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite:  false,
    blending:    THREE.AdditiveBlending,
    uniforms: { time: { value: 0 } },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;

      vec3 hsl2rgb(float h) {
        float s = 1.0, l = 0.58;
        float c = (1.0 - abs(2.0 * l - 1.0)) * s;
        float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
        float m = l - c * 0.5;
        float h6 = h * 6.0;
        vec3 rgb;
        if      (h6 < 1.0) rgb = vec3(c, x, 0.0);
        else if (h6 < 2.0) rgb = vec3(x, c, 0.0);
        else if (h6 < 3.0) rgb = vec3(0.0, c, x);
        else if (h6 < 4.0) rgb = vec3(0.0, x, c);
        else if (h6 < 5.0) rgb = vec3(x, 0.0, c);
        else               rgb = vec3(c, 0.0, x);
        return rgb + m;
      }

      void main() {
        const float cells  = 12.0;   // integer → grid edges align with play field walls
        const float lineW  = 0.04;   // fraction of cell occupied by line

        vec2  cell  = fract(vUv * cells);
        bool  onH   = cell.y < lineW || cell.y > (1.0 - lineW);
        bool  onV   = cell.x < lineW || cell.x > (1.0 - lineW);
        if (!onH && !onV) { gl_FragColor = vec4(0.0); return; }

        // Horizontal lines: hue travels along X + time * 0.15
        vec3  hCol  = hsl2rgb(fract(vUv.x + time * 0.15));
        // Vertical lines: hue travels along Y + time * 0.05
        vec3  vCol  = hsl2rgb(fract(vUv.y + time * 0.05));

        vec3  col   = onH ? hCol : vCol;
        // Half intensity: blend colour 50% toward black
        col *= 0.5;
        float alpha = onH ? 0.8 : 0.36;  // 80% opacity (vertical scaled proportionally)
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const gridMesh = new THREE.Mesh(new THREE.PlaneGeometry(CANVAS_W, PLAY_H), _gridMat);
  gridMesh.rotation.x = -Math.PI / 2;
  gridMesh.position.set(0, 1.0, 0);
  _scene.add(gridMesh);

  // ── Cashout zone — raised 3D block at the near (paddle) end ─────────────
  const czW      = CANVAS_W;
  const czD      = Math.min(CASHOUT_H, 100);
  const czBlockH = 28;  // visible height of the block above the floor

  const czGeo = new THREE.BoxGeometry(czW, czBlockH, czD);
  const czMat = new THREE.MeshStandardMaterial({
    color:             0x0c3a1c,
    emissive:          0x16743a,
    emissiveIntensity: 0.35,
    roughness:         0.55,
    metalness:         0.25,
  });
  const czMesh = new THREE.Mesh(czGeo, czMat);
  czMesh.position.set(0, czBlockH / 2, gz(PLAY_H) + czD / 2);
  _scene.add(czMesh);

  // Canvas texture — "CASHOUT ZONE" label + live payout — sits on top face
  const czTxtCanvas = document.createElement('canvas');
  czTxtCanvas.width  = 1024;
  czTxtCanvas.height = 256;
  _czTxtCtx = czTxtCanvas.getContext('2d');
  _czTxtTex = new THREE.CanvasTexture(czTxtCanvas);
  const czTxtMat = new THREE.MeshBasicMaterial({
    map:         _czTxtTex,
    transparent: true,
    depthWrite:  false,
  });
  const czTxtMesh = new THREE.Mesh(new THREE.PlaneGeometry(czW, czD), czTxtMat);
  czTxtMesh.rotation.x = -Math.PI / 2;
  czTxtMesh.position.set(0, czBlockH + 1.2, gz(PLAY_H) + czD / 2);
  _scene.add(czTxtMesh);

  // Glowing green edge strip along the front face of the block
  const edgeGeo = new THREE.BoxGeometry(CANVAS_W, czBlockH + 2, 2);
  const edgeMat = new THREE.MeshStandardMaterial({
    color: 0x27ae60, emissive: 0x27ae60, emissiveIntensity: 0.9,
  });
  const edge = new THREE.Mesh(edgeGeo, edgeMat);
  edge.position.set(0, czBlockH / 2, gz(PLAY_H));
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

  // ── Shared blob-shadow material ───────────────────────────────────────────
  _shadowMat = new THREE.MeshBasicMaterial({
    color:      0x000000,
    transparent: true,
    opacity:     0.82,
    depthWrite:  false,
  });

  // Ball shadow — circle on the floor, offset in the light's shadow direction
  _ballShadow = new THREE.Mesh(
    new THREE.CircleGeometry(BALL_R * 1.54, 24),
    _shadowMat
  );
  _ballShadow.rotation.x  = -Math.PI / 2;
  _ballShadow.position.y  = 2.0;
  _ballShadow.renderOrder = 3;
  _ballShadow.visible     = false;
  _scene.add(_ballShadow);

  // Paddle shadow — rectangle on the floor, offset in the light's shadow direction
  _paddleShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(PADDLE_W * 1.1, 24),
    _shadowMat
  );
  _paddleShadow.rotation.x  = -Math.PI / 2;
  _paddleShadow.position.y  = 2.0;
  _paddleShadow.renderOrder = 3;
  _scene.add(_paddleShadow);

  // GIF effects are rendered as HTML img elements (see _showGifEffect)

  // ── Cashout amount div — positioned via 3D projection every frame ─────────
  _czAmountDiv = document.createElement('div');
  _czAmountDiv.style.cssText = [
    'position:absolute',
    'pointer-events:none',
    'font-family:monospace',
    'font-weight:800',
    'font-size:30px',
    'color:#00ff88',
    'text-shadow:0 0 22px #00ff88,0 0 8px #fff',
    'transform:translate(-50%,-50%)',
    'z-index:7',
    'display:none',
    'white-space:nowrap',
  ].join(';');
  if (_hudCanvas && _hudCanvas.parentElement) {
    _hudCanvas.parentElement.appendChild(_czAmountDiv);
  }

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

  // Remove old bricks, reflections and shadows
  _brickMeshes.forEach(m => _scene.remove(m));
  _brickMeshes.clear();
  _brickReflections.forEach(m => _scene.remove(m));
  _brickReflections.clear();
  _brickShadows.forEach(m => _scene.remove(m));
  _brickShadows.clear();

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

    // ── Blob shadow — hard shadow on floor, offset in key-light shadow direction
    // Key light at (80, 700, 200): shadows fall left (−x) and away from camera (−z)
    if (_shadowMat) {
      const shadowMesh = new THREE.Mesh(
        new THREE.PlaneGeometry(BRICK_W * 0.95, BRICK_H * 0.95),
        _shadowMat
      );
      shadowMesh.rotation.x  = -Math.PI / 2;
      shadowMesh.renderOrder = 3;
      const bx = gx(b.x + BRICK_W / 2);
      const bz = gz(b.y + BRICK_H / 2);
      shadowMesh.position.set(bx - 4, 2.0, bz + 10);
      _scene.add(shadowMesh);
      _brickShadows.set(b.id, shadowMesh);
    }
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

// ── GIF effect overlay ────────────────────────────────────────────────────────
// Projects a 3D world position to CSS pixels and shows an animated GIF <img>
// as an absolutely-positioned child of #canvas-wrap. GIFs animate natively.

function _showGifEffect(worldX, worldY, worldZ, src, durationMs, sizePx) {
  if (!_camera || !_hudCanvas) return;
  const THREE = window.THREE;

  // Project 3D world → Normalised Device Coordinates
  const v = new THREE.Vector3(worldX, worldY, worldZ).project(_camera);

  // Convert NDC to CSS pixels relative to canvas-wrap
  const wrap = _hudCanvas.parentElement;
  if (!wrap) return;
  const rect = wrap.getBoundingClientRect();
  const cssX = (v.x  + 1) / 2 * rect.width;
  const cssY = (1 - v.y) / 2 * rect.height;

  const img = document.createElement('img');
  img.src = src;
  img.style.cssText = [
    'position:absolute',
    'pointer-events:none',
    `left:${cssX}px`,
    `top:${cssY}px`,
    `width:${sizePx}px`,
    'height:auto',
    'transform:translate(-50%,-50%)',
    'z-index:6',
    'mix-blend-mode:screen',  // black pixels → transparent, colours add onto scene
  ].join(';');

  wrap.appendChild(img);
  setTimeout(() => { if (img.parentElement) img.parentElement.removeChild(img); }, durationMs);
}

// ── Paddle hit effect ─────────────────────────────────────────────────────────
// Called from physics.js after each paddle bounce.
function showPaddleEffect(px) {
  const padCX = px + PADDLE_W / 2;
  _showGifEffect(gx(padCX), 7, gz(PLAY_H - 44), 'assets/GlintBlue01.gif', 700, 100);
}

// ── Death burst — deathblock.gif ──────────────────────────────────────────────

const BURST_DURATION = 1500;

function createDeathBurst(x, y) {
  _showGifEffect(gx(x), BRICK_3D_H / 2, gz(y), 'assets/deathblock.gif', 1500, 500); // 200 × 250%
  return { x, y, born: performance.now(), particles: [] };
}

function drawDeathBurst(ctx) {
  // Brief red screen flash on the HUD canvas
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
  if (deathBurst) {
    const age = (performance.now() - deathBurst.born) / BURST_DURATION;
    if (age >= 1) deathBurst = null;
  }
}

// ── Coin burst — GlintGreen01.gif ─────────────────────────────────────────────

const COIN_DURATION = 700;

function createCoinBurst(x, y) {
  _showGifEffect(gx(x), BRICK_3D_H / 2, gz(y), 'assets/GlintGreen01.gif', 700, 80);
  return { x, y, born: performance.now(), coins: [] };
}

function _update3DCoins() {
  // GIF effects manage their own lifetime via setTimeout — just expire the burst objects
  if (!coinBursts || !coinBursts.length) return;
  const now = performance.now();
  coinBursts.length = 0; // clear; physics.js re-pushes active bursts each frame
}

// ── HUD canvas drawing (text overlays) ────────────────────────────────────────

function _drawHUD(splashes, wager, mult, totalNormal, gs) {
  if (!_hudCtx) return;
  const ctx = _hudCtx;
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // Floating payout splashes — projected from the brick's 3D world position
  const now  = performance.now();
  const live = splashes.filter(sp => now - sp.born < 900);
  splashes.length = 0;
  live.forEach(sp => splashes.push(sp));
  live.forEach(sp => {
    const age = (now - sp.born) / 900;

    // Project the brick's 3D world position to HUD canvas coordinates
    let screenX = sp.x, screenY = sp.y;  // fallback to game coords
    if (_camera && window.THREE) {
      const v = new window.THREE.Vector3(gx(sp.x), BRICK_3D_H / 2, gz(sp.y)).project(_camera);
      screenX = (v.x  + 1) / 2 * CANVAS_W;
      screenY = (1 - v.y) / 2 * CANVAS_H;
    }

    ctx.globalAlpha   = 1 - Math.pow(age, 1.4);
    ctx.font          = `bold ${24 + age * 12}px monospace`;   // 200% of original 12+age*6
    ctx.textAlign     = "center";
    ctx.textBaseline  = "middle";
    ctx.fillStyle     = "#00ff88";    // green
    ctx.shadowColor   = "#00cc55";
    ctx.shadowBlur    = 16;
    ctx.fillText(`+$${sp.val}`, screenX, screenY - age * 60);
    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
  });

  // Cashout amount is rendered via _czAmountDiv (updated in drawFrame)

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

      // Keep reflection and shadow visibility in sync with the brick
      const refMesh = _brickReflections.get(b.id);
      if (refMesh) refMesh.visible = b.alive;
      const shadowMesh = _brickShadows.get(b.id);
      if (shadowMesh) shadowMesh.visible = b.alive;

      // While alive, death bricks look identical (handled by same material)
    });
  }

  // ── Ball position ─────────────────────────────────────────────────────────
  const ballVisible = gs && (gs.running || phase === "playing");
  _ballMesh.visible = ballVisible;
  if (_ballShadow) _ballShadow.visible = ballVisible;
  if (ballVisible) {
    _ballMesh.position.set(gx(gs.bx), BALL_R + 3, gz(gs.by));
    _ballLight.position.copy(_ballMesh.position);
    if (_ballShadow) {
      _ballShadow.position.x = gx(gs.bx) - 4;
      _ballShadow.position.z = gz(gs.by) + 8;
    }
  }

  // ── Paddle position ───────────────────────────────────────────────────────
  const padCenterX = paddleX + PADDLE_W / 2;
  const padZ       = PLAY_H - 44;
  _paddleMesh.position.set(gx(padCenterX), 7, gz(padZ));
  if (_paddleShadow) {
    _paddleShadow.position.x = gx(padCenterX) - 4;
    _paddleShadow.position.z = gz(padZ) + 8;
  }

  // ── Update 3D VFX ─────────────────────────────────────────────────────────
  _update3DBursts();
  _update3DCoins();

  // ── Animate rainbow grid ─────────────────────────────────────────────────
  if (_gridMat) {
    _gridMat.uniforms.time.value = performance.now() / 1000;
  }

  // ── Render 3D scene ───────────────────────────────────────────────────────
  _renderer.render(_scene, _camera);

  // ── Update cashout zone canvas texture with live payout amount ───────────
  if (_czTxtCtx && _czTxtTex) {
    const ctx2 = _czTxtCtx;
    ctx2.clearRect(0, 0, 1024, 256);

    // Top half: "CASHOUT ZONE" label
    ctx2.font         = 'bold 88px monospace';
    ctx2.textAlign    = 'center';
    ctx2.textBaseline = 'middle';
    ctx2.shadowColor  = '#00ff88';
    ctx2.shadowBlur   = 22;
    ctx2.fillStyle    = '#ffffff';
    ctx2.fillText('CASHOUT ZONE', 512, 80);

    // Bottom half: live payout amount (only while ball is running)
    if (gs && gs.running) {
      const cur   = getLivePayout(parseFloat(wager) || 0);
      const pulse = 0.88 + 0.12 * Math.sin(performance.now() / 280);
      ctx2.font        = `bold ${Math.round(82 * pulse)}px monospace`;
      ctx2.shadowColor = '#00ff88';
      ctx2.shadowBlur  = 30;
      ctx2.fillStyle   = '#00ff88';
      ctx2.fillText(`$${cur.toFixed(2)}`, 512, 188);
      // white core
      ctx2.shadowBlur = 0;
      ctx2.fillStyle  = '#ffffff';
      ctx2.font       = `bold ${Math.round(74 * pulse)}px monospace`;
      ctx2.fillText(`$${cur.toFixed(2)}`, 512, 188);
    }

    _czTxtTex.needsUpdate = true;
  }

  // ── HUD canvas (text overlay) ─────────────────────────────────────────────
  _drawHUD(splashes, wager, mult, totalNormal, gs);
}
