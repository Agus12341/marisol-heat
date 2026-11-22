// Marisol Heat - shared tuning constants.
// Everything the sim and the renderer agree on lives here so the world
// generator, the game step and the drawing code never drift apart.

export const WORLD_W = 4096;
export const WORLD_H = 2560;

// Avenues run on a regular grid; blocks between them hold the buildings.
export const GRID = 512;          // distance between avenue centrelines
export const ROAD_W = 108;        // full asphalt width of an avenue
export const SIDEWALK = 14;       // pavement ring around each block

export const STEP = 1 / 30;       // fixed simulation step (seconds)
export const VIEW_W = 1280;       // logical viewport the game renders to
export const VIEW_H = 800;

// Day length in game seconds: a full clock cycle is 8 real minutes.
export const DAY_SECONDS = 480;
export const START_CLOCK = 0.34;  // fraction of the day at New Game (~08:10)

export const WANTED_DECAY = 26;   // seconds unseen before one star cools off
export const BUST_TIME = 2.4;     // seconds boxed in at low speed -> busted
export const RESPRAY_COST = 100;
export const PISTOL_COST = 250;

export const COLORS = {
  grass: '#4d7c43',
  grassDark: '#456f3c',
  park: '#5d904e',
  sand: '#d9bd7f',
  water: '#2e6f9e',
  waterDeep: '#256489',
  road: '#3a3a40',
  roadEdge: '#2e2e33',
  lane: '#c8b45a',
  sidewalk: '#9a968c',
  plaza: '#b0a894',
  lot: '#55534e',
};

// Car archetypes: name, size, top speed (px/s), acceleration, grip, value.
export const CAR_TYPES = [
  { kind: 'sedan',  w: 46, h: 22, top: 305, accel: 210, grip: 5.2, colors: ['#7a8894', '#94524a', '#4a6b8a', '#c0c4c8', '#5d7355', '#8a7a4a'] },
  { kind: 'taxi',   w: 46, h: 22, top: 300, accel: 215, grip: 5.2, colors: ['#e0a91c'] },
  { kind: 'coupe',  w: 48, h: 21, top: 385, accel: 285, grip: 6.0, colors: ['#b03030', '#28418c', '#d8d8dc', '#202226'] },
  { kind: 'van',    w: 54, h: 25, top: 262, accel: 175, grip: 4.6, colors: ['#c8c8c8', '#6b7c8c', '#7a6a55'] },
  { kind: 'pickup', w: 52, h: 24, top: 285, accel: 200, grip: 4.8, colors: ['#5d6e7a', '#7a4a35', '#486048'] },
];
export const POLICE_TYPE = { kind: 'police', w: 47, h: 22, top: 342, accel: 265, grip: 5.8, colors: ['#e8e8ec'] };

export const PLACE_KINDS = {
  pd:      { label: 'Marisol PD HQ',      color: '#3a4a6b' },
  hospital:{ label: 'St. Solana Hospital',color: '#d8d8d8' },
  respray: { label: 'Bayside Respray',    color: '#7a4a8c' },
  gun:     { label: 'Iron & Oak Guns',    color: '#5d4a35' },
  shop:    { label: 'QuickMart 24/7',     color: '#3f7a4a' },
  club:    { label: 'Club Marisol',       color: '#8c2f5e' },
  warehouse:{ label: 'Pier 9 Warehouse',  color: '#6b6f75' },
  motors:  { label: 'Venn Motors',        color: '#8a6d2f' },
  hideout: { label: 'Calle Ocho Hideout', color: '#74553a' },
  hotel:   { label: 'Casa Del Mar',       color: '#c8b088' },
};
