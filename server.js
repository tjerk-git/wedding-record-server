const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const crypto = require('crypto');
const QRCode = require('qrcode');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// ── Data directory (override with DATA_DIR env var; /data on Fly.io) ─────────
const DATA_DIR = process.env.DATA_DIR || __dirname;
const uploadsDir = path.join(DATA_DIR, 'uploads');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// ── Admin password (optional) ────────────────────────────────────────────────
// Set ADMIN_PASSWORD env var to require HTTP Basic Auth on all admin routes.
// If not set, admin routes are unprotected (suitable for local dev / trusted LAN).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

function requireAdmin(req, res, next) {
    if (!ADMIN_PASSWORD) return next();
    const auth = req.headers.authorization || '';
    if (!auth.startsWith('Basic ')) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
        return res.status(401).send('Unauthorised');
    }
    const [, encoded] = auth.split(' ');
    const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
    const [, pass] = decoded.split(':');
    if (pass !== ADMIN_PASSWORD) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Admin"');
        return res.status(401).send('Unauthorised');
    }
    next();
}

// ── Admin config persistence ─────────────────────────────────────────────────
const DEFAULT_CONFIG = {
    modes: {
        photobooth: { enabled: true, duration: 0,  weight: 3 },
        dance:      { enabled: true, duration: 15, weight: 3 },
        confession: { enabled: true, duration: 15, weight: 3 },
        mirror:     { enabled: true, duration: 15, weight: 3 },
        oscar:      { enabled: true, duration: 30, weight: 3 }
    },
    qrDisplaySeconds: 20,
    selectorVelocity: 18,
    showConfetti: true,
    stripBrandText: 'CMD LWD VIDEOBOOTH',
    videoGridCount: 24
};

function readConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            return {
                ...DEFAULT_CONFIG,
                ...raw,
                modes: { ...DEFAULT_CONFIG.modes, ...(raw.modes || {}) }
            };
        }
    } catch (e) {
        console.error('config read failed:', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function writeConfig(cfg) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}

// ── Security middleware ───────────────────────────────────────────────────────
app.use(helmet({
    // Allow inline scripts/styles needed by the kiosk UI
    contentSecurityPolicy: false,
    // Kiosk runs in fullscreen; no need to block framing
    frameguard: false
}));

// Rate limit for upload endpoints (kiosk-facing but potentially abusable)
const uploadLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: 'Too many requests, slow down.' }
});

// Rate limit for admin mutating endpoints
const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false
});

// ── Core middleware ───────────────────────────────────────────────────────────
app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static(uploadsDir));

// ── Multer (memory storage, 50 MB limit) ─────────────────────────────────────
const ALLOWED_VIDEO_MIME = new Set(['video/webm', 'video/mp4', 'video/quicktime']);
const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Upload video
app.post('/api/upload/video', uploadLimiter, upload.single('video'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        // Determine extension from MIME type; default to webm if type is absent/octet-stream
        const rawMime = (req.file.mimetype || '').split(';')[0].trim();
        const fileExtension = rawMime.includes('mp4') ? 'mp4' : 'webm';
        const id = crypto.randomUUID();
        const finalFilename = `${id}.${fileExtension}`;
        const filePath = path.join(uploadsDir, finalFilename);

        fs.writeFileSync(filePath, req.file.buffer);

        const videoUrl = `${BASE_URL}/v/${id}`;
        const qrDataUrl = await QRCode.toDataURL(videoUrl, {
            width: 400,
            margin: 2,
            color: { dark: '#170c25', light: '#ffffff' }
        });

        res.json({ success: true, id, filename: finalFilename, url: videoUrl, qr: qrDataUrl });
    } catch (error) {
        console.error('Video upload error:', error);
        res.status(500).json({ success: false, error: 'Video upload failed' });
    }
});

// Share video page
app.get('/v/:id', (req, res) => {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(404).send('Not found');

    const files = fs.readdirSync(uploadsDir);
    const file = files.find(f => f.startsWith(id) && !f.startsWith('strip_'));
    if (!file) return res.status(404).send('Video not found');

    const videoSrc = `/uploads/${file}`;
    const slowMode = req.query.mode === 'slow';
    const playbackRate = slowMode ? 0.4 : 1;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>CMD LWD — Your Memory</title>
    <style>
        @font-face {
            font-family: 'Switzer';
            font-weight: 400;
            font-display: swap;
            src: url('/fonts/Switzer-Regular.woff2') format('woff2');
        }
        @font-face {
            font-family: 'Switzer';
            font-weight: 700;
            font-display: swap;
            src: url('/fonts/Switzer-Bold.woff2') format('woff2');
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #E0D9CE;
            color: #111111;
            font-family: 'Switzer', -apple-system, sans-serif;
            min-height: 100dvh;
            display: flex;
            flex-direction: column;
        }
        header {
            background: #000765;
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1.25rem 1.5rem;
        }
        header svg {
            width: 40px;
            height: auto;
            flex-shrink: 0;
        }
        header .site-name {
            font-size: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: rgba(255,255,255,0.55);
        }
        .hero {
            background: #000765;
            padding: 2.5rem 1.5rem 3rem;
        }
        .hero h1 {
            font-size: clamp(3rem, 14vw, 5rem);
            font-weight: 400;
            letter-spacing: -0.03em;
            line-height: 0.9;
            color: #ffffff;
        }
        .hero p {
            margin-top: 1rem;
            font-size: 1rem;
            color: rgba(255,255,255,0.5);
            letter-spacing: 0.02em;
        }
        main {
            flex: 1;
            padding: 2rem 1.5rem 3rem;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            align-items: flex-start;
        }
        video {
            width: 100%;
            max-width: 520px;
            border-radius: 4px;
            background: #000;
            display: block;
        }
        .download-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.875rem 2rem;
            background: #8126FF;
            color: #fff;
            text-decoration: none;
            font-size: 1rem;
            font-weight: 700;
            letter-spacing: -0.01em;
            -webkit-tap-highlight-color: transparent;
        }
        .download-btn:active { opacity: 0.85; }
    </style>
</head>
<body>
    <header>
        <svg viewBox="0 0 220 228" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="CMD LWD">
            <g fill="white">
                <g transform="translate(112.176546, 4.169458)">
                    <g transform="translate(51.886473, 174.150838) rotate(90) translate(-51.886473, -174.150838) translate(4.972326, 158.314862)">
                        <path d="M0,31.672 L0,0 L7.066,0 L7.066,31.672 L0,31.672 Z M5.428,31.672 L5.428,25.504 L21.107,25.504 L21.107,31.672 L5.428,31.672 Z"/>
                        <polygon points="28.958 31.672 18.775 0 25.773 0 33.198 24.382 30.461 24.382 37.751 0 43.247 0 50.537 24.382 47.823 24.382 55.247 0 62.201 0 52.017 31.672 46.499 31.672 39.187 7.335 41.789 7.335 34.476 31.672"/>
                        <path d="M69.244,31.672 L69.244,25.504 L77.095,25.504 C79.009,25.504 80.68,25.118 82.108,24.348 C83.536,23.578 84.643,22.464 85.428,21.006 C86.213,19.548 86.606,17.81 86.606,15.791 C86.606,13.787 86.206,12.068 85.406,10.632 C84.606,9.197 83.495,8.094 82.075,7.324 C80.654,6.553 78.994,6.168 77.095,6.168 L69.02,6.168 L69.02,0 L77.162,0 C79.555,0 81.764,0.385 83.791,1.155 C85.817,1.925 87.581,3.017 89.084,4.43 C90.587,5.843 91.753,7.514 92.583,9.443 C93.413,11.372 93.828,13.503 93.828,15.836 C93.828,18.154 93.413,20.281 92.583,22.217 C91.753,24.154 90.591,25.829 89.095,27.242 C87.6,28.655 85.843,29.747 83.824,30.517 C81.806,31.287 79.615,31.672 77.252,31.672 L69.244,31.672 Z M64.467,31.672 L64.467,0 L71.532,0 L71.532,31.672 L64.467,31.672 Z"/>
                    </g>
                    <path d="M107.265,5.112 C105.952,35.171 104.646,65.066 103.299,95.891 C100.207,93.423 97.586,91.385 95.023,89.277 C81.427,78.095 67.812,66.934 54.286,55.67 C51.518,53.365 49.69,53.381 46.9,56.044 C33.994,68.368 20.844,80.438 7.681,92.489 C5.722,94.282 3.222,95.487 0,97.603 C1.24,64.553 2.444,32.47 3.661,0 C37.774,1.684 72.16,3.38 107.265,5.112 Z"/>
                </g>
                <g transform="translate(15.605938, 130.026482)">
                    <path d="M14.628,96.974 L14.628,78.087 L38.666,78.087 C44.526,78.087 49.643,76.908 54.015,74.55 C58.388,72.192 61.776,68.781 64.18,64.317 C66.583,59.853 67.785,54.53 67.785,48.349 C67.785,42.214 66.561,36.949 64.111,32.553 C61.662,28.158 58.262,24.781 53.912,22.423 C49.563,20.065 44.481,18.886 38.666,18.886 L13.942,18.886 L13.942,0 L38.872,0 C46.197,0 52.962,1.179 59.166,3.537 C65.37,5.895 70.773,9.237 75.374,13.564 C79.976,17.891 83.547,23.007 86.088,28.913 C88.629,34.82 89.9,41.344 89.9,48.487 C89.9,55.583 88.629,62.096 86.088,68.026 C83.547,73.955 79.987,79.083 75.409,83.41 C70.83,87.736 65.45,91.079 59.269,93.437 C53.088,95.795 46.381,96.974 39.147,96.974 L14.628,96.974 Z M0,96.974 L0,0 L21.634,0 L21.634,96.974 L0,96.974 Z"/>
                </g>
                <path d="M49.453,0 C56.905,0 63.565,1.203 69.423,3.618 C75.259,6.023 80.39,9.325 84.808,13.52 L86.046,14.695 L85.297,15.446 C85.82,17.178 87.387,22.368 87.772,23.644 L74.214,37.638 C71.843,35.051 68.954,33.025 65.549,31.559 C62.143,30.094 58.177,29.361 53.651,29.361 C49.684,29.361 46.053,30.029 42.755,31.365 C39.457,32.702 36.612,34.631 34.219,37.153 C31.827,39.675 29.973,42.692 28.658,46.206 C27.343,49.719 26.686,53.61 26.686,57.878 C26.686,59.255 26.753,60.592 26.887,61.889 C28.027,64.327 29.475,66.468 31.231,68.32 C33.461,70.67 36.11,72.476 39.192,73.745 C42.283,75.018 45.7,75.657 49.453,75.657 C53.943,75.657 57.799,74.973 61.031,73.62 C64.264,72.266 67.021,70.364 69.316,67.908 L70.493,66.649 L86.637,82.792 L85.95,83.437 L88.44,91.955 C84.086,96.051 79.085,99.252 73.438,101.558 C67.79,103.864 61.238,105.018 53.78,105.018 C46.969,105.018 40.653,103.832 34.833,101.461 C29.014,99.09 23.927,95.76 19.573,91.47 C16.221,88.168 13.45,84.438 11.26,80.279 C8.142,76.588 5.627,72.453 3.717,67.878 C1.238,61.937 0,55.533 0,48.678 C0,41.779 1.239,35.363 3.718,29.443 C6.197,23.526 9.686,18.37 14.18,13.988 C18.666,9.614 23.911,6.188 29.903,3.715 C35.908,1.237 42.428,0 49.453,0 Z"/>
            </g>
        </svg>
        <span class="site-name">CMD Leeuwarden</span>
    </header>

    <div class="hero">
        <h1>Your<br>memory!</h1>
        <p>CMD LWD Videobooth</p>
    </div>

    <main>
        <video id="playback" src="${videoSrc}" controls playsinline autoplay loop></video>
        <a href="${videoSrc}" download="cmd-memory.webm" class="download-btn">Download video</a>
    </main>
    <script>
        (function () {
            var v = document.getElementById('playback');
            if (!v) return;
            v.playbackRate = ${playbackRate};
            v.addEventListener('loadedmetadata', function () { v.playbackRate = ${playbackRate}; });
        })();
    </script>
</body>
</html>`);
});


// ── Photo strip upload + share ────────────────────────
app.post('/api/upload/strip', uploadLimiter, upload.single('strip'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
        if (!ALLOWED_IMAGE_MIME.has(req.file.mimetype.split(';')[0].trim())) {
            return res.status(415).json({ success: false, error: 'Unsupported file type' });
        }

        const id = crypto.randomUUID();
        const finalFilename = `strip_${id}.png`;
        const filePath = path.join(uploadsDir, finalFilename);
        fs.writeFileSync(filePath, req.file.buffer);

        const stripUrl = `${BASE_URL}/s/${id}`;
        const qrDataUrl = await QRCode.toDataURL(stripUrl, {
            width: 400,
            margin: 2,
            color: { dark: '#170c25', light: '#ffffff' }
        });

        res.json({ success: true, id, filename: finalFilename, url: stripUrl, qr: qrDataUrl });
    } catch (error) {
        console.error('Strip upload error:', error);
        res.status(500).json({ success: false, error: 'Strip upload failed' });
    }
});

app.get('/s/:id', (req, res) => {
    const { id } = req.params;
    if (!/^[0-9a-f-]{36}$/.test(id)) return res.status(404).send('Not found');

    const filename = `strip_${id}.png`;
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('Strip not found');

    const stripSrc = `/uploads/${filename}`;

    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>CMD LWD — Your Photo Strip</title>
    <style>
        @font-face { font-family: 'Switzer'; font-weight: 400; font-display: swap; src: url('/fonts/Switzer-Regular.woff2') format('woff2'); }
        @font-face { font-family: 'Switzer'; font-weight: 700; font-display: swap; src: url('/fonts/Switzer-Bold.woff2') format('woff2'); }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #E0D9CE;
            color: #111111;
            font-family: 'Switzer', -apple-system, sans-serif;
            min-height: 100dvh;
            display: flex;
            flex-direction: column;
        }
        header {
            background: #000765;
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 1.25rem 1.5rem;
        }
        header .site-name {
            font-size: 0.75rem;
            font-weight: 600;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            color: rgba(255,255,255,0.55);
        }
        .hero {
            background: #000765;
            padding: 2.5rem 1.5rem 3rem;
        }
        .hero h1 {
            font-size: clamp(3rem, 14vw, 5rem);
            font-weight: 400;
            letter-spacing: -0.03em;
            line-height: 0.9;
            color: #ffffff;
        }
        .hero p {
            margin-top: 1rem;
            font-size: 1rem;
            color: rgba(255,255,255,0.5);
            letter-spacing: 0.02em;
        }
        main {
            flex: 1;
            padding: 2rem 1.5rem 3rem;
            display: flex;
            flex-direction: column;
            gap: 1.5rem;
            align-items: center;
        }
        img.strip {
            width: 100%;
            max-width: 360px;
            border-radius: 4px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.18);
            display: block;
        }
        .download-btn {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.875rem 2rem;
            background: #FF6BB5;
            color: #fff;
            text-decoration: none;
            font-size: 1rem;
            font-weight: 700;
            letter-spacing: -0.01em;
            -webkit-tap-highlight-color: transparent;
        }
        .download-btn:active { opacity: 0.85; }
    </style>
</head>
<body>
    <header>
        <span class="site-name">CMD Leeuwarden</span>
    </header>
    <div class="hero">
        <h1>Your<br>strip!</h1>
        <p>CMD LWD Photobooth</p>
    </div>
    <main>
        <img src="${stripSrc}" alt="Photo strip" class="strip">
        <a href="${stripSrc}" download="cmd-strip.png" class="download-btn">Download strip</a>
    </main>
</body>
</html>`);
});


app.post('/api/upload/screenshot', uploadLimiter, upload.single('screenshot'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });
        if (!ALLOWED_IMAGE_MIME.has(req.file.mimetype.split(';')[0].trim())) {
            return res.status(415).json({ success: false, error: 'Unsupported file type' });
        }

        const promptText = req.body.prompt || 'no_prompt';
        const sanitizedPrompt = promptText.replace(/[^a-zA-Z0-9-_\.]/g, '_').substring(0, 50);
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const randomStr = Math.random().toString(36).substring(2, 8);
        const finalFilename = `${sanitizedPrompt}_${timestamp}_${randomStr}.png`;
        const filePath = path.join(uploadsDir, finalFilename);

        fs.writeFileSync(filePath, req.file.buffer);

        res.json({
            success: true,
            message: 'Screenshot saved successfully',
            filename: finalFilename
        });
    } catch (error) {
        console.error('Screenshot upload error:', error);
        res.status(500).json({ success: false, error: 'Screenshot upload failed' });
    }
});


app.get('/api/video/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);

    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

app.get('/api/images', (req, res) => {
    try {
        const files = fs.readdirSync(uploadsDir);
        const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'];
        const imageFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return imageExtensions.includes(ext);
        });

        const sortedImageFiles = imageFiles
            .map(file => ({
                file,
                mtime: fs.statSync(path.join(uploadsDir, file)).mtime
            }))
            .sort((a, b) => a.mtime - b.mtime)
            .map(obj => obj.file);

        const lastEightImages = sortedImageFiles.slice(-6);
        res.json({ images: lastEightImages });
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch images' });
    }
});

app.get('/api/videos', (req, res) => {
    try {
        const files = fs.readdirSync(uploadsDir);
        const videoExtensions = ['.mp4', '.webm', '.mov', '.avi', '.mkv'];
        const videoFiles = files.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return videoExtensions.includes(ext);
        });

        const sortedVideoFiles = videoFiles
            .map(file => ({
                file,
                mtime: fs.statSync(path.join(uploadsDir, file)).mtime
            }))
            .sort((a, b) => b.mtime - a.mtime)
            .map(obj => obj.file);

        res.json({ videos: sortedVideoFiles });
    } catch (error) {
        console.error('Error fetching videos:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch videos' });
    }
});

// ── Admin panel + admin API ───────────────────────────────────────────────────
app.get('/tjerk-secret-panel', requireAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Config: read is kiosk-facing (no auth); write is admin-only
app.get('/api/config', (req, res) => {
    res.json(readConfig());
});

app.put('/api/config', adminLimiter, requireAdmin, (req, res) => {
    try {
        const incoming = req.body;
        if (!incoming || typeof incoming !== 'object') {
            return res.status(400).json({ success: false, error: 'Invalid body' });
        }

        const current = readConfig();
        const merged = { ...current, ...incoming };

        if (incoming.modes && typeof incoming.modes === 'object') {
            merged.modes = { ...current.modes };
            for (const key of Object.keys(DEFAULT_CONFIG.modes)) {
                const incomingMode = incoming.modes[key];
                if (!incomingMode) continue;
                merged.modes[key] = {
                    enabled: incomingMode.enabled !== false,
                    duration: Math.max(0, Math.min(120, Number(incomingMode.duration) || 0)),
                    weight:   Math.max(1, Math.min(5,   Number(incomingMode.weight)   || 3))
                };
            }
        }

        if ('qrDisplaySeconds' in merged) merged.qrDisplaySeconds = Math.max(5, Math.min(180, Number(merged.qrDisplaySeconds) || 20));
        if ('selectorVelocity' in merged) merged.selectorVelocity = Math.max(4,  Math.min(60,  Number(merged.selectorVelocity) || 18));
        if ('videoGridCount' in merged)   merged.videoGridCount   = Math.max(0,  Math.min(48,  Number(merged.videoGridCount)   || 24));
        if ('showConfetti' in merged)     merged.showConfetti     = !!merged.showConfetti;
        if ('stripBrandText' in merged)   merged.stripBrandText   = String(merged.stripBrandText).slice(0, 80);

        writeConfig(merged);
        res.json({ success: true, config: merged });
    } catch (e) {
        console.error('config write failed:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/uploads', adminLimiter, requireAdmin, (req, res) => {
    try {
        const files = fs.readdirSync(uploadsDir);
        const list = files
            .filter(f => !f.startsWith('.'))
            .map(name => {
                try {
                    const stat = fs.statSync(path.join(uploadsDir, name));
                    return { name, size: stat.size, mtime: stat.mtime.toISOString() };
                } catch (e) {
                    return null;
                }
            })
            .filter(Boolean)
            .sort((a, b) => b.mtime.localeCompare(a.mtime));
        res.json({ uploads: list });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ── Download all uploads as zip (must be before /:filename) ──────────────────
app.get('/api/uploads/download-all', adminLimiter, requireAdmin, (req, res) => {
    try {
        const files = fs.readdirSync(uploadsDir).filter(f =>
            fs.statSync(path.join(uploadsDir, f)).isFile()
        );
        if (files.length === 0) {
            return res.status(404).json({ error: 'No uploads to download' });
        }
        const date = new Date().toISOString().slice(0, 10);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="videobooth-${date}.zip"`);

        const archive = archiver('zip', { zlib: { level: 1 } });
        archive.on('error', err => { console.error('archive error:', err); res.end(); });
        archive.pipe(res);
        files.forEach(f => archive.file(path.join(uploadsDir, f), { name: f }));
        archive.finalize();
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.delete('/api/uploads/:filename', adminLimiter, requireAdmin, (req, res) => {
    try {
        const filename = req.params.filename;
        if (!filename || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
            return res.status(400).json({ success: false, error: 'Invalid filename' });
        }
        const filePath = path.join(uploadsDir, filename);
        if (!filePath.startsWith(uploadsDir + path.sep)) {
            return res.status(400).json({ success: false, error: 'Invalid path' });
        }
        if (!fs.existsSync(filePath)) return res.status(404).json({ success: false, error: 'Not found' });
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Bulk delete all uploads ───────────────────────────────────────────────────
app.delete('/api/uploads', adminLimiter, requireAdmin, (req, res) => {
    try {
        const files = fs.readdirSync(uploadsDir);
        let deleted = 0;
        files.forEach(f => {
            const fp = path.join(uploadsDir, f);
            if (fs.statSync(fp).isFile()) { fs.unlinkSync(fp); deleted++; }
        });
        res.json({ success: true, deleted });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Admin panel:        http://localhost:${PORT}/tjerk-secret-panel`);
    console.log(`Uploads directory:  ${uploadsDir}`);
    console.log(`Config path:        ${CONFIG_PATH}`);
    if (ADMIN_PASSWORD) console.log('Admin password:     [set via ADMIN_PASSWORD env var]');
});

process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    process.exit(0);
});
