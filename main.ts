// Marisol Heat - gta6-01 entry program (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files a desktop
// browser loads offline (game/index.html and its ES modules, no library and
// no network request). This program hands it in: it copies game/ and
// screenshots/ from beside this file to /output and writes
// /output/dossier.json, the summary the judge reads, with the vendored
// make.fun library.
//
// Before anything is copied, the screenshots are validated against
// shots.json: every scene the file names must exist under screenshots/, be
// a real JPEG or PNG (checked by magic bytes, not by name), and be at most
// 256 KiB. A bad screenshot fails the run here, with the file named, rather
// than at the scorer.
//
// Serve the game locally with `node serve.ts`, then open
// http://localhost:8080. Outside the grader's container,
// MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const MAX_SHOT_BYTES = 262144; // 256 KiB, the scorer's per-screenshot cap

function validateScreenshots() {
  const shotsPath = join(here, 'shots.json');
  if (!existsSync(shotsPath)) throw new Error('shots.json is missing beside main.ts');
  const shots = JSON.parse(readFileSync(shotsPath, 'utf8'));
  if (!Array.isArray(shots) || shots.length === 0) {
    throw new Error('shots.json does not name any screenshots');
  }
  for (const shot of shots) {
    const name = shot && shot.name;
    if (typeof name !== 'string' || name.length === 0) {
      throw new Error('shots.json has an entry with no screenshot name');
    }
    const file = join(here, 'screenshots', name);
    if (!existsSync(file)) {
      throw new Error('shots.json lists "' + name + '" but screenshots/' + name + ' does not exist');
    }
    const size = statSync(file).size;
    if (size > MAX_SHOT_BYTES) {
      throw new Error('screenshots/' + name + ' is ' + size + ' bytes, over the 256 KiB cap');
    }
    const head = readFileSync(file).subarray(0, 8);
    const isJpeg = head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    const isPng = head.length >= 8 &&
      head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
      head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a;
    if (!isJpeg && !isPng) {
      throw new Error('screenshots/' + name + ' is not a JPEG or PNG image (magic bytes do not match)');
    }
  }
}

validateScreenshots();

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
