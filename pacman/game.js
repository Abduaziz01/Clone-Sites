/* ============================================================
   PAC-MAN CLONE — pure HTML/CSS/JS, no dependencies.
   28x31 tile maze, 4 ghosts with personalities,
   scatter/chase/frightened AI, dots, power pellets, scoring,
   lives, levels, high score (localStorage), sound (WebAudio),
   keyboard + touch controls.
   ============================================================ */

(() => {
    'use strict';

    // ---------- Maze layout ----------
    // Legend per character:
    //   # = wall
    //   . = pellet (10 pts)
    //   o = power pellet (50 pts)
    //   - = ghost-house door (passable to ghosts only)
    //   _ = empty corridor (no pellet) — used inside ghost house & tunnels
    //   space = empty corridor outside the play field (for tunnel wrap)
    //
    // 28 columns wide, 31 rows tall (classic dimensions).
    const RAW_MAP = [
        '############################',
        '#............##............#',
        '#.####.#####.##.#####.####.#',
        '#o####.#####.##.#####.####o#',
        '#.####.#####.##.#####.####.#',
        '#..........................#',
        '#.####.##.########.##.####.#',
        '#.####.##.########.##.####.#',
        '#......##....##....##......#',
        '######.##### ## #####.######',
        '     #.##### ## #####.#     ',
        '     #.##          ##.#     ',
        '     #.## ###--### ##.#     ',
        '######.## #______# ##.######',
        '      .   #______#   .      ',
        '######.## #______# ##.######',
        '     #.## ######## ##.#     ',
        '     #.##          ##.#     ',
        '     #.## ######## ##.#     ',
        '######.## ######## ##.######',
        '#............##............#',
        '#.####.#####.##.#####.####.#',
        '#.####.#####.##.#####.####.#',
        '#o..##................##..o#',
        '###.##.##.########.##.##.###',
        '###.##.##.########.##.##.###',
        '#......##....##....##......#',
        '#.##########.##.##########.#',
        '#.##########.##.##########.#',
        '#..........................#',
        '############################'
    ];

    const COLS = 28;
    const ROWS = 31;
    const TILE = 16;
    const W = COLS * TILE;   // 448
    const H = ROWS * TILE;   // 496

    // Tile codes used in the in-memory grid
    const T = {
        EMPTY: 0,
        WALL:  1,
        PELLET: 2,
        POWER: 3,
        DOOR:  4,
        TUNNEL: 5
    };

    function buildGrid() {
        const g = [];
        for (let r = 0; r < ROWS; r++) {
            const row = [];
            const src = RAW_MAP[r];
            for (let c = 0; c < COLS; c++) {
                const ch = src[c] || ' ';
                switch (ch) {
                    case '#': row.push(T.WALL);  break;
                    case '.': row.push(T.PELLET); break;
                    case 'o': row.push(T.POWER); break;
                    case '-': row.push(T.DOOR);  break;
                    case '_': row.push(T.EMPTY); break;
                    case ' ': row.push(T.TUNNEL); break;
                    default:  row.push(T.EMPTY);
                }
            }
            g.push(row);
        }
        return g;
    }
    let grid = buildGrid();

    // ---------- Canvas ----------
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;

    // ---------- DOM ----------
    const scoreEl = document.getElementById('score');
    const highEl  = document.getElementById('highScore');
    const levelEl = document.getElementById('level');
    const livesEl = document.getElementById('lives');
    const statusEl = document.getElementById('status');
    const overlay = document.getElementById('overlay');
    const overlayMsg = document.getElementById('overlayMsg');

    // ---------- Game state ----------
    const STATE = {
        MENU: 'menu',
        READY: 'ready',
        PLAYING: 'playing',
        PAUSED: 'paused',
        DYING: 'dying',
        WIN: 'win',
        GAMEOVER: 'gameover'
    };

    let game = {
        state: STATE.MENU,
        score: 0,
        high: Number(localStorage.getItem('pacman-high') || 0),
        level: 1,
        lives: 3,
        dotsRemaining: 0,
        frightenedTimer: 0,
        modeTimer: 0,
        modeIndex: 0,
        ghostMode: 'scatter',
        ghostsEatenInPower: 0,
        readyTimer: 0,
        dyingTimer: 0
    };

    // Classic-ish scatter/chase schedule (ms)
    const MODE_SCHEDULE = [
        { mode: 'scatter', dur: 7000 },
        { mode: 'chase',   dur: 20000 },
        { mode: 'scatter', dur: 7000 },
        { mode: 'chase',   dur: 20000 },
        { mode: 'scatter', dur: 5000 },
        { mode: 'chase',   dur: 20000 },
        { mode: 'scatter', dur: 5000 },
        { mode: 'chase',   dur: Infinity }
    ];

    // ---------- Directions ----------
    const DIR = {
        NONE:  { x: 0,  y: 0 },
        LEFT:  { x: -1, y: 0 },
        RIGHT: { x: 1,  y: 0 },
        UP:    { x: 0,  y: -1 },
        DOWN:  { x: 0,  y: 1 }
    };
    const opposite = d =>
        d === DIR.LEFT ? DIR.RIGHT :
        d === DIR.RIGHT ? DIR.LEFT :
        d === DIR.UP ? DIR.DOWN :
        d === DIR.DOWN ? DIR.UP : DIR.NONE;

    // ---------- Helpers ----------
    function tileAt(px, py) {
        return { c: Math.floor(px / TILE), r: Math.floor(py / TILE) };
    }
    function isWall(c, r) {
        if (r < 0 || r >= ROWS) return true;
        if (c < 0 || c >= COLS) return false; // tunnel wrap = open
        return grid[r][c] === T.WALL;
    }
    function isGhostDoor(c, r) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
        return grid[r][c] === T.DOOR;
    }
    function tileCenter(c, r) {
        return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
    }

    // ---------- Pac-Man ----------
    class Pacman {
        constructor() { this.reset(); }
        reset() {
            // Classic Pac-Man spawn: between cols 13 & 14 on row 23.
            // Place him exactly on the boundary so he can go left or right
            // immediately without eating a pellet on spawn.
            this.x = 14 * TILE;          // boundary between cols 13 & 14
            this.y = 23 * TILE + TILE / 2;
            this.dir = DIR.NONE;
            this.next = DIR.LEFT;
            this.speed = 80;             // px/sec base
            this.mouth = 0;
            this.mouthDir = 1;
            this.dead = false;
            this.deathFrame = 0;
        }
        get tile() { return tileAt(this.x, this.y); }

        canMove(dir) {
            if (dir === DIR.NONE) return true;
            const cx = this.x + dir.x * (TILE / 2 + 0.1);
            const cy = this.y + dir.y * (TILE / 2 + 0.1);
            const t = tileAt(cx, cy);
            return !isWall(t.c, t.r) && !isGhostDoor(t.c, t.r);
        }

        atTileCenter(tol = 1) {
            const fx = ((this.x % TILE) + TILE) % TILE;
            const fy = ((this.y % TILE) + TILE) % TILE;
            return Math.abs(fx - TILE / 2) <= tol && Math.abs(fy - TILE / 2) <= tol;
        }

        update(dt) {
            if (this.dead) {
                this.deathFrame += dt * 6;
                return;
            }

            // Honor queued direction.
            if (this.next !== this.dir) {
                if (this.next === opposite(this.dir)) {
                    this.dir = this.next;
                } else if (this.atTileCenter(2) && this.canMove(this.next)) {
                    const t = tileAt(this.x, this.y);
                    const c = tileCenter(t.c, t.r);
                    this.x = c.x; this.y = c.y;
                    this.dir = this.next;
                }
            }

            if (!this.canMove(this.dir)) {
                if (this.atTileCenter(3)) {
                    const t = tileAt(this.x, this.y);
                    const c = tileCenter(t.c, t.r);
                    this.x = c.x; this.y = c.y;
                }
                return;
            }

            const speed = this.speed * (1 + (game.level - 1) * 0.05);
            this.x += this.dir.x * speed * dt;
            this.y += this.dir.y * speed * dt;

            // Tunnel wrap
            if (this.x < -TILE / 2) this.x = W + TILE / 2 - 1;
            else if (this.x > W + TILE / 2) this.x = -TILE / 2 + 1;

            // Mouth animation
            this.mouth += this.mouthDir * dt * 8;
            if (this.mouth > 1) { this.mouth = 1; this.mouthDir = -1; }
            if (this.mouth < 0) { this.mouth = 0; this.mouthDir = 1; }
        }

        draw() {
            ctx.save();
            ctx.translate(this.x, this.y);
            const r = TILE * 0.55;

            if (this.dead) {
                const p = Math.min(1, this.deathFrame / 4);
                const open = p * Math.PI;
                ctx.fillStyle = '#ffcc00';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, r * (1 - p * 0.4),
                        -Math.PI / 2 + open,
                        -Math.PI / 2 - open + Math.PI * 2);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                return;
            }

            let angle = 0;
            if (this.dir === DIR.LEFT)  angle = Math.PI;
            if (this.dir === DIR.UP)    angle = -Math.PI / 2;
            if (this.dir === DIR.DOWN)  angle =  Math.PI / 2;
            ctx.rotate(angle);

            const open = (this.dir === DIR.NONE ? 0.05 : 0.05 + this.mouth * 0.4) * Math.PI;
            ctx.fillStyle = '#ffcc00';
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, r, open, Math.PI * 2 - open);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }
    }

    // ---------- Ghost ----------
    class Ghost {
        constructor(name, color, scatterTarget, startTile, exitDelay, startsOut = false) {
            this.name = name;
            this.color = color;
            this.scatterTarget = scatterTarget; // {c,r}
            this.startTile = startTile;
            this.exitDelay = exitDelay;
            this.startsOut = startsOut;
            this.reset();
        }
        reset() {
            const c = tileCenter(this.startTile.c, this.startTile.r);
            this.x = c.x; this.y = c.y;
            this.dir = this.startsOut ? DIR.LEFT : DIR.UP;
            this.state = this.startsOut ? 'out' : 'house';
            this.houseTimer = this.exitDelay;
            this.frightened = false;
            this.eaten = false;
            this.bobPhase = Math.random() * Math.PI * 2;
            this.bobOriginY = this.y;
        }

        get tile() { return tileAt(this.x, this.y); }

        atTileCenter(tol = 1) {
            const fx = ((this.x % TILE) + TILE) % TILE;
            const fy = ((this.y % TILE) + TILE) % TILE;
            return Math.abs(fx - TILE / 2) <= tol && Math.abs(fy - TILE / 2) <= tol;
        }

        canEnter(c, r) {
            if (r < 0 || r >= ROWS) return false;
            if (c < 0 || c >= COLS) return true; // tunnel wrap
            const v = grid[r][c];
            if (v === T.WALL) return false;
            if (v === T.DOOR) {
                return this.state === 'leaving' ||
                       this.state === 'returning' ||
                       this.state === 'house';
            }
            return true;
        }

        getTarget(pac, blinky) {
            if (this.eaten) return { c: 13, r: 11 }; // tile just above the door
            if (this.frightened) return null;
            if (game.ghostMode === 'scatter') return this.scatterTarget;

            const pt = pac.tile;
            switch (this.name) {
                case 'blinky':
                    return { c: pt.c, r: pt.r };
                case 'pinky': {
                    let c = pt.c + pac.dir.x * 4;
                    let r = pt.r + pac.dir.y * 4;
                    if (pac.dir === DIR.UP) c -= 4; // classic overflow bug
                    return { c, r };
                }
                case 'inky': {
                    let c2 = pt.c + pac.dir.x * 2;
                    let r2 = pt.r + pac.dir.y * 2;
                    if (pac.dir === DIR.UP) c2 -= 2;
                    const bt = blinky.tile;
                    return { c: c2 + (c2 - bt.c), r: r2 + (r2 - bt.r) };
                }
                case 'clyde': {
                    const dx = this.tile.c - pt.c;
                    const dy = this.tile.r - pt.r;
                    return (dx * dx + dy * dy) > 64
                        ? { c: pt.c, r: pt.r }
                        : this.scatterTarget;
                }
            }
            return { c: pt.c, r: pt.r };
        }

        chooseDirection(target) {
            const t = this.tile;
            const candidates = [];
            const dirs = [DIR.UP, DIR.LEFT, DIR.DOWN, DIR.RIGHT]; // tie-break order
            for (const d of dirs) {
                if (d === opposite(this.dir)) continue;
                const nc = t.c + d.x;
                const nr = t.r + d.y;
                if (!this.canEnter(nc, nr)) continue;
                candidates.push({ d, nc, nr });
            }
            if (candidates.length === 0) {
                this.dir = opposite(this.dir);
                return;
            }
            if (this.frightened && !this.eaten) {
                this.dir = candidates[Math.floor(Math.random() * candidates.length)].d;
                return;
            }
            let best = candidates[0];
            let bestDist = Infinity;
            for (const cand of candidates) {
                const dx = cand.nc - target.c;
                const dy = cand.nr - target.r;
                const dist = dx * dx + dy * dy;
                if (dist < bestDist) { bestDist = dist; best = cand; }
            }
            this.dir = best.d;
        }

        update(dt, pac, blinky) {
            this.bobPhase += dt * 6;

            // Speed
            let speed = 70 + (game.level - 1) * 2;
            if (this.frightened) speed *= 0.6;
            if (this.eaten) speed = 150;
            const t = this.tile;
            if (t.r === 14 && (t.c < 6 || t.c > 21)) speed *= 0.5;

            // Door tile target = column 13.5 (between 13 & 14), row 11.5 (just above door)
            const doorX = 14 * TILE;
            const doorOutsideY = 11 * TILE + TILE / 2;
            const houseY = 14 * TILE + TILE / 2;

            if (this.state === 'house') {
                // Bob inside house
                this.y = this.bobOriginY + Math.sin(this.bobPhase) * 2;
                this.houseTimer -= dt * 1000;
                if (this.houseTimer <= 0) this.state = 'leaving';
                return;
            }
            if (this.state === 'leaving') {
                // Center horizontally to door, then move up out of the house
                if (Math.abs(this.x - doorX) > 1) {
                    this.x += Math.sign(doorX - this.x) * speed * dt;
                } else {
                    this.x = doorX;
                    if (this.y > doorOutsideY) {
                        this.y -= speed * dt;
                    } else {
                        this.y = doorOutsideY;
                        this.state = 'out';
                        this.dir = Math.random() < 0.5 ? DIR.LEFT : DIR.RIGHT;
                    }
                }
                return;
            }
            if (this.state === 'returning') {
                // Move toward door from above
                const tx = doorX, ty = doorOutsideY;
                const dx = tx - this.x, dy = ty - this.y;
                const d = Math.hypot(dx, dy);
                if (d < 2) {
                    this.x = tx; this.y = ty;
                    this.state = 'entering';
                } else {
                    this.x += (dx / d) * speed * dt;
                    this.y += (dy / d) * speed * dt;
                }
                return;
            }
            if (this.state === 'entering') {
                if (this.y < houseY) {
                    this.y += speed * dt;
                } else {
                    this.y = houseY;
                    this.eaten = false;
                    this.frightened = false;
                    this.bobOriginY = this.y;
                    this.state = 'leaving';
                    this.houseTimer = 600;
                }
                return;
            }

            // 'out' — corridor movement
            if (this.atTileCenter(1.5)) {
                const tc = tileCenter(t.c, t.r);
                this.x = tc.x; this.y = tc.y;
                const target = this.getTarget(pac, blinky);
                this.chooseDirection(target || { c: 0, r: 0 });
            }

            this.x += this.dir.x * speed * dt;
            this.y += this.dir.y * speed * dt;

            if (this.x < -TILE / 2) this.x = W + TILE / 2 - 1;
            else if (this.x > W + TILE / 2) this.x = -TILE / 2 + 1;
        }

        draw() {
            const r = TILE * 0.55;
            ctx.save();
            ctx.translate(this.x, this.y);

            if (this.eaten) {
                drawEyes(this.dir);
                ctx.restore();
                return;
            }

            let body = this.color;
            if (this.frightened) {
                const flashing = game.frightenedTimer < 2000 &&
                                 Math.floor(game.frightenedTimer / 200) % 2 === 0;
                body = flashing ? '#ffffff' : '#2121de';
            }

            ctx.fillStyle = body;
            // Top dome
            ctx.beginPath();
            ctx.arc(0, -2, r, Math.PI, 0, false);
            // Skirt with 3 humps
            const bottomY = r - 2;
            ctx.lineTo(r, bottomY);
            const humps = 3;
            const segW = (r * 2) / humps;
            for (let i = 0; i < humps; i++) {
                const x0 = r - i * segW;
                const x1 = x0 - segW / 2;
                const x2 = x0 - segW;
                ctx.lineTo(x1, bottomY - 4);
                ctx.lineTo(x2, bottomY);
            }
            ctx.closePath();
            ctx.fill();

            if (this.frightened) {
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(-5, -3, 3, 3);
                ctx.fillRect(2, -3, 3, 3);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(-5, 4);
                ctx.lineTo(-3, 2);
                ctx.lineTo(-1, 4);
                ctx.lineTo(1, 2);
                ctx.lineTo(3, 4);
                ctx.lineTo(5, 2);
                ctx.stroke();
            } else {
                drawEyes(this.dir);
            }
            ctx.restore();
        }
    }

    function drawEyes(dir) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-3, -2, 2.6, 0, Math.PI * 2);
        ctx.arc(3, -2, 2.6, 0, Math.PI * 2);
        ctx.fill();
        let px = 0, py = 0;
        if (dir === DIR.LEFT)  px = -1.2;
        if (dir === DIR.RIGHT) px =  1.2;
        if (dir === DIR.UP)    py = -1.2;
        if (dir === DIR.DOWN)  py =  1.2;
        ctx.fillStyle = '#0033ff';
        ctx.beginPath();
        ctx.arc(-3 + px, -2 + py, 1.3, 0, Math.PI * 2);
        ctx.arc( 3 + px, -2 + py, 1.3, 0, Math.PI * 2);
        ctx.fill();
    }

    // ---------- Entities ----------
    const pac = new Pacman();
    // Ghost-house interior tiles. Door is on row 12 (the '-' chars).
    // House interior spans roughly cols 11..16, rows 13..15.
    const ghosts = [
        // Blinky starts above the house, already 'out'
        new Ghost('blinky', '#ff0000', { c: 25, r: 0 },  { c: 13, r: 11 }, 0,    true),
        new Ghost('pinky',  '#ffb8ff', { c: 2,  r: 0 },  { c: 13, r: 14 }, 1500, false),
        new Ghost('inky',   '#00ffff', { c: 27, r: 30 }, { c: 11, r: 14 }, 4000, false),
        new Ghost('clyde',  '#ffb851', { c: 0,  r: 30 }, { c: 16, r: 14 }, 7000, false)
    ];
    const blinky = ghosts[0];

    // ---------- Web Audio ----------
    let audioCtx = null;
    function ensureAudio() {
        if (!audioCtx) {
            try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
            catch (e) { audioCtx = null; }
        }
        if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
    }
    function beep(freq, dur, type = 'square', vol = 0.06) {
        if (!audioCtx) return;
        const o = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        o.type = type;
        o.frequency.value = freq;
        g.gain.value = vol;
        o.connect(g).connect(audioCtx.destination);
        const t = audioCtx.currentTime;
        o.start(t);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.stop(t + dur + 0.02);
    }
    let chompToggle = 0;
    function sndChomp()    { ensureAudio(); beep(chompToggle++ % 2 ? 520 : 380, 0.05, 'square', 0.04); }
    function sndPower()    { ensureAudio(); beep(180, 0.12, 'sawtooth', 0.08); setTimeout(() => beep(280, 0.12, 'sawtooth', 0.08), 100); }
    function sndEatGhost() { ensureAudio(); beep(700, 0.08); setTimeout(() => beep(900, 0.08), 80); setTimeout(() => beep(1200, 0.12), 160); }
    function sndDeath()    { ensureAudio(); for (let i = 0; i < 8; i++) setTimeout(() => beep(700 - i * 70, 0.12, 'square', 0.08), i * 120); }
    function sndStart()    { ensureAudio(); [523, 659, 784, 1046].forEach((n, i) => setTimeout(() => beep(n, 0.15, 'square', 0.06), i * 150)); }

    // ---------- Init helpers ----------
    function countDots() {
        let n = 0;
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++)
                if (grid[r][c] === T.PELLET || grid[r][c] === T.POWER) n++;
        return n;
    }

    function resetLevel(fullReset = false) {
        if (fullReset) grid = buildGrid();
        pac.reset();
        ghosts.forEach(g => g.reset());
        game.dotsRemaining = countDots();
        game.modeIndex = 0;
        game.modeTimer = MODE_SCHEDULE[0].dur;
        game.ghostMode = MODE_SCHEDULE[0].mode;
        game.frightenedTimer = 0;
        game.ghostsEatenInPower = 0;
        game.readyTimer = 1800;
        game.state = STATE.READY;
        statusEl.textContent = 'READY';
    }

    function startGame() {
        game.score = 0;
        game.lives = 3;
        game.level = 1;
        resetLevel(true);
        sndStart();
        updateHUD();
        hideOverlay();
    }

    function nextLevel() {
        game.level++;
        resetLevel(true);
        sndStart();
        updateHUD();
    }

    function loseLife() {
        game.lives--;
        updateHUD();
        if (game.lives <= 0) {
            game.state = STATE.GAMEOVER;
            statusEl.textContent = 'GAME OVER';
            if (game.score > game.high) {
                game.high = game.score;
                localStorage.setItem('pacman-high', game.high);
            }
            showOverlay('GAME OVER', `SCORE ${game.score} — PRESS ENTER`);
        } else {
            pac.reset();
            ghosts.forEach(g => g.reset());
            game.frightenedTimer = 0;
            game.readyTimer = 1500;
            game.state = STATE.READY;
            statusEl.textContent = 'READY';
        }
    }

    // ---------- HUD ----------
    function updateHUD() {
        scoreEl.textContent = String(game.score).padStart(2, '0');
        highEl.textContent  = String(Math.max(game.score, game.high)).padStart(2, '0');
        levelEl.textContent = String(game.level);
        livesEl.innerHTML = '';
        for (let i = 0; i < game.lives; i++) {
            const d = document.createElement('div');
            d.className = 'life';
            livesEl.appendChild(d);
        }
    }

    function showOverlay(title, msg) {
        overlay.classList.remove('hidden');
        overlay.querySelector('.title').textContent = title;
        overlayMsg.textContent = msg;
    }
    function hideOverlay() { overlay.classList.add('hidden'); }

    // ---------- Input ----------
    window.addEventListener('keydown', (e) => {
        ensureAudio();
        const k = e.key.toLowerCase();

        if (k === 'enter') {
            if (game.state === STATE.MENU || game.state === STATE.GAMEOVER || game.state === STATE.WIN) {
                startGame();
            }
            return;
        }
        if (k === 'p') {
            if (game.state === STATE.PLAYING) {
                game.state = STATE.PAUSED;
                showOverlay('PAUSED', 'PRESS P TO RESUME');
            } else if (game.state === STATE.PAUSED) {
                game.state = STATE.PLAYING;
                hideOverlay();
            }
            return;
        }
        if (game.state !== STATE.PLAYING && game.state !== STATE.READY) return;

        if (k === 'arrowleft' || k === 'a')       { pac.next = DIR.LEFT;  e.preventDefault(); }
        else if (k === 'arrowright' || k === 'd') { pac.next = DIR.RIGHT; e.preventDefault(); }
        else if (k === 'arrowup' || k === 'w')    { pac.next = DIR.UP;    e.preventDefault(); }
        else if (k === 'arrowdown' || k === 's')  { pac.next = DIR.DOWN;  e.preventDefault(); }
    });

    // Touch / swipe
    let touchStart = null;
    canvas.addEventListener('touchstart', e => {
        const t = e.changedTouches[0];
        touchStart = { x: t.clientX, y: t.clientY };
    }, { passive: true });
    canvas.addEventListener('touchend', e => {
        if (!touchStart) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStart.x;
        const dy = t.clientY - touchStart.y;
        if (Math.abs(dx) > Math.abs(dy)) pac.next = dx > 0 ? DIR.RIGHT : DIR.LEFT;
        else                              pac.next = dy > 0 ? DIR.DOWN  : DIR.UP;
        touchStart = null;
        if (game.state === STATE.MENU || game.state === STATE.GAMEOVER) startGame();
    }, { passive: true });

    // ---------- Pellet & ghost collisions ----------
    function eatPellets() {
        const t = pac.tile;
        if (t.c < 0 || t.c >= COLS || t.r < 0 || t.r >= ROWS) return;
        const v = grid[t.r][t.c];
        if (v === T.PELLET) {
            grid[t.r][t.c] = T.EMPTY;
            game.score += 10;
            game.dotsRemaining--;
            sndChomp();
            updateHUD();
        } else if (v === T.POWER) {
            grid[t.r][t.c] = T.EMPTY;
            game.score += 50;
            game.dotsRemaining--;
            game.frightenedTimer = Math.max(7000 - (game.level - 1) * 500, 2000);
            game.ghostsEatenInPower = 0;
            ghosts.forEach(g => {
                if (!g.eaten && g.state === 'out') {
                    g.frightened = true;
                    g.dir = opposite(g.dir);
                }
            });
            sndPower();
            updateHUD();
        }
        if (game.dotsRemaining <= 0) {
            game.state = STATE.WIN;
            statusEl.textContent = 'CLEAR!';
            setTimeout(nextLevel, 1500);
        }
    }

    function checkGhostCollisions() {
        for (const g of ghosts) {
            if (g.state === 'house' || g.state === 'leaving' ||
                g.state === 'returning' || g.state === 'entering') continue;
            const dx = g.x - pac.x;
            const dy = g.y - pac.y;
            if (dx * dx + dy * dy < (TILE * 0.55) ** 2) {
                if (g.frightened && !g.eaten) {
                    g.eaten = true;
                    g.frightened = false;
                    g.state = 'returning';
                    game.ghostsEatenInPower++;
                    const points = 200 * Math.pow(2, game.ghostsEatenInPower - 1);
                    game.score += points;
                    sndEatGhost();
                    updateHUD();
                } else if (!pac.dead) {
                    pac.dead = true;
                    pac.deathFrame = 0;
                    game.state = STATE.DYING;
                    game.dyingTimer = 1800;
                    sndDeath();
                }
            }
        }
    }

    // ---------- Maze rendering ----------
    function drawMaze() {
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const v = grid[r][c];
                const x = c * TILE, y = r * TILE;
                if (v === T.WALL) {
                    ctx.fillStyle = '#0a0a4f';
                    ctx.fillRect(x, y, TILE, TILE);
                    ctx.strokeStyle = '#2121de';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
                } else if (v === T.DOOR) {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(x, y, TILE, TILE);
                    ctx.fillStyle = '#ffb8ff';
                    ctx.fillRect(x, y + TILE / 2 - 1, TILE, 2);
                } else if (v === T.PELLET) {
                    ctx.fillStyle = '#ffb897';
                    ctx.beginPath();
                    ctx.arc(x + TILE / 2, y + TILE / 2, 2, 0, Math.PI * 2);
                    ctx.fill();
                } else if (v === T.POWER) {
                    const pulse = 4 + Math.sin(performance.now() / 150) * 1.2;
                    ctx.fillStyle = '#ffb897';
                    ctx.beginPath();
                    ctx.arc(x + TILE / 2, y + TILE / 2, pulse, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    // ---------- Mode update ----------
    function updateMode(dt) {
        if (game.frightenedTimer > 0) {
            game.frightenedTimer -= dt * 1000;
            if (game.frightenedTimer <= 0) {
                game.frightenedTimer = 0;
                ghosts.forEach(g => { if (!g.eaten) g.frightened = false; });
                game.ghostsEatenInPower = 0;
            }
            return;
        }
        if (game.modeTimer === Infinity) return;
        game.modeTimer -= dt * 1000;
        if (game.modeTimer <= 0) {
            game.modeIndex = Math.min(game.modeIndex + 1, MODE_SCHEDULE.length - 1);
            const phase = MODE_SCHEDULE[game.modeIndex];
            game.modeTimer = phase.dur;
            game.ghostMode = phase.mode;
            ghosts.forEach(g => { if (g.state === 'out') g.dir = opposite(g.dir); });
        }
    }

    // ---------- Main loop ----------
    let lastTime = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        if (game.state === STATE.READY) {
            game.readyTimer -= dt * 1000;
            if (game.readyTimer <= 0) {
                game.state = STATE.PLAYING;
                statusEl.textContent = 'GO!';
                setTimeout(() => { if (statusEl) statusEl.textContent = '--'; }, 600);
            }
            // Ghosts in house keep bobbing during READY
            ghosts.forEach(g => { if (g.state === 'house') g.update(dt, pac, blinky); });
        } else if (game.state === STATE.PLAYING) {
            updateMode(dt);
            pac.update(dt);
            eatPellets();
            ghosts.forEach(g => g.update(dt, pac, blinky));
            checkGhostCollisions();
        } else if (game.state === STATE.DYING) {
            pac.update(dt);
            game.dyingTimer -= dt * 1000;
            if (game.dyingTimer <= 0) loseLife();
        }

        ctx.clearRect(0, 0, W, H);
        drawMaze();
        if (game.state !== STATE.DYING) ghosts.forEach(g => g.draw());
        pac.draw();

        if (game.state === STATE.READY) {
            ctx.fillStyle = '#ffcc00';
            ctx.font = 'bold 14px "Press Start 2P", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('READY!', W / 2, 17 * TILE + 4);
        }

        requestAnimationFrame(loop);
    }

    // ---------- Boot ----------
    updateHUD();
    showOverlay('PAC-MAN', 'PRESS ENTER TO START');
    requestAnimationFrame(loop);
})();
