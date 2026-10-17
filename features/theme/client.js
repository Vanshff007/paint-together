// Theme feature: dark mode toggle and landing splash animation.

// DARK MODE
const html = document.documentElement;
// A saved toggle choice wins; otherwise follow the system/browser setting.
const systemDark = window.matchMedia('(prefers-color-scheme: dark)');
const savedTheme = localStorage.getItem('theme');
let isDark = savedTheme ? savedTheme === 'dark' : systemDark.matches;

function applyTheme(dark) {
    html.setAttribute('data-theme', dark ? 'dark' : 'light');
    document.querySelectorAll('.dark-toggle, .dark-toggle-app').forEach(btn => {
        btn.textContent = dark ? '☀️' : '🌙';
    });
}

function toggleTheme() {
    isDark = !isDark;
    applyTheme(isDark);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
}

applyTheme(isDark);

// Follow live system changes until the user picks a theme with the toggle.
systemDark.addEventListener('change', e => {
    if (localStorage.getItem('theme')) return;
    isDark = e.matches;
    applyTheme(isDark);
});

const darkToggleBtn = document.getElementById('darkToggleBtn');
if (darkToggleBtn) {
    darkToggleBtn.addEventListener('click', toggleTheme);
}

function initAppDarkMode() {
    const darkToggleBtnApp = document.getElementById('darkToggleBtnApp');
    if (darkToggleBtnApp) {
        darkToggleBtnApp.onclick = toggleTheme; // not addEventListener: showApp runs on every join
    }
}

// SPLASH CANVAS ANIMATION
const splashCanvas = document.getElementById('splashCanvas');
const splashCtx = splashCanvas.getContext('2d');
let splashBubbles = [];
function resizeSplash() {
    splashCanvas.width  = window.innerWidth;
    splashCanvas.height = window.innerHeight;
}
resizeSplash();
window.addEventListener('resize', resizeSplash);

function createBubble() {
    const colors = [
        'rgba(6,182,212,0.18)', 'rgba(14,116,144,0.15)', 'rgba(56,239,125,0.12)',
        'rgba(236,72,153,0.12)', 'rgba(167,139,250,0.13)', 'rgba(245,87,108,0.11)',
        'rgba(247,151,30,0.12)',
    ];
    return {
        x: Math.random() * splashCanvas.width,
        y: Math.random() * splashCanvas.height,
        baseR: 60 + Math.random() * 120,
        pulsePhase: Math.random() * Math.PI * 2,
        pulseSpeed: 0.02 + Math.random() * 0.03,
        color: colors[Math.floor(Math.random() * colors.length)],
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
        phase: Math.random() * Math.PI * 2,
        speed: 0.005 + Math.random() * 0.01,
    };
}

for (let i = 0; i < 14; i++) splashBubbles.push(createBubble());

// Paint balloons: click the background around the card to throw a balloon that bursts into a splat.
let balloons = [];
let splats = [];
const splatColors = ['#06b6d4', '#ec4899', '#a78bfa', '#f5576c', '#f7971e', '#38ef7d', '#0e7490'];
document.getElementById('landingScreen').addEventListener('pointerdown', e => {
    if (e.target.closest('.landing-card, .dark-toggle, .clear-splats')) return;
    balloons.push({
        sx: e.clientX + (Math.random() - 0.5) * 300, sy: splashCanvas.height + 40, // thrown from below the screen
        tx: e.clientX, ty: e.clientY, born: performance.now(),
        color: splatColors[Math.floor(Math.random() * splatColors.length)],
    });
});

// Hose: the clean button sprays water from the bottom right corner, sweeping from left to up.
// Each splat washes away (fades and drips down) when a water drop hits it.
const clearSplatsBtn = document.getElementById('clearSplatsBtn');
const WASH_MS = 2000;
let wash = null;      // { born } while the hose runs
let water = [];       // spray drops
let lastWashFrame = 0;
clearSplatsBtn.addEventListener('click', () => {
    clearSplatsBtn.hidden = true;
    wash = { born: performance.now() };
});

const nozzle = () => [splashCanvas.width - 20, splashCanvas.height - 20];

function drawWash(now) {
    const k = Math.min(3, (now - lastWashFrame) / 16.7); // frames at 60fps since last draw
    lastWashFrame = now;
    const [nx, ny] = nozzle();
    if (wash) {
        const t = (now - wash.born) / WASH_MS;
        if (t >= 1) { wash = null; splats.forEach(s => { s.washed = s.washed || now; }); } // anything the spray missed
        else {
            const a = -Math.PI + t * (Math.PI / 2 + 0.2); // a little past straight up
            for (let i = 0; i < 8; i++) {
                const da = a + (Math.random() - 0.5) * 0.12, v = 30 + Math.random() * 12;
                water.push({ x: nx, y: ny, vx: Math.cos(da) * v, vy: Math.sin(da) * v, life: 1 });
            }
            // hose nozzle pointing along the stream
            splashCtx.save();
            splashCtx.translate(nx, ny);
            splashCtx.rotate(a);
            splashCtx.globalAlpha = 1;
            splashCtx.fillStyle = '#4b5563';
            splashCtx.fillRect(-40, -7, 40, 14);
            splashCtx.fillStyle = '#9ca3af';
            splashCtx.fillRect(0, -5, 14, 10);
            splashCtx.restore();
        }
    }
    splashCtx.strokeStyle = '#38bdf8';
    splashCtx.lineWidth = 6;
    splashCtx.lineCap = 'round';
    water = water.filter(w => {
        w.x += w.vx * k; w.y += w.vy * k; w.vy += 0.3 * k; w.life -= 0.015 * k; // a little gravity on the spray
        splats.forEach(s => { if (!s.washed && Math.hypot(s.x - w.x, s.y - w.y) < 50) s.washed = now; });
        splashCtx.globalAlpha = 0.8 * w.life;
        splashCtx.beginPath();
        splashCtx.moveTo(w.x, w.y);
        splashCtx.lineTo(w.x - w.vx * 0.6, w.y - w.vy * 0.6);
        splashCtx.stroke();
        return w.life > 0 && w.x > -50 && w.y > -50;
    });
}

function makeSplat(x, y, color, born) {
    const R = 25 + Math.random() * 25;
    const blob = [];
    for (let i = 0; i < 18; i++) blob.push(R * (0.75 + Math.random() * 0.45));
    const drops = [];
    for (let i = 0, n = 5 + Math.floor(Math.random() * 6); i < n; i++) {
        const a = Math.random() * Math.PI * 2, d = R * (1.2 + Math.random() * 1.1);
        drops.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, r: 2 + Math.random() * R * 0.18 });
    }
    return { x, y, blob, drops, born, color };
}

const BALLOON_FLIGHT = 450; // ms
function drawBalloon(b, now) {
    const t = (now - b.born) / BALLOON_FLIGHT;
    if (t >= 1) {
        splats.push(makeSplat(b.tx, b.ty, b.color, now));
        clearSplatsBtn.hidden = false;
        if (splats.length > 100) splats.shift(); // ponytail: oldest splat drops past 100, bake into an offscreen canvas if a bigger wall is wanted
        return false;
    }
    const x = b.sx + (b.tx - b.sx) * t;
    const y = b.sy + (b.ty - b.sy) * t - Math.sin(t * Math.PI) * 120; // arc up over the target
    const r = 22 - t * 8;                                                // shrinks as it flies away
    splashCtx.save();
    splashCtx.translate(x, y);
    splashCtx.rotate(t * Math.PI * 2);                                   // tumbles in flight
    splashCtx.globalAlpha = 0.95;
    splashCtx.fillStyle = b.color;
    splashCtx.beginPath();
    splashCtx.ellipse(0, 0, r * 0.85, r, 0, 0, Math.PI * 2);
    splashCtx.moveTo(-3, r - 1); splashCtx.lineTo(3, r - 1); splashCtx.lineTo(0, r + 5); // knot
    splashCtx.fill();
    splashCtx.globalAlpha = 0.5;
    splashCtx.fillStyle = '#fff';
    splashCtx.beginPath();
    splashCtx.ellipse(-r * 0.3, -r * 0.4, r * 0.15, r * 0.25, -0.5, 0, Math.PI * 2); // shine
    splashCtx.fill();
    splashCtx.restore();
    return true;
}

function drawSplat(s, now) {
    const age = now - s.born;
    const grow = Math.min(1, age / 120);                  // pop in over 120ms
    const washT = s.washed ? (now - s.washed) / 800 : 0; // washed away over 800ms
    if (washT >= 1) return false;
    splashCtx.save();
    splashCtx.translate(0, washT * 60);                   // drips down while fading
    splashCtx.globalAlpha = 0.85 * (1 - washT);
    splashCtx.fillStyle = s.color;
    splashCtx.beginPath();
    const n = s.blob.length;
    const pt = i => {
        const a = (i % n) / n * Math.PI * 2, r = s.blob[i % n] * grow;
        return [s.x + Math.cos(a) * r, s.y + Math.sin(a) * r];
    };
    // smooth closed blob: curve through midpoints of neighbouring points
    let [px, py] = pt(0), [qx, qy] = pt(1);
    splashCtx.moveTo((px + qx) / 2, (py + qy) / 2);
    for (let i = 1; i <= n; i++) {
        [px, py] = pt(i); [qx, qy] = pt(i + 1);
        splashCtx.quadraticCurveTo(px, py, (px + qx) / 2, (py + qy) / 2);
    }
    splashCtx.fill();
    s.drops.forEach(d => {
        splashCtx.beginPath();
        splashCtx.arc(s.x + d.x * grow, s.y + d.y * grow, d.r * grow, 0, Math.PI * 2);
        splashCtx.fill();
    });
    splashCtx.restore();
    return true;
}

function animateSplash() {
    splashCtx.clearRect(0, 0, splashCanvas.width, splashCanvas.height);
    splashCtx.globalAlpha = 0.25;
    splashBubbles.forEach(b => {
        b.phase += b.speed;
        b.pulsePhase += b.pulseSpeed;
        b.x += b.vx + Math.sin(b.phase) * 0.3;
        b.y += b.vy + Math.cos(b.phase * 0.7) * 0.3;
        const currentR = b.baseR + Math.sin(b.pulsePhase) * 15;
        if (b.x < -currentR) b.x = splashCanvas.width + currentR;
        if (b.x > splashCanvas.width + currentR) b.x = -currentR;
        if (b.y < -currentR) b.y = splashCanvas.height + currentR;
        if (b.y > splashCanvas.height + currentR) b.y = -currentR;
        const grad = splashCtx.createRadialGradient(b.x, b.y, 0, b.x, b.y, currentR);
        grad.addColorStop(0, b.color);
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        splashCtx.beginPath();
        splashCtx.arc(b.x, b.y, currentR, 0, Math.PI * 2);
        splashCtx.fillStyle = grad;
        splashCtx.fill();
    });
    const now = performance.now();
    splats = splats.filter(s => drawSplat(s, now));
    drawWash(now);
    balloons = balloons.filter(b => drawBalloon(b, now));
    if (document.getElementById('landingScreen').style.display !== 'none') {
        requestAnimationFrame(animateSplash);
    }
}
animateSplash();
