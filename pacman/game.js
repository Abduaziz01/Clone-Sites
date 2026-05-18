/* ============================================================
   PAC-MAN CLONE
   Classic 28x31 tile maze, 4 ghosts with personalities,
   scatter/chase/frightened AI, dots, power pellets, scoring.
   ============================================================ */

(() => {
    'use strict';

    // ---------- Maze layout ----------
    // 0 = empty (no dot, no wall)  -- corridor without dot (used for ghost house, tunnels)
    // 1 = wall
    // 2 = dot (pellet)
    // 3 = power pellet
    // 4 = ghost-house door (passable for ghosts only)
    // 5 = tunnel / corridor empty
    // Width 28, height 31 (classic).
    const RAW_MAP = [
        '1111111111111111111111111111',
        '1222222222222112222222222221',
        '1211112111112112111112111121',
        '1311112111112112111112111131',
        '1211112111112112111112111121',
        '1222222222222222222222222221',
        '1211112112111111112112111121',
        '1211112112111111112112111121',
        '1222222112222112222112222221',
        '1111112111110110111112111111',
        '0000012111110110111112100000',
        '0000012112000000000112100000',
        '0000012112011441100112100000',
        '1111112112010000010112111111',
        '5000000002010000010200000005',
        '1111112112010000010112111111',
        '0000012112011111100112100000',
        '0000012112000000000112100000',
        '0000012112011111100112100000',
        '1111112112011111100112111111',
        '1222222222222112222222222221',
        '1211112111112112111112111121',
        '1211112111112112111112111121',
        '1322112222222002222222112231',
        '1112112112111111112112112111',
        '1112112112111111112112112111',
        '1222222112222112222112222221',
        '1211111111112112111111111121',
        '1211111111112112111111111121',
        '1222222222222222222222222221',
        '1111111111111111111111111111'
    ];

    const COLS = 28;
    const ROWS = 31;
    const TILE = 16;          // pixels per tile
    const W = COLS * TILE;    // 448
    const H = ROWS * TILE;    // 496

    // Build mutable grid (numbers)
    function buildGrid() {
        return RAW_MAP.map(row => row.split('').map(Number));
    }
    let grid = buildGrid();

    // ---------- Canvas ----------
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;

    // ---------- DOM ----------
    const scoreEl = document.getElementById('score');
    const highEl = document.getElementById('highScore');
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
        frightenedTimer: 0,    // ms remaining on power pellet
        modeTimer: 0,          // ms remaining in current scatter/chase phase
        modeIndex: 0,          // index into MODE_SCHEDULE
        ghostMode: 'scatter',  // current mode (scatter|chase) — frightened overrides
        ghostsEatenInPower: 0, // for compounding score (200,400,800,1600)
        readyTimer: 0,         // countdown before Pac-Man can move
        dyingTimer: 0
    };

    // Mode schedule (ms): scatter / chase alternation, classic level 1 timings
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
        // Tunnel wrap: out-of-bounds c is a corridor
        if (c < 0 || c >= COLS) return false;
        const v = grid[r][c];
        return v === 1;
    }
    function isGhostDoor(c, r) {
        if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return false;
        return grid[r][c] === 4;
    }
    function tileCenter(c, r) {
        return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
    }

    // ---------- Entities ----------
    class Pacman {
        constructor() { this.reset(); }
        reset() {
            const start = tileCenter(13, 23);
            // Pac-Man starts between columns 13 and 14
            this.x = start.x + TILE / 2;
            this.y = start.y;
            this.dir = DIR.NONE;
            this.next = DIR.LEFT;
            this.speed = 75; // px/sec — base
            this.mouth = 0;
            this.mouthDir = 1;
            this.dead = false;
            this.deathFrame = 0;
        }
        get tile() { return tileAt(this.x, this.y); }

        canMove(dir) {
            if (dir === DIR.NONE) return true;
            // Look ahead from the tile the head will enter
            const cx = this.x + dir.x * (TILE / 2);
            const cy = this.y + dir.y * (TILE / 2);
            const t = tileAt(cx, cy);
            // For perpendicular turns, only allow when centered on tile
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

            // Try to honor queued direction when possible
            if (this.next !== this.dir) {
                // Allow reverse instantly
                if (this.next === opposite(this.dir)) {
                    this.dir = this.next;
                } else if (this.atTileCenter(2) && this.canMove(this.next)) {
                    // snap to center then turn
                    const t = tileAt(this.x, this.y);
                    const c = tileCenter(t.c, t.r);
                    this.x = c.x; this.y = c.y;
                    this.dir = this.next;
                }
            }

            if (!this.canMove(this.dir)) {
                // align to center if blocked
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
                // Death animation: shrinking arc
                const p = Math.min(1, this.deathFrame / 4);
                const open = p * Math.PI;
                ctx.fillStyle = '#ffcc00';
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.arc(0, 0, r * (1 - p * 0.4), -Math.PI / 2 + open, -Math.PI / 2 - open + Math.PI * 2);
                ctx.closePath();
                ctx.fill();
                ctx.restore();
                return;
            }

            // Rotate based on direction
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

    class Ghost {
        constructor(name, color, scatterTarget, startTile, exitDelay) {
            this.name = name;
            this.color = color;
            this.scatterTarget = scatterTarget; // {c,r}
            this.startTile = startTile;         // spawn tile
            this.exitDelay = exitDelay;         // ms before leaving house
            this.reset();
        }
        reset() {
            const c = tileCenter(this.startTile.c, this.startTile.r);
            this.x = c.x; this.y = c.y;
            this.dir = DIR.UP;
            this.speed = 70;
            this.state = this.name === 'blinky' ? 'out' : 'house'; // blinky starts out
            this.houseTimer = this.exitDelay;
            this.frightened = false;
            this.eaten = false; // returning to house as eyes
            this.bobPhase = Math.random() * Math.PI * 2;
        }

        get tile() { return tileAt(this.x, this.y); }

        atTileCenter(tol = 1) {
            const fx = ((this.x % TILE) + TILE) % TILE;
            const fy = ((this.y % TILE) + TILE) % TILE;
            return Math.abs(fx - TILE / 2) <= tol && Math.abs(fy - TILE / 2) <= tol;
        }

        canEnter(c, r) {
            if (r < 0 || r >= ROWS) return false;
            // Tunnel wrap
            if (c < 0 || c >= COLS) return true;
            const v = grid[r][c];
            if (v === 1) return false;
            if (v === 4) {
                // Door: only allowed when leaving or returning to house
                return this.state === 'leaving' || this.state === 'returning' || this.state === 'house';
            }
            return true;
        }

        // Compute target tile based on state
        getTarget(pac, blinky) {
            if (this.eaten) return { c: 13, r: 14 }; // house entrance
            if (this.frightened) return null;

            if (game.ghostMode === 'scatter') return this.scatterTarget;

            // Chase mode — personality
            const pt = pac.tile;
            switch (this.name) {
                case 'blinky':
                    return { c: pt.c, r: pt.r };
                case 'pinky': {
                    // 4 tiles ahead of pac
                    let c = pt.c + pac.dir.x * 4;
                    let r = pt.r + pac.dir.y * 4;
                    // Replicate original bug: when up, also offset left by 4
                    if (pac.dir === DIR.UP) c -= 4;
                    return { c, r };
                }
                case 'inky': {
                    // 2 tiles ahead of pac, then double vector from blinky
                    let c2 = pt.c + pac.dir.x * 2;
                    let r2 = pt.r + pac.dir.y * 2;
                    if (pac.dir === DIR.UP) c2 -= 2;
                    const bt = blinky.tile;
                    return { c: c2 + (c2 - bt.c), r: r2 + (r2 - bt.r) };
                }
                case 'clyde': {
                    const dx = this.tile.c - pt.c;
                    const dy = this.tile.r - pt.r;
                    const distSq = dx * dx + dy * dy;
                    return distSq > 64 ? { c: pt.c, r: pt.r } : this.scatterTarget;
                }
            }
            return { c: pt.c, r: pt.r };
        }

        chooseDirection(target) {
            // Standard pac-man ghost AI: at each tile center, evaluate the
            // 4 neighbors (excluding reverse) and pick the one minimizing
            // straight-line distance to target. Frightened => random.
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
                // Forced reverse
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

            // Speed determination
            let speed = 70 + (game.level - 1) * 2;
            if (this.frightened) speed *= 0.6;
            if (this.eaten) speed = 140;
            // Tunnel slowdown
            const t = this.tile;
            if (t.r === 14 && (t.c < 6 || t.c > 21)) speed *= 0.5;

            // House logic
            if (this.state === 'house') {
                // Bob up and down inside the house
                this.y += Math.sin(this.bobPhase) * 0.5;
                this.houseTimer -= dt * 1000;
                if (this.houseTimer <= 0 || game.frightenedTimer > 0 && false) {
                    this.state = 'leaving';
                }
                return;
            }
            if (this.state === 'leaving') {
                // Move to door tile (13.5, 14) center
                const tx = 13 * TILE + TILE; // boundary between cols 13 & 14
                const ty = 14 * TILE + TILE / 2;
                // first center horizontally
                if (Math.abs(this.x - tx) > 1) {
                    this.x += Math.sign(tx - this.x) * speed * dt;
                } else {
                    this.x = tx;
                    if (this.y > ty) {
                        this.y -= speed * dt;
                    } else {
                        this.y = ty;
                        this.state = 'out';
                        this.dir = Math.random() < 0.5 ? DIR.LEFT : DIR.RIGHT;
                    }
                }
                return;
            }
            if (this.state === 'returning') {
                // Move toward door (13.5, 14)
                const tx = 13 * TILE + TILE;
                const ty = 14 * TILE + TILE / 2;
                const dx = tx - this.x;
                const dy = ty - this.y;
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
                // Drop into the house, then resume
                const targetY = 17 * TILE - TILE / 2; // mid house
                if (this.y < targetY) {
                    this.y += speed * dt;
                } else {
                    this.y = targetY;
                    this.eaten = false;
                    this.frightened = false;
                    this.state = 'leaving';
                    this.houseTimer = 800;
                }
                return;
            }

            // state === 'out' — normal corridor movement
            // Decide direction at tile center
            if (this.atTileCenter(1.5)) {
                const tc = tileCenter(t.c, t.r);
                this.x = tc.x; this.y = tc.y;
                const target = this.getTarget(pac, blinky);
                if (target) this.chooseDirection(target);
                else {
                    // frightened (random) — chooseDirection handles it but it needs target null check
                    this.chooseDirection({ c: 0, r: 0 });
                }
            }

            this.x += this.dir.x * speed * dt;
            this.y += this.dir.y * speed * dt;

            // Tunnel wrap
            if (this.x < -TILE / 2) this.x = W + TILE / 2 - 1;
            else if (this.x > W + TILE / 2) this.x = -TILE / 2 + 1;
        }

        draw() {
            const r = TILE * 0.55;
            ctx.save();
            ctx.translate(this.x, this.y);

            if (this.eaten) {
                // Just eyes
                drawEyes(this.dir);
                ctx.restore();
                return;
            }

            // Body color
            let body = this.color;
            if (this.frightened) {
                const flashing = game.frightenedTimer < 2000 && Math.floor(game.frightenedTimer / 200) % 2 === 0;
                body = flashing ? '#ffffff' : '#2121de';
            }
            ctx.fillStyle = body;

            // Rounded top
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
                // Scared face
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(-5, -3, 3, 3);
                ctx.fillRect(2, -3, 3, 3);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let i = -5; i <= 5; i += 2) {
                    ctx.lineTo(i, 4 + (i % 4 === 0 ? 0 : 2));
                }
                ctx.stroke();
            } else {
                drawEyes(this.dir);
            }
            ctx.restore();
        }
    }

    function drawEyes(dir) {
        // White
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(-3, -2, 2.6, 0, Math.PI * 2);
        ctx.arc(3, -2, 2.6, 0, Math.PI * 2);
        ctx.fill();
        // Pupils
        let px = 0, py = 0;
        if (dir === DIR.LEFT)  px = -1.2;
        if (dir === DIR.RIGHT) px = 1.2;
        if (dir === DIR.UP)    py = -1.2;
        if (dir === DIR.DOWN)  py = 1.2;
        ctx.fillStyle = '#0033ff';
        ctx.beginPath();
        ctx.arc(-3 + px, -2 + py, 1.3, 0, Math.PI * 2);
        ctx.arc(3 + px, -2 + py, 1.3, 0, Math.PI * 2);
        ctx.fill();
    }

    // ---------- Create entities ----------
    const pac = new Pacman();
    const ghosts = [
        new Ghost('blinky', '#ff0000', { c: 25, r: 0 }, { c: 13, r: 14 }, 0),
        new Ghost('pinky',  '#ffb8ff', { c: 2,  r: 0 }, { c: 13, r: 17 }, 2000),
        new Ghost('inky',   '#00ffff', { c: 27, r: 30 }, { c: 11, r: 17 }, 5000),
        new Ghost('clyde',  '#ffb851', { c: 0,  r: 30 }, { c: 15, r: 17 }, 8000)
    ];
    const blinky = ghosts[0];

    // ---------- Sound (Web Audio) ----------
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
        o.stop(t + dur);
    }
    let chompToggle = 0;
    function sndChomp() { ensureAudio(); beep(chompToggle++ % 2 ? 520 : 380, 0.05, 'square', 0.04); }
    function sndPower() { ensureAudio(); beep(180, 0.12, 'sawtooth', 0.08); setTimeout(() => beep(280, 0.12, 'sawtooth', 0.08), 100); }
    function sndEatGhost() { ensureAudio(); beep(700, 0.08); setTimeout(() => beep(900, 0.08), 80); setTimeout(() => beep(1200, 0.12), 160); }
    function sndDeath() {
        ensureAudio();
        for (let i = 0; i < 8; i++) {
            setTimeout(() => beep(700 - i * 70, 0.12, 'square', 0.08), i * 120);
        }
    }
    function sndStart() {
        ensureAudio();
        const notes = [523, 659, 784, 1046];
        notes.forEach((n, i) => setTimeout(() => beep(n, 0.15, 'square', 0.06), i * 150));
    }

    // ---------- Initialization helpers ----------
    function countDots() {
        let n = 0;
        for (let r = 0; r < ROWS; r++)
            for (let c = 0; c < COLS; c++)
                if (grid[r][c] === 2 || grid[r][c] === 3) n++;
        return n;
    }

    function resetLevel(fullReset = false) {
        if (fullReset) {
            grid = buildGrid();
        }
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
            // soft reset positions
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
        highEl.textContent = String(Math.max(game.score, game.high)).padStart(2, '0');
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

        if (k === 'arrowleft' || k === 'a')  pac.next = DIR.LEFT;
        else if (k === 'arrowright' || k === 'd') pac.next = DIR.RIGHT;
        else if (k === 'arrowup' || k === 'w')    pac.next = DIR.UP;
        else if (k === 'arrowdown' || k === 's')  pac.next = DIR.DOWN;
    });

    // Touch / swipe controls
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
        if (Math.abs(dx) > Math.abs(dy)) {
            pac.next = dx > 0 ? DIR.RIGHT : DIR.LEFT;
        } else {
            pac.next = dy > 0 ? DIR.DOWN : DIR.UP;
        }
        touchStart = null;
    }, { passive: true });

    // ---------- Collision logic ----------
    function eatPellets() {
        const t = pac.tile;
        if (t.c < 0 || t.c >= COLS || t.r < 0 || t.r >= ROWS) return;
        const v = grid[t.r][t.c];
        if (v === 2) {
            grid[t.r][t.c] = 0;
            game.score += 10;
            game.dotsRemaining--;
            sndChomp();
            updateHUD();
        } else if (v === 3) {
            grid[t.r][t.c] = 0;
            game.score += 50;
            game.dotsRemaining--;
            game.frightenedTimer = Math.max(7000 - (game.level - 1) * 500, 2000);
            game.ghostsEatenInPower = 0;
            ghosts.forEach(g => {
                if (!g.eaten && g.state === 'out') {
                    g.frightened = true;
                    // reverse direction
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
            if (g.state === 'house' || g.state === 'leaving' || g.state === 'returning' || g.state === 'entering') continue;
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

    // ---------- Render maze ----------
    function drawMaze() {
        // Walls — draw blue thick lines for each wall tile boundary against non-wall
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                const v = grid[r][c];
                const x = c * TILE, y = r * TILE;
                if (v === 1) {
                    // Stylized: filled wall block w/ inner blue
                    ctx.fillStyle = '#0a0a4f';
                    ctx.fillRect(x, y, TILE, TILE);
                    ctx.strokeStyle = '#2121de';
                    ctx.lineWidth = 2;
                    ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
                } else if (v === 4) {
                    // Ghost door
                    ctx.fillStyle = '#000';
                    ctx.fillRect(x, y, TILE, TILE);
                    ctx.fillStyle = '#ffb8ff';
                    ctx.fillRect(x, y + TILE / 2 - 1, TILE, 2);
                } else if (v === 2) {
                    // Dot
                    ctx.fillStyle = '#ffb897';
                    ctx.beginPath();
                    ctx.arc(x + TILE / 2, y + TILE / 2, 2, 0, Math.PI * 2);
                    ctx.fill();
                } else if (v === 3) {
                    // Power pellet — pulsing
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
            return; // freeze schedule during frightened
        }
        if (game.modeTimer === Infinity) return;
        game.modeTimer -= dt * 1000;
        if (game.modeTimer <= 0) {
            game.modeIndex = Math.min(game.modeIndex + 1, MODE_SCHEDULE.length - 1);
            const phase = MODE_SCHEDULE[game.modeIndex];
            game.modeTimer = phase.dur;
            game.ghostMode = phase.mode;
            // Force ghosts to reverse direction on phase change
            ghosts.forEach(g => {
                if (g.state === 'out') g.dir = opposite(g.dir);
            });
        }
    }

    // ---------- Main loop ----------
    let lastTime = performance.now();
    function loop(now) {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        // --- Update ---
        if (game.state === STATE.READY) {
            game.readyTimer -= dt * 1000;
            if (game.readyTimer <= 0) {
                game.state = STATE.PLAYING;
                statusEl.textContent = 'GO!';
                setTimeout(() => { if (statusEl) statusEl.textContent = '--'; }, 600);
            }
        } else if (game.state === STATE.PLAYING) {
            updateMode(dt);
            pac.update(dt);
            eatPellets();
            ghosts.forEach(g => g.update(dt, pac, blinky));
            checkGhostCollisions();
        } else if (game.state === STATE.DYING) {
            pac.update(dt);
            game.dyingTimer -= dt * 1000;
            if (game.dyingTimer <= 0) {
                pac.dead = false;
                loseLife();
            }
        }

        // --- Draw ---
        ctx.clearRect(0, 0, W, H);
        drawMaze();
        if (game.state !== STATE.DYING) {
            ghosts.forEach(g => g.draw());
        }
        pac.draw();

        // READY text overlay on the maze
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
