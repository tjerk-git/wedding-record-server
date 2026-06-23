'use strict';

// Mode metadata mirrors the kiosk's ALL_MODES order. Keep in sync.
const MODES_META = [
    { id: 'photobooth',   name: 'PHOTO BOOTH',     color: '#FF6BB5', desc: '3-shot photo strip with white-flash effect.', durationConfigurable: false, durationLabel: '3 photos × 3s countdown' },
    { id: 'dance',        name: 'DANCE PARTY',     color: '#8126FF', desc: 'Music plays, animated notes, recording at the same time.', durationConfigurable: true },
    { id: 'confession',   name: 'CONFESSION',      color: '#384BDA', desc: 'Random prompt shown before recording.', durationConfigurable: true },
    { id: 'mirror',       name: 'FUNHOUSE MIRROR', color: '#26ccff', desc: 'Distortion drawn to canvas, captured as video.', durationConfigurable: true },
    { id: 'oscar',        name: 'OSCAR SPEECH',    color: '#FFD700', desc: 'Theatrical buildup then 30s acceptance speech.', durationConfigurable: true },
    { id: 'video_message',name: 'VIDEO MESSAGE',   color: '#10B981', desc: 'Simple video recording with no special effects.', durationConfigurable: true }
];

let config = null;
let saveTimer = null;

const status = {
    el: null,
    show(state, msg) {
        if (!this.el) this.el = document.getElementById('save-status');
        this.el.classList.remove('saved', 'saving', 'error');
        this.el.classList.add(state);
        this.el.textContent = msg;
    },
    clear() {
        if (!this.el) this.el = document.getElementById('save-status');
        this.el.classList.remove('saved', 'saving', 'error');
        this.el.textContent = '';
    }
};

// ── Boot ─────────────────────────────────────
async function init() {
    setupTabs();
    try {
        config = await fetchConfig();
    } catch (e) {
        toast('Failed to load config');
        return;
    }
    renderModes();
    renderSettings();
    loadUploads();

    document.getElementById('reload-uploads').addEventListener('click', loadUploads);

    document.getElementById('delete-all-btn').addEventListener('click', async () => {
        if (!confirm('Delete ALL uploads? This cannot be undone.')) return;
        if (!confirm('Are you sure? Every recording and photo strip will be permanently deleted.')) return;
        try {
            const r = await fetch('/api/uploads', { method: 'DELETE' });
            const j = await r.json();
            if (r.ok && j.success) {
                toast(`Deleted ${j.deleted} file${j.deleted !== 1 ? 's' : ''}`);
                loadUploads();
            } else {
                toast('Delete failed: ' + (j.error || 'unknown error'));
            }
        } catch (e) {
            toast('Delete failed');
        }
    });
}

document.addEventListener('DOMContentLoaded', init);

// ── API ──────────────────────────────────────
async function fetchConfig() {
    const r = await fetch('/api/config');
    if (!r.ok) throw new Error('config fetch failed');
    return r.json();
}

function scheduleSave() {
    status.show('saving', 'Saving…');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveConfig, 250);
}

async function saveConfig() {
    try {
        const r = await fetch('/api/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(config)
        });
        const j = await r.json();
        if (!r.ok || !j.success) throw new Error(j.error || 'save failed');
        config = j.config;
        status.show('saved', 'Saved');
        setTimeout(() => status.clear(), 1800);
    } catch (e) {
        console.error('save failed:', e);
        status.show('error', 'Save failed');
    }
}

// ── Tabs ─────────────────────────────────────
function setupTabs() {
    document.querySelectorAll('.tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            document.getElementById('tab-' + tab).classList.add('active');
            if (tab === 'uploads') loadUploads();
        });
    });
}

// ── Modes panel ──────────────────────────────
function renderModes() {
    const container = document.getElementById('mode-cards');
    container.innerHTML = '';

    MODES_META.forEach((m, idx) => {
        const cfg = config.modes[m.id] || { enabled: true, duration: 15, weight: 3 };
        const card = document.createElement('div');
        card.className = 'mode-card' + (cfg.enabled ? '' : ' disabled');
        card.dataset.id = m.id;

        const num = String(idx + 1).padStart(2, '0');
        const durationField = m.durationConfigurable
            ? `<div class="row">
                   <label class="row-label">Duration (seconds)</label>
                   <input type="number" min="1" max="120" value="${cfg.duration}"
                          data-mode="${m.id}" data-field="duration">
               </div>`
            : `<div class="row">
                   <label class="row-label">Duration</label>
                   <span class="row-label" style="color:var(--fg-3)">${m.durationLabel || 'fixed'}</span>
               </div>`;

        card.innerHTML = `
            <div class="swatch" style="background:${m.color}"></div>
            <div class="mode-num">Mode ${num}</div>
            <h3>${m.name}</h3>
            <p class="desc">${m.desc}</p>
            <div class="row">
                <label class="row-label" for="enabled-${m.id}">Show on selector</label>
                <label class="toggle">
                    <input type="checkbox" id="enabled-${m.id}"
                           ${cfg.enabled ? 'checked' : ''}
                           data-mode="${m.id}" data-field="enabled">
                    <span class="slider"></span>
                </label>
            </div>
            ${durationField}
            <div class="row weight-row">
                <label class="row-label">Probability</label>
                <div class="weight-slider-wrap">
                    <input type="range" min="1" max="5" step="1" value="${cfg.weight ?? 3}"
                           data-mode="${m.id}" data-field="weight"
                           class="weight-slider" id="weight-${m.id}">
                    <div class="weight-labels">
                        <span>Very Rare</span><span>Rare</span><span>Normal</span><span>Likely</span><span>Very Likely</span>
                    </div>
                </div>
            </div>
            <div class="actions">
                <button class="btn-primary test-btn" data-mode="${m.id}">Test mode →</button>
            </div>
        `;
        container.appendChild(card);
    });

    container.querySelectorAll('input[data-mode]').forEach(input => {
        input.addEventListener('change', () => {
            const id = input.dataset.mode;
            const field = input.dataset.field;
            if (!config.modes[id]) config.modes[id] = { enabled: true, duration: 15, weight: 3 };
            if (input.type === 'checkbox') {
                config.modes[id][field] = input.checked;
                input.closest('.mode-card').classList.toggle('disabled', !input.checked);
            } else if (field === 'weight') {
                const v = Math.max(1, Math.min(5, +input.value || 3));
                config.modes[id][field] = v;
            } else {
                const v = Math.max(1, Math.min(120, +input.value || 0));
                config.modes[id][field] = v;
                input.value = v;
            }
            scheduleSave();
        });
    });

    container.querySelectorAll('.test-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.dataset.mode;
            window.open('/?test=' + encodeURIComponent(mode), '_blank', 'noopener');
        });
    });
}

// ── Settings panel ───────────────────────────
function renderSettings() {
    const form = document.getElementById('settings-form');
    form.innerHTML = `
        <div class="field">
            <label class="field-label" for="qrDisplaySeconds">QR display time</label>
            <div class="field-row">
                <input type="number" id="qrDisplaySeconds" min="5" max="180" value="${config.qrDisplaySeconds}">
                <span class="hint">seconds before auto-reset</span>
            </div>
        </div>

        <div class="field">
            <label class="field-label" for="selectorVelocity">Selector spin speed</label>
            <div class="field-row">
                <input type="number" id="selectorVelocity" min="4" max="60" value="${config.selectorVelocity}">
                <span class="hint">px / frame · default 18</span>
            </div>
        </div>

        <div class="field">
            <label class="field-label" for="videoGridCount">Background video grid count</label>
            <div class="field-row">
                <input type="number" id="videoGridCount" min="0" max="48" value="${config.videoGridCount}">
                <span class="hint">number of background tiles · 0 hides grid</span>
            </div>
        </div>

        <div class="field">
            <label class="field-label">Confetti</label>
            <div class="field-row">
                <span class="hint">Show confetti on mode lock + QR</span>
                <label class="toggle">
                    <input type="checkbox" id="showConfetti" ${config.showConfetti ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
            </div>
        </div>

        <div class="field full">
            <label class="field-label" for="stripBrandText">Photo strip footer text</label>
            <input type="text" id="stripBrandText" maxlength="80" value="${escapeHtml(config.stripBrandText || '')}">
            <p class="hint">Shown on the bottom band of each photobooth strip.</p>
        </div>

        <div class="field full">
            <label class="field-label" for="buttonText">Idle screen button text</label>
            <input type="text" id="buttonText" maxlength="200" value="${escapeHtml(config.buttonText || 'PRESS THE<BR>BUTTON')}">
            <p class="hint">Use &lt;BR&gt; for line breaks. Shown on the idle screen.</p>
        </div>

        <div class="field full">
            <label class="field-label" for="logoPath">Logo image path</label>
            <input type="text" id="logoPath" maxlength="200" value="${escapeHtml(config.logoPath || 'images/cmd-logo.svg')}">
            <p class="hint">Path to logo image (e.g., images/cmd-logo.svg or images/my-logo.png).</p>
        </div>

        <div class="field full">
            <label class="field-label">Upload custom logo</label>
            <div class="field-row">
                <input type="file" id="logoUpload" accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif">
                <button id="uploadLogoBtn" class="btn-primary">Upload</button>
                <button id="resetLogoBtn" class="btn-secondary" ${!config.logoPath || !config.logoPath.includes('logo-uploads/') ? 'disabled' : ''}>Reset to default</button>
            </div>
            <p class="hint">Upload a custom logo (JPEG, PNG, GIF, WebP, HEIC). Max 10MB.</p>
            <div id="logoPreview" style="margin-top: 10px;">
                ${config.logoPath && config.logoPath.includes('logo-uploads/') 
                    ? `<img src="/${config.logoPath}" style="max-width: 200px; max-height: 100px; border-radius: 4px;" alt="Current logo">`
                    : '<p style="color: var(--fg-3);">Using default CMD logo</p>'
                }
            </div>
        </div>
    `;

    const bind = (id, key, type) => {
        const el = form.querySelector('#' + id);
        el.addEventListener('change', () => {
            if (type === 'bool') config[key] = el.checked;
            else if (type === 'num') config[key] = +el.value;
            else config[key] = el.value;
            scheduleSave();
        });
    };
    bind('qrDisplaySeconds', 'qrDisplaySeconds', 'num');
    bind('selectorVelocity', 'selectorVelocity', 'num');
    bind('videoGridCount',   'videoGridCount',   'num');
    bind('showConfetti',     'showConfetti',     'bool');
    bind('stripBrandText',   'stripBrandText',   'str');
    bind('buttonText',       'buttonText',       'str');
    bind('logoPath',        'logoPath',        'str');

    // Logo upload handlers
    const logoUploadInput = form.querySelector('#logoUpload');
    const uploadLogoBtn = form.querySelector('#uploadLogoBtn');
    const resetLogoBtn = form.querySelector('#resetLogoBtn');
    const logoPreview = form.querySelector('#logoPreview');

    uploadLogoBtn.addEventListener('click', async () => {
        const file = logoUploadInput.files[0];
        if (!file) {
            toast('Please select a file first');
            return;
        }

        const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
        if (!validTypes.includes(file.type)) {
            toast('Please select a valid image file (JPEG, PNG, GIF, WebP, HEIC)');
            return;
        }

        if (file.size > 10 * 1024 * 1024) {
            toast('File is too large (max 10MB)');
            return;
        }

        uploadLogoBtn.disabled = true;
        uploadLogoBtn.textContent = 'Uploading...';

        try {
            const fd = new FormData();
            fd.append('logo', file);

            const res = await fetch('/api/upload/logo', {
                method: 'POST',
                body: fd
            });

            const data = await res.json();

            if (res.ok && data.success) {
                toast('Logo uploaded successfully!');
                config.logoPath = data.logoPath;
                logoPreview.innerHTML = `<img src="/${data.logoPath}" style="max-width: 200px; max-height: 100px; border-radius: 4px;" alt="Current logo">`;
                resetLogoBtn.disabled = false;
                // Update the text input as well
                form.querySelector('#logoPath').value = data.logoPath;
            } else {
                toast(data.error || 'Upload failed');
            }
        } catch (e) {
            toast('Upload failed: ' + e.message);
        } finally {
            uploadLogoBtn.disabled = false;
            uploadLogoBtn.textContent = 'Upload';
            logoUploadInput.value = '';
        }
    });

    resetLogoBtn.addEventListener('click', async () => {
        if (!confirm('Reset to default CMD logo?')) return;

        resetLogoBtn.disabled = true;
        resetLogoBtn.textContent = 'Resetting...';

        try {
            const res = await fetch('/api/upload/logo', { method: 'DELETE' });
            const data = await res.json();

            if (res.ok && data.success) {
                toast('Logo reset to default');
                config.logoPath = data.logoPath;
                logoPreview.innerHTML = '<p style="color: var(--fg-3);">Using default CMD logo</p>';
                resetLogoBtn.disabled = true;
                // Update the text input as well
                form.querySelector('#logoPath').value = data.logoPath;
            } else {
                toast(data.error || 'Reset failed');
            }
        } catch (e) {
            toast('Reset failed: ' + e.message);
        } finally {
            resetLogoBtn.disabled = false;
            resetLogoBtn.textContent = 'Reset to default';
        }
    });
}

// ── Uploads panel ────────────────────────────
async function loadUploads() {
    const container = document.getElementById('uploads-list');
    container.innerHTML = '<p class="empty-state">Loading…</p>';
    try {
        const r = await fetch('/api/uploads');
        const data = await r.json();
        const uploads = data.uploads || [];
        if (uploads.length === 0) {
            container.innerHTML = '<p class="empty-state">No uploads yet.</p>';
            return;
        }
        container.innerHTML = '';
        uploads.forEach(file => container.appendChild(renderUploadTile(file)));

        container.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete ' + btn.dataset.name + '?')) return;
                const r = await fetch('/api/uploads/' + encodeURIComponent(btn.dataset.name), { method: 'DELETE' });
                if (r.ok) {
                    toast('Deleted ' + btn.dataset.name);
                    loadUploads();
                } else {
                    toast('Delete failed');
                }
            });
        });

        container.querySelectorAll('.cutout-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                const name = btn.dataset.name;
                btn.disabled = true;
                try {
                    const r = await fetch('/api/uploads/' + encodeURIComponent(name) + '/cutouts', { method: 'POST' });
                    const j = await r.json();
                    if (r.ok && j.success) {
                        toast('Cutout job queued · check /dancefloor in ~30s');
                    } else {
                        toast('Failed: ' + (j.error || 'unknown'));
                    }
                } catch {
                    toast('Cutout request failed');
                } finally {
                    btn.disabled = false;
                }
            });
        });
    } catch (e) {
        container.innerHTML = '<p class="empty-state" style="color:var(--color-danger)">Failed to load uploads.</p>';
    }
}

function renderUploadTile(file) {
    const isVideo = /\.(webm|mp4|mov)$/i.test(file.name);
    const isStrip = file.name.startsWith('strip_');
    const url = '/uploads/' + file.name;
    const tile = document.createElement('div');
    tile.className = 'upload-tile' + (isStrip ? ' strip' : '');
    const dt = new Date(file.mtime);
    const dateStr = dt.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

    if (isVideo) {
        tile.innerHTML = `<video src="${url}" muted preload="metadata" playsinline></video>`;
        const v = tile.querySelector('video');
        tile.addEventListener('mouseenter', () => { v.play().catch(() => {}); });
        tile.addEventListener('mouseleave', () => { v.pause(); v.currentTime = 0; });
        // Open share page
        const shareUrl = '/v/' + file.name.replace(/\.(webm|mp4|mov)$/i, '');
        tile.appendChild(metaRow(file, dateStr, shareUrl, url));
    } else if (/\.(png|jpe?g|gif|webp)$/i.test(file.name)) {
        tile.innerHTML = `<img src="${url}" alt="" loading="lazy">`;
        const shareUrl = isStrip
            ? '/s/' + file.name.replace(/^strip_/, '').replace(/\.png$/i, '')
            : url;
        tile.appendChild(metaRow(file, dateStr, shareUrl, url));
    } else {
        tile.innerHTML = `<div class="empty-state" style="text-align:center">${file.name}</div>`;
        tile.appendChild(metaRow(file, dateStr, null, url));
    }

    return tile;
}

function metaRow(file, dateStr, shareUrl, downloadUrl) {
    const row = document.createElement('div');
    row.className = 'meta';
    const isVideo = /\.(webm|mp4|mov)$/i.test(file.name);
    const buttons = [];
    if (shareUrl)    buttons.push(`<a class="icon-btn" href="${shareUrl}" target="_blank" rel="noopener" title="Open">↗</a>`);
    if (downloadUrl) buttons.push(`<a class="icon-btn" href="${downloadUrl}" download title="Download">↓</a>`);
    if (isVideo)     buttons.push(`<button class="icon-btn cutout-btn" data-name="${escapeHtml(file.name)}" title="Extract dancefloor cutouts">✂</button>`);
    buttons.push(`<button class="icon-btn danger delete-btn" data-name="${escapeHtml(file.name)}" title="Delete">×</button>`);
    row.innerHTML = `
        <span class="name" title="${escapeHtml(file.name)}">${dateStr}</span>
        <span class="meta-buttons">${buttons.join('')}</span>
    `;
    return row;
}

// ── Helpers ──────────────────────────────────
function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

let toastTimer = null;
function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}
