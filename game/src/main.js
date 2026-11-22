// Marisol Heat - browser bootstrap. Owns the canvas, the fixed-step loop
// (30 Hz sim, render every animation frame), resize handling and the
// tab-hide auto-pause. All game logic lives in game.js.

import { createGame, stepGame, saveGame } from './game.js';
import { render } from './render.js';
import { createInput } from './input.js';
import { setupShot } from './shots.js';
import { STEP, VIEW_W, VIEW_H } from './config.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

function fitCanvas() {
  const scale = Math.min(window.innerWidth / VIEW_W, window.innerHeight / VIEW_H);
  canvas.width = Math.floor(VIEW_W * scale);
  canvas.height = Math.floor(VIEW_H * scale);
  canvas.style.width = canvas.width + 'px';
  canvas.style.height = canvas.height + 'px';
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || 20261122);
const game = createGame(seed);
const input = createInput();
input.attach(window);

const shot = params.get('shot');
if (shot) {
  setupShot(game, shot);
  // Let the staged scene settle into motion before the first frame.
  const warm = { up: shot === 'drive' || shot === 'chase' || shot === 'mission', down: false, left: false, right: false, run: false, act: false, atk: false, pause: false, confirm: false };
  for (let i = 0; i < 20; i++) stepGame(game, warm);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.mode === 'play') game.mode = 'paused';
});
window.addEventListener('beforeunload', () => { if (game.mode !== 'title') saveGame(game); });

let acc = 0, last = performance.now();
function frame(now) {
  acc += Math.min(0.12, (now - last) / 1000);
  last = now;
  while (acc >= STEP) {
    stepGame(game, input.snapshot());
    acc -= STEP;
  }
  render(ctx, game, VIEW_W, VIEW_H);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
