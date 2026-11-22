// Marisol Heat - canvas renderer. Draws the world from the camera, then the
// HUD, then any menu or overlay. Pure drawing: it reads the sim state and
// never changes it, so the headless harness can render staged scenes with
// the exact code the browser runs.

import { WORLD_W, WORLD_H, VIEW_W, VIEW_H, COLORS, PLACE_KINDS } from './config.js';
import { AV_X, AV_Y, COAST_Y, SEA_Y, shade } from './world.js';
import { starsOf } from './game.js';
import { clamp } from './random.js';

export function render(ctx, g, W = VIEW_W, H = VIEW_H) {
  const cam = g.cam;
  ctx.fillStyle = COLORS.grass;
  ctx.fillRect(0, 0, W, H);
  drawGround(ctx, g, cam, W, H);
  drawBuildings(ctx, g, cam);
  drawTrees(ctx, g, cam);
  drawPickups(ctx, g, cam);
  drawCars(ctx, g, cam);
  drawPeds(ctx, g, cam);
  if (!g.player.car && g.mode !== 'title') drawPlayer(ctx, g, cam);
  drawFx(ctx, g, cam);
  drawDayTint(ctx, g, W, H);
  if (g.mode === 'title') { drawTitle(ctx, g, W, H); return; }
  drawHUD(ctx, g, W, H);
  if (g.mode === 'paused') overlay(ctx, W, H, 'PAUSED', 'Esc or P to resume', 'rgba(8,10,16,0.55)');
  if (g.mode === 'busted') overlay(ctx, W, H, 'BUSTED', 'The Marisol PD impound accepts cash and dignity.', 'rgba(20,30,90,0.45)');
  if (g.mode === 'wasted') overlay(ctx, W, H, 'WASTED', 'St. Solana patches you up. The bill is never small.', 'rgba(90,10,10,0.45)');
  if (g.mode === 'storydone') drawStoryDone(ctx, g, W, H);
}

function drawGround(ctx, g, cam, W, H) {
  const x0 = cam.x, y0 = cam.y, x1 = cam.x + W, y1 = cam.y + H;
  // Park and parking-lot blocks.
  ctx.fillStyle = COLORS.park;
  ctx.fillRect(AV_X[5] + 60 - x0, AV_Y[1] + 60 - y0, 512 - 120, 512 - 120);
  ctx.fillStyle = COLORS.lot;
  ctx.fillRect(AV_X[2] + 54 - x0, AV_Y[3] + 54 - y0, 512 - 108, COAST_Y - AV_Y[3] - 108);
  // Beach and sea.
  if (y1 > COAST_Y) {
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, COAST_Y - y0, W, SEA_Y - COAST_Y);
    ctx.fillStyle = COLORS.water;
    ctx.fillRect(0, SEA_Y - y0, W, H - (SEA_Y - y0));
    ctx.fillStyle = COLORS.waterDeep;
    for (let wx = -((x0 / 90) % 90); wx < W; wx += 90) ctx.fillRect(wx, SEA_Y + 46 - y0, 44, 5);
  }
  // Sidewalk aprons, then asphalt.
  ctx.fillStyle = COLORS.sidewalk;
  for (const a of AV_X) if (a > x0 - 90 && a < x1 + 90) ctx.fillRect(a - 68 - x0, Math.max(0, -y0), 136, Math.min(H, COAST_Y - y0));
  for (const a of AV_Y) if (a > y0 - 90 && a < y1 + 90) ctx.fillRect(Math.max(0, -x0), a - 68 - y0, W, 136);
  ctx.fillStyle = COLORS.road;
  for (const a of AV_X) if (a > x0 - 70 && a < x1 + 70) ctx.fillRect(a - 54 - x0, Math.max(0, -y0), 108, Math.min(H, COAST_Y - y0));
  for (const a of AV_Y) if (a > y0 - 70 && a < y1 + 70) ctx.fillRect(Math.max(0, -x0), a - 54 - y0, W, 108);
  // Lane dashes.
  ctx.fillStyle = COLORS.lane;
  for (const a of AV_X) {
    if (a < x0 - 70 || a > x1 + 70) continue;
    for (let y = Math.floor(y0 / 46) * 46; y < y1; y += 46) {
      let onCross = false;
      for (const b of AV_Y) if (Math.abs(y - b) < 62) { onCross = true; break; }
      if (!onCross) ctx.fillRect(a - 2 - x0, y - y0, 4, 26);
    }
  }
  for (const a of AV_Y) {
    if (a < y0 - 70 || a > y1 + 70) continue;
    for (let x = Math.floor(x0 / 46) * 46; x < x1; x += 46) {
      let onCross = false;
      for (const b of AV_X) if (Math.abs(x - b) < 62) { onCross = true; break; }
      if (!onCross) ctx.fillRect(x - x0, a - 2 - y0, 26, 4);
    }
  }
  // Respray pad.
  const pad = g.world.resprayPad;
  ctx.fillStyle = '#6d5a7a';
  ctx.fillRect(pad.x - x0, pad.y - y0, pad.w, pad.h);
  ctx.strokeStyle = '#e8e2f2';
  ctx.lineWidth = 2;
  ctx.strokeRect(pad.x - x0 + 3, pad.y - y0 + 3, pad.w - 6, pad.h - 6);
}

function drawBuildings(ctx, g, cam) {
  const night = nightFactor(g);
  for (const b of g.world.buildings) {
    if (b.x > cam.x + VIEW_W + 80 || b.x + b.w < cam.x - 80 || b.y > cam.y + VIEW_H + 80 || b.y + b.h < cam.y - 80) continue;
    const x = b.x - cam.x, y = b.y - cam.y;
    const lift = b.floors * 3;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + 7, y + 9 + lift * 0.3, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(x, y - lift * 0.4, b.w, b.h);
    ctx.fillStyle = b.roof;
    ctx.fillRect(x + 5, y - lift * 0.4 + 5, b.w - 10, b.h - 10);
    if (b.floors >= 3) {
      // Top-down, a tall building shows its roof: a lighter slab, vents and
      // plant boxes placed by a hash of the position so they never flicker.
      ctx.fillStyle = shade(b.color, 16);
      ctx.fillRect(x + 10, y - lift * 0.4 + 10, b.w - 20, b.h - 20);
      ctx.fillStyle = shade(b.color, -6);
      const units = 3 + Math.floor(b.w / 90);
      for (let i = 0; i < units; i++) {
        const hx = x + 16 + ((b.x * 7 + i * 53) % Math.max(20, b.w - 52));
        const hy = y - lift * 0.4 + 14 + ((b.y * 5 + i * 37) % Math.max(16, b.h - 44));
        ctx.fillRect(hx, hy, 20, 13);
      }
      ctx.beginPath();
      ctx.arc(x + b.w - 26, y - lift * 0.4 + 24, 8, 0, 6.29);
      ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(30,40,55,0.5)';
      ctx.fillRect(x + b.w / 2 - 11, y + b.h - 16, 22, 12); // door
    }
    if (b.label) {
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,12,16,0.72)';
      const tw = ctx.measureText(b.label).width + 12;
      ctx.fillRect(x + b.w / 2 - tw / 2, y - lift * 0.4 - 22, tw, 16);
      ctx.fillStyle = '#f2ead8';
      ctx.fillText(b.label, x + b.w / 2, y - lift * 0.4 - 10);
    }
  }
}

function drawTrees(ctx, g, cam) {
  for (const t of g.world.trees) {
    if (t.x < cam.x - 40 || t.x > cam.x + VIEW_W + 40 || t.y < cam.y - 40 || t.y > cam.y + VIEW_H + 40) continue;
    const x = t.x - cam.x, y = t.y - cam.y;
    if (t.palm) {
      ctx.strokeStyle = '#8a6d4a';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(x, y + 8); ctx.quadraticCurveTo(x + 4, y - 6, x + 8, y - 14); ctx.stroke();
      ctx.strokeStyle = '#4d8a3f';
      ctx.lineWidth = 3;
      for (let i = 0; i < 5; i++) {
        const a = -0.4 - i * 0.55;
        ctx.beginPath(); ctx.moveTo(x + 8, y - 14);
        ctx.quadraticCurveTo(x + 8 + Math.cos(a) * 13, y - 14 + Math.sin(a) * 10 - 4, x + 8 + Math.cos(a) * 22, y - 14 + Math.sin(a) * 15 + 5);
        ctx.stroke();
      }
    } else {
      ctx.fillStyle = '#6d5136';
      ctx.fillRect(x - 2, y - 2, 4, 9);
      ctx.fillStyle = '#3f7031';
      ctx.beginPath(); ctx.arc(x, y - 6, t.r, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#4d8540';
      ctx.beginPath(); ctx.arc(x - t.r * 0.3, y - t.r * 0.75, t.r * 0.62, 0, 6.29); ctx.fill();
    }
  }
}

function drawPickups(ctx, g, cam) {
  const bob = Math.sin(g.time * 3) * 3;
  for (const pk of g.world.pickups) {
    if (pk.taken) continue;
    const x = pk.x - cam.x, y = pk.y - cam.y + bob;
    if (x < -30 || x > VIEW_W + 30 || y < -30 || y > VIEW_H + 30) continue;
    ctx.beginPath(); ctx.arc(x, y, 11, 0, 6.29);
    ctx.fillStyle = pk.type === 'heart' ? '#c23b4e' : pk.type === 'armour' ? '#3f6ea8' : '#3f9e4d';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '700 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(pk.type === 'heart' ? '+' : pk.type === 'armour' ? 'A' : '$', x, y + 5);
  }
}

function drawCars(ctx, g, cam) {
  for (const c of g.cars) {
    if (c.x < cam.x - 70 || c.x > cam.x + VIEW_W + 70 || c.y < cam.y - 70 || c.y > cam.y + VIEW_H + 70) continue;
    ctx.save();
    ctx.translate(c.x - cam.x, c.y - cam.y);
    ctx.rotate(c.angle);
    const w = c.type.w, h = c.type.h;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w, h);
    ctx.fillStyle = c.health <= 0 ? shade(c.color, -40) : c.color;
    roundRect(ctx, -w / 2, -h / 2, w, h, 6); ctx.fill();
    ctx.fillStyle = 'rgba(20,28,38,0.85)';
    roundRect(ctx, -w * 0.08, -h / 2 + 3, w * 0.3, h - 6, 3); ctx.fill(); // windshield + cabin
    ctx.fillStyle = shade(c.color, 22);
    roundRect(ctx, -w * 0.34, -h / 2 + 4, w * 0.22, h - 8, 3); ctx.fill(); // hood/roof tone
    if (c.type.kind === 'police') {
      ctx.fillStyle = '#23262b';
      ctx.fillRect(-w * 0.05, -h / 2, w * 0.2, h);
      const flash = Math.sin(c.lightPhase * 9) > 0;
      ctx.fillStyle = flash ? '#ff4040' : '#4060ff';
      ctx.fillRect(-4, -h / 2 + 2, 8, 5);
      ctx.fillStyle = flash ? '#4060ff' : '#ff4040';
      ctx.fillRect(-4, h / 2 - 7, 8, 5);
    }
    if (c.type.kind === 'taxi') {
      ctx.fillStyle = '#fff2c0';
      ctx.fillRect(-5, -4, 10, 8);
      ctx.fillStyle = '#222';
      ctx.font = '700 7px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('TAXI', 0, 2.5);
    }
    if (c.isMarco) {
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(-w / 2, -2, w, 4);
    }
    if (c.health < 45) { // damage smoke
      ctx.fillStyle = 'rgba(60,60,60,0.5)';
      ctx.beginPath(); ctx.arc(w * 0.3, 0, 6 + (c.health < 20 ? 4 : 0), 0, 6.29); ctx.fill();
    }
    ctx.restore();
  }
}

function drawPeds(ctx, g, cam) {
  for (const ped of g.peds) {
    if (ped.inCar) continue;
    if (ped.x < cam.x - 30 || ped.x > cam.x + VIEW_W + 30 || ped.y < cam.y - 30 || ped.y > cam.y + VIEW_H + 30) continue;
    const x = ped.x - cam.x, y = ped.y - cam.y;
    if (ped.state === 'down') {
      ctx.save(); ctx.translate(x, y); ctx.rotate(ped.angle);
      ctx.fillStyle = shade(ped.color, -25);
      ctx.fillRect(-11, -4, 22, 8);
      ctx.restore();
      continue;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.arc(x + 2, y + 3, 7, 0, 6.29); ctx.fill();
    ctx.fillStyle = ped.color;
    ctx.beginPath(); ctx.arc(x, y, 7.5, 0, 6.29); ctx.fill();
    ctx.fillStyle = '#e8c39a';
    ctx.beginPath(); ctx.arc(x + Math.cos(ped.angle) * 2, y + Math.sin(ped.angle) * 2, 3.6, 0, 6.29); ctx.fill();
    if (ped.isFare || ped.isAccountant) {
      const bob = Math.sin(g.time * 4) * 3;
      ctx.font = '700 15px system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillStyle = ped.isAccountant ? '#9fd0ff' : '#7dff8a';
      ctx.fillText(ped.isAccountant ? '!' : '$', x, y - 14 + bob);
    }
  }
}

function drawPlayer(ctx, g, cam) {
  const p = g.player;
  const x = p.x - cam.x, y = p.y - cam.y;
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath(); ctx.arc(x + 2, y + 3, 8, 0, 6.29); ctx.fill();
  ctx.fillStyle = '#e8b13c';
  ctx.beginPath(); ctx.arc(x, y, 8.5, 0, 6.29); ctx.fill();
  ctx.fillStyle = '#22242a';
  ctx.beginPath(); ctx.arc(x + Math.cos(p.angle) * 2.5, y + Math.sin(p.angle) * 2.5, 4, 0, 6.29); ctx.fill();
  if (p.hasPistol) {
    ctx.strokeStyle = '#191919'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(p.angle) * 14, y + Math.sin(p.angle) * 14); ctx.stroke();
  }
}

function drawFx(ctx, g, cam) {
  for (const f of g.fx) {
    if (f.type === 'tracer') {
      ctx.strokeStyle = f.color; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(f.x1 - cam.x, f.y1 - cam.y); ctx.lineTo(f.x2 - cam.x, f.y2 - cam.y); ctx.stroke();
    } else if (f.type === 'flash') {
      ctx.fillStyle = '#ffe9a0';
      ctx.beginPath(); ctx.arc(f.x - cam.x, f.y - cam.y, 7, 0, 6.29); ctx.fill();
    } else if (f.type === 'spark') {
      ctx.strokeStyle = '#ffb84e'; ctx.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const a = i * 1.256 + f.x * 0.01;
        ctx.beginPath();
        ctx.moveTo(f.x - cam.x, f.y - cam.y);
        ctx.lineTo(f.x - cam.x + Math.cos(a) * 11, f.y - cam.y + Math.sin(a) * 11);
        ctx.stroke();
      }
    }
  }
}

export function nightFactor(g) {
  // 0 at midday, 1 in the small hours.
  const t = g.clock;
  const day = Math.sin((t - 0.25) * Math.PI * 2); // peaks at 13:00-ish
  return clamp(0.25 - day * 0.55, 0, 0.82);
}

function drawDayTint(ctx, g, W, H) {
  const n = nightFactor(g);
  if (n > 0.03) { ctx.fillStyle = 'rgba(12,16,48,' + (n * 0.5).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
  const dusk = clamp(1 - Math.abs(g.clock - 0.78) * 9, 0, 1);
  if (dusk > 0.03) { ctx.fillStyle = 'rgba(255,130,50,' + (dusk * 0.10).toFixed(3) + ')'; ctx.fillRect(0, 0, W, H); }
}

// --- HUD ---------------------------------------------------------------------

function drawHUD(ctx, g, W, H) {
  const p = g.player;
  // Top-left vitals.
  panel(ctx, 14, 14, 208, 74);
  ctx.textAlign = 'left';
  ctx.font = '700 19px system-ui, sans-serif';
  ctx.fillStyle = '#8fe388';
  ctx.fillText('$' + p.cash, 26, 40);
  bar(ctx, 26, 50, 120, 9, p.health / 100, '#d84a5e');
  bar(ctx, 26, 64, 120, 9, p.armour / 60, '#5e9ad8');
  ctx.font = '600 12px system-ui, sans-serif';
  ctx.fillStyle = '#cfd4da';
  ctx.fillText(p.hasPistol ? 'PISTOL' : 'FISTS', 156, 59);
  if (p.car) ctx.fillText(p.car.type.kind.toUpperCase(), 156, 76);
  // Clock.
  const hh = Math.floor(g.clock * 24), mm = Math.floor((g.clock * 24 - hh) * 60);
  ctx.font = '700 16px system-ui, sans-serif';
  ctx.fillStyle = '#f2ead8';
  ctx.textAlign = 'right';
  ctx.fillText(String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0'), W - 24, 40);
  // Wanted stars + cooling bar.
  const stars = starsOf(g);
  ctx.font = '20px system-ui, sans-serif';
  ctx.textAlign = 'right';
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = i < stars ? '#ffd23e' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', W - 24 - (4 - i) * 24, 66);
  }
  if (stars > 0) {
    const cooling = clamp(g.wanted.unseen / 26, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(W - 144, 74, 120, 5);
    ctx.fillStyle = '#7ec8ff';
    ctx.fillRect(W - 144, 74, 120 * cooling, 5);
  }
  // Objective banner.
  if (g.objective) {
    ctx.font = '600 15px system-ui, sans-serif';
    const tw = ctx.measureText(g.objective.text).width + 28;
    panel(ctx, (W - tw) / 2, 14, tw, 30);
    ctx.fillStyle = '#f2ead8'; ctx.textAlign = 'center';
    ctx.fillText(g.objective.text, W / 2, 35);
  }
  if (g.subObjective) {
    ctx.font = '600 13px system-ui, sans-serif';
    ctx.fillStyle = '#ffd76a'; ctx.textAlign = 'center';
    ctx.fillText(g.subObjective, W / 2, 62);
  }
  if (g.mission.idx === 1 && g.mission.stage === 1) {
    const frac = clamp(g.mission.timer / 100, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(W / 2 - 130, 70, 260, 8);
    ctx.fillStyle = frac > 0.3 ? '#ffd23e' : '#ff5040';
    ctx.fillRect(W / 2 - 130, 70, 260 * frac, 8);
  }
  drawMinimap(ctx, g, 14, H - 154);
  drawPrompt(ctx, g, W, H);
  // Bust meter.
  if (g.wanted.bust > 0.1) {
    const frac = clamp(g.wanted.bust / 2.4, 0, 1);
    ctx.font = '700 15px system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = '#ff6a5e';
    ctx.fillText('BUSTED IN...', W / 2, H - 120);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fillRect(W / 2 - 110, H - 112, 220, 10);
    ctx.fillStyle = '#ff5040'; ctx.fillRect(W / 2 - 110, H - 112, 220 * frac, 10);
  }
  // Toasts.
  ctx.font = '600 13px system-ui, sans-serif'; ctx.textAlign = 'right';
  g.toasts.forEach((t, i) => {
    ctx.fillStyle = 'rgba(240,235,220,' + clamp(t.ttl, 0, 1).toFixed(2) + ')';
    ctx.fillText(t.text, W - 18, H - 26 - i * 19);
  });
}

function drawMinimap(ctx, g, x, y) {
  const mw = 216, mh = 135, sx = mw / WORLD_W, sy = mh / WORLD_H;
  ctx.fillStyle = 'rgba(16,22,18,0.82)';
  ctx.fillRect(x, y, mw, mh);
  ctx.fillStyle = '#2e6f9e';
  ctx.fillRect(x, y + SEA_Y * sy, mw, (WORLD_H - SEA_Y) * sy);
  ctx.fillStyle = '#5d904e';
  ctx.fillRect(x + (AV_X[5] + 60) * sx, y + (AV_Y[1] + 60) * sy, (512 - 120) * sx, (512 - 120) * sy);
  ctx.strokeStyle = 'rgba(220,220,220,0.5)'; ctx.lineWidth = 1;
  for (const a of AV_X) { ctx.beginPath(); ctx.moveTo(x + a * sx, y); ctx.lineTo(x + a * sx, y + COAST_Y * sy); ctx.stroke(); }
  for (const a of AV_Y) { ctx.beginPath(); ctx.moveTo(x, y + a * sy); ctx.lineTo(x + mw, y + a * sy); ctx.stroke(); }
  const blip = (wx, wy, color, r = 3) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x + wx * sx, y + wy * sy, r, 0, 6.29); ctx.fill(); };
  for (const c of g.cars) if (c.driver === 'police') blip(c.x, c.y, Math.sin(g.time * 8) > 0 ? '#ff5040' : '#4e8aff', 2.5);
  if (g.fare) blip(g.fare.phase === 'pickup' ? g.fare.ped.x : g.fare.x, g.fare.phase === 'pickup' ? g.fare.ped.y : g.fare.y, '#7dff8a', 3.5);
  if (g.objective && g.objective.x !== null) blip(g.objective.x, g.objective.y, '#ffd23e', 3.5);
  const rp = g.world.places.respray;
  blip(rp.x, rp.y, '#c99aff', 2.5);
  // Player arrow.
  const p = g.player;
  ctx.save();
  ctx.translate(x + p.x * sx, y + p.y * sy);
  ctx.rotate(p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(6, 0); ctx.lineTo(-4, -3.5); ctx.lineTo(-4, 3.5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeRect(x, y, mw, mh);
}

function drawPrompt(ctx, g, W, H) {
  const p = g.player;
  let text = null;
  if (!p.car) {
    let nearCar = false;
    for (const c of g.cars) if (c.driver !== 'police' && (c.x - p.x) ** 2 + (c.y - p.y) ** 2 < 36 * 36) { nearCar = true; break; }
    const gun = g.world.places.gun;
    if (!p.hasPistol && (p.x - gun.x) ** 2 + (p.y - gun.y) ** 2 < 34 * 34) {
      text = p.cash >= 250 ? 'Iron & Oak: pistol bought automatically at the door - $250' : 'Iron & Oak Guns: a pistol costs $250';
    } else if (nearCar) text = 'E - Get in';
    else {
      const shop = g.world.places.shop, club = g.world.places.club;
      if ((p.x - shop.x) ** 2 + (p.y - shop.y) ** 2 < 34 * 34 || (p.x - club.x) ** 2 + (p.y - club.y) ** 2 < 34 * 34) text = 'Hold still at the door to rob the register';
    }
  } else {
    text = 'E - Get out · F - Shoot';
    const pad = g.world.resprayPad;
    if (p.x > pad.x && p.x < pad.x + pad.w && p.y > pad.y && p.y < pad.y + pad.h) text = 'Bayside Respray: $100 clears your heat';
  }
  if (!text) return;
  ctx.font = '600 14px system-ui, sans-serif'; ctx.textAlign = 'center';
  const tw = ctx.measureText(text).width + 24;
  panel(ctx, (W - tw) / 2, H - 44, tw, 28);
  ctx.fillStyle = '#f2ead8';
  ctx.fillText(text, W / 2, H - 25);
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(10,13,18,0.62)';
  roundRect(ctx, x, y, w, h, 7); ctx.fill();
}

function bar(ctx, x, y, w, h, frac, color) {
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}

function overlay(ctx, W, H, title, sub, tint) {
  ctx.fillStyle = tint;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = '800 64px system-ui, sans-serif';
  ctx.fillStyle = '#fff';
  ctx.fillText(title, W / 2, H / 2 - 8);
  ctx.font = '600 16px system-ui, sans-serif';
  ctx.fillStyle = '#e8e2d2';
  ctx.fillText(sub, W / 2, H / 2 + 28);
}

function drawStoryDone(ctx, g, W, H) {
  ctx.fillStyle = 'rgba(8,10,16,0.6)';
  ctx.fillRect(0, 0, W, H);
  const cw = 520, ch = 250, x = (W - cw) / 2, y = (H - ch) / 2;
  ctx.fillStyle = '#171a21';
  roundRect(ctx, x, y, cw, ch, 12); ctx.fill();
  ctx.strokeStyle = '#ffd23e'; ctx.lineWidth = 2;
  roundRect(ctx, x, y, cw, ch, 12); ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = '800 34px system-ui, sans-serif';
  ctx.fillStyle = '#ffd23e';
  ctx.fillText('STORY COMPLETE', W / 2, y + 58);
  ctx.font = '600 15px system-ui, sans-serif';
  ctx.fillStyle = '#e8e2d2';
  ctx.fillText('Marco, the package, the register and the accountant:', W / 2, y + 96);
  ctx.fillText('Marisol is yours now. Fares and robberies keep paying.', W / 2, y + 118);
  ctx.font = '600 14px system-ui, sans-serif';
  ctx.fillStyle = '#9fd0a8';
  ctx.fillText('Earned from work: $' + g.stats.earned + ' · Fares: ' + g.stats.fares + ' · Robberies: ' + g.stats.robberies, W / 2, y + 152);
  ctx.fillStyle = '#cfd4da';
  ctx.fillText('Free roam continues...', W / 2, y + 196);
}

function drawTitle(ctx, g, W, H) {
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, 'rgba(10,8,24,0.55)');
  grad.addColorStop(0.55, 'rgba(10,8,24,0.08)');
  grad.addColorStop(1, 'rgba(10,8,24,0.6)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.font = '800 92px system-ui, sans-serif';
  ctx.fillStyle = '#ff5e8a';
  ctx.fillText('MARISOL', W / 2 + 3, 223);
  ctx.fillStyle = '#ffd23e';
  ctx.fillText('HEAT', W / 2 + 3, 313);
  ctx.font = '600 17px system-ui, sans-serif';
  ctx.fillStyle = '#f2ead8';
  ctx.fillText('Steal cars. Run the jobs. Lose the heat.', W / 2, 352);
  const items = ['New Game', g.hasSave ? 'Continue' : 'Continue (no save yet)', 'Free Roam'];
  items.forEach((label, i) => {
    const y = 424 + i * 46;
    if (i === g.menuIdx) {
      ctx.fillStyle = 'rgba(255,210,62,0.92)';
      roundRect(ctx, W / 2 - 150, y - 26, 300, 36, 8); ctx.fill();
      ctx.fillStyle = '#1c1a14';
    } else ctx.fillStyle = '#e8e2d2';
    ctx.font = '700 19px system-ui, sans-serif';
    ctx.fillText(label, W / 2, y);
  });
  ctx.font = '600 13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(240,235,220,0.85)';
  ctx.fillText('WASD drive · E enter/exit · F punch or shoot · Shift run · P pause', W / 2, H - 30);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
