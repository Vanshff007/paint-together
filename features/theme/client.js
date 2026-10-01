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
        darkToggleBtnApp.addEventListener('click', toggleTheme);
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

function animateSplash() {
    splashCtx.clearRect(0, 0, splashCanvas.width, splashCanvas.height);
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
    if (document.getElementById('landingScreen').style.display !== 'none') {
        requestAnimationFrame(animateSplash);
    }
}
animateSplash();
