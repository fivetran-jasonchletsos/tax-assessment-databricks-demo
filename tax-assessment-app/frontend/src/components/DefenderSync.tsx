/* ============================================================
 * DefenderSync — hidden mini Defender. Trigger: Konami code.
 *
 * Theme: "Kelly K defends Fivetran". Player ship is the Fivetran
 * icon (three diagonal blue bars). Enemies (PSA APPEAL / BAD PARCEL /
 * STALE ASSMT) try to abduct "PARCEL" rows from the ground and
 * escape upward. Player flies the wrapping world, shoots them down,
 * and catches falling parcels. Mini radar across the top.
 *
 * Loss copy: "PSA needs to regroup." (Allegheny County Office of
 * Property Sales Assessment — the implied antagonist).
 * ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';

const CANVAS_W = 720;
const CANVAS_H = 540;
const WORLD_W = CANVAS_W * 4; // wide horizontal wrap
const RADAR_H = 56;
const GROUND_Y = CANVAS_H - 52;
const PLAY_TOP = RADAR_H + 8;

const NUM_HUMANOIDS = 8;
const ENEMY_LABELS = ['PSA APPEAL', 'BAD PARCEL', 'STALE ASSMT'];

const PLAYER_SPEED_X = 5;
const PLAYER_SPEED_Y = 3.2;
const BULLET_SPEED = 11;
const ENEMY_SPEED = 1.4;
const ENEMY_CARRY_SPEED = 1.0;
const FALL_SPEED = 2.0;

const HS_KEY = 'defender-sync:high-score';

// Allegheny / Sheetz palette — sky-blue primary scale + tax accents.
const COLOR_BG = '#0c1a26';            // deep navy, evokes county-tax institutional
const COLOR_PANEL = '#0f2233';
const COLOR_PRIMARY = '#0284c7';        // primary-600
const COLOR_PRIMARY_LIGHT = '#38bdf8';  // primary-400
const COLOR_PRIMARY_GLOW = '#7dd3fc';   // primary-300
const COLOR_INK = '#e0f2fe';            // primary-100
const COLOR_MUTED = '#7d99b0';
const COLOR_RISING = '#b91c1c';         // bad-direction red (matches dashboard)
const COLOR_FALLING = '#047857';        // good-direction green (matches dashboard)
const COLOR_AMBER = '#d97706';

type Facing = 'left' | 'right';

interface Bullet { x: number; y: number; vx: number; }
interface Humanoid {
  id: number;
  x: number;
  y: number;
  state: 'ground' | 'carried' | 'falling' | 'rescued' | 'lost';
  carrier?: Enemy;
}
interface Enemy {
  id: number;
  x: number; y: number;
  vy: number;
  target: Humanoid | null;
  carrying: Humanoid | null;
  label: string;
  alive: boolean;
}

export default function DefenderSync({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const stateRef = useRef<GameState>(initialState());
  const [, setTick] = useState(0);
  const [phase, setPhase] = useState<'playing' | 'won' | 'lost'>('playing');
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [highScore, setHighScore] = useState(() => {
    try { return parseInt(localStorage.getItem(HS_KEY) || '0', 10) || 0; } catch { return 0; }
  });

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if ([' ', 'arrowleft', 'arrowright', 'arrowup', 'arrowdown', 'a', 'd', 'w', 's', 'p', 'escape'].includes(k)) {
        e.preventDefault();
      }
      if (k === 'escape') { onClose(); return; }
      if (k === 'p') { stateRef.current.paused = !stateRef.current.paused; return; }
      keysRef.current[k] = true;
    };
    const onUp = (e: KeyboardEvent) => { keysRef.current[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [onClose]);

  useEffect(() => {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(40, now - last) / 16.67;
      last = now;
      const s = stateRef.current;
      step(s, keysRef.current, dt, {
        onScore: (n) => { s.score += n; setScore(s.score); },
        onLife: () => {
          s.lives -= 1;
          setLives(s.lives);
          s.invulnerableUntil = performance.now() + 1800;
          if (s.lives <= 0) {
            s.phase = 'lost';
            setPhase('lost');
            persistHigh(s.score);
          }
        },
        onWin: () => {
          s.phase = 'won';
          setPhase('won');
          persistHigh(s.score);
        },
      });
      draw(canvasRef.current, s);
      setTick((t) => t + 1);
      if (s.phase === 'playing') rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [phase]);

  const persistHigh = (s: number) => {
    setHighScore((prev) => {
      const next = Math.max(prev, s);
      try { localStorage.setItem(HS_KEY, String(next)); } catch {}
      return next;
    });
  };

  const restart = useCallback(() => {
    stateRef.current = initialState();
    setScore(0); setLives(3); setPhase('playing');
  }, []);

  const setKey = (k: string, v: boolean) => { keysRef.current[k] = v; };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(8, 16, 26, 0.92)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{
        background: COLOR_BG,
        border: `1px solid ${COLOR_PRIMARY}55`,
        borderRadius: 10,
        boxShadow: `0 0 80px ${COLOR_PRIMARY}55`,
        padding: 16,
        maxWidth: CANVAS_W + 32,
        width: '100%',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 10, color: COLOR_PRIMARY_LIGHT, letterSpacing: '0.25em', textTransform: 'uppercase', fontWeight: 700 }}>
              {'>'} Easter Egg · Konami unlocked
            </div>
            <div style={{ fontFamily: 'ui-serif, Georgia, serif', fontWeight: 600, fontSize: 26, color: COLOR_INK, letterSpacing: '-0.01em' }}>
              Kelly K defends <span style={{ color: COLOR_PRIMARY_LIGHT }}>Fivetran</span>
            </div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: COLOR_MUTED, marginTop: 2 }}>
              The PSA is filing appeals against your pipeline. Hold the line.
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: `1px solid ${COLOR_MUTED}`, color: COLOR_INK,
            padding: '6px 12px', borderRadius: 5, cursor: 'pointer', fontFamily: 'monospace', fontSize: 11, fontWeight: 700, letterSpacing: 1.5,
          }}>ESC</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 10 }}>
          <Stat label="PARCELS" value={String(score)} accent={COLOR_PRIMARY_LIGHT} />
          <Stat label="HIGH" value={String(highScore)} accent={COLOR_PRIMARY_GLOW} />
          <Stat label="ON ROLLS" value={String(stateRef.current.humanoids.filter((h) => h.state !== 'lost').length)} accent={COLOR_AMBER} />
          <Stat label="LIVES" value={'+'.repeat(Math.max(0, lives)).padEnd(3, '-')} accent={lives <= 1 ? COLOR_RISING : COLOR_FALLING} />
        </div>

        <div style={{ position: 'relative', background: '#000', borderRadius: 5, overflow: 'hidden', border: `1px solid ${COLOR_PRIMARY}40` }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            style={{ display: 'block', width: '100%', maxHeight: '72vh', imageRendering: 'pixelated' }}
          />
          {phase === 'won' && <Overlay tone="win" title="PIPELINE SECURED" subtitle={`Every parcel reconciled. Final score: ${score}.`} action="Run again" onAction={restart} />}
          {phase === 'lost' && <Overlay tone="lose" title="PSA needs to regroup." subtitle={`The appeals board got the better of you. Score: ${score}.`} action="Try again" onAction={restart} />}
        </div>

        <div className="ds-touch" style={{ display: 'none', marginTop: 10, gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          <TouchBtn label="<" onDown={() => setKey('arrowleft', true)} onUp={() => setKey('arrowleft', false)} />
          <TouchBtn label="^" onDown={() => setKey('arrowup', true)} onUp={() => setKey('arrowup', false)} />
          <TouchBtn label="v" onDown={() => setKey('arrowdown', true)} onUp={() => setKey('arrowdown', false)} />
          <TouchBtn label=">" onDown={() => setKey('arrowright', true)} onUp={() => setKey('arrowright', false)} />
          <TouchBtn label="FIRE" onDown={() => setKey(' ', true)} onUp={() => setKey(' ', false)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontFamily: 'monospace', fontSize: 10, color: COLOR_MUTED }}>
          <span>arrows fly · SPACE fire · P pause · ESC exit</span>
          <span style={{ color: COLOR_PRIMARY }}>v1 · rescue every parcel</span>
        </div>

        <style>{`
          @media (hover: none) and (pointer: coarse) {
            .ds-touch { display: grid !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: COLOR_PANEL, border: `1px solid ${COLOR_PRIMARY}30`, padding: '6px 8px', borderRadius: 5, fontFamily: 'monospace' }}>
      <div style={{ color: COLOR_MUTED, fontSize: 9, letterSpacing: '0.15em', fontWeight: 700 }}>{label}</div>
      <div style={{ color: accent, fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>{value}</div>
    </div>
  );
}

function Overlay({ tone, title, subtitle, action, onAction }: { tone: 'win' | 'lose'; title: string; subtitle: string; action: string; onAction: () => void }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(8,16,26,0.9)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: 20, textAlign: 'center',
    }}>
      <div style={{
        fontFamily: 'ui-serif, Georgia, serif', fontSize: 36,
        color: tone === 'win' ? COLOR_FALLING : COLOR_RISING,
        textShadow: tone === 'win' ? `0 0 24px ${COLOR_FALLING}99` : `0 0 24px ${COLOR_RISING}99`,
        letterSpacing: '-0.01em',
      }}>{title}</div>
      <div style={{ fontFamily: 'monospace', color: COLOR_INK, fontSize: 13 }}>{subtitle}</div>
      <button onClick={onAction} style={{
        marginTop: 8,
        background: tone === 'win' ? COLOR_FALLING : COLOR_PRIMARY,
        color: '#fff', fontWeight: 800, fontFamily: 'monospace',
        padding: '10px 18px', borderRadius: 5, border: 'none', cursor: 'pointer',
        letterSpacing: '0.12em', textTransform: 'uppercase',
      }}>{action}</button>
    </div>
  );
}

function TouchBtn({ label, onDown, onUp }: { label: string; onDown: () => void; onUp: () => void }) {
  return (
    <button
      onPointerDown={onDown}
      onPointerUp={onUp}
      onPointerLeave={onUp}
      style={{
        background: COLOR_PANEL, border: `1px solid ${COLOR_PRIMARY}55`, color: COLOR_INK,
        padding: '14px 0', borderRadius: 5, fontFamily: 'monospace', fontWeight: 800, fontSize: 16,
        touchAction: 'manipulation', userSelect: 'none',
      }}
    >{label}</button>
  );
}

// =============================================================
// Game state
// =============================================================

interface GameState {
  playerX: number;
  playerY: number;
  facing: Facing;
  cameraX: number;
  bullets: Bullet[];
  humanoids: Humanoid[];
  enemies: Enemy[];
  cooldownFrames: number;
  enemySpawnTimer: number;
  enemyIdSeq: number;
  score: number;
  lives: number;
  phase: 'playing' | 'won' | 'lost';
  paused: boolean;
  invulnerableUntil: number;
  startedAt: number;
  duration: number;
  mountainSeed: number;
}

function initialState(): GameState {
  const humanoids: Humanoid[] = [];
  const rng = mulberry32(7);
  for (let i = 0; i < NUM_HUMANOIDS; i++) {
    humanoids.push({
      id: i,
      x: (i + 0.5) * (WORLD_W / NUM_HUMANOIDS) + (rng() - 0.5) * 40,
      y: GROUND_Y - 8,
      state: 'ground',
    });
  }
  return {
    playerX: CANVAS_W / 2,
    playerY: (PLAY_TOP + GROUND_Y) / 2,
    facing: 'right',
    cameraX: 0,
    bullets: [],
    humanoids,
    enemies: [],
    cooldownFrames: 0,
    enemySpawnTimer: 60,
    enemyIdSeq: 0,
    score: 0,
    lives: 3,
    phase: 'playing',
    paused: false,
    invulnerableUntil: performance.now() + 1500,
    startedAt: performance.now(),
    duration: 75_000,
    mountainSeed: 13,
  };
}

function step(
  s: GameState,
  keys: Record<string, boolean>,
  dt: number,
  cb: { onScore: (n: number) => void; onLife: () => void; onWin: () => void },
) {
  if (s.phase !== 'playing' || s.paused) return;

  const left = keys['arrowleft'] || keys['a'];
  const right = keys['arrowright'] || keys['d'];
  const up = keys['arrowup'] || keys['w'];
  const down = keys['arrowdown'] || keys['s'];
  if (left)  { s.playerX -= PLAYER_SPEED_X * dt; s.facing = 'left'; }
  if (right) { s.playerX += PLAYER_SPEED_X * dt; s.facing = 'right'; }
  if (up)    s.playerY -= PLAYER_SPEED_Y * dt;
  if (down)  s.playerY += PLAYER_SPEED_Y * dt;
  s.playerY = Math.max(PLAY_TOP + 12, Math.min(GROUND_Y - 18, s.playerY));
  s.playerX = ((s.playerX % WORLD_W) + WORLD_W) % WORLD_W;

  const lead = s.facing === 'right' ? 100 : -100;
  s.cameraX = (s.playerX - CANVAS_W / 2 + lead + WORLD_W) % WORLD_W;

  if (keys[' '] && s.cooldownFrames <= 0) {
    s.bullets.push({
      x: s.playerX + (s.facing === 'right' ? 18 : -18),
      y: s.playerY,
      vx: s.facing === 'right' ? BULLET_SPEED : -BULLET_SPEED,
    });
    s.cooldownFrames = 7;
  }
  s.cooldownFrames -= dt;

  for (const b of s.bullets) {
    b.x = ((b.x + b.vx * dt) % WORLD_W + WORLD_W) % WORLD_W;
  }
  while (s.bullets.length > 18) s.bullets.shift();

  s.enemySpawnTimer -= dt;
  const aliveCount = s.enemies.filter((e) => e.alive).length;
  if (s.enemySpawnTimer <= 0 && aliveCount < 6) {
    spawnEnemy(s);
    s.enemySpawnTimer = 90 + Math.random() * 80 - Math.min(40, aliveCount * 10);
  }

  for (const e of s.enemies) {
    if (!e.alive) continue;
    if (e.carrying) {
      e.y -= ENEMY_CARRY_SPEED * dt;
      e.carrying.x = e.x;
      e.carrying.y = e.y + 14;
      if (e.y <= PLAY_TOP - 4) {
        e.carrying.state = 'lost';
        e.carrying = null;
        e.alive = false;
      }
    } else {
      if (!e.target || e.target.state !== 'ground') {
        const ground = s.humanoids.filter((h) => h.state === 'ground');
        e.target = ground.length ? closest(ground, e.x) : null;
      }
      const target = e.target;
      if (target) {
        const dx = wrapDelta(target.x - e.x);
        const dy = target.y - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        e.x += (dx / dist) * ENEMY_SPEED * dt;
        e.y += (dy / dist) * ENEMY_SPEED * dt + e.vy * dt;
        e.x = ((e.x % WORLD_W) + WORLD_W) % WORLD_W;
        if (Math.hypot(dx, dy) < 18) {
          target.state = 'carried';
          target.carrier = e;
          e.carrying = target;
        }
      } else {
        const dx = wrapDelta(s.playerX - e.x);
        const dy = s.playerY - e.y;
        const dist = Math.hypot(dx, dy) || 1;
        e.x += (dx / dist) * ENEMY_SPEED * 0.8 * dt;
        e.y += (dy / dist) * ENEMY_SPEED * 0.8 * dt;
        e.x = ((e.x % WORLD_W) + WORLD_W) % WORLD_W;
      }
    }
  }

  for (const h of s.humanoids) {
    if (h.state === 'falling') {
      h.y += FALL_SPEED * dt;
      if (h.y >= GROUND_Y - 8) {
        h.y = GROUND_Y - 8;
        h.state = 'ground';
      }
    }
  }

  for (const h of s.humanoids) {
    if (h.state !== 'falling') continue;
    const dx = Math.abs(wrapDelta(h.x - s.playerX));
    const dy = Math.abs(h.y - s.playerY);
    if (dx < 18 && dy < 14) {
      h.state = 'rescued';
      cb.onScore(100);
      setTimeout(() => { if (h.state === 'rescued') { h.state = 'ground'; h.y = GROUND_Y - 8; } }, 600);
    }
  }

  for (const b of s.bullets) {
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const dx = Math.abs(wrapDelta(b.x - e.x));
      const dy = Math.abs(b.y - e.y);
      if (dx < 16 && dy < 14) {
        e.alive = false;
        b.x = -9999;
        if (e.carrying) {
          e.carrying.state = 'falling';
          e.carrying.carrier = undefined;
          e.carrying = null;
          cb.onScore(120);
        } else {
          cb.onScore(50);
        }
        break;
      }
    }
  }

  const invuln = performance.now() < s.invulnerableUntil;
  if (!invuln) {
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const dx = Math.abs(wrapDelta(e.x - s.playerX));
      const dy = Math.abs(e.y - s.playerY);
      if (dx < 16 && dy < 14) {
        e.alive = false;
        if (e.carrying) {
          e.carrying.state = 'falling';
          e.carrying.carrier = undefined;
          e.carrying = null;
        }
        cb.onLife();
        return;
      }
    }
  }

  const allLost = s.humanoids.every((h) => h.state === 'lost');
  if (allLost) {
    cb.onLife();
    if (s.lives > 0) {
      for (let i = 0; i < s.humanoids.length; i++) {
        const h = s.humanoids[i];
        if (h.state === 'lost') {
          h.state = 'ground';
          h.x = (i + 0.5) * (WORLD_W / NUM_HUMANOIDS);
          h.y = GROUND_Y - 8;
        }
      }
    }
    return;
  }

  if (performance.now() - s.startedAt >= s.duration) {
    cb.onScore(500 + s.humanoids.filter((h) => h.state !== 'lost').length * 50);
    cb.onWin();
  }

  s.enemies = s.enemies.filter((e) => e.alive || e.carrying);
  s.bullets = s.bullets.filter((b) => b.x > -100);
}

function spawnEnemy(s: GameState) {
  const fromLeft = Math.random() < 0.5;
  const offset = CANVAS_W * 0.6 + Math.random() * CANVAS_W * 0.4;
  const ex = ((s.cameraX + (fromLeft ? -offset : CANVAS_W + offset)) % WORLD_W + WORLD_W) % WORLD_W;
  const ey = PLAY_TOP + 20 + Math.random() * 80;
  s.enemies.push({
    id: ++s.enemyIdSeq,
    x: ex, y: ey,
    vy: (Math.random() - 0.5) * 0.6,
    target: null,
    carrying: null,
    label: ENEMY_LABELS[Math.floor(Math.random() * ENEMY_LABELS.length)],
    alive: true,
  });
}

function closest(items: Humanoid[], x: number): Humanoid {
  let best = items[0];
  let bestDist = Math.abs(wrapDelta(items[0].x - x));
  for (let i = 1; i < items.length; i++) {
    const d = Math.abs(wrapDelta(items[i].x - x));
    if (d < bestDist) { best = items[i]; bestDist = d; }
  }
  return best;
}

function wrapDelta(d: number) {
  let v = d % WORLD_W;
  if (v > WORLD_W / 2) v -= WORLD_W;
  if (v < -WORLD_W / 2) v += WORLD_W;
  return v;
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

// =============================================================
// Rendering
// =============================================================

function worldToScreen(worldX: number, cameraX: number): number | null {
  const dx = wrapDelta(worldX - cameraX);
  if (dx > 0 && dx < CANVAS_W) return dx;
  if (dx >= -40 && dx <= CANVAS_W + 40) return dx;
  return null;
}

function draw(canvas: HTMLCanvasElement | null, s: GameState) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.fillStyle = '#04111c';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = `${COLOR_INK}80`;
  for (let i = 0; i < 80; i++) {
    const wx = (i * 71 + Math.floor(s.cameraX * 0.3)) % WORLD_W;
    const sx = wrapDelta(wx - s.cameraX);
    if (sx < 0 || sx > CANVAS_W) continue;
    const y = (i * 37) % (CANVAS_H - GROUND_Y + 200) + PLAY_TOP;
    ctx.fillRect(sx, y, 1, 1);
  }

  ctx.strokeStyle = `${COLOR_PRIMARY_LIGHT}10`;
  for (let y = PLAY_TOP; y < GROUND_Y; y += 18) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(CANVAS_W, y); ctx.stroke();
  }

  drawRadar(ctx, s);
  drawMountains(ctx, s);

  ctx.fillStyle = '#0a1a26';
  ctx.fillRect(0, GROUND_Y, CANVAS_W, CANVAS_H - GROUND_Y);
  ctx.strokeStyle = COLOR_PRIMARY;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, GROUND_Y); ctx.lineTo(CANVAS_W, GROUND_Y); ctx.stroke();

  for (const h of s.humanoids) {
    if (h.state === 'lost') continue;
    const sx = worldToScreen(h.x, s.cameraX);
    if (sx === null) continue;
    if (h.state === 'carried' || h.state === 'falling') {
      drawHumanoid(ctx, sx, h.y, h.state === 'falling');
    } else {
      drawHumanoid(ctx, sx, GROUND_Y - 8, false);
    }
  }

  for (const e of s.enemies) {
    if (!e.alive) continue;
    const sx = worldToScreen(e.x, s.cameraX);
    if (sx === null) continue;
    drawEnemy(ctx, sx, e.y, e.label, !!e.carrying);
  }

  ctx.fillStyle = COLOR_PRIMARY_GLOW;
  for (const b of s.bullets) {
    const sx = worldToScreen(b.x, s.cameraX);
    if (sx === null) continue;
    ctx.fillRect(sx - 5, b.y - 1, 10, 2);
    ctx.fillStyle = `${COLOR_PRIMARY_GLOW}60`;
    ctx.fillRect(sx - 9, b.y - 2, 18, 4);
    ctx.fillStyle = COLOR_PRIMARY_GLOW;
  }

  const blink = performance.now() < s.invulnerableUntil;
  if (!blink || Math.floor(performance.now() / 100) % 2 === 0) {
    const psx = worldToScreen(s.playerX, s.cameraX);
    if (psx !== null) drawFivetranShip(ctx, psx, s.playerY, s.facing);
  }

  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, CANVAS_H - 22, CANVAS_W, 22);
  ctx.strokeStyle = `${COLOR_PRIMARY}80`;
  ctx.beginPath(); ctx.moveTo(0, CANVAS_H - 22); ctx.lineTo(CANVAS_W, CANVAS_H - 22); ctx.stroke();
  ctx.fillStyle = COLOR_PRIMARY_LIGHT;
  ctx.font = '700 10px ui-monospace, Menlo, monospace';
  ctx.fillText('FIVETRAN CONNECTOR · src_parcels -> snowflake · ALLEGHENY CO.', 8, CANVAS_H - 7);

  if (s.paused) {
    ctx.fillStyle = 'rgba(4,17,28,0.7)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.fillStyle = COLOR_PRIMARY_LIGHT;
    ctx.font = '800 28px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', CANVAS_W / 2, CANVAS_H / 2);
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = COLOR_INK;
    ctx.fillText('press P to resume', CANVAS_W / 2, CANVAS_H / 2 + 24);
    ctx.textAlign = 'left';
  }
}

function drawRadar(ctx: CanvasRenderingContext2D, s: GameState) {
  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, CANVAS_W, RADAR_H);
  ctx.strokeStyle = `${COLOR_PRIMARY_LIGHT}66`;
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 6, CANVAS_W - 16, RADAR_H - 12);
  ctx.fillStyle = COLOR_PRIMARY_LIGHT;
  ctx.font = '700 9px ui-monospace, Menlo, monospace';
  ctx.fillText('COUNTY GRID · LONG-RANGE SCAN', 12, 18);
  const radarLeft = 8, radarRight = CANVAS_W - 8, radarTop = 22, radarBot = RADAR_H - 8;
  const radarW = radarRight - radarLeft;
  const radarH = radarBot - radarTop;
  const px = radarLeft + (s.playerX / WORLD_W) * radarW;
  const py = radarTop + ((s.playerY - PLAY_TOP) / (GROUND_Y - PLAY_TOP)) * radarH;
  const camLeft = radarLeft + (s.cameraX / WORLD_W) * radarW;
  const camRight = radarLeft + (((s.cameraX + CANVAS_W) % WORLD_W) / WORLD_W) * radarW;
  ctx.strokeStyle = `${COLOR_PRIMARY}99`;
  if (camRight > camLeft) {
    ctx.strokeRect(camLeft, radarTop, camRight - camLeft, radarH);
  } else {
    ctx.strokeRect(camLeft, radarTop, radarRight - camLeft, radarH);
    ctx.strokeRect(radarLeft, radarTop, camRight - radarLeft, radarH);
  }
  ctx.fillStyle = COLOR_INK;
  for (const h of s.humanoids) {
    if (h.state === 'lost') continue;
    const hx = radarLeft + (h.x / WORLD_W) * radarW;
    ctx.fillRect(hx - 1, radarBot - 3, 2, 3);
  }
  ctx.fillStyle = COLOR_RISING;
  for (const e of s.enemies) {
    if (!e.alive) continue;
    const ex = radarLeft + (e.x / WORLD_W) * radarW;
    const ey = radarTop + ((e.y - PLAY_TOP) / (GROUND_Y - PLAY_TOP)) * radarH;
    ctx.fillRect(ex - 1, ey - 1, 2, 2);
  }
  ctx.fillStyle = COLOR_PRIMARY_LIGHT;
  ctx.fillRect(px - 2, py - 2, 4, 4);
}

function drawMountains(ctx: CanvasRenderingContext2D, s: GameState) {
  // Faux Pittsburgh skyline ridge — silhouette across the bottom of the playfield.
  ctx.fillStyle = `${COLOR_PRIMARY}18`;
  ctx.strokeStyle = `${COLOR_PRIMARY_LIGHT}55`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);
  for (let x = 0; x <= CANVAS_W; x += 16) {
    const wx = (s.cameraX + x) % WORLD_W;
    const h = 12 + Math.abs(Math.sin(wx * 0.013 + s.mountainSeed)) * 22 + Math.abs(Math.sin(wx * 0.041)) * 12;
    ctx.lineTo(x, GROUND_Y - h);
  }
  ctx.lineTo(CANVAS_W, GROUND_Y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

function drawHumanoid(ctx: CanvasRenderingContext2D, x: number, y: number, falling: boolean) {
  // "PARCEL" — a tiny lot tile with a flag staked into it.
  ctx.fillStyle = falling ? COLOR_AMBER : COLOR_INK;
  ctx.fillRect(x - 5, y - 4, 10, 8);
  ctx.fillStyle = COLOR_BG;
  ctx.font = '700 6px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LOT', x, y + 1);
  ctx.textAlign = 'left';
  ctx.strokeStyle = falling ? COLOR_AMBER : COLOR_INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y - 4); ctx.lineTo(x, y - 8);
  ctx.stroke();
}

function drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, carrying: boolean) {
  // "PSA APPEAL" — a stamped-document diamond with a red seal.
  ctx.fillStyle = carrying ? COLOR_AMBER : COLOR_RISING;
  ctx.beginPath();
  ctx.moveTo(x, y - 10);
  ctx.lineTo(x + 11, y);
  ctx.lineTo(x, y + 10);
  ctx.lineTo(x - 11, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = carrying ? COLOR_BG : COLOR_INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x - 6, y - 3); ctx.lineTo(x + 6, y + 3);
  ctx.stroke();
  ctx.fillStyle = carrying ? COLOR_BG : COLOR_RISING;
  ctx.font = '700 7px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y + 18);
  ctx.textAlign = 'left';
}

function drawFivetranShip(ctx: CanvasRenderingContext2D, x: number, y: number, facing: Facing) {
  // Three diagonal Fivetran-blue bars; flipped horizontally based on facing.
  const flip = facing === 'left' ? -1 : 1;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(flip, 1);

  const drawBar = (offsetX: number, color: string) => {
    ctx.save();
    ctx.translate(offsetX, 0);
    ctx.rotate(0.45);
    ctx.fillStyle = color;
    ctx.fillRect(-2.5, -10, 5, 20);
    ctx.restore();
  };
  drawBar(-10, COLOR_PRIMARY);
  drawBar(-2,  COLOR_PRIMARY_LIGHT);
  drawBar( 6,  COLOR_PRIMARY);

  const t = performance.now() / 70;
  const flame = 4 + Math.sin(t) * 2.5;
  ctx.fillStyle = `${COLOR_PRIMARY_GLOW}d9`;
  ctx.fillRect(-18, -2, -flame, 4);

  ctx.fillStyle = COLOR_PRIMARY_GLOW;
  ctx.beginPath();
  ctx.arc(8, -2, 1.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
