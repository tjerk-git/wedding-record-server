import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync, renameSync, existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { removeBackground } from '@imgly/background-removal-node';

const FRAME_COUNT = 8;
const MAX_HEIGHT = 720;
const MODEL = 'medium'; // 'small' | 'medium'

const videoArg = process.argv[2];
if (!videoArg) {
  console.error('Usage: node scripts/extract-cutouts.mjs <video-path> [output-dir]');
  process.exit(1);
}

const videoPath = resolve(videoArg);
const stem = basename(videoPath, extname(videoPath));
const finalDir = resolve(process.argv[3] ?? join('out', stem));

// Write into a sibling .partial dir, rename when fully done so consumers
// never see a half-written cutout set.
const workDir = `${finalDir}.partial`;
const tmpDir = join(workDir, '_frames');

if (existsSync(finalDir) && existsSync(join(finalDir, `cutout-${FRAME_COUNT - 1}.png`))) {
  console.log(`already done: ${finalDir}`);
  process.exit(0);
}

rmSync(workDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

function ffprobeDuration(file) {
  const r = spawnSync('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  const d = parseFloat(r.stdout.trim());
  if (Number.isFinite(d) && d > 0) return d;

  // MediaRecorder webm files often lack a segment duration in the header,
  // so ffprobe returns N/A. Fall back to demuxing the whole file and
  // parsing the last "time=HH:MM:SS.mmm" line from ffmpeg's stderr.
  const r2 = spawnSync('ffmpeg', ['-i', file, '-f', 'null', '-'], { encoding: 'utf8' });
  const stderr = r2.stderr || '';
  const matches = [...stderr.matchAll(/time=(\d+):(\d+):(\d+(?:\.\d+)?)/g)];
  if (matches.length === 0) throw new Error(`could not determine duration: ${stderr}`);
  const [, h, m, s] = matches[matches.length - 1];
  return parseInt(h, 10) * 3600 + parseInt(m, 10) * 60 + parseFloat(s);
}

try {
  const duration = ffprobeDuration(videoPath);
  console.log(`video: ${videoPath}  duration: ${duration.toFixed(2)}s`);

  const margin = duration * 0.05;
  const usable = duration - margin * 2;
  const timestamps = Array.from({ length: FRAME_COUNT }, (_, i) =>
    margin + (usable * i) / (FRAME_COUNT - 1)
  );

  const framePaths = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = timestamps[i];
    const out = join(tmpDir, `frame-${i}.png`);
    const r = spawnSync('ffmpeg', [
      '-y', '-loglevel', 'error',
      '-ss', t.toFixed(3),
      '-i', videoPath,
      '-frames:v', '1',
      '-vf', `scale=-2:'min(${MAX_HEIGHT},ih)'`,
      '-q:v', '2',
      out,
    ]);
    if (r.status !== 0) throw new Error(`ffmpeg failed at t=${t}: ${r.stderr?.toString()}`);
    framePaths.push(out);
  }

  for (let i = 0; i < framePaths.length; i++) {
    const buf = readFileSync(framePaths[i]);
    const blob = new Blob([buf], { type: 'image/png' });
    const t0 = Date.now();
    const cutBlob = await removeBackground(blob, {
      model: MODEL,
      output: { format: 'image/png', quality: 1 },
    });
    const cutBuf = Buffer.from(await cutBlob.arrayBuffer());
    writeFileSync(join(workDir, `cutout-${i}.png`), cutBuf);
    console.log(`  cutout ${i}/${FRAME_COUNT}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }

  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(finalDir, { recursive: true, force: true });
  renameSync(workDir, finalDir);
  console.log(`done -> ${finalDir}`);
} catch (e) {
  console.error('cutout extraction failed:', e?.message || e);
  rmSync(workDir, { recursive: true, force: true });
  process.exit(1);
}
