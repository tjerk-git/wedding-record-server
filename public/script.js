'use strict';

// ─────────────────────────────────────────────
//  CMD LWD Videobooth — state machine + modes
// ─────────────────────────────────────────────

// ── Mode definitions ─────────────────────────
// Source-of-truth ordered list. Filtered by config.enabled at boot.
const ALL_MODES = [
    { id: 'photobooth', name: 'PHOTO BOOTH',     color: '#FF6BB5', textColor: '#170c25' },
    { id: 'dance',      name: 'DANCE PARTY',     color: '#8126FF', textColor: '#ffffff' },
    { id: 'confession', name: 'CONFESSION',      color: '#384BDA', textColor: '#ffffff' },
    { id: 'mirror',     name: 'FUNHOUSE MIRROR', color: '#26ccff', textColor: '#170c25' },
    { id: 'oscar',      name: 'OSCAR SPEECH',    color: '#FFD700', textColor: '#170c25' }
];
const MODES = ALL_MODES.slice();

const CONFESSION_PROMPTS = [
    "What's the wildest thing you've done at a wedding?",
    "Share a secret about the bride or groom.",
    "What's your most embarrassing dancefloor moment?",
    "Describe your worst date in three words.",
    "What's a guilty pleasure you'll never give up?",
    "When did you last cry happy tears?",
    "Name one thing you'd never tell your mother.",
    "What's the strangest thing in your bag right now?",
    "Tell us about your first kiss.",
    "What's a lie you tell yourself often?",
    "What song instantly makes you happy?",
    "What's the kindest thing a stranger has done for you?",
    "Confess: what's still in your wardrobe from 10 years ago?",
    "What's the weirdest food you secretly love?",
    "Describe your dream wedding in five words.",
    "What's a talent nobody knows you have?",
    "What's the worst gift you've ever received?",
    "Who would play you in the movie of your life?",
    "What's a phrase you say way too often?",
    "What's the best advice you ever ignored?",
    "If you had to relive one day forever, which would it be?",
    "What's a tiny thing that always cheers you up?",
    "What's a habit you wish you'd kicked years ago?",
    "Confess your biggest celebrity crush.",
    "What's the strangest place you've fallen asleep?",
    "What would you tell your 16-year-old self?"
];

const KARAOKE_SONGS = [];

const DURATIONS = { dance: 15, confession: 15, mirror: 15, oscar: 30 };
let QR_DISPLAY_SECONDS = 20;
let SELECTOR_VELOCITY = 18;
let SHOW_CONFETTI = true;
let STRIP_BRAND_TEXT = 'CMD LWD VIDEOBOOTH';
let VIDEO_GRID_COUNT = 24;

// ── State ────────────────────────────────────
let state = 'IDLE';   // 'IDLE' | 'SPIN' | 'MODE_LOCKED' | 'ACTION' | 'QR' | 'PANIC'
let activeMode = null;
let enterDisabled = false;

// ── Rapid-press (panic) tracking ─────────────
const PANIC_THRESHOLD = 4;        // presses within window
const PANIC_WINDOW_MS = 2000;     // rolling window in ms
let panicPressTimestamps = [];
const PANIC_MESSAGES = [
    'Please stop',
    'Don\'t',
    'PLEASE stop pressing the button',
    'Why are you doing this?',
    'I\'m calling my mom',
    'Self destruct in 5..4..3..2..1'
];

let cameraStream = null;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStopped = false;

let selectorAnim = null;
const timers = {};

const ITEM_HEIGHT = 120;
const SELECTOR_VIEWPORT_HEIGHT = 600;
const SELECTOR_REPEATS = 13; // odd, so a "middle copy" exists

// ── DOM refs ─────────────────────────────────
const els = {};
function cacheEls() {
    const ids = [
        'screen-idle', 'screen-spin', 'screen-mode-locked', 'screen-qr', 'screen-panic',
        'mode-locked-icon', 'mode-locked-name',
        'video', 'mirror-canvas', 'flash-overlay',
        'selector-list', 'spin-hint',
        'action-countdown',
        'overlay-confession', 'confession-prompt',
        'overlay-dance', 'dance-text', 'dance-notes',
        'overlay-oscar', 'oscar-text',
        'overlay-photobooth', 'photo-instruction', 'photo-countdown-display',
        'qr-loading', 'qr-image', 'qr-url', 'qr-label', 'qr-countdown',
        'record-timer', 'progress-bar', 'progress-bar-container',
        'audio-shutter', 'audio-applause', 'audio-oscar-applause',
        'panic-message'
    ];
    ids.forEach(id => {
        const camelKey = id.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        els[camelKey] = document.getElementById(id);
    });
    els.stripSlots = [0, 1, 2].map(i => document.getElementById('strip-slot-' + i));
    els.danceAudio = [0, 1, 2, 3].map(i => document.getElementById('audio-dance-' + i));
    els.panicAudio = [0, 1, 2, 3, 4, 5].map(i => document.getElementById('audio-panic-' + i));
}

// ── Boot ─────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    cacheEls();
    document.addEventListener('keydown', onKeyDown);

    try {
        const r = await fetch('/api/config');
        if (r.ok) applyConfig(await r.json());
    } catch (e) {
        console.warn('[config] load failed; using defaults:', e);
    }

    loadVideoGrid();

    // Test mode shortcut: ?test=<mode-id> jumps straight to the locked screen.
    const params = new URLSearchParams(location.search);
    const testMode = params.get('test');
    if (testMode) {
        const found = ALL_MODES.find(m => m.id === testMode);
        if (found) {
            console.log('[test] running mode:', testMode);
            transitionTo('IDLE');
            setTimeout(() => showModeLocked(found), 250);
            return;
        }
        console.warn('[test] unknown mode:', testMode);
    }

    transitionTo('IDLE');
});

function applyConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return;

    if (cfg.modes && typeof cfg.modes === 'object') {
        // Filter MODES to enabled ones (preserving ALL_MODES order)
        MODES.length = 0;
        ALL_MODES.forEach(m => {
            const c = cfg.modes[m.id];
            if (!c || c.enabled !== false) MODES.push(m);
        });
        // Apply per-mode duration overrides
        for (const id in cfg.modes) {
            const c = cfg.modes[id];
            if (c && typeof c.duration === 'number' && DURATIONS[id] != null) {
                DURATIONS[id] = c.duration;
            }
        }
    }

    if (typeof cfg.qrDisplaySeconds === 'number') QR_DISPLAY_SECONDS = cfg.qrDisplaySeconds;
    if (typeof cfg.selectorVelocity === 'number') SELECTOR_VELOCITY = cfg.selectorVelocity;
    if (typeof cfg.showConfetti === 'boolean')    SHOW_CONFETTI = cfg.showConfetti;
    if (typeof cfg.stripBrandText === 'string')   STRIP_BRAND_TEXT = cfg.stripBrandText;
    if (typeof cfg.videoGridCount === 'number')   VIDEO_GRID_COUNT = cfg.videoGridCount;

    console.log('[config] applied:', { modes: MODES.map(m => m.id), DURATIONS, QR_DISPLAY_SECONDS, SHOW_CONFETTI });
}

window.addEventListener('beforeunload', cleanupEverything);

function onKeyDown(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    handleEnterPress();
}

function handleEnterPress() {
    // ── Panic state: handle first, before any enterDisabled check ──
    if (state === 'PANIC') {
        if (panicExitReady) {
            transitionTo('IDLE');
        } else {
            advancePanic();
        }
        return;
    }

    // ── Panic trigger (spam-while-locked easter egg) ──
    if (enterDisabled || state === 'MODE_LOCKED' || state === 'ACTION') {
        const now = Date.now();
        panicPressTimestamps.push(now);
        panicPressTimestamps = panicPressTimestamps.filter(t => now - t < PANIC_WINDOW_MS);
        if (panicPressTimestamps.length >= PANIC_THRESHOLD) {
            panicPressTimestamps = [];
            enterPanic();
        }
        return;
    }

    switch (state) {
        case 'IDLE': transitionTo('SPIN'); break;
        case 'SPIN': stopWheelAndLock();   break;
        case 'QR':   transitionTo('IDLE'); break;
    }
}

// ── State transitions ────────────────────────
function transitionTo(newState) {
    state = newState;
    if (newState === 'IDLE') {
        cleanupEverything();
        showScreen('IDLE');
        enterDisabled = false;
    } else if (newState === 'SPIN') {
        showScreen('SPIN');
        startSpin();
    }
}

function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (name === 'IDLE')        els.screenIdle.classList.add('active');
    else if (name === 'SPIN')   els.screenSpin.classList.add('active');
    else if (name === 'MODE_LOCKED') els.screenModeLocked.classList.add('active');
    else if (name === 'QR')     els.screenQr.classList.add('active');
    else if (name === 'PANIC')  els.screenPanic.classList.add('active');
}

function clearTimer(key) {
    const t = timers[key];
    if (!t) return;
    if (t.kind === 'interval') clearInterval(t.id);
    else if (t.kind === 'timeout') clearTimeout(t.id);
    else if (t.kind === 'raf') cancelAnimationFrame(t.id);
    delete timers[key];
}

function clearAllTimers() {
    Object.keys(timers).forEach(clearTimer);
}

function cleanupEverything() {
    clearAllTimers();

    if (selectorAnim) {
        cancelAnimationFrame(selectorAnim.rafId);
        selectorAnim = null;
    }

    stopMediaRecorder();
    stopCameraStream();

    els.video.style.display = 'none';
    els.mirrorCanvas.style.display = 'none';
    document.querySelectorAll('.mode-overlay').forEach(o => o.classList.remove('active'));
    els.actionCountdown.classList.remove('visible');
    els.actionCountdown.textContent = '';
    els.recordTimer.classList.remove('visible');
    els.progressBarContainer.classList.remove('visible');
    els.flashOverlay.style.opacity = '0';

    document.querySelectorAll('audio').forEach(a => {
        try { a.pause(); a.currentTime = 0; } catch (e) {}
    });

    els.stripSlots.forEach(s => { s.innerHTML = ''; s.classList.remove('filled'); });

    activeMode = null;
}

function stopMediaRecorder() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive' && !recordingStopped) {
        try { mediaRecorder.stop(); } catch (e) {}
    }
    mediaRecorder = null;
    recordedChunks = [];
    recordingStopped = false;
}

function stopCameraStream() {
    if (cameraStream) {
        cameraStream.getTracks().forEach(t => { try { t.stop(); } catch (e) {} });
        cameraStream = null;
    }
    const old = els.video.querySelector('video');
    if (old) old.remove();
}

// ── Vertical selector ────────────────────────
function startSpin() {
    enterDisabled = false;
    buildSelectorItems();

    selectorAnim = {
        offset: 0,
        velocity: SELECTOR_VELOCITY,
        decel: 1,
        rafId: null,
        phase: 'spinning'
    };
    drawSelector();

    const tick = () => {
        selectorAnim.offset += selectorAnim.velocity;
        if (selectorAnim.phase === 'decelerating') {
            selectorAnim.velocity *= selectorAnim.decel;
            if (selectorAnim.velocity < 0.6) {
                // snap to nearest item slot
                selectorAnim.offset = Math.round(selectorAnim.offset / ITEM_HEIGHT) * ITEM_HEIGHT;
                selectorAnim.velocity = 0;
                selectorAnim.phase = 'stopped';
                drawSelector();
                onSelectorStopped();
                return;
            }
        }
        drawSelector();
        selectorAnim.rafId = requestAnimationFrame(tick);
    };
    selectorAnim.rafId = requestAnimationFrame(tick);
}

function stopWheelAndLock() {
    if (!selectorAnim || selectorAnim.phase !== 'spinning') return;
    enterDisabled = true;
    selectorAnim.phase = 'decelerating';
    selectorAnim.decel = 0.975;
}

function buildSelectorItems() {
    const list = els.selectorList;
    list.innerHTML = '';
    for (let r = 0; r < SELECTOR_REPEATS; r++) {
        for (let i = 0; i < MODES.length; i++) {
            const m = MODES[i];
            const item = document.createElement('div');
            item.className = 'selector-item';
            item.style.background = m.color;
            item.style.color = m.textColor;
            item.innerHTML =
                `<span class="selector-num">${String(i + 1).padStart(2, '0')}</span>` +
                `<span class="selector-name">${m.name}</span>`;
            list.appendChild(item);
        }
    }
}

function drawSelector() {
    if (!selectorAnim) return;
    const cycle = MODES.length * ITEM_HEIGHT;
    const o = ((selectorAnim.offset % cycle) + cycle) % cycle;

    const N0 = Math.floor(SELECTOR_REPEATS / 2) * MODES.length;
    const listTop = (SELECTOR_VIEWPORT_HEIGHT / 2 - ITEM_HEIGHT / 2) - (N0 * ITEM_HEIGHT) - o;
    els.selectorList.style.transform = `translateY(${listTop}px)`;

    const idx = ((Math.round(o / ITEM_HEIGHT) % MODES.length) + MODES.length) % MODES.length;
    const items = els.selectorList.children;
    for (let i = 0; i < items.length; i++) {
        items[i].classList.toggle('selected', i % MODES.length === idx);
    }
}

function onSelectorStopped() {
    const cycle = MODES.length * ITEM_HEIGHT;
    const o = ((selectorAnim.offset % cycle) + cycle) % cycle;
    const idx = ((Math.round(o / ITEM_HEIGHT) % MODES.length) + MODES.length) % MODES.length;
    showModeLocked(MODES[idx]);
}

// ── Mode locked reveal ───────────────────────
function showModeLocked(mode) {
    state = 'MODE_LOCKED';
    activeMode = mode;
    showScreen('MODE_LOCKED');
    els.screenModeLocked.style.background = mode.color;
    els.screenModeLocked.style.color = mode.textColor;
    const idx = ALL_MODES.findIndex(m => m.id === mode.id);
    els.modeLockedIcon.textContent =
        'MODE ' + String(idx + 1).padStart(2, '0') + ' / ' + String(ALL_MODES.length).padStart(2, '0');
    els.modeLockedName.textContent = mode.name;

    // Re-trigger CSS animations
    [els.modeLockedIcon, els.modeLockedName].forEach(e => {
        e.style.animation = 'none';
        // eslint-disable-next-line no-unused-expressions
        e.offsetHeight;
        e.style.animation = '';
    });

    if (SHOW_CONFETTI && typeof confetti === 'function') {
        confetti({
            particleCount: 60,
            spread: 70,
            origin: { y: 0.5 },
            colors: [mode.color, '#ffffff']
        });
    }

    playAnnounce(mode.id);

    timers.modeReveal = {
        kind: 'timeout',
        id: setTimeout(() => {
            clearTimer('modeReveal');
            runMode(mode.id);
        }, 1800)
    };
}

function playAnnounce(modeId) {
    const el = document.getElementById('audio-announce-' + modeId);
    playAudio(el);
}

// ── Panic easter egg ─────────────────────────
// Click thresholds to reach each message level
const PANIC_THRESHOLDS = [1, 3, 6, 10, 14, 19];
let panicClickCount   = 0;
let panicCurrentLevel = -1;
let panicExitReady    = false;

function enterPanic() {
    state           = 'PANIC';
    panicClickCount = 0;
    panicCurrentLevel = -1;
    panicExitReady  = false;
    enterDisabled   = false;
    cleanupEverything();
    showScreen('PANIC');
    if (els.panicMessage) els.panicMessage.classList.remove('panic-exit');
    advancePanic();
}

function advancePanic() {
    panicClickCount++;
    clearTimer('panicIdle');

    // Determine which level we're at based on total click count
    let level = 0;
    for (let i = PANIC_THRESHOLDS.length - 1; i >= 0; i--) {
        if (panicClickCount >= PANIC_THRESHOLDS[i]) { level = i; break; }
    }

    const levelChanged = level !== panicCurrentLevel;
    panicCurrentLevel = level;

    // Always replay the audio; update text only when level changes
    if (levelChanged) {
        els.panicMessage.textContent = PANIC_MESSAGES[level];
    }
    playAudio(els.panicAudio[level]);

    // Start inactivity timer — if no press for 4s, show exit prompt
    timers.panicIdle = {
        kind: 'timeout',
        id: setTimeout(() => {
            delete timers.panicIdle;
            showPanicExitPrompt();
        }, 4000)
    };
}

function showPanicExitPrompt() {
    panicExitReady = true;
    els.panicMessage.textContent = 'Press once to exit';
    els.panicMessage.classList.add('panic-exit');
}

// ── Mode runner ──────────────────────────────
async function runMode(id) {
    state = 'ACTION';
    enterDisabled = true;

    // Drop the mode-locked screen immediately so the transition is visible
    // even if camera init takes a moment.
    showScreen('ACTION');

    console.log('[mode] running:', id);
    try {
        switch (id) {
            case 'photobooth': await photoboothMode(); break;
            case 'dance':      await danceMode();      break;
            case 'confession': await confessionMode(); break;
            case 'mirror':     await mirrorMode();     break;
            case 'oscar':      await oscarMode();      break;
            default: throw new Error('Unknown mode: ' + id);
        }
    } catch (e) {
        console.error('[mode] error:', e);
        showFatalError(e && e.message ? e.message : String(e));
    }
}

function showFatalError(msg) {
    state = 'QR';
    showScreen('QR');
    enterDisabled = false;
    document.querySelectorAll('.mode-overlay').forEach(o => o.classList.remove('active'));
    els.video.style.display = 'none';
    els.mirrorCanvas.style.display = 'none';
    stopMediaRecorder();
    stopCameraStream();
    els.qrLabel.textContent = 'Something went wrong';
    els.qrLoading.style.display = 'block';
    els.qrLoading.textContent = msg || 'Try again';
    els.qrImage.style.display = 'none';
    els.qrUrl.textContent = '';
    els.qrCountdown.textContent = 'Press ENTER to reset';
}

// ── Camera helpers ───────────────────────────
async function startCameraVideoElement(opts) {
    const { audio = true } = opts || {};

    showLoadingHint('Starting camera…');

    const old = els.video.querySelector('video');
    if (old) old.remove();

    const videoEl = document.createElement('video');
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;

    const audioConstraints = {
        sampleRate: { ideal: 48000 },
        channelCount: { ideal: 1 },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
    };

    let stream;
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 1280, max: 1920 },
                height: { ideal: 720, max: 1080 },
                frameRate: { ideal: 30, max: 30 }
            },
            audio: audio ? audioConstraints : false
        });
    } catch (e) {
        console.warn('[camera] HD getUserMedia failed, falling back:', e);
        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
                audio: audio
            });
        } catch (e2) {
            hideLoadingHint();
            const err = new Error('Camera unavailable: ' + (e2.name || e2.message || 'unknown'));
            err.cause = e2;
            throw err;
        }
    }

    videoEl.srcObject = stream;
    els.video.appendChild(videoEl);
    els.video.style.display = 'block';
    cameraStream = stream;

    // Some browsers won't autoplay without an explicit call.
    try { await videoEl.play(); } catch (e) { console.warn('[camera] play() rejected:', e); }

    // Wait for first frame, with a hard timeout.
    await new Promise((resolve, reject) => {
        if (videoEl.videoWidth) return resolve();
        const cleanup = () => { videoEl.onloadedmetadata = null; clearTimeout(to); };
        const to = setTimeout(() => {
            cleanup();
            reject(new Error('Camera did not produce a frame in 8s'));
        }, 8000);
        videoEl.onloadedmetadata = () => { cleanup(); resolve(); };
    });

    hideLoadingHint();
    return { stream, videoEl };
}

function showLoadingHint(text) {
    els.actionCountdown.classList.add('visible');
    els.actionCountdown.style.fontSize = '4rem';
    els.actionCountdown.textContent = text;
}

function hideLoadingHint() {
    els.actionCountdown.classList.remove('visible');
    els.actionCountdown.style.fontSize = '';
    els.actionCountdown.textContent = '';
}

// ── Generic countdown 3-2-1 ──────────────────
async function showCountdown(from = 3) {
    els.actionCountdown.style.fontSize = '';
    els.actionCountdown.classList.add('visible');
    for (let n = from; n > 0; n--) {
        els.actionCountdown.textContent = String(n);
        await sleep(1000);
    }
    els.actionCountdown.textContent = '';
    els.actionCountdown.classList.remove('visible');
}

// ── Recording timer ──────────────────────────
function startRecordTimer(seconds) {
    els.recordTimer.classList.add('visible');
    els.progressBarContainer.classList.add('visible');
    let remaining = seconds;
    els.recordTimer.textContent = remaining;

    els.progressBar.style.transition = 'none';
    els.progressBar.style.transform = 'scaleX(1)';
    requestAnimationFrame(() => {
        els.progressBar.style.transition = `transform ${seconds}s linear`;
        els.progressBar.style.transform = 'scaleX(0)';
    });

    timers.recordCountdown = {
        kind: 'interval',
        id: setInterval(() => {
            remaining--;
            if (remaining > 0) {
                els.recordTimer.textContent = remaining;
            } else {
                clearTimer('recordCountdown');
                els.recordTimer.classList.remove('visible');
                els.progressBarContainer.classList.remove('visible');
                els.progressBar.style.transition = 'none';
                els.progressBar.style.transform = 'scaleX(1)';
            }
        }, 1000)
    };
}

// ── MediaRecorder helper ─────────────────────
function startRecording(stream, durationSec) {
    return new Promise((resolve, reject) => {
        recordedChunks = [];
        recordingStopped = false;

        let mimeType = '';
        if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) mimeType = 'video/webm;codecs=vp8,opus';
        else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')) mimeType = 'video/webm;codecs=vp9,opus';
        else if (MediaRecorder.isTypeSupported('video/webm')) mimeType = 'video/webm';
        else if (MediaRecorder.isTypeSupported('video/mp4')) mimeType = 'video/mp4';

        const opts = { videoBitsPerSecond: 2_500_000, audioBitsPerSecond: 128_000 };
        if (mimeType) opts.mimeType = mimeType;

        try {
            mediaRecorder = new MediaRecorder(stream, opts);
        } catch (e) {
            return reject(e);
        }

        mediaRecorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) recordedChunks.push(e.data);
        };
        mediaRecorder.onerror = (e) => reject(e);
        mediaRecorder.onstop = () => {
            if (recordingStopped) return;
            recordingStopped = true;
            const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || 'video/webm' });
            resolve(blob);
        };

        mediaRecorder.start(500);
        startRecordTimer(durationSec);

        timers.recordStop = {
            kind: 'timeout',
            id: setTimeout(() => {
                clearTimer('recordStop');
                if (mediaRecorder && mediaRecorder.state === 'recording') {
                    try { mediaRecorder.stop(); } catch (e) {}
                }
            }, durationSec * 1000)
        };
    });
}

// ── Mode: Confession ─────────────────────────
async function confessionMode() {
    const prompt = CONFESSION_PROMPTS[Math.floor(Math.random() * CONFESSION_PROMPTS.length)];
    activeMode.prompt = prompt;

    const { stream } = await startCameraVideoElement({ audio: true });
    els.confessionPrompt.textContent = prompt;
    els.overlayConfession.classList.add('active');

    showScreen('ACTION');
    await sleep(4000);
    await showCountdown(3);

    const blob = await startRecording(stream, DURATIONS.confession);

    els.overlayConfession.classList.remove('active');
    await uploadVideoAndShowQR(blob, { prompt, label: 'Your confession is saved!' });
}

// ── Mode: Oscar ──────────────────────────────
async function oscarMode() {
    showScreen('ACTION');
    els.overlayOscar.classList.add('active');

    // Let the mode-locked announcer (oscar.mp3) finish, then play opening applause
    els.oscarText.textContent = 'AND THE OSCAR GOES TO...';
    if (SHOW_CONFETTI && typeof confetti === 'function') {
        confetti({ particleCount: 80, spread: 90, origin: { y: 0.4 }, colors: ['#FFB800', '#FFD700', '#FFF59D'] });
    }

    // Short pause so the announcer from the mode-locked screen is clearly heard
    await sleep(600);
    playAudio(els.audioOscarApplause);

    await sleep(2200);
    els.oscarText.textContent = 'YOU!';
    if (SHOW_CONFETTI && typeof confetti === 'function') {
        confetti({ particleCount: 220, spread: 130, origin: { y: 0.5 }, colors: ['#FFB800', '#FFD700', '#FFF59D', '#ffffff'] });
    }
    await sleep(1800);

    els.oscarText.textContent = 'PREPARE YOUR SPEECH';

    const { stream } = await startCameraVideoElement({ audio: true });
    await showCountdown(3);

    els.oscarText.textContent = 'YOUR ACCEPTANCE SPEECH';

    // Paparazzi flashes during the speech
    let paparazziActive = true;
    const doPaparazzi = async () => {
        while (paparazziActive) {
            // Random delay between flashes: 2–6 seconds
            await sleep(2000 + Math.random() * 4000);
            if (!paparazziActive) break;
            flashWhite();
            playAudio(els.audioShutter);
        }
    };
    doPaparazzi();

    const blob = await startRecording(stream, DURATIONS.oscar);
    paparazziActive = false;

    playAudio(els.audioApplause);
    els.overlayOscar.classList.remove('active');
    await uploadVideoAndShowQR(blob, { prompt: 'oscar', label: 'Your Oscar moment is saved!' });
}

// ── Mode: Dance ──────────────────────────────
async function danceMode() {
    const { stream } = await startCameraVideoElement({ audio: true });
    els.danceNotes.innerHTML = '';
    els.overlayDance.classList.add('active');
    showScreen('ACTION');

    // Pick and play a random dance track
    const trackIdx = Math.floor(Math.random() * els.danceAudio.length);
    const danceTrack = els.danceAudio[trackIdx];
    playAudio(danceTrack);

    const noteColors = ['#FF6BB5', '#8126FF', '#FFB800', '#26ccff', '#ffffff'];
    timers.danceNotes = {
        kind: 'interval',
        id: setInterval(() => {
            const note = document.createElement('div');
            note.className = 'music-note';
            const size = 18 + Math.random() * 32;
            note.style.width = size + 'px';
            note.style.height = size + 'px';
            note.style.left = Math.random() * 100 + 'vw';
            note.style.bottom = '0';
            note.style.background = noteColors[Math.floor(Math.random() * noteColors.length)];
            note.style.borderRadius = Math.random() > 0.5 ? '50%' : '4px';
            note.style.animationDuration = (3 + Math.random() * 2) + 's';
            els.danceNotes.appendChild(note);
            setTimeout(() => note.remove(), 5500);
        }, 220)
    };

    // Spawn cat GIFs at random positions
    const catGifs = ['images/catjam-cat.gif', 'images/scuba-scuba-dance.gif'];
    timers.danceCats = {
        kind: 'interval',
        id: setInterval(() => {
            const cat = document.createElement('img');
            cat.src = catGifs[Math.floor(Math.random() * catGifs.length)];
            cat.className = 'dance-cat';
            cat.style.left = (5 + Math.random() * 80) + 'vw';
            cat.style.top  = (10 + Math.random() * 70) + 'vh';
            els.danceNotes.appendChild(cat);
            setTimeout(() => cat.remove(), 4000);
        }, 1800)
    };

    await showCountdown(3);
    const blob = await startRecording(stream, DURATIONS.dance);

    clearTimer('danceNotes');
    clearTimer('danceCats');
    if (danceTrack) { try { danceTrack.pause(); danceTrack.currentTime = 0; } catch (e) {} }
    els.overlayDance.classList.remove('active');

    await uploadVideoAndShowQR(blob, { prompt: 'dance', label: 'Your dance is saved!' });
}

// ── Mode: Funhouse Mirror ────────────────────
async function mirrorMode() {
    const { stream, videoEl } = await startCameraVideoElement({ audio: true });

    els.video.style.display = 'none';
    const canvas = els.mirrorCanvas;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    canvas.style.display = 'block';
    const ctx = canvas.getContext('2d');

    showScreen('ACTION');

    const distortions = ['stretch-wide', 'stretch-tall', 'wave'];
    let distIdx = 0;
    let distStart = performance.now();
    const DIST_DURATION = 5000;
    let drawing = true;

    function draw() {
        if (!drawing) return;
        const now = performance.now();
        if (now - distStart > DIST_DURATION) {
            distIdx = (distIdx + 1) % distortions.length;
            distStart = now;
        }

        const cw = canvas.width, ch = canvas.height;
        const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
        if (!vw || !vh) {
            requestAnimationFrame(draw);
            return;
        }

        ctx.fillStyle = '#000a1e';
        ctx.fillRect(0, 0, cw, ch);

        const dist = distortions[distIdx];
        ctx.save();
        ctx.translate(cw, 0);
        ctx.scale(-1, 1);

        if (dist === 'stretch-wide') {
            const scale = Math.max(cw / vw, ch / vh);
            const dw = vw * scale * 1.6;
            const dh = vh * scale * 0.7;
            ctx.drawImage(videoEl, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
        } else if (dist === 'stretch-tall') {
            const scale = Math.max(cw / vw, ch / vh);
            const dw = vw * scale * 0.7;
            const dh = vh * scale * 1.6;
            ctx.drawImage(videoEl, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
        } else if (dist === 'wave') {
            const slices = 32;
            const sliceH = ch / slices;
            const t = (now - distStart) / 1000;
            const scale = Math.max(cw / vw, ch / vh);
            const dw = vw * scale, dh = vh * scale;
            const dx0 = (cw - dw) / 2, dy0 = (ch - dh) / 2;
            for (let i = 0; i < slices; i++) {
                const y = i * sliceH;
                const offset = Math.sin(i * 0.4 + t * 3) * 50;
                const sy = Math.max(0, (y - dy0) * (vh / dh));
                const ssh = Math.min(vh - sy, sliceH * (vh / dh));
                if (ssh > 0) {
                    ctx.drawImage(videoEl, 0, sy, vw, ssh, dx0 + offset, y, dw, sliceH);
                }
            }
        }
        ctx.restore();
        requestAnimationFrame(draw);
    }
    draw();

    const canvasStream = canvas.captureStream(30);
    stream.getAudioTracks().forEach(t => canvasStream.addTrack(t));

    await showCountdown(3);
    const blob = await startRecording(canvasStream, DURATIONS.mirror);

    drawing = false;
    canvas.style.display = 'none';

    await uploadVideoAndShowQR(blob, { prompt: 'mirror', label: 'Your funhouse video is saved!' });
}

// ── Mode: Photobooth ─────────────────────────
async function photoboothMode() {
    console.log('[photobooth] requesting camera (video only)');
    const { videoEl } = await startCameraVideoElement({ audio: false });
    console.log('[photobooth] camera ready', videoEl.videoWidth, 'x', videoEl.videoHeight);

    els.photoInstruction.textContent = 'Get ready for 3 photos!';
    els.photoCountdownDisplay.textContent = '';
    els.overlayPhotobooth.classList.add('active');
    showScreen('ACTION');

    await sleep(1500);

    const photos = [];
    for (let i = 0; i < 3; i++) {
        console.log('[photobooth] photo', i + 1);
        els.photoInstruction.textContent = `Photo ${i + 1} of 3 — pose!`;
        for (let n = 3; n > 0; n--) {
            els.photoCountdownDisplay.textContent = String(n);
            await sleep(1000);
        }
        els.photoCountdownDisplay.textContent = '';

        flashWhite();
        playAudio(els.audioShutter);
        await sleep(40);

        const photoCanvas = capturePhoto(videoEl);
        photos.push(photoCanvas);

        const slot = els.stripSlots[i];
        slot.innerHTML = '';
        const thumb = document.createElement('canvas');
        thumb.width = photoCanvas.width;
        thumb.height = photoCanvas.height;
        thumb.getContext('2d').drawImage(photoCanvas, 0, 0);
        slot.appendChild(thumb);
        slot.classList.add('filled');

        if (i < 2) await sleep(2000);
    }

    console.log('[photobooth] composing strip');
    els.photoInstruction.textContent = 'Building your strip...';
    const stripCanvas = composeStrip(photos);

    els.overlayPhotobooth.classList.remove('active');
    console.log('[photobooth] uploading strip');
    await uploadStripAndShowQR(stripCanvas);
}

function capturePhoto(videoEl) {
    const vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    const targetW = 420, targetH = 320;
    const targetRatio = targetW / targetH;
    const sourceRatio = vw / vh;
    let sx, sy, sw, sh;
    if (sourceRatio > targetRatio) {
        sh = vh;
        sw = vh * targetRatio;
        sx = (vw - sw) / 2;
        sy = 0;
    } else {
        sw = vw;
        sh = vw / targetRatio;
        sx = 0;
        sy = (vh - sh) / 2;
    }
    const c = document.createElement('canvas');
    c.width = targetW;
    c.height = targetH;
    const ctx = c.getContext('2d');
    ctx.translate(targetW, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(videoEl, sx, sy, sw, sh, 0, 0, targetW, targetH);
    return c;
}

function composeStrip(photos) {
    const W = 420, H = 1220;
    const photoH = 320, gap = 20, brand = 80;
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d');

    ctx.fillStyle = '#170c25';
    ctx.fillRect(0, 0, W, H);

    let y = gap;
    photos.forEach(p => {
        ctx.drawImage(p, 0, y);
        y += photoH + gap;
    });

    ctx.fillStyle = '#000765';
    ctx.fillRect(0, H - brand, W, brand);
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 26px Switzer, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(STRIP_BRAND_TEXT, W / 2, H - brand / 2 - 6);
    ctx.font = '500 14px Switzer, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(new Date().toLocaleDateString(), W / 2, H - brand / 2 + 18);

    return c;
}

function flashWhite() {
    els.flashOverlay.style.transition = 'opacity 80ms linear';
    els.flashOverlay.style.opacity = '1';
    setTimeout(() => {
        els.flashOverlay.style.transition = 'opacity 400ms linear';
        els.flashOverlay.style.opacity = '0';
    }, 80);
}

// ── Upload + QR ──────────────────────────────
async function uploadVideoAndShowQR(blob, opts) {
    const { prompt = '', label = 'Scan to keep your memory!' } = opts || {};
    transitionToQRDisplay(label);

    const mimeType = blob.type || 'video/webm';
    const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
    const fd = new FormData();
    fd.append('video', blob, `recording.${ext}`);
    fd.append('prompt', prompt);
    if (activeMode) fd.append('mode', activeMode.id);

    try {
        const res = await fetch('/api/upload/video', { method: 'POST', body: fd });
        const r = await res.json();
        if (r && r.qr) renderQR(r.qr, r.url);
        else renderQRError();
    } catch (e) {
        console.error('Video upload failed:', e);
        renderQRError();
    }

    setTimeout(() => loadVideoGrid(), 500);
    startQRAutoReset();
}

async function uploadStripAndShowQR(canvas) {
    transitionToQRDisplay('Scan to take home your strip!');

    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    const fd = new FormData();
    fd.append('strip', blob, 'strip.png');

    try {
        const res = await fetch('/api/upload/strip', { method: 'POST', body: fd });
        const r = await res.json();
        if (r && r.qr) renderQR(r.qr, r.url);
        else renderQRError();
    } catch (e) {
        console.error('Strip upload failed:', e);
        renderQRError();
    }

    startQRAutoReset();
}

function transitionToQRDisplay(label) {
    state = 'QR';
    showScreen('QR');
    enterDisabled = true;

    stopMediaRecorder();
    stopCameraStream();
    els.video.style.display = 'none';
    els.mirrorCanvas.style.display = 'none';
    document.querySelectorAll('.mode-overlay').forEach(o => o.classList.remove('active'));

    els.qrLabel.textContent = label || 'Scan to keep your memory!';
    els.qrLoading.style.display = 'block';
    els.qrLoading.textContent = 'Saving...';
    els.qrImage.style.display = 'none';
    els.qrImage.src = '';
    els.qrUrl.textContent = '';
    els.qrCountdown.textContent = '';

    if (SHOW_CONFETTI && typeof confetti === 'function') {
        const baseColor = activeMode ? activeMode.color : '#8126FF';
        const colors = [baseColor, '#ffffff', '#FFB800'];
        confetti({ particleCount: 200, spread: 120, origin: { y: 0.6 }, colors });
        confetti({ particleCount: 80, angle: 0,   spread: 70, origin: { x: 0, y: 0.5 }, colors });
        confetti({ particleCount: 80, angle: 180, spread: 70, origin: { x: 1, y: 0.5 }, colors });
    }
}

function renderQR(qrDataUrl, url) {
    els.qrLoading.style.display = 'none';
    els.qrImage.src = qrDataUrl;
    els.qrImage.style.display = 'block';
    els.qrUrl.textContent = url || '';
}

function renderQRError() {
    els.qrLoading.textContent = 'Upload failed — press ENTER to reset';
    enterDisabled = false;
}

function startQRAutoReset() {
    enterDisabled = false;
    let remaining = QR_DISPLAY_SECONDS;
    els.qrCountdown.textContent = `Resetting in ${remaining}s`;
    timers.qrReset = {
        kind: 'interval',
        id: setInterval(() => {
            remaining--;
            if (remaining > 0) {
                els.qrCountdown.textContent = `Resetting in ${remaining}s`;
            } else {
                clearTimer('qrReset');
                if (state === 'QR') transitionTo('IDLE');
            }
        }, 1000)
    };
}

// ── Helpers ──────────────────────────────────
function sleep(ms) {
    return new Promise(resolve => {
        const id = setTimeout(() => {
            delete timers['sleep_' + id];
            resolve();
        }, ms);
        timers['sleep_' + id] = { kind: 'timeout', id };
    });
}

function playAudio(el) {
    if (!el) return;
    try {
        el.currentTime = 0;
        const p = el.play();
        if (p && p.catch) p.catch(e => console.warn('audio play failed:', e));
    } catch (e) {}
}

function loadVideoGrid() {
    fetch('/api/videos')
        .then(r => r.json())
        .then(data => {
            const grid = document.getElementById('video-grid-background');
            if (!grid) return;
            grid.innerHTML = '';
            const videos = data.videos || [];
            const count = Math.max(0, Math.min(48, VIDEO_GRID_COUNT | 0));
            const recent = videos.slice(0, count);
            const clipPaths = [
                'circle(40% at 50% 50%)',
                'polygon(50% 0%, 0% 100%, 100% 100%)',
                'inset(5% 5% 5% 5%)',
                'polygon(25% 0%, 100% 0%, 75% 100%, 0% 100%)'
            ];
            for (let i = 0; i < count; i++) {
                const item = document.createElement('div');
                item.className = 'video-grid-item';
                if (recent[i]) {
                    const v = document.createElement('video');
                    v.src = `/uploads/${recent[i]}`;
                    v.muted = true;
                    v.autoplay = true;
                    v.loop = true;
                    v.preload = 'metadata';
                    v.style.transform = 'scale(0.8)';
                    v.style.clipPath = clipPaths[i % clipPaths.length];
                    v.addEventListener('timeupdate', () => {
                        if (v.currentTime >= 10) v.currentTime = 0;
                    });
                    item.appendChild(v);
                }
                grid.appendChild(item);
            }
        })
        .catch(err => console.error('video grid load:', err));
}
