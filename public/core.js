// Shared client state and helpers used by every feature.
// Loaded first; feature scripts in features/*/client.js rely on these globals.

// SOCKET.IO
const socket = io();

let currentRoomId = null;
let myColor = '#06b6d4';
let myName  = 'Guest';
let amIHost = false;
let currentHostId = null;
let mySocketId = null;
let wasKicked = false;

// SHARED DOM ELEMENTS
const landingScreen    = document.getElementById('landingScreen');
const appScreen        = document.getElementById('appScreen');
const toast            = document.getElementById('toast');
const canvas        = document.getElementById('canvas');
const ctx           = canvas.getContext('2d');

// TOAST

let toastTimer = null;

function showToast(message, duration = 2500) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
}

// SHOW APP
function showApp() {
    console.log('🎯 showApp() called — switching to canvas view');
    initColorPalette();
    initAppDarkMode();

    // Hide landing immediately
    landingScreen.style.opacity = '0';
    landingScreen.style.pointerEvents = 'none';

    // Show app screen — remove inline opacity:0, set display, add visible class
    appScreen.style.display        = 'flex';
    appScreen.style.flexDirection  = 'column';
    appScreen.style.opacity        = '1';   
    appScreen.classList.add('visible');

    // Hide landing after transition completes
    setTimeout(() => {
        landingScreen.style.display = 'none';
        landingScreen.classList.add('fade-out');
    }, 400);
}
