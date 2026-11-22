// Marisol Heat - simulation. One fixed 30 Hz step moves everything: the
// player on foot or in a car, traffic, pedestrians, police, combat, the
// wanted level, four story missions, taxi fares and shop robberies.
// No rendering and no DOM in here, so the same step runs in the browser
// and in the headless harness.

import { WORLD_W, WORLD_H, STEP, CAR_TYPES, POLICE_TYPE, DAY_SECONDS, START_CLOCK, WANTED_DECAY, BUST_TIME, RESPRAY_COST, PISTOL_COST } from './config.js';
import { Rng, clamp, lerp, dist2, wrapAngle, angleLerp } from './random.js';
import { buildWorld, groundAt, collideCircle, pointInBuilding, losBlocked, nearestAvX, nearestAvY, AV_X, AV_Y, SEA_Y } from './world.js';

const LANE = 27;
let NEXT_ID = 1;

export function createGame(seed = 20261122) {
  const world = buildWorld(seed);
  const rng = new Rng(seed ^ 0xbeef);
  const g = {
    seed, world, rng,
    mode: 'title',           // title | play | paused | busted | wasted | storydone
    menuIdx: 0, hasSave: false,
    time: 0, clock: START_CLOCK,
    cam: { x: 0, y: 0 },
    player: null, cars: [], peds: [],
    wanted: { heat: 0, unseen: 0, bust: 0 },
    mission: { idx: 0, stage: 0, timer: 0, robT: 0, data: {} },
    fare: null, fareCooldown: 240,
    robCooldowns: {},
    objective: null, subObjective: '',
    toasts: [], fx: [],
    stats: { earned: 0, robberies: 0, fares: 0 },
    prevInput: {},
    overlayT: 0,
    storyDone: false,
  };
  const hd = world.places.hideout;
  g.player = {
    x: hd.x + 26, y: hd.y + 16, angle: -Math.PI / 2, health: 100, armour: 0,
    cash: 120, hasPistol: false, car: null, atkCd: 0, hurtT: 0, dead: false,
  };
  // Parked cars from the world layout.
  for (const p of world.parked) g.cars.push(makeCar(p.typeIdx, p.x, p.y, p.angle, 'parked', rng));
  const mc = world.marcoCoupe;
  const coupe = makeCar(mc.typeIdx, mc.x, mc.y, mc.angle, 'parked', rng);
  coupe.color = '#b03030'; coupe.isMarco = true;
  g.cars.push(coupe);
  g.marcoCar = coupe;
  // Traffic.
  for (let i = 0; i < 16; i++) {
    const c = spawnTrafficCar(g, rng);
    if (c) g.cars.push(c);
  }
  // Pedestrians.
  for (let i = 0; i < 34; i++) g.peds.push(spawnPed(g, rng));
  g.hasSave = !!loadSaveRaw();
  updateObjective(g);
  return g;
}

function makeCar(typeIdx, x, y, angle, driver, rng) {
  const t = driver === 'police' ? POLICE_TYPE : CAR_TYPES[typeIdx];
  return {
    id: NEXT_ID++, type: t, typeIdx, x, y, angle, speed: 0,
    color: driver === 'police' ? '#e8e8ec' : rng.pick(t.colors),
    driver, health: 100, dir: 0, lightPhase: rng.range(0, 6), isMarco: false,
  };
}

function spawnTrafficCar(g, rng) {
  for (let tries = 0; tries < 24; tries++) {
    const vertical = rng.chance(0.5);
    const dir = rng.int(0, 3); // 0 N, 1 E, 2 S, 3 W
    let x, y;
    if (vertical) { x = AV_X[rng.int(0, AV_X.length - 1)]; y = rng.range(80, 2200); if (dir === 1 || dir === 3) continue; }
    else { y = AV_Y[rng.int(0, AV_Y.length - 1)]; x = rng.range(80, WORLD_W - 80); if (dir === 0 || dir === 2) continue; }
    if (dist2(x, y, g.player.x, g.player.y) < 180 * 180) continue;
    if (pointInBuilding(g.world, x, y)) continue;
    const c = makeCar(rng.int(0, 4), x, y, dirAngle(dir), 'traffic', rng);
    c.dir = dir;
    snapToLane(c);
    c.speed = c.type.top * 0.5;
    return c;
  }
  return null;
}

function dirAngle(d) { return [ -Math.PI / 2, 0, Math.PI / 2, Math.PI ][d]; }
function dirVec(d) { return [[0, -1], [1, 0], [0, 1], [-1, 0]][d]; }

function snapToLane(c) {
  if (c.dir === 0) c.x = nearestAvX(c.x) + LANE;
  else if (c.dir === 2) c.x = nearestAvX(c.x) - LANE;
  else if (c.dir === 1) c.y = nearestAvY(c.y) + LANE;
  else if (c.dir === 3) c.y = nearestAvY(c.y) - LANE;
}

function spawnPed(g, rng, near) {
  for (let tries = 0; tries < 30; tries++) {
    const x = near ? clamp(near.x + rng.range(-300, 300), 30, WORLD_W - 30) : rng.range(40, WORLD_W - 40);
    const y = near ? clamp(near.y + rng.range(-300, 300), 30, 2300) : rng.range(40, 2300);
    const gr = groundAt(x, y);
    if (gr !== 'sidewalk' && gr !== 'grass' && gr !== 'sand' && gr !== 'park') continue;
    if (pointInBuilding(g.world, x, y)) continue;
    return {
      id: NEXT_ID++, x, y, angle: rng.range(0, 6.28), health: 100,
      state: 'stroll', tx: x, ty: y, panicT: 0, threatX: 0, threatY: 0,
      color: rng.pick(['#c25e4e', '#4e7ac2', '#5ea85e', '#c2a44e', '#8a5ec2', '#c2784e', '#d8d8d8']),
      downT: 0, inCar: null, isFare: false, isAccountant: false,
    };
  }
  return { id: NEXT_ID++, x: 200, y: 200, angle: 0, health: 100, state: 'stroll', tx: 200, ty: 200, panicT: 0, threatX: 0, threatY: 0, color: '#ccc', downT: 0, inCar: null, isFare: false, isAccountant: false };
}

// --- Wanted ----------------------------------------------------------------

export function starsOf(g) { return clamp(Math.floor(g.wanted.heat / 90), 0, 5); }

function witnesses(g, x, y, radius) {
  let n = 0;
  for (const p of g.peds) if (p.state !== 'down' && dist2(p.x, p.y, x, y) < radius * radius && !losBlocked(g.world, p.x, p.y, x, y)) n++;
  for (const c of g.cars) if (c.driver === 'police' && dist2(c.x, c.y, x, y) < (radius + 160) * (radius + 160)) n += 2;
  return n;
}

export function addHeat(g, pts, x, y, silent = false) {
  if (!silent && witnesses(g, x, y, 300) === 0 && starsOf(g) === 0) pts = Math.floor(pts * 0.35);
  g.wanted.heat = clamp(g.wanted.heat + pts, 0, 540);
  if (pts > 0) g.wanted.unseen = 0;
}

// --- Main step ---------------------------------------------------------------

export function stepGame(g, input) {
  const pressed = {};
  for (const k of ['act', 'atk', 'pause', 'confirm']) pressed[k] = !!input[k] && !g.prevInput[k];
  g.prevInput = { ...input };
  g.time += STEP;

  if (g.mode === 'title') {
    if (input.down && !g._menuHeld) { g.menuIdx = (g.menuIdx + 1) % 3; g._menuHeld = true; }
    if (input.up && !g._menuHeld) { g.menuIdx = (g.menuIdx + 2) % 3; g._menuHeld = true; }
    if (!input.up && !input.down) g._menuHeld = false;
    if (pressed.confirm || pressed.act) titleChoose(g);
    stepAmbient(g);
    // Slow camera drift along the beachfront for the title backdrop: the
    // club and hotel blocks, the coast road, the sand and the sea.
    g.cam.x = clamp(2920 + Math.sin(g.time * 0.05) * 620 - 640, 0, WORLD_W - 1280);
    g.cam.y = WORLD_H - 800;
    decayFx(g);
    return;
  }
  if (g.mode === 'paused') {
    if (pressed.pause || pressed.confirm) g.mode = 'play';
    return;
  }
  if (g.mode === 'busted' || g.mode === 'wasted' || g.mode === 'storydone') {
    g.overlayT -= STEP;
    if (g.overlayT <= 0) {
      if (g.mode === 'storydone') { g.mode = 'play'; }
      else respawn(g, g.mode);
    }
    decayFx(g);
    return;
  }
  if (pressed.pause) { g.mode = 'paused'; return; }

  g.clock = (g.clock + STEP / DAY_SECONDS) % 1;
  stepPlayer(g, input, pressed);
  stepTraffic(g);
  stepPolice(g);
  stepPeds(g);
  stepWanted(g);
  stepMissions(g, pressed);
  stepFreeRobbery(g);
  stepFare(g);
  stepPickups(g);
  decayFx(g);
  // Camera follows the player.
  const p = g.player;
  const tx = clamp((p.car ? p.car.x : p.x) - 640, 0, WORLD_W - 1280);
  const ty = clamp((p.car ? p.car.y : p.y) - 400, 0, WORLD_H - 800);
  g.cam.x = lerp(g.cam.x, tx, 0.12); g.cam.y = lerp(g.cam.y, ty, 0.12);
  for (const t of g.toasts) t.ttl -= STEP;
  g.toasts = g.toasts.filter(t => t.ttl > 0);
}

function stepAmbient(g) {
  stepTraffic(g);
  stepPeds(g);
  g.clock = (g.clock + STEP / DAY_SECONDS) % 1;
}

function titleChoose(g) {
  const items = ['new', 'continue', 'free'];
  const choice = items[g.menuIdx];
  if (choice === 'continue' && g.hasSave) {
    const s = loadSaveRaw();
    if (s) {
      g.player.cash = s.cash; g.player.hasPistol = !!s.hasPistol;
      g.mission.idx = s.missionIdx || 0; g.storyDone = !!s.storyDone;
      g.player.x = s.x ?? g.player.x; g.player.y = s.y ?? g.player.y;
    }
  }
  if (choice === 'free') { g.mission.idx = 4; g.storyDone = true; }
  g.mode = 'play';
  updateObjective(g);
}

function respawn(g, kind) {
  const p = g.player;
  const place = kind === 'busted' ? g.world.places.pd : g.world.places.hospital;
  if (p.car) { p.car.driver = 'parked'; p.car = null; }
  p.x = place.x; p.y = place.y + 10; p.health = 100; p.armour = 0;
  p.cash = Math.max(0, p.cash - Math.floor(p.cash * 0.1) - 20);
  g.wanted.heat = 0; g.wanted.bust = 0; g.wanted.unseen = 0;
  // Police stand down.
  g.cars = g.cars.filter(c => c.driver !== 'police');
  // A busted/wasted escort or delivery fails back to its start.
  const m = g.mission;
  if ((m.idx === 1 && m.stage === 1) || (m.idx === 2 && m.stage === 1) || (m.idx === 3 && m.stage === 1)) {
    m.stage = 0; m.timer = 0;
    for (const ped of g.peds) if (ped.isAccountant) { ped.isAccountant = false; ped.inCar = null; ped.state = 'stroll'; }
  }
  g.mode = 'play';
  toast(g, kind === 'busted' ? 'Released. The impound thanks you for the donation.' : 'Patched up at St. Solana. The bill stings.');
  updateObjective(g);
}

// --- Player ------------------------------------------------------------------

function stepPlayer(g, input, pressed) {
  const p = g.player;
  if (p.atkCd > 0) p.atkCd -= STEP;
  if (p.hurtT > 0) p.hurtT -= STEP;
  else if (p.health < 100 && !p.car) p.health = Math.min(100, p.health + STEP * 2.2); // slow regen on foot

  if (pressed.act) {
    if (p.car) exitCar(g);
    else tryEnterCar(g);
  }

  if (p.car) {
    const c = p.car;
    const gr = groundAt(c.x, c.y);
    const gripF = gr === 'road' || gr === 'lot' ? 1 : gr === 'sidewalk' ? 0.82 : gr === 'sand' ? 0.5 : 0.55;
    const topF = c.health <= 0 ? 0.16 : gripF;
    if (input.up) c.speed += c.type.accel * STEP;
    if (input.down) c.speed -= (c.speed > 4 ? c.type.accel * 1.25 : c.type.accel * 0.55) * STEP;
    c.speed -= c.speed * (input.up ? 0.12 : 0.55) * STEP;
    c.speed = clamp(c.speed, -110, c.type.top * topF);
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    if (Math.abs(c.speed) > 3) c.angle += steer * c.type.grip * 0.42 * STEP * clamp(c.speed / 120, -1.4, 1.4) * (c.speed < 0 ? -1 : 1);
    moveCar(g, c, true);
    p.x = c.x; p.y = c.y; p.angle = c.angle;
    if (pressed.atk && p.hasPistol) playerShoot(g);
  } else {
    const run = input.run ? 1.55 : 1;
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx || my) {
      const len = Math.hypot(mx, my); mx /= len; my /= len;
      p.angle = Math.atan2(my, mx);
      const sp = 122 * run * (groundAt(p.x, p.y) === 'sand' ? 0.7 : 1);
      let nx = p.x + mx * sp * STEP, ny = p.y + my * sp * STEP;
      if (groundAt(nx, ny) !== 'water') {
        [nx, ny] = collideCircle(g.world, nx, ny, 10);
        if (groundAt(nx, ny) !== 'water') { p.x = nx; p.y = ny; }
      }
    }
    if (pressed.atk) {
      if (p.hasPistol) playerShoot(g);
      else playerPunch(g);
    }
    // Respray needs you in the car; the gun store works on foot.
    tryBuyPistol(g);
  }
  if (p.health <= 0 && g.mode === 'play') { g.mode = 'wasted'; g.overlayT = 2.6; }
}

function tryEnterCar(g) {
  const p = g.player;
  let best = null, bd = 36 * 36;
  for (const c of g.cars) {
    if (c.driver === 'police') continue;
    const d = dist2(c.x, c.y, p.x, p.y);
    if (d < bd) { bd = d; best = c; }
  }
  if (!best) return;
  if (best.driver === 'traffic') {
    // The driver bails and runs; a witnessed theft is a crime.
    const ped = spawnPed(g, g.rng, best);
    ped.x = best.x + 20; ped.y = best.y + 14; ped.state = 'flee'; ped.panicT = 4; ped.threatX = p.x; ped.threatY = p.y;
    g.peds.push(ped);
    addHeat(g, 55, p.x, p.y);
    toast(g, 'Car jacked!');
  }
  best.driver = 'player'; best.speed = 0;
  p.car = best;
}

function exitCar(g) {
  const p = g.player, c = p.car;
  c.driver = c.health <= 0 ? 'parked' : 'parked';
  c.speed = 0;
  const sx = c.x + Math.cos(c.angle + Math.PI / 2) * 30, sy = c.y + Math.sin(c.angle + Math.PI / 2) * 30;
  const [nx, ny] = collideCircle(g.world, sx, sy, 10);
  p.x = nx; p.y = ny; p.car = null;
}

function moveCar(g, c, isPlayer) {
  const nx = c.x + Math.cos(c.angle) * c.speed * STEP;
  const ny = c.y + Math.sin(c.angle) * c.speed * STEP;
  if (groundAt(nx, ny) === 'water') { c.speed *= 0.4; return; }
  // Two collision circles, front and rear axle.
  const fx = nx + Math.cos(c.angle) * c.type.w * 0.32, fy = ny + Math.sin(c.angle) * c.type.w * 0.32;
  const rx = nx - Math.cos(c.angle) * c.type.w * 0.32, ry = ny - Math.sin(c.angle) * c.type.w * 0.32;
  const hitF = pointInBuilding(g.world, fx, fy, 4), hitR = pointInBuilding(g.world, rx, ry, 4);
  if (hitF || hitR) {
    if (Math.abs(c.speed) > 120) {
      c.health -= (Math.abs(c.speed) - 110) * 0.06;
      if (isPlayer) addHeat(g, 6, c.x, c.y, true);
      spark(g, hitF ? fx : rx, hitF ? fy : ry);
    }
    c.speed *= -0.22;
    return;
  }
  c.x = clamp(nx, 24, WORLD_W - 24); c.y = clamp(ny, 24, SEA_Y - 10);
  // Car vs car.
  for (const o of g.cars) {
    if (o === c) continue;
    const d2 = dist2(c.x, c.y, o.x, o.y);
    if (d2 < 40 * 40 && d2 > 0.01) {
      const d = Math.sqrt(d2), push = (40 - d) / 2;
      const ux = (c.x - o.x) / d, uy = (c.y - o.y) / d;
      c.x += ux * push; c.y += uy * push;
      if (o.driver !== 'player') { o.x -= ux * push; o.y -= uy * push; }
      const impact = Math.abs(c.speed - o.speed);
      if (impact > 90) {
        c.health -= impact * 0.05; o.health -= impact * 0.05;
        spark(g, (c.x + o.x) / 2, (c.y + o.y) / 2);
        if (isPlayer && o.driver === 'police') addHeat(g, 42, c.x, c.y);
        else if (isPlayer) addHeat(g, 14, c.x, c.y);
        c.speed *= 0.55; o.speed *= 0.55;
      }
    }
  }
  // Running over a pedestrian is very much a crime.
  if (Math.abs(c.speed) > 60) {
    for (const ped of g.peds) {
      if (ped.state === 'down' || ped.inCar) continue;
      if (dist2(ped.x, ped.y, c.x, c.y) < 24 * 24) {
        ped.health -= 70; ped.state = ped.health <= 0 ? 'down' : 'flee';
        ped.panicT = 4; ped.threatX = c.x; ped.threatY = c.y;
        if (isPlayer) addHeat(g, 95, c.x, c.y);
        spark(g, ped.x, ped.y);
      }
    }
  }
}

function playerShoot(g) {
  const p = g.player;
  if (p.atkCd > 0) return;
  p.atkCd = 0.24;
  const ox = p.x + Math.cos(p.angle) * 16, oy = p.y + Math.sin(p.angle) * 16;
  let bestT = 1, hitPed = null, hitCar = null;
  for (const ped of g.peds) {
    if (ped.state === 'down' || ped.inCar) continue;
    const t = rayHit(ox, oy, p.angle, ped.x, ped.y, 11);
    if (t !== null && t < bestT) { bestT = t; hitPed = ped; hitCar = null; }
  }
  for (const c of g.cars) {
    if (c === p.car) continue;
    const t = rayHit(ox, oy, p.angle, c.x, c.y, 26);
    if (t !== null && t < bestT) { bestT = t; hitCar = c; hitPed = null; }
  }
  const range = 340;
  const ex = ox + Math.cos(p.angle) * range * bestT, ey = oy + Math.sin(p.angle) * range * bestT;
  if (losBlocked(g.world, ox, oy, ex, ey) && bestT >= 1) { /* wall stops the round */ }
  g.fx.push({ type: 'tracer', x1: ox, y1: oy, x2: ex, y2: ey, ttl: 0.07, color: '#ffd76a' });
  g.fx.push({ type: 'flash', x: ox, y: oy, ttl: 0.05 });
  if (hitPed) {
    hitPed.health -= 55;
    hitPed.state = hitPed.health <= 0 ? 'down' : 'flee';
    hitPed.panicT = 4; hitPed.threatX = p.x; hitPed.threatY = p.y;
    addHeat(g, hitCar || hitPed ? 80 : 80, p.x, p.y);
  } else if (hitCar) {
    hitCar.health -= 9;
    if (hitCar.driver === 'police') addHeat(g, 70, p.x, p.y); else addHeat(g, 45, p.x, p.y);
    spark(g, ex, ey);
  } else {
    addHeat(g, 34, p.x, p.y); // gunfire alone still draws attention
  }
  panicNear(g, p.x, p.y, 190);
}

function playerPunch(g) {
  const p = g.player;
  if (p.atkCd > 0) return;
  p.atkCd = 0.34;
  const hx = p.x + Math.cos(p.angle) * 22, hy = p.y + Math.sin(p.angle) * 22;
  for (const ped of g.peds) {
    if (ped.state === 'down' || ped.inCar) continue;
    if (dist2(ped.x, ped.y, hx, hy) < 20 * 20) {
      ped.health -= 34;
      ped.state = ped.health <= 0 ? 'down' : 'flee';
      ped.panicT = 3.5; ped.threatX = p.x; ped.threatY = p.y;
      addHeat(g, 48, p.x, p.y);
      spark(g, ped.x, ped.y);
      return;
    }
  }
  for (const c of g.cars) {
    if (dist2(c.x, c.y, hx, hy) < 30 * 30) { c.health -= 3; spark(g, hx, hy); return; }
  }
}

// Ray vs circle: returns t in [0,1] along a 340px ray, or null.
function rayHit(ox, oy, ang, cx, cy, r) {
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const lx = cx - ox, ly = cy - oy;
  const tca = lx * dx + ly * dy;
  if (tca < 0 || tca > 340) return null;
  const d2 = lx * lx + ly * ly - tca * tca;
  if (d2 > r * r) return null;
  return tca / 340;
}

function panicNear(g, x, y, r) {
  for (const ped of g.peds) {
    if (ped.state === 'stroll' && dist2(ped.x, ped.y, x, y) < r * r) {
      ped.state = 'flee'; ped.panicT = 2.6; ped.threatX = x; ped.threatY = y;
    }
  }
}

function tryBuyPistol(g) {
  const p = g.player;
  const gun = g.world.places.gun;
  if (!p.hasPistol && dist2(p.x, p.y, gun.x, gun.y) < 34 * 34) {
    if (p.cash >= PISTOL_COST) {
      p.cash -= PISTOL_COST; p.hasPistol = true;
      toast(g, 'Pistol bought at Iron & Oak. Try not to wave it around.');
      saveGame(g);
    }
  }
}

// --- Traffic -----------------------------------------------------------------

function stepTraffic(g) {
  for (const c of g.cars) {
    if (c.driver !== 'traffic') continue;
    const v = dirVec(c.dir);
    // Intersection ahead? Maybe turn.
    const aheadX = c.x + v[0] * 60, aheadY = c.y + v[1] * 60;
    const nearCross = (c.dir === 0 || c.dir === 2)
      ? Math.abs(aheadY - nearestAvY(aheadY)) < 26 && Math.abs(c.x - nearestAvX(c.x)) > 60
      : Math.abs(aheadX - nearestAvX(aheadX)) < 26 && Math.abs(c.y - nearestAvY(c.y)) > 60;
    if (nearCross && g.rng.chance(0.012)) {
      c.dir = (c.dir + (g.rng.chance(0.5) ? 1 : 3)) % 4;
    }
    // World-edge avenues force a turn back into the city.
    if ((c.dir === 2 && c.y > 2240) || (c.dir === 0 && c.y < 90) || (c.dir === 1 && c.x > WORLD_W - 90) || (c.dir === 3 && c.x < 90)) {
      c.dir = (c.dir + 2) % 4;
    }
    // Steer toward the lane line.
    let laneErr = 0;
    if (c.dir === 0) laneErr = (nearestAvX(c.x) + LANE) - c.x;
    if (c.dir === 2) laneErr = (nearestAvX(c.x) - LANE) - c.x;
    if (c.dir === 1) laneErr = (nearestAvY(c.y) + LANE) - c.y;
    if (c.dir === 3) laneErr = (nearestAvY(c.y) - LANE) - c.y;
    const desired = dirAngle(c.dir) + clamp(laneErr * 0.02, -0.5, 0.5) * (c.dir === 0 || c.dir === 2 ? 1 : 1);
    c.angle = angleLerp(c.angle, desired, 0.08);
    // Brake for anything in the probe point ahead.
    let want = c.type.top * 0.52;
    const px = c.x + Math.cos(c.angle) * (46 + Math.abs(c.speed) * 0.3);
    const py = c.y + Math.sin(c.angle) * (46 + Math.abs(c.speed) * 0.3);
    for (const o of g.cars) {
      if (o === c) continue;
      if (dist2(o.x, o.y, px, py) < 30 * 30) { want = 0; break; }
    }
    if (want > 0) for (const ped of g.peds) {
      if (!ped.inCar && ped.state !== 'down' && dist2(ped.x, ped.y, px, py) < 24 * 24) { want = 0; break; }
    }
    if (c.speed < want) c.speed = Math.min(want, c.speed + c.type.accel * 0.7 * STEP);
    else c.speed = Math.max(want, c.speed - c.type.accel * 1.6 * STEP);
    moveCar(g, c, false);
  }
}

// --- Police --------------------------------------------------------------------

function stepPolice(g) {
  const stars = starsOf(g);
  const p = g.player;
  const want = stars === 0 ? 0 : Math.min(2 + stars, 6);
  const units = g.cars.filter(c => c.driver === 'police');
  if (units.length < want) {
    // Spawn on a road near (but not on top of) the player.
    const ang = g.rng.range(0, Math.PI * 2);
    let sx = clamp(p.x + Math.cos(ang) * 620, 60, WORLD_W - 60);
    let sy = clamp(p.y + Math.sin(ang) * 620, 60, 2280);
    sx = nearestAvX(sx); sy = nearestAvY(sy);
    const c = makeCar(0, sx, sy, 0, 'police', g.rng);
    g.cars.push(c);
  }
  if (stars === 0) return;
  for (const c of units) {
    // Target the player; if a building blocks the line, aim for the avenue
    // corner nearest the player so the unit routes around the block.
    let tx = p.x, ty = p.y;
    if (losBlocked(g.world, c.x, c.y, p.x, p.y)) { tx = nearestAvX(p.x); ty = nearestAvY(p.y); }
    const desired = Math.atan2(ty - c.y, tx - c.x);
    c.angle = angleLerp(c.angle, desired, 0.055);
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    let wantSpeed = c.type.top * (0.82 + stars * 0.045);
    if (d < 60) wantSpeed = 30;
    if (c.speed < wantSpeed) c.speed = Math.min(wantSpeed, c.speed + c.type.accel * STEP);
    else c.speed = Math.max(wantSpeed, c.speed - c.type.accel * STEP);
    moveCar(g, c, false);
    // Shooting at 3+ stars, from the car, when the line is clear.
    c.lightPhase += STEP;
    if (stars >= 3 && d < 330 && d > 30 && !losBlocked(g.world, c.x, c.y, p.x, p.y) && g.rng.chance(0.028)) {
      g.fx.push({ type: 'tracer', x1: c.x, y1: c.y, x2: p.x, y2: p.y, ttl: 0.07, color: '#ff9a5e' });
      const hitChance = clamp(0.62 - d / 700, 0.15, 0.6);
      if (g.rng.chance(hitChance)) {
        if (p.car) { p.car.health -= 4; if (p.car.health < 25) hurtPlayer(g, 3); }
        else hurtPlayer(g, 6);
      }
    }
  }
}

function hurtPlayer(g, dmg) {
  const p = g.player;
  if (p.armour > 0) { const absorbed = Math.min(p.armour, dmg * 0.7); p.armour -= absorbed; dmg -= absorbed; }
  p.health -= dmg;
  p.hurtT = 2.5;
}

// --- Pedestrians ---------------------------------------------------------------

function stepPeds(g) {
  for (const ped of g.peds) {
    if (ped.inCar) { ped.x = ped.inCar.x; ped.y = ped.inCar.y; continue; }
    if (ped.state === 'down') {
      ped.downT += STEP;
      if (ped.downT > 24) { Object.assign(ped, spawnPed(g, g.rng)); }
      continue;
    }
    if (ped.isAccountant && g.mission.idx === 3 && g.mission.stage === 1 && !g.player.car) {
      // The accountant sticks close on foot.
      const d = Math.hypot(g.player.x - ped.x, g.player.y - ped.y);
      if (d > 30) movePed(g, ped, g.player.x, g.player.y, 150);
      continue;
    }
    if (ped.state === 'flee') {
      ped.panicT -= STEP;
      const away = Math.atan2(ped.y - ped.threatY, ped.x - ped.threatX);
      movePed(g, ped, ped.x + Math.cos(away) * 90, ped.y + Math.sin(away) * 90, 138);
      if (ped.panicT <= 0) ped.state = 'stroll';
      continue;
    }
    // Stroll: wander between nearby pavement points.
    const d = Math.hypot(ped.tx - ped.x, ped.ty - ped.y);
    if (d < 8 || g.rng.chance(0.002)) {
      ped.tx = clamp(ped.x + g.rng.range(-260, 260), 26, WORLD_W - 26);
      ped.ty = clamp(ped.y + g.rng.range(-260, 260), 26, 2340);
      const gr = groundAt(ped.tx, ped.ty);
      if (gr === 'water' || pointInBuilding(g.world, ped.tx, ped.ty)) { ped.tx = ped.x; ped.ty = ped.y; }
    }
    movePed(g, ped, ped.tx, ped.ty, 52);
  }
}

function movePed(g, ped, tx, ty, speed) {
  const dx = tx - ped.x, dy = ty - ped.y;
  const d = Math.hypot(dx, dy);
  if (d < 2) return;
  ped.angle = Math.atan2(dy, dx);
  let nx = ped.x + (dx / d) * speed * STEP, ny = ped.y + (dy / d) * speed * STEP;
  if (groundAt(nx, ny) === 'water') return;
  [nx, ny] = collideCircle(g.world, nx, ny, 9);
  ped.x = nx; ped.y = ny;
}

// --- Wanted bookkeeping ----------------------------------------------------------

function stepWanted(g) {
  const w = g.wanted, p = g.player;
  const stars = starsOf(g);
  if (stars === 0) { w.bust = 0; return; }
  let seen = false;
  for (const c of g.cars) {
    if (c.driver !== 'police') continue;
    if (dist2(c.x, c.y, p.x, p.y) < 460 * 460 && !losBlocked(g.world, c.x, c.y, p.x, p.y)) { seen = true; break; }
  }
  if (seen) w.unseen = 0; else w.unseen += STEP;
  if (w.unseen > WANTED_DECAY) {
    w.heat = Math.max(0, w.heat - 26 * STEP);
  }
  // Respray: drive in with heat and cash, drive out clean.
  const pad = g.world.resprayPad;
  if (p.car && p.x > pad.x && p.x < pad.x + pad.w && p.y > pad.y && p.y < pad.y + pad.h) {
    if (p.cash >= RESPRAY_COST) {
      p.cash -= RESPRAY_COST; w.heat = 0; w.unseen = 0;
      p.car.color = g.rng.pick(['#4a6b8a', '#5d7355', '#8a7a4a', '#6b5d7a']);
      toast(g, 'Fresh paint, fresh start. Bayside Respray: $' + RESPRAY_COST + '.');
    } else if (!w._resprayWarned) {
      w._resprayWarned = true;
      toast(g, 'Respray costs $' + RESPRAY_COST + ' - you are short.');
    }
  } else w._resprayWarned = false;
  // Bust check.
  const pSpeed = p.car ? Math.abs(p.car.speed) : 0;
  let boxed = false;
  if (pSpeed < 26) {
    for (const c of g.cars) if (c.driver === 'police' && dist2(c.x, c.y, p.x, p.y) < 64 * 64) { boxed = true; break; }
  }
  if (boxed) {
    w.bust += STEP;
    if (w.bust >= BUST_TIME && g.mode === 'play') { g.mode = 'busted'; g.overlayT = 2.6; }
  } else w.bust = Math.max(0, w.bust - STEP * 1.6);
}

// --- Missions ----------------------------------------------------------------------

const MISSIONS = [
  { name: "Wheels for Marco", pay: 300 },
  { name: 'Night Run', pay: 450 },
  { name: 'Register Diet', pay: 500 },
  { name: 'The Accountant', pay: 700 },
];

function stepMissions(g, pressed) {
  const m = g.mission, p = g.player, places = g.world.places;
  if (m.idx >= MISSIONS.length) { g.objective = null; return; }
  if (m.idx === 0) {
    if (m.stage === 0) {
      if (p.car === g.marcoCar) { m.stage = 1; toast(g, "That's the coupe. Marco is waiting at the hideout."); }
    } else if (dist2(p.x, p.y, places.hideout.x, places.hideout.y) < 52 * 52 && p.car === g.marcoCar) {
      completeMission(g, 'Marco beams at the coupe. $' + MISSIONS[0].pay + ' changes hands.');
    }
  } else if (m.idx === 1) {
    if (m.stage === 0) {
      if (dist2(p.x, p.y, places.warehouse.x, places.warehouse.y) < 40 * 40) {
        m.stage = 1; m.timer = 100;
        g.wanted.heat = Math.max(g.wanted.heat, 185);
        toast(g, 'Package aboard. Club Marisol, fast - and the heat is already on.');
      }
    } else {
      m.timer -= STEP;
      if (m.timer <= 0) { m.stage = 0; toast(g, 'Too slow. The package went back to Pier 9.'); }
      else if (dist2(p.x, p.y, places.club.x, places.club.y) < 46 * 46) {
        completeMission(g, 'Delivered with seconds to spare. $' + MISSIONS[1].pay + '.');
      }
    }
  } else if (m.idx === 2) {
    if (m.stage === 0) {
      const shop = places.shop;
      if (!p.car && dist2(p.x, p.y, shop.x, shop.y) < 34 * 34) {
        g.subObjective = 'Hold still at the register...';
        m.robT += STEP;
        if (m.robT >= 3) {
          m.stage = 1; m.robT = 0;
          p.cash += 160; g.stats.robberies++;
          g.wanted.heat = Math.max(g.wanted.heat, 285);
          toast(g, 'Register emptied: $160. Now lose the cops.');
        }
      } else m.robT = Math.max(0, m.robT - STEP * 2);
    } else if (starsOf(g) === 0) {
      completeMission(g, 'Clean getaway. Marco wires your cut: $' + MISSIONS[2].pay + '.');
    }
  } else if (m.idx === 3) {
    if (m.stage === 0) {
      const hosp = places.hospital;
      let acc = g.peds.find(pd => pd.isAccountant);
      if (!acc) {
        acc = g.peds.find(pd => pd.state === 'stroll' && !pd.isFare);
        if (acc) { acc.isAccountant = true; acc.x = hosp.x; acc.y = hosp.y + 8; acc.color = '#3a3f4a'; }
      }
      if (acc && dist2(p.x, p.y, acc.x, acc.y) < 40 * 40) {
        m.stage = 1;
        g.wanted.heat = Math.max(g.wanted.heat, 275);
        if (p.car) { acc.inCar = p.car; }
        toast(g, 'The accountant is with you. Casa Del Mar, and keep him breathing.');
      }
    } else {
      const acc = g.peds.find(pd => pd.isAccountant);
      if (acc && p.car && !acc.inCar && dist2(p.x, p.y, acc.x, acc.y) < 44 * 44) acc.inCar = p.car;
      if (acc && !p.car && acc.inCar) acc.inCar = null;
      if (dist2(p.x, p.y, places.hotel.x, places.hotel.y) < 52 * 52 && acc && dist2(acc.x, acc.y, p.x, p.y) < 90 * 90) {
        acc.isAccountant = false; acc.inCar = null; acc.state = 'stroll';
        completeMission(g, 'The accountant vanishes into Casa Del Mar. $' + MISSIONS[3].pay + '.');
        g.storyDone = true;
        g.mode = 'storydone'; g.overlayT = 6;
      }
    }
  }
  updateObjective(g);
}

function completeMission(g, msg) {
  const pay = MISSIONS[g.mission.idx].pay;
  g.player.cash += pay; g.stats.earned += pay;
  g.mission.idx++; g.mission.stage = 0; g.mission.timer = 0;
  toast(g, msg);
  saveGame(g);
}

function updateObjective(g) {
  const m = g.mission, places = g.world.places;
  g.subObjective = '';
  if (g.storyDone || m.idx >= MISSIONS.length) {
    g.objective = { text: 'Free roam - fares, robberies and trouble are all still hiring.', x: null, y: null };
    return;
  }
  if (m.idx === 0) {
    g.objective = m.stage === 0
      ? { text: "Wheels for Marco: steal his coupe, parked by Pier 9 Warehouse.", x: g.marcoCar.x, y: g.marcoCar.y }
      : { text: 'Deliver the coupe to the Calle Ocho Hideout.', x: places.hideout.x, y: places.hideout.y };
  } else if (m.idx === 1) {
    g.objective = m.stage === 0
      ? { text: 'Night Run: pick up the package at Pier 9 Warehouse.', x: places.warehouse.x, y: places.warehouse.y }
      : { text: 'Night Run: get the package to Club Marisol before the timer dies.', x: places.club.x, y: places.club.y };
    if (m.stage === 1) g.subObjective = 'Time left: ' + Math.max(0, Math.ceil(m.timer)) + 's';
  } else if (m.idx === 2) {
    g.objective = m.stage === 0
      ? { text: 'Register Diet: rob the QuickMart register (on foot, at the door).', x: places.shop.x, y: places.shop.y }
      : { text: 'Register Diet: lose the cops completely.', x: null, y: null };
  } else if (m.idx === 3) {
    g.objective = m.stage === 0
      ? { text: 'The Accountant: pick him up outside St. Solana Hospital.', x: places.hospital.x, y: places.hospital.y }
      : { text: 'The Accountant: deliver him to Casa Del Mar.', x: places.hotel.x, y: places.hotel.y };
  }
}

// --- Taxi fares ---------------------------------------------------------------------

function stepFare(g) {
  const p = g.player;
  if (g.fare) {
    const f = g.fare;
    if (f.phase === 'pickup') {
      if (p.car && Math.abs(p.car.speed) < 12 && dist2(p.x, p.y, f.ped.x, f.ped.y) < 52 * 52) {
        f.ped.inCar = p.car; f.phase = 'dropoff';
        toast(g, 'Fare aboard. Follow the marker.');
      }
    } else {
      if (dist2(p.x, p.y, f.x, f.y) < 54 * 54 && Math.abs(p.car ? p.car.speed : 99) < 20) {
        const pay = 24 + Math.floor(f.dist / 38);
        p.cash += pay; g.stats.earned += pay; g.stats.fares++;
        f.ped.inCar = null; f.ped.isFare = false; f.ped.state = 'stroll';
        f.ped.x = p.x + 26; f.ped.y = p.y + 10;
        toast(g, 'Fare paid: $' + pay + '. Five stars, no tip jar needed.');
        g.fare = null; g.fareCooldown = g.rng.range(200, 420);
      }
    }
    return;
  }
  // Free-roam shop robberies tick down their cooldowns here too.
  for (const k of Object.keys(g.robCooldowns)) if (g.robCooldowns[k] > 0) g.robCooldowns[k] -= STEP;
  if (!p.car || g.mode !== 'play') return;
  g.fareCooldown -= STEP;
  if (g.fareCooldown > 0) return;
  const ped = g.peds.find(pd => pd.state === 'stroll' && !pd.isFare && !pd.isAccountant && dist2(pd.x, pd.y, p.x, p.y) < 700 * 700);
  if (!ped) { g.fareCooldown = 60; return; }
  ped.isFare = true;
  const dx = clamp(ped.x + g.rng.range(-900, 900), 80, WORLD_W - 80);
  const dy = clamp(ped.y + g.rng.range(-700, 700), 80, 2280);
  g.fare = { ped, phase: 'pickup', x: nearestAvX(dx), y: nearestAvY(dy), dist: Math.hypot(dx - ped.x, dy - ped.y) };
  toast(g, 'A fare is waving you down nearby.');
}

// Free-roam robbery: on foot at the QuickMart or Club Marisol door, hold
// still to empty the register. Repeatable, with a per-shop cooldown. The
// story mission uses the QuickMart too, so this stands down while that
// mission is at its robbery stage.
function stepFreeRobbery(g) {
  const p = g.player;
  if (p.car || g.mode !== 'play') { g.freeRobT = 0; return; }
  const spots = [
    { key: 'shop', place: g.world.places.shop },
    { key: 'club', place: g.world.places.club },
  ];
  for (const s of spots) {
    if (s.key === 'shop' && g.mission.idx === 2 && g.mission.stage === 0) continue;
    if ((g.robCooldowns[s.key] || 0) > 0) continue;
    if (dist2(p.x, p.y, s.place.x, s.place.y) < 34 * 34) {
      g.freeRobT = (g.freeRobT || 0) + STEP;
      g.subObjective = 'Emptying the register...';
      if (g.freeRobT >= 3) {
        g.freeRobT = 0;
        const take = 90 + g.rng.int(0, 90);
        p.cash += take; g.stats.robberies++;
        g.wanted.heat = Math.max(g.wanted.heat, 200);
        g.robCooldowns[s.key] = 150;
        toast(g, s.place.label + ' register: $' + take + '. Time to not be here.');
      }
      return;
    }
  }
  g.freeRobT = Math.max(0, (g.freeRobT || 0) - STEP * 2);
}

// --- Pickups ---------------------------------------------------------------------------

function stepPickups(g) {
  const p = g.player;
  for (const pk of g.world.pickups) {
    if (pk.taken) {
      pk.respawn -= STEP;
      if (pk.respawn <= 0) pk.taken = false;
      continue;
    }
    if (dist2(p.x, p.y, pk.x, pk.y) < 24 * 24) {
      if (pk.type === 'heart' && p.health < 100) { p.health = 100; pk.taken = true; pk.respawn = 45; toast(g, 'Patched up.'); }
      else if (pk.type === 'armour') { p.armour = 60; pk.taken = true; pk.respawn = 60; toast(g, 'Armour vest on.'); }
      else if (pk.type === 'cash') { p.cash += 40; pk.taken = true; pk.respawn = 90; toast(g, 'Loose cash: $40.'); }
    }
  }
}

// --- FX / toasts --------------------------------------------------------------------------

function spark(g, x, y) { g.fx.push({ type: 'spark', x, y, ttl: 0.22 }); }
function decayFx(g) { for (const f of g.fx) f.ttl -= STEP; g.fx = g.fx.filter(f => f.ttl > 0); }
export function toast(g, text) { g.toasts.push({ text, ttl: 4.2 }); if (g.toasts.length > 3) g.toasts.shift(); }

// --- Save -----------------------------------------------------------------------------------

const SAVE_KEY = 'marisol-heat-save-v1';
function loadSaveRaw() {
  try { if (typeof localStorage !== 'undefined') return JSON.parse(localStorage.getItem(SAVE_KEY)); } catch (e) { /* no storage */ }
  return null;
}
export function saveGame(g) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: g.player.cash, hasPistol: g.player.hasPistol,
      missionIdx: g.mission.idx, storyDone: g.storyDone,
      x: g.player.x, y: g.player.y,
    }));
    g.hasSave = true;
  } catch (e) { /* storage unavailable */ }
}
