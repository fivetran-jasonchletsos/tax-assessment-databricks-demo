/* ============================================================
 * SpaceSync — hidden mini Space Invaders. Type "fivetran" anywhere
 * in the app to launch. Player: Fivetran ship. Enemies: bad data.
 *
 * Self-contained: canvas-based, no assets, no deps beyond React.
 * Sprites are drawn programmatically.
 * ============================================================ */
import { useCallback, useEffect, useRef, useState } from 'react';

const GAME_W = 480;
const GAME_H = 620;
const COLS = 8;
const ROWS = 4;
const ENEMY_W = 42;
const ENEMY_H = 30;
const ENEMY_GAP_X = 12;
const ENEMY_GAP_Y = 18;
const PLAYER_W = 44;
const PLAYER_H = 24;
const BULLET_W = 4;
const BULLET_H = 12;
const PLAYER_SPEED = 5.5;
const BULLET_SPEED = 8;
const ENEMY_BULLET_SPEED = 3.5;

const ENEMY_LABELS = ['NULL', 'DUPE', 'STALE', 'DRIFT', 'SCHEMA', '500', 'TIMEOUT', 'LATE'];

const HIGH_SCORE_KEY = 'space-sync:high-score';

interface Enemy {
  x: number;
  y: number;
  alive: boolean;
  label: string;
  hue: number; // for slight color variation
}
interface Bullet {
  x: number;
  y: number;
  vy: number;
  fromEnemy: boolean;
}

type Phase = 'playing' | 'won' | 'lost';

export default function SpaceSync({ onClose }: { onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const keysRef = useRef<Record<string, boolean>>({});
  const stateRef = useRef<GameState>(initialState());
  const [, setTick] = useState(0);
  const [phase, setPhase] = useState<Phase>('playing');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    try { return parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10) || 0; } catch { return 0; }
  });
  const [wave, setWave] = useState(1);
  const [lives, setLives] = useState(3);

  // Keyboard
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      // Only swallow keys relevant to the game
      const key = e.key.toLowerCase();
      if ([' ', 'arrowleft', 'arrowright', 'a', 'd', 'p', 'escape'].includes(key)) {
        e.preventDefault();
      }
      if (key === 'escape') {
        onClose();
        return;
      }
      if (key === 'p') {
        stateRef.current.paused = !stateRef.current.paused;
        return;
      }
      keysRef.current[key] = true;
    };
    const up = (e: KeyboardEvent) => {
      keysRef.current[e.key.toLowerCase()] = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
    };
  }, [onClose]);

  // Touch controls — buttons handle their own onPointerDown/Up
  const setKey = (k: string, v: boolean) => { keysRef.current[k] = v; };

  // Main loop
  useEffect(() => {
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(40, now - last) / 16.67;
      last = now;
      stepGame(stateRef.current, keysRef.current, dt, {
        onWaveClear: () => {
          stateRef.current.wave += 1;
          setWave(stateRef.current.wave);
          stateRef.current.enemies = spawnEnemies(stateRef.current.wave);
          stateRef.current.enemyDir = 1;
        },
        onPlayerHit: () => {
          stateRef.current.lives -= 1;
          setLives(stateRef.current.lives);
          stateRef.current.invulnerableUntil = performance.now() + 1500;
          if (stateRef.current.lives <= 0) {
            stateRef.current.phase = 'lost';
            setPhase('lost');
            persistHighScore(stateRef.current.score);
          }
        },
        onScore: (delta) => {
          stateRef.current.score += delta;
          setScore(stateRef.current.score);
        },
      });
      if (stateRef.current.enemies.every((e) => !e.alive)) {
        // bumped via onWaveClear; check if max wave reached
        if (stateRef.current.wave >= 5 && stateRef.current.phase === 'playing') {
          stateRef.current.phase = 'won';
          setPhase('won');
          persistHighScore(stateRef.current.score);
        }
      }
      draw(canvasRef.current, stateRef.current);
      setTick((t) => t + 1);
      if (stateRef.current.phase === 'playing' && !stateRef.current.paused) {
        rafRef.current = requestAnimationFrame(loop);
      } else if (stateRef.current.paused) {
        rafRef.current = requestAnimationFrame(loop); // still draw for pause overlay
      }
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const persistHighScore = (s: number) => {
    setHighScore((prev) => {
      const next = Math.max(prev, s);
      try { localStorage.setItem(HIGH_SCORE_KEY, String(next)); } catch {}
      return next;
    });
  };

  const restart = useCallback(() => {
    stateRef.current = initialState();
    setScore(0);
    setWave(1);
    setLives(3);
    setPhase('playing');
    // restart loop
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(40, now - last) / 16.67;
      last = now;
      stepGame(stateRef.current, keysRef.current, dt, {
        onWaveClear: () => {
          stateRef.current.wave += 1;
          setWave(stateRef.current.wave);
          stateRef.current.enemies = spawnEnemies(stateRef.current.wave);
          stateRef.current.enemyDir = 1;
        },
        onPlayerHit: () => {
          stateRef.current.lives -= 1;
          setLives(stateRef.current.lives);
          stateRef.current.invulnerableUntil = performance.now() + 1500;
          if (stateRef.current.lives <= 0) {
            stateRef.current.phase = 'lost';
            setPhase('lost');
            persistHighScore(stateRef.current.score);
          }
        },
        onScore: (delta) => {
          stateRef.current.score += delta;
          setScore(stateRef.current.score);
        },
      });
      draw(canvasRef.current, stateRef.current);
      setTick((t) => t + 1);
      if (stateRef.current.phase === 'playing') {
        rafRef.current = requestAnimationFrame(loop);
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(2, 6, 23, 0.88)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px',
      }}
    >
      <div
        style={{
          background: '#020617',
          border: '1px solid rgba(99,102,241,0.3)',
          borderRadius: 12,
          boxShadow: '0 0 80px rgba(37, 99, 235, 0.35), inset 0 0 0 1px rgba(255,255,255,0.04)',
          padding: '16px',
          maxWidth: GAME_W + 32,
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#60a5fa', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
              ▶ Easter Egg
            </div>
            <div style={{ fontFamily: 'monospace', fontWeight: 800, fontSize: 22, color: '#e2e8f0', letterSpacing: '0.05em' }}>
              SPACE<span style={{ color: '#3b82f6' }}>SYNC</span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'transparent', border: '1px solid rgba(148,163,184,0.3)', color: '#94a3b8',
              padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontFamily: 'monospace', fontSize: 12,
            }}
          >
            ESC
          </button>
        </div>

        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6,
          marginBottom: 10, fontFamily: 'monospace', fontSize: 11,
        }}>
          <Stat label="ROWS" value={String(score)} accent="#3b82f6" />
          <Stat label="HIGH" value={String(highScore)} accent="#22d3ee" />
          <Stat label="WAVE" value={`${wave}/5`} accent="#f59e0b" />
          <Stat label="RETRY" value={'■'.repeat(Math.max(0, lives)).padEnd(3, '·')} accent={lives <= 1 ? '#ef4444' : '#22c55e'} />
        </div>

        <div style={{ position: 'relative', background: '#000', borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(99,102,241,0.2)' }}>
          <canvas
            ref={canvasRef}
            width={GAME_W}
            height={GAME_H}
            style={{ display: 'block', width: '100%', maxHeight: '70vh', imageRendering: 'pixelated' }}
          />
          {phase === 'won' && (
            <Overlay tone="win" title="SYNC COMPLETE" subtitle={`All sources clean. Final: ${score} rows`} action="Run again" onAction={restart} />
          )}
          {phase === 'lost' && (
            <Overlay tone="lose" title="CONNECTOR PAUSED" subtitle={`Schema drift caught up. Synced ${score} rows.`} action="Resume sync" onAction={restart} />
          )}
        </div>

        {/* Touch controls — hidden on desktop */}
        <div className="ss-touch" style={{ display: 'none', marginTop: 10, gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          <TouchBtn label="◀" onDown={() => setKey('arrowleft', true)} onUp={() => setKey('arrowleft', false)} />
          <TouchBtn label="FIRE" onDown={() => setKey(' ', true)} onUp={() => setKey(' ', false)} />
          <TouchBtn label="▶" onDown={() => setKey('arrowright', true)} onUp={() => setKey('arrowright', false)} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontFamily: 'monospace', fontSize: 10, color: '#64748b' }}>
          <span>← → / A D — move · SPACE — fire · P — pause · ESC — exit</span>
          <span style={{ color: '#475569' }}>v1 · zero downtime sync</span>
        </div>

        <style>{`
          @media (hover: none) and (pointer: coarse) {
            .ss-touch { display: grid !important; }
          }
        `}</style>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: '#0f172a', border: '1px solid rgba(99,102,241,0.15)', padding: '6px 8px', borderRadius: 6 }}>
      <div style={{ color: '#475569', fontSize: 9, letterSpacing: '0.15em', fontWeight: 700 }}>{label}</div>
      <div style={{ color: accent, fontSize: 16, fontWeight: 800, letterSpacing: 1 }}>{value}</div>
    </div>
  );
}

function Overlay({ tone, title, subtitle, action, onAction }: { tone: 'win' | 'lose'; title: string; subtitle: string; action: string; onAction: () => void }) {
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: 'rgba(2,6,23,0.85)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: 12, padding: 20, textAlign: 'center',
    }}>
      <div style={{
        fontFamily: 'monospace', fontWeight: 800, fontSize: 28, letterSpacing: '0.08em',
        color: tone === 'win' ? '#22c55e' : '#ef4444',
        textShadow: tone === 'win' ? '0 0 20px rgba(34,197,94,0.5)' : '0 0 20px rgba(239,68,68,0.5)',
      }}>
        {title}
      </div>
      <div style={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: 13 }}>{subtitle}</div>
      <button
        onClick={onAction}
        style={{
          marginTop: 8,
          background: tone === 'win' ? '#22c55e' : '#3b82f6',
          color: '#020617', fontWeight: 800, fontFamily: 'monospace',
          padding: '10px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}
      >
        {action}
      </button>
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
        background: '#1e293b', border: '1px solid rgba(99,102,241,0.3)', color: '#e2e8f0',
        padding: '14px 0', borderRadius: 6, fontFamily: 'monospace', fontWeight: 800, fontSize: 18,
        touchAction: 'manipulation', userSelect: 'none',
      }}
    >{label}</button>
  );
}

// ============================================================
// Game state + logic
// ============================================================

interface GameState {
  playerX: number;
  bullets: Bullet[];
  enemies: Enemy[];
  enemyDir: 1 | -1;
  enemyStepCooldown: number;
  enemyShootCooldown: number;
  cooldownFrames: number; // player shoot cooldown
  score: number;
  wave: number;
  lives: number;
  phase: Phase;
  paused: boolean;
  invulnerableUntil: number;
  bonusUfo: { x: number; vx: number; active: boolean } | null;
  ufoCooldown: number;
  stars: { x: number; y: number; speed: number }[];
}

function initialState(): GameState {
  return {
    playerX: GAME_W / 2 - PLAYER_W / 2,
    bullets: [],
    enemies: spawnEnemies(1),
    enemyDir: 1,
    enemyStepCooldown: 0,
    enemyShootCooldown: 90,
    cooldownFrames: 0,
    score: 0,
    wave: 1,
    lives: 3,
    phase: 'playing',
    paused: false,
    invulnerableUntil: 0,
    bonusUfo: null,
    ufoCooldown: 800,
    stars: Array.from({ length: 60 }, () => ({
      x: Math.random() * GAME_W,
      y: Math.random() * GAME_H,
      speed: 0.2 + Math.random() * 0.6,
    })),
  };
}

function spawnEnemies(wave: number): Enemy[] {
  const out: Enemy[] = [];
  const totalW = COLS * ENEMY_W + (COLS - 1) * ENEMY_GAP_X;
  const startX = (GAME_W - totalW) / 2;
  const startY = 50 + (wave - 1) * 6; // each wave starts a touch lower
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      out.push({
        x: startX + c * (ENEMY_W + ENEMY_GAP_X),
        y: startY + r * (ENEMY_H + ENEMY_GAP_Y),
        alive: true,
        label: ENEMY_LABELS[(r * COLS + c) % ENEMY_LABELS.length],
        hue: r * 25,
      });
    }
  }
  return out;
}

function stepGame(
  s: GameState,
  keys: Record<string, boolean>,
  dt: number,
  cb: { onWaveClear: () => void; onPlayerHit: () => void; onScore: (delta: number) => void },
) {
  if (s.phase !== 'playing' || s.paused) return;

  // Stars
  for (const star of s.stars) {
    star.y += star.speed * dt;
    if (star.y > GAME_H) { star.y = 0; star.x = Math.random() * GAME_W; }
  }

  // Player movement
  const left = keys['arrowleft'] || keys['a'];
  const right = keys['arrowright'] || keys['d'];
  if (left) s.playerX -= PLAYER_SPEED * dt;
  if (right) s.playerX += PLAYER_SPEED * dt;
  s.playerX = Math.max(8, Math.min(GAME_W - PLAYER_W - 8, s.playerX));

  // Shoot
  if (keys[' '] && s.cooldownFrames <= 0) {
    s.bullets.push({ x: s.playerX + PLAYER_W / 2 - BULLET_W / 2, y: GAME_H - 70, vy: -BULLET_SPEED, fromEnemy: false });
    s.cooldownFrames = 14;
  }
  s.cooldownFrames -= dt;

  // Bullets
  for (const b of s.bullets) {
    b.y += b.vy * dt;
  }
  s.bullets = s.bullets.filter((b) => b.y > -20 && b.y < GAME_H + 20);

  // Enemy collective movement — pace ties to remaining enemies (classic Invaders accel)
  const aliveCount = s.enemies.filter((e) => e.alive).length;
  if (aliveCount === 0) {
    cb.onWaveClear();
    return;
  }
  s.enemyStepCooldown -= dt;
  const stepEvery = Math.max(4, Math.round(28 - (32 - aliveCount) * 0.6 - s.wave * 1.5));
  if (s.enemyStepCooldown <= 0) {
    s.enemyStepCooldown = stepEvery;
    // Move horizontally
    let touchEdge = false;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      e.x += 4 * s.enemyDir;
      if (e.x < 8 || e.x + ENEMY_W > GAME_W - 8) touchEdge = true;
    }
    if (touchEdge) {
      s.enemyDir = (s.enemyDir === 1 ? -1 : 1) as 1 | -1;
      for (const e of s.enemies) {
        if (e.alive) e.y += 12;
      }
    }
  }

  // Enemy shoots randomly from bottommost columns
  s.enemyShootCooldown -= dt;
  if (s.enemyShootCooldown <= 0) {
    const shooters: Record<number, Enemy> = {};
    for (const e of s.enemies) {
      if (!e.alive) continue;
      const col = Math.round(e.x);
      if (!shooters[col] || e.y > shooters[col].y) shooters[col] = e;
    }
    const list = Object.values(shooters);
    if (list.length > 0) {
      const shooter = list[Math.floor(Math.random() * list.length)];
      s.bullets.push({
        x: shooter.x + ENEMY_W / 2 - BULLET_W / 2,
        y: shooter.y + ENEMY_H,
        vy: ENEMY_BULLET_SPEED,
        fromEnemy: true,
      });
    }
    s.enemyShootCooldown = Math.max(35, 100 - aliveCount * 1.5 - s.wave * 8);
  }

  // Bonus UFO ("Schema Migration") — high-value, rare
  s.ufoCooldown -= dt;
  if (s.ufoCooldown <= 0 && !s.bonusUfo) {
    s.bonusUfo = { x: -40, vx: 2.2, active: true };
    s.ufoCooldown = 800 + Math.random() * 1200;
  }
  if (s.bonusUfo) {
    s.bonusUfo.x += s.bonusUfo.vx * dt;
    if (s.bonusUfo.x > GAME_W + 40) s.bonusUfo = null;
  }

  // Collisions: player bullets vs enemies + UFO
  for (const b of s.bullets) {
    if (b.fromEnemy) continue;
    for (const e of s.enemies) {
      if (!e.alive) continue;
      if (b.x < e.x + ENEMY_W && b.x + BULLET_W > e.x && b.y < e.y + ENEMY_H && b.y + BULLET_H > e.y) {
        e.alive = false;
        b.y = -100; // remove next frame
        cb.onScore(10 + s.wave * 2);
        break;
      }
    }
    if (s.bonusUfo && b.y < 40) {
      if (b.x < s.bonusUfo.x + 40 && b.x + BULLET_W > s.bonusUfo.x && b.y < 30 && b.y + BULLET_H > 12) {
        cb.onScore(150);
        s.bonusUfo = null;
        b.y = -100;
      }
    }
  }

  // Collisions: enemy bullets vs player
  const invuln = performance.now() < s.invulnerableUntil;
  for (const b of s.bullets) {
    if (!b.fromEnemy) continue;
    const py = GAME_H - 50;
    if (!invuln && b.x < s.playerX + PLAYER_W && b.x + BULLET_W > s.playerX && b.y < py + PLAYER_H && b.y + BULLET_H > py) {
      b.y = GAME_H + 100;
      cb.onPlayerHit();
      break;
    }
  }

  // Enemy reaches the bottom = game over
  for (const e of s.enemies) {
    if (e.alive && e.y + ENEMY_H >= GAME_H - 60) {
      s.lives = 0;
      cb.onPlayerHit();
      break;
    }
  }
}

// ============================================================
// Rendering
// ============================================================

function draw(canvas: HTMLCanvasElement | null, s: GameState) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background — dark with subtle vertical scanlines + warp stars
  ctx.fillStyle = '#000010';
  ctx.fillRect(0, 0, GAME_W, GAME_H);
  // Grid scanlines (data-stream feel)
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.05)';
  for (let y = 0; y < GAME_H; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(GAME_W, y);
    ctx.stroke();
  }
  // Stars
  for (const star of s.stars) {
    ctx.fillStyle = `rgba(148, 163, 184, ${0.3 + star.speed * 0.5})`;
    ctx.fillRect(star.x, star.y, 1.5, 1.5);
  }

  // Bonus UFO
  if (s.bonusUfo) drawUfo(ctx, s.bonusUfo.x, 18);

  // Enemies
  for (const e of s.enemies) {
    if (!e.alive) continue;
    drawEnemy(ctx, e);
  }

  // Bullets
  for (const b of s.bullets) {
    if (b.fromEnemy) {
      ctx.fillStyle = '#fb7185';
      ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H);
      ctx.fillStyle = 'rgba(251,113,133,0.4)';
      ctx.fillRect(b.x - 1, b.y - 2, BULLET_W + 2, BULLET_H + 4);
    } else {
      ctx.fillStyle = '#22d3ee';
      ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H);
      ctx.fillStyle = 'rgba(34,211,238,0.5)';
      ctx.fillRect(b.x - 1, b.y - 2, BULLET_W + 2, BULLET_H + 6);
    }
  }

  // Player (Fivetran ship)
  const py = GAME_H - 50;
  const blink = performance.now() < s.invulnerableUntil;
  if (!blink || Math.floor(performance.now() / 100) % 2 === 0) {
    drawPlayerShip(ctx, s.playerX, py);
  }

  // Ground line — like a connector status bar
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, GAME_H - 18, GAME_W, 2);
  ctx.fillStyle = '#3b82f6';
  // pulsing connector "sync" indicator
  const t = performance.now() / 400;
  ctx.fillRect(8, GAME_H - 12, 4 + Math.sin(t) * 2, 4);
  ctx.fillStyle = '#475569';
  ctx.font = '10px ui-monospace, Menlo, monospace';
  ctx.fillText('CONNECTOR ACTIVE · src_clarity → snowflake', 20, GAME_H - 4);

  // Pause overlay
  if (s.paused) {
    ctx.fillStyle = 'rgba(2,6,23,0.6)';
    ctx.fillRect(0, 0, GAME_W, GAME_H);
    ctx.fillStyle = '#60a5fa';
    ctx.font = '800 32px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', GAME_W / 2, GAME_H / 2);
    ctx.font = '11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('press P to resume', GAME_W / 2, GAME_H / 2 + 22);
    ctx.textAlign = 'left';
  }
}

function drawPlayerShip(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Fivetran-icon ship: rounded blue badge with the iconic stacked F bars
  const r = 4;
  // Badge background
  ctx.fillStyle = '#0073ea'; // Fivetran brand blue
  roundedRect(ctx, x, y, PLAYER_W, PLAYER_H, r);
  ctx.fill();

  // Inner highlight (subtle gloss)
  const grad = ctx.createLinearGradient(x, y, x, y + PLAYER_H);
  grad.addColorStop(0, 'rgba(255,255,255,0.18)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  roundedRect(ctx, x, y, PLAYER_W, PLAYER_H, r);
  ctx.fill();

  // Fivetran "F" icon — 3 white horizontal bars + left stem
  ctx.fillStyle = '#ffffff';
  const stemX = x + PLAYER_W * 0.18;
  const stemW = PLAYER_W * 0.12;
  const stemY = y + PLAYER_H * 0.18;
  const stemH = PLAYER_H * 0.64;
  // Vertical stem
  ctx.fillRect(stemX, stemY, stemW, stemH);
  // Top arm
  ctx.fillRect(stemX, stemY, PLAYER_W * 0.62, PLAYER_H * 0.2);
  // Middle arm
  ctx.fillRect(stemX, y + PLAYER_H * 0.46, PLAYER_W * 0.45, PLAYER_H * 0.18);

  // Cyan accent — Fivetran's data-flow dot
  ctx.fillStyle = '#22d3ee';
  ctx.beginPath();
  ctx.arc(x + PLAYER_W * 0.85, y + PLAYER_H * 0.32, 2, 0, Math.PI * 2);
  ctx.fill();

  // Thruster glow
  const t = performance.now() / 80;
  const flame = 4 + Math.sin(t) * 2;
  ctx.fillStyle = 'rgba(34, 211, 238, 0.8)';
  ctx.fillRect(x + PLAYER_W * 0.42, y + PLAYER_H, 2, flame);
  ctx.fillRect(x + PLAYER_W * 0.56, y + PLAYER_H, 2, flame);
}

function drawEnemy(ctx: CanvasRenderingContext2D, e: Enemy) {
  const bob = Math.sin(performance.now() / 250 + e.x) * 1.2;
  const x = e.x;
  const y = e.y + bob;

  // Body — "corrupted data tile"
  ctx.fillStyle = '#1e1b3a';
  ctx.fillRect(x, y, ENEMY_W, ENEMY_H);
  ctx.strokeStyle = `hsl(${340 + e.hue}, 70%, 55%)`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 0.5, y + 0.5, ENEMY_W - 1, ENEMY_H - 1);

  // Glitch corners
  ctx.fillStyle = `hsl(${340 + e.hue}, 70%, 55%)`;
  ctx.fillRect(x, y, 4, 4);
  ctx.fillRect(x + ENEMY_W - 4, y, 4, 4);
  ctx.fillRect(x, y + ENEMY_H - 4, 4, 4);
  ctx.fillRect(x + ENEMY_W - 4, y + ENEMY_H - 4, 4, 4);

  // Label
  ctx.fillStyle = '#fda4af';
  ctx.font = '700 9px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(e.label, x + ENEMY_W / 2, y + ENEMY_H / 2 + 3);
  ctx.textAlign = 'left';
}

function drawUfo(ctx: CanvasRenderingContext2D, x: number, y: number) {
  // Gold "Schema Migration" UFO — worth 150
  const t = performance.now() / 200;
  ctx.fillStyle = '#fbbf24';
  ctx.fillRect(x, y + 4, 40, 8);
  ctx.fillRect(x + 6, y, 28, 4);
  ctx.fillRect(x + 12, y - 4, 16, 4);
  // blinking lights
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = Math.floor(t + i) % 2 === 0 ? '#f59e0b' : '#fde68a';
    ctx.fillRect(x + 4 + i * 9, y + 6, 4, 4);
  }
  ctx.fillStyle = '#0a0a0a';
  ctx.font = '700 7px ui-monospace, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.fillText('SCHEMA', x + 20, y + 11);
  ctx.textAlign = 'left';
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
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
