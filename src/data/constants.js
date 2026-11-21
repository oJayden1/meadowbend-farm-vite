export const TILE_SIZE = 1.6;
export const GRID_COLS = 28;
export const GRID_ROWS = 24;
export const HALF_W = (GRID_COLS * TILE_SIZE) / 2;
export const HALF_H = (GRID_ROWS * TILE_SIZE) / 2;

export const SPAWN_POS = { x: 0, z: 0 };

export const INVENTORY_CAPACITY = 24;
export const CHEST_CAPACITY = 24;

// 5-minute day (300s) + 5-minute night (300s) = 600s full cycle
export const FULL_CYCLE_SECONDS = 600;
export const TIME_MORNING = 0.0;
export const TIME_NOON = 0.25;
export const TIME_NIGHT = 0.5;

// 5-minute soil moisture & empty-plot reversion duration (300 seconds)
export const SOIL_CYCLE_SECONDS = 300;

export const CURRENT_SCHEMA_VERSION = 2;
export const SAVE_KEY = 'meadowbend_farm_interiors_v1';
export const BACKUP_SNAPSHOT_KEY = `${SAVE_KEY}_backup_snapshot`;

// Balanced 4-tier Watering Can progression (Tiers 0 through 3)
export const WATERING_CAN_TIERS = [
  {
    tier: 0,
    name: 'Tin Can',
    icon: '🥫',
    maxCharges: 12,
    cost: 0,
    moistureMult: 1.0,
    forwardPair: false,
    summary: '12 charges · Single tile (1 tile)'
  },
  {
    tier: 1,
    name: 'Reinforced Tin Can',
    icon: '🪣',
    maxCharges: 16,
    cost: 45,
    moistureMult: 1.0,
    forwardPair: false,
    summary: '16 charges · Single tile (1 tile)'
  },
  {
    tier: 2,
    name: 'Copper Watering Can',
    icon: '🏺',
    maxCharges: 21,
    cost: 95,
    moistureMult: 1.15,
    forwardPair: false,
    summary: '21 charges · 1 tile · +15% moisture time'
  },
  {
    tier: 3,
    name: 'Brass Sprinkler Can',
    icon: '🚿',
    maxCharges: 26,
    cost: 165,
    moistureMult: 1.15,
    forwardPair: true,
    summary: '26 charges · 2-tile forward pair · +15% moisture'
  }
];
export const MAX_WATERING_CAN_TIER = WATERING_CAN_TIERS.length - 1;

// Interior room dimensions & centers (placed cleanly in a dedicated indoor arena at Y = -40)
export const ROOM_Y = -40;
export const SHOP_ROOM = {
  id: 'shop_interior',
  name: "Pip's Valley Shop (Inside)",
  cx: 0,
  cz: 0,
  halfW: 6.2,
  halfD: 5.2,
  spawnX: 0,
  spawnZ: 3.7,
  exitX: 0,
  exitZ: 4.55,
  exitRadius: 1.55,
  npcX: 0,
  npcZ: -1.85,
  npcInteractRadius: 2.35
};

export const HOUSE_ROOM = {
  id: 'house_interior',
  name: 'Cozy Farmhouse (Inside)',
  cx: 40,
  cz: 0,
  halfW: 6.4,
  halfD: 5.4,
  spawnX: 40,
  spawnZ: 3.85,
  exitX: 40,
  exitZ: 4.75,
  exitRadius: 1.55,
  bedX: 40 - 3.3,
  bedZ: 0 - 1.6,
  bedInteractRadius: 2.35,
  deskX: 40 + 3.3,
  deskZ: 0 - 1.5,
  deskInteractRadius: 2.35,
  chestX: 40 + 3.3,
  chestZ: 0 - 0.05,
  chestInteractRadius: 2.35
};

export const HOTBAR_SLOTS = [
  { key: '1', fixedType: 'tool', fixedId: 'hoe', defaultLabel: 'Hoe', defaultIcon: '🪓' },
  { key: '2', fixedType: 'tool', fixedId: 'water', defaultLabel: 'Water', defaultIcon: '💧' },
  { key: '3', fixedType: 'tool', fixedId: 'harvest', defaultLabel: 'Harvest', defaultIcon: '🧺' },
  { key: '4', fixedType: 'tool', fixedId: 'clear', defaultLabel: 'Clear/Pick', defaultIcon: '⛏️' },
  { key: '5', assignable: true, defaultItem: { kind: 'seed', id: 'turnip' } },
  { key: '6', assignable: true, defaultItem: { kind: 'seed', id: 'carrot' } },
  { key: '7', assignable: true, defaultItem: { kind: 'seed', id: 'corn' } },
  { key: '8', assignable: true, defaultItem: { kind: 'seed', id: 'tomato' } },
  { key: '9', assignable: true, defaultItem: { kind: 'seed', id: 'starfruit' } },
  { key: '0', assignable: true, defaultItem: { kind: 'placeable', id: 'fence' } },
  { key: '-', assignable: true, defaultItem: { kind: 'placeable', id: 'gate' } }
];
