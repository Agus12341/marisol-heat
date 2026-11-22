// Marisol Heat - the city of Marisol, generated deterministically from a seed.
// Avenues on a 512 px grid; the blocks between them are filled per district.
// The same seed always builds the same city, which the staged screenshots
// and the headless tests rely on.

import { WORLD_W, WORLD_H, GRID, ROAD_W, SIDEWALK, COLORS, PLACE_KINDS } from './config.js';
import { Rng, clamp } from './random.js';

// Avenue centrelines.
export const AV_X = []; for (let x = GRID / 2; x < WORLD_W; x += GRID) AV_X.push(x);
export const AV_Y = []; for (let y = GRID / 2; y < WORLD_H - 200; y += GRID) AV_Y.push(y);
export const COAST_Y = 2384;   // sand starts here
export const SEA_Y = 2468;     // open water below this

const TOWER_COLORS = ['#6b7c8c', '#7d8a99', '#5d6d7e', '#8a94a0', '#71808f', '#66788c'];
const OLD_COLORS = ['#b08a5e', '#a87f63', '#bf9a6b', '#9c7a58', '#b5936a'];
const HOUSE_COLORS = ['#c9b8a3', '#b5c2b0', '#d0c4ae', '#bcae9d', '#c4b49c'];
const SHOP_COLORS = ['#8fa3b8', '#a8b8a0', '#b8a888', '#98a8b8'];
const WARE_COLORS = ['#7a7d82', '#6e7278', '#83868a'];

export function buildWorld(seed) {
  const rng = new Rng(seed ^ 0x51ab);
  const buildings = [];
  const trees = [];
  const places = {};
  const parked = [];
  const pickups = [];

  const blockL = (i) => AV_X[i] + ROAD_W / 2;              // left edge of block column i
  const blockR = (i) => (i + 1 < AV_X.length ? AV_X[i + 1] : WORLD_W) - ROAD_W / 2;
  const blockT = (j) => AV_Y[j] + ROAD_W / 2;
  const blockB = (j) => (j + 1 < AV_Y.length ? AV_Y[j + 1] : COAST_Y) - ROAD_W / 2;

  function addBuilding(x, y, w, h, color, floors, kind) {
    const b = { x, y, w, h, color, roof: shade(color, -18), floors, kind: kind || null, label: kind ? PLACE_KINDS[kind].label : null };
    buildings.push(b);
    if (kind) {
      // Door point: middle of the south sidewalk edge of the building.
      places[kind] = { x: x + w / 2, y: y + h + SIDEWALK + 4, kind, label: b.label, building: b };
    }
    return b;
  }

  // Named places first, at fixed blocks, so the layout never depends on
  // the random fill that follows.
  const fixed = [
    // kind, col, row, w, h, floors
    ['warehouse', 0, 3, 300, 210, 1],
    ['hideout',   1, 1, 150, 120, 2],
    ['pd',        3, 1, 210, 170, 5],
    ['hospital',  4, 1, 230, 160, 4],
    ['gun',       2, 0, 130, 100, 1],
    ['shop',      3, 0, 140, 105, 1],
    ['motors',    4, 0, 200, 120, 1],
    ['club',      5, 3, 190, 130, 2],
    ['hotel',     6, 3, 210, 140, 3],
    ['respray',   2, 3, 170, 120, 1],
  ];
  const usedCells = new Set();
  for (const [kind, ci, rj, w, h, floors] of fixed) {
    const x = blockL(ci) + SIDEWALK + 10 + rng.int(0, 24);
    const y = blockT(rj) + SIDEWALK + 10 + rng.int(0, 20);
    addBuilding(x, y, w, h, PLACE_KINDS[kind].color, floors, kind);
    usedCells.add(ci + ',' + rj);
  }
  // The respray also gets a drive-in pad in front of its door.
  const rp = places.respray;
  const resprayPad = { x: rp.x - 60, y: rp.y - 6, w: 120, h: 64 };

  // District fill for the remaining blocks.
  for (let ci = 0; ci < AV_X.length; ci++) {
    for (let rj = 0; rj < AV_Y.length; rj++) {
      if (usedCells.has(ci + ',' + rj)) continue;
      const x0 = blockL(ci) + SIDEWALK, x1 = blockR(ci) - SIDEWALK;
      const y0 = blockT(rj) + SIDEWALK, y1 = blockB(rj) - SIDEWALK;
      const bw = x1 - x0, bh = y1 - y0;
      if (bw < 120 || bh < 100) continue;
      const district = districtOf(ci, rj);
      if (district === 'park') {
        for (let t = 0; t < 26; t++) trees.push({ x: rng.range(x0 + 20, x1 - 20), y: rng.range(y0 + 20, y1 - 20), r: rng.range(13, 22), palm: false });
        continue;
      }
      if (district === 'lot') {
        // Parking lot: rows of parked cars, no buildings.
        for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) {
          if (rng.chance(0.25)) continue;
          parked.push({ x: x0 + 44 + c * 62, y: y0 + 52 + r * 92, angle: Math.PI / 2, typeIdx: rng.int(0, 4) });
        }
        continue;
      }
      fillBlock(rng, buildings, trees, district, x0, y0, bw, bh);
    }
  }

  // Forecourt cars at Venn Motors (stealable stock).
  const mo = places.motors;
  for (let i = 0; i < 4; i++) parked.push({ x: mo.x - 84 + i * 56, y: mo.y + 30, angle: Math.PI, typeIdx: i % 3 === 0 ? 2 : 0 });
  // Marco's coupe: the mission-one target, parked by the docks.
  const marcoCoupe = { x: places.warehouse.x + 40, y: places.warehouse.y + 66, angle: 0, typeIdx: 2 };

  // Palms along the coast road and the beach.
  for (let x = 90; x < WORLD_W - 60; x += 118) {
    if (isRoadPoint(x, COAST_Y - 66)) continue;
    trees.push({ x: x + rng.range(-14, 14), y: COAST_Y - 62 + rng.range(-8, 8), r: rng.range(12, 17), palm: true });
  }
  // Street trees on some sidewalks.
  for (let i = 0; i < 130; i++) {
    const x = rng.range(40, WORLD_W - 40), y = rng.range(40, COAST_Y - 80);
    if (groundAtRaw(x, y) === 'sidewalk') trees.push({ x, y, r: rng.range(10, 15), palm: false });
  }

  // Pickups at fixed, reachable spots.
  const addPickup = (type, x, y) => pickups.push({ type, x, y, taken: false, respawn: 0 });
  addPickup('heart', places.hospital.x + 52, places.hospital.y + 6);
  addPickup('heart', blockL(5) + 120, blockT(1) + 120);
  addPickup('armour', places.pd.x - 70, places.pd.y + 6);
  addPickup('armour', places.warehouse.x - 60, places.warehouse.y + 40);
  for (const [ci, rj] of [[1, 2], [3, 2], [6, 1], [2, 1], [5, 2]]) {
    addPickup('cash', (blockL(ci) + blockR(ci)) / 2 + rng.range(-60, 60), blockB(rj) - 24);
  }

  return { seed, buildings, trees, places, parked, marcoCoupe, pickups, resprayPad };
}

function districtOf(ci, rj) {
  if (ci === 5 && rj === 1) return 'park';
  if (ci === 2 && rj === 3) return 'lot';
  if (ci >= 3 && ci <= 4 && rj >= 1 && rj <= 2) return 'downtown';
  if (ci <= 1 && rj >= 1 && rj <= 2) return 'oldtown';
  if (rj === 3) return 'industrial';
  if (rj === 0) return 'shops';
  return 'suburb';
}

function fillBlock(rng, buildings, trees, district, x0, y0, bw, bh) {
  const add = (x, y, w, h, color, floors) => buildings.push({ x, y, w, h, color, roof: shade(color, -18), floors, kind: null, label: null });
  if (district === 'downtown') {
    if (rng.chance(0.5)) {
      add(x0 + 26, y0 + 22, bw - 52, bh - 44, rng.pick(TOWER_COLORS), rng.int(7, 12));
    } else {
      add(x0 + 18, y0 + 18, bw * 0.44, bh - 36, rng.pick(TOWER_COLORS), rng.int(5, 9));
      add(x0 + bw * 0.55, y0 + 26, bw * 0.38, bh - 52, rng.pick(TOWER_COLORS), rng.int(4, 8));
    }
  } else if (district === 'oldtown') {
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const w = (bw - 30 * (n + 1)) / n;
      add(x0 + 30 + i * (w + 30), y0 + rng.int(14, 40), w, bh * rng.range(0.5, 0.72), rng.pick(OLD_COLORS), rng.int(2, 3));
    }
  } else if (district === 'industrial') {
    add(x0 + 24, y0 + 26, bw * rng.range(0.55, 0.75), bh * 0.62, rng.pick(WARE_COLORS), 1);
    if (rng.chance(0.6)) trees.push({ x: x0 + bw - 34, y: y0 + bh - 30, r: 12, palm: false });
  } else if (district === 'shops') {
    const n = rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const w = (bw - 24 * (n + 1)) / n;
      add(x0 + 24 + i * (w + 24), y0 + 16, w, bh * 0.5, rng.pick(SHOP_COLORS), 1);
    }
  } else { // suburb: detached houses with lawns
    for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) {
      if (rng.chance(0.15)) continue;
      const w = rng.range(62, 84), h = rng.range(48, 64);
      add(x0 + 26 + c * (bw - 40) / 3, y0 + 24 + r * (bh - 30) / 2, w, h, rng.pick(HOUSE_COLORS), 1);
    }
    for (let t = 0; t < 3; t++) trees.push({ x: rng.range(x0 + 16, x0 + bw - 16), y: rng.range(y0 + 14, y0 + bh - 14), r: rng.range(10, 15), palm: false });
  }
}

export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp((n >> 16) + amt, 0, 255), g = clamp(((n >> 8) & 255) + amt, 0, 255), b = clamp((n & 255) + amt, 0, 255);
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

// --- Spatial queries -------------------------------------------------------

export function nearestAvX(x) { let best = AV_X[0], bd = 1e9; for (const a of AV_X) { const d = Math.abs(a - x); if (d < bd) { bd = d; best = a; } } return best; }
export function nearestAvY(y) { let best = AV_Y[0], bd = 1e9; for (const a of AV_Y) { const d = Math.abs(a - y); if (d < bd) { bd = d; best = a; } } return best; }

export function isRoadPoint(x, y) {
  if (y > COAST_Y) return false;
  for (const a of AV_X) if (Math.abs(x - a) <= ROAD_W / 2) return true;
  for (const a of AV_Y) if (Math.abs(y - a) <= ROAD_W / 2) return true;
  return false;
}

function groundAtRaw(x, y) { return groundAt(x, y); }

export function groundAt(x, y) {
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return 'water';
  if (y >= SEA_Y) return 'water';
  if (y >= COAST_Y) return 'sand';
  if (isRoadPoint(x, y)) return 'road';
  // Sidewalk: the ring just outside the asphalt around each block.
  const lx = nearestAvX(x), ly = nearestAvY(y);
  const dx = Math.abs(x - lx), dy = Math.abs(y - ly);
  const inX = dx > ROAD_W / 2 && dx <= ROAD_W / 2 + SIDEWALK && dy <= GRID / 2 - 6;
  const inY = dy > ROAD_W / 2 && dy <= ROAD_W / 2 + SIDEWALK && dx <= GRID / 2 - 6;
  if (inX || inY) return 'sidewalk';
  // The parking-lot block reads as asphalt.
  const ci = Math.round(x / GRID - 0.5), rj = Math.round(y / GRID - 0.5);
  if (ci === 2 && rj === 3) return 'lot';
  if (ci === 5 && rj === 1) return 'park';
  return 'grass';
}

export function pointInBuilding(world, x, y, pad = 0) {
  for (const b of world.buildings) {
    if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
  }
  return null;
}

// Push a circle out of every building it overlaps; returns [x, y].
export function collideCircle(world, x, y, r) {
  for (const b of world.buildings) {
    const nx = clamp(x, b.x, b.x + b.w), ny = clamp(y, b.y, b.y + b.h);
    let dx = x - nx, dy = y - ny;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r) {
      if (d2 < 0.0001) { // centre inside: push out along the smallest axis
        const left = x - b.x, right = b.x + b.w - x, top = y - b.y, bot = b.y + b.h - y;
        const m = Math.min(left, right, top, bot);
        if (m === left) x = b.x - r; else if (m === right) x = b.x + b.w + r;
        else if (m === top) y = b.y - r; else y = b.y + b.h + r;
      } else {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r; y = ny + (dy / d) * r;
      }
    }
  }
  return [x, y];
}

// Segment vs buildings, sampled - good enough for gunfire and sight lines.
export function losBlocked(world, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.floor(len / 22));
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (pointInBuilding(world, x1 + dx * t, y1 + dy * t)) return true;
  }
  return false;
}
