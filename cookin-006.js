/*  ROAD RUSH — game.js
    Pure vanilla JS + HTML5 Canvas
    ─────────────────────────────────────────────────────── */

// ── Canvas setup ─────────────────────────────────────────
const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');

const GAME_W  = 480;
const GAME_H  = 700;
canvas.width  = GAME_W;
canvas.height = GAME_H;

// Scale canvas to fill the viewport while preserving ratio
function resizeCanvas() {
  const scale = Math.min(window.innerWidth / GAME_W, window.innerHeight / GAME_H);
  canvas.style.width  = GAME_W * scale + 'px';
  canvas.style.height = GAME_H * scale + 'px';
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ── Constants ─────────────────────────────────────────────
const ROAD_LEFT  = 80;
const ROAD_RIGHT = GAME_W - 80;
const ROAD_W     = ROAD_RIGHT - ROAD_LEFT;
const NUM_LANES  = 3;
const LANE_W     = ROAD_W / NUM_LANES;

const PLAYER_W = 36;
const PLAYER_H = 60;
const ENEMY_W  = 36;
const ENEMY_H  = 60;

const MAX_SPEED       = 320;  // px/s equivalent units
const ACCEL           = 180;
const BRAKE_FORCE     = 280;
const FRICTION        = 90;
const LATERAL_SPEED   = 260;
const NITRO_SPEED     = 520;
const NITRO_MAX       = 100;
const NITRO_DRAIN     = 55;   // per second
const NITRO_REGEN     = 18;   // per second
const LIVES_START     = 3;
const ENEMY_SPAWN_MIN = 1.2;  // seconds between spawns (minimum)
const SCORE_PER_SEC   = 12;

// ── Game State ────────────────────────────────────────────
let state = 'START';   // START | PLAYING | PAUSED | GAMEOVER

// ── Input ─────────────────────────────────────────────────
const keys = {};
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'PLAYING')  pauseGame();
  else if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'PAUSED') resumeGame();
  if (e.code === 'Space') e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

// ── DOM refs ──────────────────────────────────────────────
const startScreen    = document.getElementById('startScreen');
const pauseScreen    = document.getElementById('pauseScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const hud            = document.getElementById('hud');

const startBtn         = document.getElementById('startBtn');
const resumeBtn        = document.getElementById('resumeBtn');
const restartBtnPause  = document.getElementById('restartBtnPause');
const restartBtn       = document.getElementById('restartBtn');
const menuBtn          = document.getElementById('menuBtn');
const pauseBtn         = document.getElementById('pauseBtn');

const hudScore  = document.getElementById('hudScore');
const hudBest   = document.getElementById('hudBest');
const hudSpeed  = document.getElementById('hudSpeed');
const hudLives  = document.getElementById('hudLives');
const nitroBar  = document.getElementById('nitroBar');
const bestScoreStart = document.getElementById('bestScoreStart');
const finalScore     = document.getElementById('finalScore');
const finalBest      = document.getElementById('finalBest');

// ── Player ────────────────────────────────────────────────
let player;
function createPlayer() {
  player = {
    x:     ROAD_LEFT + ROAD_W / 2 - PLAYER_W / 2,
    y:     GAME_H - PLAYER_H - 40,
    w:     PLAYER_W,
    h:     PLAYER_H,
    vx:    0,
    speed: 0,       // current forward speed (0-MAX_SPEED)
    nitro: NITRO_MAX,
    nitroActive: false,
    invincible: 0,  // invincibility frames after crash (seconds)
    crashFlash: 0,
  };
}

// ── Enemies ───────────────────────────────────────────────
let enemies = [];
let enemyTimer = 0;
const ENEMY_COLORS = ['#e53935','#8e24aa','#1e88e5','#43a047','#fb8c00'];

function laneCenter(laneIndex) {
  return ROAD_LEFT + laneIndex * LANE_W + LANE_W / 2;
}

function spawnEnemy() {
  const lane = Math.floor(Math.random() * NUM_LANES);
  const ex   = laneCenter(lane) - ENEMY_W / 2;
  // Don't spawn directly on the player
  if (Math.abs(ex - player.x) < PLAYER_W + 10 && player.speed < 30) return;

  const baseSpeed = 100 + Math.random() * 80 + Math.min(score / 800, 120);
  enemies.push({
    x:     ex,
    y:     -ENEMY_H - 10,
    w:     ENEMY_W,
    h:     ENEMY_H,
    speed: baseSpeed,
    color: ENEMY_COLORS[Math.floor(Math.random() * ENEMY_COLORS.length)],
    lane,
  });
}

// ── Road scrolling ────────────────────────────────────────
let roadOffset = 0;
const DASH_H   = 40;
const DASH_GAP = 30;
const DASH_CYCLE = DASH_H + DASH_GAP;

// ── Score / lives ─────────────────────────────────────────
let score     = 0;
let bestScore = parseInt(localStorage.getItem('roadRushBest') || '0');
let lives     = LIVES_START;

// ── Effects ───────────────────────────────────────────────
let screenShake    = 0;   // remaining seconds of shake
let shakeX         = 0;
let shakeY         = 0;
let crashFlash     = 0;   // remaining seconds of red flash
let speedLines     = [];  // array of { x, y, len, alpha }
let nitroGlow      = 0;   // 0-1 intensity

// ── Timing ────────────────────────────────────────────────
let lastTime = 0;
let rafId    = null;

// ── Spawn interval grows shorter as score rises ───────────
function spawnInterval() {
  return Math.max(0.45, ENEMY_SPAWN_MIN - score / 4000);
}

// ─────────────────────────────────────────────────────────
//  INIT / RESET
// ─────────────────────────────────────────────────────────
function initGame() {
  createPlayer();
  enemies     = [];
  enemyTimer  = 0;
  score       = 0;
  lives       = LIVES_START;
  roadOffset  = 0;
  crashFlash  = 0;
  screenShake = 0;
  speedLines  = [];
  nitroGlow   = 0;
  updateHUD();
}

// ─────────────────────────────────────────────────────────
//  STATE MANAGEMENT
// ─────────────────────────────────────────────────────────
function showScreen(name) {
  startScreen.classList.remove('active');
  pauseScreen.classList.remove('active');
  gameOverScreen.classList.remove('active');
  if (name === 'start')    startScreen.classList.add('active');
  if (name === 'pause')    pauseScreen.classList.add('active');
  if (name === 'gameover') gameOverScreen.classList.add('active');
}

function startGame() {
  initGame();
  state = 'PLAYING';
  showScreen(null);
  hud.classList.remove('hidden');
  lastTime = performance.now();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = requestAnimationFrame(gameLoop);
}

function pauseGame() {
  if (state !== 'PLAYING') return;
  state = 'PAUSED';
  showScreen('pause');
}

function resumeGame() {
  if (state !== 'PAUSED') return;
  state = 'PLAYING';
  showScreen(null);
  lastTime = performance.now();
  rafId = requestAnimationFrame(gameLoop);
}

function gameOver() {
  state = 'GAMEOVER';
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('roadRushBest', bestScore);
  }
  finalScore.textContent = 'SCORE: ' + formatScore(score);
  finalBest.textContent  = 'BEST:  ' + formatScore(bestScore);
  showScreen('gameover');
  hud.classList.add('hidden');
}

function goToMenu() {
  state = 'START';
  if (rafId) cancelAnimationFrame(rafId);
  hud.classList.add('hidden');
  bestScoreStart.textContent = 'BEST SCORE: ' + formatScore(bestScore);
  showScreen('start');
}

// ── Button wiring ─────────────────────────────────────────
startBtn.addEventListener('click', startGame);
resumeBtn.addEventListener('click', resumeGame);
restartBtnPause.addEventListener('click', startGame);
restartBtn.addEventListener('click', startGame);
menuBtn.addEventListener('click', goToMenu);
pauseBtn.addEventListener('click', () => {
  if (state === 'PLAYING') pauseGame();
  else if (state === 'PAUSED') resumeGame();
});

// ─────────────────────────────────────────────────────────
//  GAME LOOP
// ─────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (state !== 'PLAYING') return;

  const dt = Math.min((timestamp - lastTime) / 1000, 0.05); // cap at 50 ms
  lastTime = timestamp;

  update(dt);
  render(dt);

  rafId = requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────────────────
//  UPDATE
// ─────────────────────────────────────────────────────────
function update(dt) {
  handleInput(dt);
  moveEnemies(dt);
  spawnEnemies(dt);
  checkCollisions();
  updateScore(dt);
  updateEffects(dt);
  updateHUD();
}

// ── Input & player movement ───────────────────────────────
function handleInput(dt) {
  const p = player;
  const pressing = {
    up:    keys['KeyW']    || keys['ArrowUp'],
    down:  keys['KeyS']    || keys['ArrowDown'],
    left:  keys['KeyA']    || keys['ArrowLeft'],
    right: keys['KeyD']    || keys['ArrowRight'],
    nitro: keys['Space'],
  };

  // Nitro
  p.nitroActive = pressing.nitro && p.nitro > 0;
  const topSpeed = p.nitroActive ? NITRO_SPEED : MAX_SPEED;

  if (p.nitroActive) {
    p.nitro = Math.max(0, p.nitro - NITRO_DRAIN * dt);
    nitroGlow = Math.min(1, nitroGlow + dt * 4);
  } else {
    p.nitro = Math.min(NITRO_MAX, p.nitro + NITRO_REGEN * dt);
    nitroGlow = Math.max(0, nitroGlow - dt * 3);
  }

  // Forward speed
  if (pressing.up) {
    p.speed = Math.min(topSpeed, p.speed + ACCEL * dt);
  } else if (pressing.down) {
    p.speed = Math.max(0, p.speed - BRAKE_FORCE * dt);
  } else {
    // Friction deceleration
    const friction = p.speed > 0 ? Math.min(p.speed, FRICTION * dt) : 0;
    p.speed = Math.max(0, p.speed - friction);
  }

  // Lateral movement
  if (pressing.left) {
    p.vx = -LATERAL_SPEED;
  } else if (pressing.right) {
    p.vx =  LATERAL_SPEED;
  } else {
    p.vx *= 0.75; // dampen lateral momentum
  }

  p.x += p.vx * dt;

  // Clamp inside road
  p.x = Math.max(ROAD_LEFT + 2, Math.min(ROAD_RIGHT - p.w - 2, p.x));

  // Road scroll speed = player forward speed
  roadOffset = (roadOffset + p.speed * dt) % DASH_CYCLE;
}

// ── Enemy movement ────────────────────────────────────────
function moveEnemies(dt) {
  const scrollBonus = player.speed; // enemies move relative to player speed
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.y += (e.speed + scrollBonus) * dt;
    if (e.y > GAME_H + ENEMY_H) {
      enemies.splice(i, 1);
      // Bonus score for surviving past an enemy
      score += 15;
    }
  }
}

// ── Enemy spawning ────────────────────────────────────────
function spawnEnemies(dt) {
  enemyTimer += dt;
  if (enemyTimer >= spawnInterval()) {
    enemyTimer = 0;
    spawnEnemy();
  }
}

// ── Collision detection (AABB) ────────────────────────────
function checkCollisions() {
  if (player.invincible > 0) return;

  const p = player;
  // Shrink hitbox slightly for fairness
  const px1 = p.x + 4, py1 = p.y + 6;
  const px2 = p.x + p.w - 4, py2 = p.y + p.h - 6;

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    const ex1 = e.x + 4, ey1 = e.y + 6;
    const ex2 = e.x + e.w - 4, ey2 = e.y + e.h - 6;

    if (px1 < ex2 && px2 > ex1 && py1 < ey2 && py2 > ey1) {
      handleCrash(i);
      break;
    }
  }
}

function handleCrash(enemyIdx) {
  lives -= 1;
  enemies.splice(enemyIdx, 1);

  // Reset player position slightly upward
  player.y = GAME_H - PLAYER_H - 40;
  player.speed *= 0.3;

  // Invincibility window
  player.invincible = 2.0;

  // Screen effects
  screenShake = 0.45;
  crashFlash  = 0.5;

  if (lives <= 0) {
    lives = 0;
    updateHUD();
    setTimeout(gameOver, 600);
  }
}

// ── Score ─────────────────────────────────────────────────
function updateScore(dt) {
  if (player.speed > 10) {
    // Base score per second, scaled by speed ratio
    const multiplier = player.speed / MAX_SPEED;
    score += SCORE_PER_SEC * multiplier * dt * (player.nitroActive ? 2 : 1);
  }
}

// ── Effects ───────────────────────────────────────────────
function updateEffects(dt) {
  // Invincibility countdown
  if (player.invincible > 0) player.invincible -= dt;

  // Screen shake
  if (screenShake > 0) {
    screenShake -= dt;
    shakeX = (Math.random() - 0.5) * 10 * (screenShake / 0.45);
    shakeY = (Math.random() - 0.5) * 10 * (screenShake / 0.45);
  } else {
    shakeX = 0; shakeY = 0;
  }

  // Crash flash
  if (crashFlash > 0) crashFlash -= dt;

  // Speed lines
  const targetLines = player.nitroActive ? 22 : (player.speed > 60 ? 12 : 0);
  while (speedLines.length < targetLines) {
    speedLines.push(newSpeedLine());
  }
  if (speedLines.length > targetLines) speedLines.splice(targetLines);
  for (const sl of speedLines) {
    sl.y += (player.speed * 2 + 200) * dt;
    sl.alpha -= dt * 1.2;
    if (sl.y > GAME_H || sl.alpha <= 0) {
      Object.assign(sl, newSpeedLine());
    }
  }
}

function newSpeedLine() {
  return {
    x:     ROAD_LEFT + Math.random() * ROAD_W,
    y:     Math.random() * GAME_H,
    len:   20 + Math.random() * 50,
    alpha: 0.3 + Math.random() * 0.4,
  };
}

// ── HUD update ────────────────────────────────────────────
function updateHUD() {
  hudScore.textContent = formatScore(Math.floor(score));
  hudBest.textContent  = formatScore(bestScore);
  hudSpeed.textContent = Math.floor(player.speed / MAX_SPEED * 220);

  // Lives hearts
  const hearts = '❤️ '.repeat(lives).trim() || '💀';
  hudLives.textContent = hearts;

  // Nitro bar
  const pct = (player.nitro / NITRO_MAX) * 100;
  nitroBar.style.width = pct + '%';
  if (player.nitroActive) nitroBar.classList.add('active');
  else                    nitroBar.classList.remove('active');
}

function formatScore(n) {
  return String(Math.floor(n)).padStart(6, '0');
}

// ─────────────────────────────────────────────────────────
//  RENDER
// ─────────────────────────────────────────────────────────
function render(dt) {
  ctx.save();

  // Screen shake transform
  ctx.translate(shakeX, shakeY);

  drawBackground();
  drawRoad();
  drawSpeedLines();
  drawEnemies();
  drawPlayer(dt);

  // Red crash flash overlay
  if (crashFlash > 0) {
    ctx.fillStyle = `rgba(255,30,30,${Math.min(0.45, crashFlash * 0.9)})`;
    ctx.fillRect(-10, -10, GAME_W + 20, GAME_H + 20);
  }

  // Nitro glow overlay
  if (nitroGlow > 0) {
    const grd = ctx.createLinearGradient(0, GAME_H, 0, GAME_H - 180);
    grd.addColorStop(0, `rgba(0,229,255,${0.22 * nitroGlow})`);
    grd.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, GAME_W, GAME_H);
  }

  ctx.restore();
}

// ── Background (grass) ────────────────────────────────────
function drawBackground() {
  ctx.fillStyle = '#2d5a1b';
  ctx.fillRect(0, 0, GAME_W, GAME_H);

  // Subtle grass stripes for depth
  ctx.fillStyle = '#2a521a';
  for (let y = -20; y < GAME_H; y += 60) {
    const oy = (y + roadOffset * 0.3) % GAME_H;
    ctx.fillRect(0, oy, ROAD_LEFT, 30);
    ctx.fillRect(ROAD_RIGHT, oy, GAME_W - ROAD_RIGHT, 30);
  }

  // Road edge rumble strips
  drawRumble(ROAD_LEFT - 14, 14);
  drawRumble(ROAD_RIGHT,     14);
}

function drawRumble(x, w) {
  const stripeH = 28;
  for (let sy = -stripeH; sy < GAME_H + stripeH; sy += stripeH * 2) {
    const oy = (sy + roadOffset * 0.9) % (GAME_H + stripeH * 2) - stripeH;
    ctx.fillStyle = '#e53935';
    ctx.fillRect(x, oy, w, stripeH);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, oy + stripeH, w, stripeH);
  }
}

// ── Road surface ──────────────────────────────────────────
function drawRoad() {
  // Asphalt
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, GAME_H);

  // Subtle asphalt texture (lighter centre strip)
  const rg = ctx.createLinearGradient(ROAD_LEFT, 0, ROAD_RIGHT, 0);
  rg.addColorStop(0,   'rgba(0,0,0,0.25)');
  rg.addColorStop(0.5, 'rgba(0,0,0,0)');
  rg.addColorStop(1,   'rgba(0,0,0,0.25)');
  ctx.fillStyle = rg;
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, GAME_H);

  // Lane dashes (white)
  ctx.fillStyle = '#e0e0e0';
  for (let lane = 1; lane < NUM_LANES; lane++) {
    const lx = ROAD_LEFT + lane * LANE_W - 2;
    for (let y = -DASH_H; y < GAME_H + DASH_H; y += DASH_CYCLE) {
      const oy = (y + roadOffset) % (GAME_H + DASH_H) - DASH_H;
      ctx.fillRect(lx, oy, 4, DASH_H);
    }
  }

  // Solid edge lines (yellow)
  ctx.fillStyle = '#fdd835';
  ctx.fillRect(ROAD_LEFT,     0, 4, GAME_H);
  ctx.fillRect(ROAD_RIGHT - 4, 0, 4, GAME_H);
}

// ── Speed lines ───────────────────────────────────────────
function drawSpeedLines() {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  for (const sl of speedLines) {
    ctx.globalAlpha = sl.alpha;
    ctx.beginPath();
    ctx.moveTo(sl.x, sl.y);
    ctx.lineTo(sl.x, sl.y + sl.len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// ── Draw a car ────────────────────────────────────────────
function drawCar(x, y, w, h, bodyColor, accentColor, isPlayer, blink) {
  if (blink) return; // skip draw during invincibility blink

  const cx = x + w / 2;

  // Shadow
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.ellipse(cx, y + h - 4, w * 0.42, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Car body
  ctx.fillStyle = bodyColor;
  roundRect(ctx, x + 3, y + 8, w - 6, h - 16, 6);
  ctx.fill();

  // Roof / cabin
  ctx.fillStyle = accentColor;
  roundRect(ctx, x + 6, y + 18, w - 12, h * 0.34, 5);
  ctx.fill();

  // Windshields
  ctx.fillStyle = 'rgba(160,220,255,0.65)';
  roundRect(ctx, x + 7, y + 20, w - 14, 12, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(160,220,255,0.45)';
  roundRect(ctx, x + 7, y + h - 32, w - 14, 10, 3);
  ctx.fill();

  // Headlights / taillights
  if (isPlayer) {
    // Headlights (front = top)
    ctx.fillStyle = '#fff9c4';
    ctx.fillRect(x + 4, y + 8, 7, 5);
    ctx.fillRect(x + w - 11, y + 8, 7, 5);
    // Taillights
    ctx.fillStyle = '#ef5350';
    ctx.fillRect(x + 4, y + h - 14, 7, 5);
    ctx.fillRect(x + w - 11, y + h - 14, 7, 5);
  } else {
    // Enemy: taillights on top (facing toward player)
    ctx.fillStyle = '#ef5350';
    ctx.fillRect(x + 4, y + 8, 7, 5);
    ctx.fillRect(x + w - 11, y + 8, 7, 5);
  }

  // Wheels
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(x - 2, y + 14, 7, 12);
  ctx.fillRect(x + w - 5, y + 14, 7, 12);
  ctx.fillRect(x - 2, y + h - 26, 7, 12);
  ctx.fillRect(x + w - 5, y + h - 26, 7, 12);

  // Exhaust / nitro flame on player
  if (isPlayer && player.nitroActive) {
    const fh = 14 + Math.random() * 12;
    const grd = ctx.createLinearGradient(cx, y + h, cx, y + h + fh);
    grd.addColorStop(0, '#00e5ff');
    grd.addColorStop(0.5, '#7c5cd8');
    grd.addColorStop(1, 'rgba(124,92,216,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.moveTo(cx - 6, y + h);
    ctx.lineTo(cx + 6, y + h);
    ctx.lineTo(cx, y + h + fh);
    ctx.closePath();
    ctx.fill();
  }
}

// ── Player draw ───────────────────────────────────────────
function drawPlayer(dt) {
  const p = player;
  // Blink effect during invincibility
  const blink = p.invincible > 0 && Math.floor(p.invincible / 0.12) % 2 === 0;
  drawCar(p.x, p.y, p.w, p.h, '#1565c0', '#0d47a1', true, blink);
}

// ── Enemies draw ──────────────────────────────────────────
function drawEnemies() {
  for (const e of enemies) {
    const accent = shadeColor(e.color, -30);
    drawCar(e.x, e.y, e.w, e.h, e.color, accent, false, false);
  }
}

// ── Utility: round rectangle ──────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Darken a hex colour by `amount` units
function shadeColor(hex, amount) {
  let r = parseInt(hex.slice(1,3), 16);
  let g = parseInt(hex.slice(3,5), 16);
  let b = parseInt(hex.slice(5,7), 16);
  r = Math.max(0, Math.min(255, r + amount));
  g = Math.max(0, Math.min(255, g + amount));
  b = Math.max(0, Math.min(255, b + amount));
  return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

// ─────────────────────────────────────────────────────────
//  START SCREEN animated background loop
// ─────────────────────────────────────────────────────────
let bgAnimOffset = 0;
function animateBg() {
  if (state !== 'START' && state !== 'GAMEOVER') return;
  bgAnimOffset = (bgAnimOffset + 2) % DASH_CYCLE;

  // Draw a mini road preview on the canvas behind the overlay
  ctx.fillStyle = '#2d5a1b';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  ctx.fillStyle = '#2c2c2c';
  ctx.fillRect(ROAD_LEFT, 0, ROAD_W, GAME_H);

  ctx.fillStyle = '#fdd835';
  ctx.fillRect(ROAD_LEFT, 0, 4, GAME_H);
  ctx.fillRect(ROAD_RIGHT - 4, 0, 4, GAME_H);

  ctx.fillStyle = '#e0e0e0';
  for (let lane = 1; lane < NUM_LANES; lane++) {
    const lx = ROAD_LEFT + lane * LANE_W - 2;
    for (let y = -DASH_H; y < GAME_H + DASH_H; y += DASH_CYCLE) {
      const oy = (y + bgAnimOffset) % (GAME_H + DASH_H) - DASH_H;
      ctx.fillRect(lx, oy, 4, DASH_H);
    }
  }
  requestAnimationFrame(animateBg);
}

// ─────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────
bestScoreStart.textContent = 'BEST SCORE: ' + formatScore(bestScore);
// Provide a dummy player reference so HUD won't crash before first game
createPlayer();
animateBg();
