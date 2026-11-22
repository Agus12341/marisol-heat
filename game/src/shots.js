// Marisol Heat - staged scenes for the entry screenshots. Each setup puts
// the sim into a deterministic, photogenic state; the browser opens them
// with ?shot=<name> and the headless harness calls the same functions.
// Nothing here is render-only fakery: every scene is real sim state that
// then steps and plays like the game itself.

import { clamp } from './random.js';

function putInCar(g, car, x, y, angle, speed) {
  car.x = x; car.y = y; car.angle = angle; car.speed = speed;
  car.driver = 'player';
  g.player.car = car;
  g.player.x = x; g.player.y = y; g.player.angle = angle;
}

function findCar(g, pred) { return g.cars.find(pred); }

export const SHOT_NAMES = ['title', 'drive', 'chase', 'mission'];

export function setupShot(g, name) {
  const places = g.world.places;
  g.mode = 'play';
  g.wanted.heat = 0;
  if (name === 'title') {
    // The menu over the beachfront: camera drifts along the club/hotel coast.
    g.mode = 'title';
    g.cam.x = clamp(places.club.x - 500, 0, 4096 - 1280);
    g.cam.y = 2560 - 800;
    g.time = 0;
    g.clock = 0.72; // golden late afternoon
    return;
  }
  if (name === 'drive') {
    // Marco's coupe, mid-run downtown: traffic around, delivery objective up.
    const coupe = g.marcoCar;
    putInCar(g, coupe, 1792, 1040, 0, 235); // eastbound on the avenue at y=1024-ish
    coupe.y = 1280 + 27; coupe.angle = 0;
    g.player.cash = 420; g.player.hasPistol = true;
    g.mission.idx = 0; g.mission.stage = 1; // "deliver the coupe"
    let taxi = findCar(g, c => c.type.kind === 'taxi' && c.driver === 'traffic');
    if (taxi) { taxi.x = 1560; taxi.y = 1280 + 27; taxi.angle = 0; taxi.speed = 150; taxi.dir = 1; }
    let sedan = findCar(g, c => c.type.kind === 'sedan' && c.driver === 'traffic' && c !== taxi);
    if (sedan) { sedan.x = 2150; sedan.y = 1280 - 27; sedan.angle = Math.PI; sedan.speed = 130; sedan.dir = 3; }
    g.clock = 0.42;
    g.cam.x = clamp(coupe.x - 640, 0, 4096 - 1280);
    g.cam.y = clamp(coupe.y - 400, 0, 2560 - 800);
    return;
  }
  if (name === 'chase') {
    // Four stars on the coast road, units converging, a tracer in the air.
    const coupe = findCar(g, c => c.type.kind === 'coupe' && c.driver === 'parked' && !c.isMarco) || g.marcoCar;
    putInCar(g, coupe, 2380, 2304 + 27, 0, 285);
    coupe.color = '#28418c';
    g.player.hasPistol = true; g.player.cash = 610;
    g.wanted.heat = 380; // four stars
    g.mission.idx = 4; g.storyDone = true; // free roam objective text
    const spots = [
      [2060, 2304 - 27, 0], [1960, 2304 + 27, 0], [2760, 2304 - 27, Math.PI], [1500, 1792 + 27, 1],
    ];
    let i = 0;
    for (const c of g.cars) {
      if (c.driver === 'police' && i < spots.length) {
        const [x, y, a] = spots[i++];
        c.x = x; c.y = y; c.angle = a; c.speed = 200;
      }
    }
    // If the sim has not spawned units yet, the step loop will; force two now.
    g.clock = 0.55;
    g.cam.x = clamp(coupe.x - 640, 0, 4096 - 1280);
    g.cam.y = clamp(coupe.y - 430, 0, 2560 - 800);
    return;
  }
  if (name === 'mission') {
    // Night Run at dusk: package aboard, timer running, two stars, club marked.
    const van = findCar(g, c => c.type.kind === 'van' && c.driver === 'traffic') || g.marcoCar;
    putInCar(g, van, 2950, 1792 - 27, Math.PI, 195);
    van.driver = 'player';
    g.player.cash = 735; g.player.hasPistol = true;
    g.mission.idx = 1; g.mission.stage = 1; g.mission.timer = 87;
    g.wanted.heat = 190; // two stars
    g.clock = 0.79; // dusk
    g.cam.x = clamp(van.x - 640, 0, 4096 - 1280);
    g.cam.y = clamp(van.y - 400, 0, 2560 - 800);
    return;
  }
  throw new Error('unknown shot: ' + name);
}
