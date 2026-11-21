import {
  CURRENT_SCHEMA_VERSION,
  SAVE_KEY,
  BACKUP_SNAPSHOT_KEY,
  INVENTORY_CAPACITY,
  CHEST_CAPACITY,
  WATERING_CAN_TIERS,
  MAX_WATERING_CAN_TIER,
  HOTBAR_SLOTS,
  GRID_COLS,
  GRID_ROWS,
  SOIL_CYCLE_SECONDS
} from '../data/constants.js';
import { CROPS } from '../data/crops.js';
import {
  makeEmptySlots,
  getDefaultHotbarAssignments,
  packLegacyCountsIntoSlots,
  sanitizeSlotArray,
  syncLegacyMapsFromInventory,
  tileKey,
  isReservedZone
} from './inventory.js';

const MIGRATIONS = {
  0: (raw) => {
    const next = { ...raw };
    if (typeof next.wateringCanTier !== 'number' || !Number.isFinite(next.wateringCanTier)) {
      next.wateringCanTier = next.upgrades && next.upgrades.wideWater ? 2 : 0;
    }
    next.schemaVersion = 1;
    return next;
  },
  1: (raw) => {
    const next = { ...raw };
    const hasSlots = Array.isArray(next.inventorySlots) && next.inventorySlots.length > 0;
    next.inventorySlots = hasSlots
      ? sanitizeSlotArray(next.inventorySlots, INVENTORY_CAPACITY)
      : packLegacyCountsIntoSlots(next);
    next.chestSlots = sanitizeSlotArray(next.chestSlots, CHEST_CAPACITY);
    next.hotbarAssignments = (next.hotbarAssignments && typeof next.hotbarAssignments === 'object')
      ? { ...getDefaultHotbarAssignments(), ...next.hotbarAssignments }
      : getDefaultHotbarAssignments();
    next.schemaVersion = 2;
    return next;
  }
};

export function defaultState() {
  const inv = makeEmptySlots(INVENTORY_CAPACITY);
  inv[0] = { kind: 'seed', id: 'turnip', count: 6 };
  inv[1] = { kind: 'seed', id: 'carrot', count: 3 };
  inv[2] = { kind: 'seed', id: 'corn', count: 2 };
  inv[3] = { kind: 'seed', id: 'tomato', count: 2 };
  inv[4] = { kind: 'seed', id: 'lettuce', count: 2 };
  inv[5] = { kind: 'placeable', id: 'fence', count: 4 };
  inv[6] = { kind: 'placeable', id: 'gate', count: 1 };

  const st = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt: new Date().toISOString(),
    day: 1,
    timeOfDay: 0.08,
    weather: 'sunny',
    coins: 120,
    hotCrop: 'turnip',
    selectedSlot: 0,
    wateringCanTier: 0,
    waterCharges: WATERING_CAN_TIERS[0].maxCharges,
    inventorySlots: inv,
    chestSlots: makeEmptySlots(CHEST_CAPACITY),
    hotbarAssignments: getDefaultHotbarAssignments(),
    seeds: {},
    harvested: {},
    items: { fence: 4, gate: 1 },
    upgrades: {
      swiftBoots: false,
      richSoil: false
    },
    tiles: {}
  };
  syncLegacyMapsFromInventory(st);
  return st;
}

export function runSequentialMigrations(rawInput) {
  let draft = rawInput && typeof rawInput === 'object' ? { ...rawInput } : {};
  let ver = typeof draft.schemaVersion === 'number' && Number.isFinite(draft.schemaVersion)
    ? Math.max(0, Math.floor(draft.schemaVersion))
    : 0;
  let migratedSteps = 0;

  while (ver < CURRENT_SCHEMA_VERSION && typeof MIGRATIONS[ver] === 'function') {
    draft = MIGRATIONS[ver](draft);
    ver += 1;
    migratedSteps += 1;
  }

  draft.schemaVersion = CURRENT_SCHEMA_VERSION;
  return { data: draft, migratedSteps };
}

export function normalizeAndMigrateState(raw) {
  const { data: migrated } = runSequentialMigrations(raw);
  const base = defaultState();

  const hasInventorySlots = Array.isArray(migrated.inventorySlots);
  const invSlots = hasInventorySlots
    ? sanitizeSlotArray(migrated.inventorySlots, INVENTORY_CAPACITY)
    : packLegacyCountsIntoSlots(migrated);

  if (!hasInventorySlots) {
    syncLegacyMapsFromInventory({ ...base, inventorySlots: invSlots });
  }

  const chestSlots = sanitizeSlotArray(migrated.chestSlots, CHEST_CAPACITY);
  const hotbarAssignments = {
    ...getDefaultHotbarAssignments(),
    ...(migrated.hotbarAssignments && typeof migrated.hotbarAssignments === 'object' ? migrated.hotbarAssignments : {})
  };

  const merged = {
    ...base,
    ...migrated,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    savedAt: typeof migrated.savedAt === 'string' ? migrated.savedAt : base.savedAt,
    day: typeof migrated.day === 'number' && Number.isFinite(migrated.day) && migrated.day >= 1
      ? Math.floor(migrated.day) : base.day,
    timeOfDay: typeof migrated.timeOfDay === 'number' && Number.isFinite(migrated.timeOfDay)
      ? ((migrated.timeOfDay % 1) + 1) % 1 : base.timeOfDay,
    weather: migrated.weather === 'rainy' ? 'rainy' : 'sunny',
    coins: typeof migrated.coins === 'number' && Number.isFinite(migrated.coins)
      ? Math.max(0, Math.floor(migrated.coins)) : base.coins,
    hotCrop: CROPS[migrated.hotCrop] ? migrated.hotCrop : base.hotCrop,
    selectedSlot: typeof migrated.selectedSlot === 'number' && Number.isFinite(migrated.selectedSlot)
      ? Math.max(0, Math.min(HOTBAR_SLOTS.length - 1, Math.floor(migrated.selectedSlot))) : 0,
    inventorySlots: invSlots,
    chestSlots,
    hotbarAssignments,
    upgrades: {
      swiftBoots: Boolean(migrated.upgrades && migrated.upgrades.swiftBoots),
      richSoil: Boolean(migrated.upgrades && migrated.upgrades.richSoil)
    },
    tiles: migrated.tiles && typeof migrated.tiles === 'object' ? migrated.tiles : {}
  };

  if (typeof migrated.wateringCanTier === 'number' && Number.isFinite(migrated.wateringCanTier)) {
    merged.wateringCanTier = Math.max(0, Math.min(MAX_WATERING_CAN_TIER, Math.floor(migrated.wateringCanTier)));
  } else if (migrated.upgrades && migrated.upgrades.wideWater) {
    merged.wateringCanTier = 2;
  } else {
    merged.wateringCanTier = 0;
  }

  const tierMax = WATERING_CAN_TIERS[merged.wateringCanTier].maxCharges;
  if (typeof migrated.waterCharges !== 'number' || !Number.isFinite(migrated.waterCharges)) {
    merged.waterCharges = tierMax;
  } else {
    merged.waterCharges = Math.max(0, Math.min(tierMax, Math.floor(migrated.waterCharges)));
  }

  syncLegacyMapsFromInventory(merged);
  return merged;
}

export function createBackupSnapshot(sourceState, reason = 'auto-backup') {
  if (!sourceState || typeof sourceState !== 'object') return null;
  const snapshot = {
    reason,
    createdAt: new Date().toISOString(),
    schemaVersion: sourceState.schemaVersion || 0,
    day: sourceState.day || 1,
    coins: sourceState.coins || 0,
    state: normalizeAndMigrateState(sourceState)
  };
  try {
    localStorage.setItem(BACKUP_SNAPSHOT_KEY, JSON.stringify(snapshot));
  } catch (e) { /* ignore storage quota errors */ }
  return snapshot;
}

export function readBackupSnapshot() {
  try {
    const raw = localStorage.getItem(BACKUP_SNAPSHOT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.state || typeof parsed.state !== 'object') return null;
    return {
      reason: parsed.reason || 'snapshot',
      createdAt: parsed.createdAt || '',
      schemaVersion: typeof parsed.schemaVersion === 'number' ? parsed.schemaVersion : 0,
      day: typeof parsed.day === 'number' ? parsed.day : 1,
      coins: typeof parsed.coins === 'number' ? parsed.coins : 0,
      state: normalizeAndMigrateState(parsed.state)
    };
  } catch (e) {
    return null;
  }
}

export function hasStoredSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return Boolean(parsed && typeof parsed === 'object' && parsed.tiles);
  } catch (e) {
    return false;
  }
}

export function getStoredSavePreview() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || !parsed.tiles) return null;
    const normalized = normalizeAndMigrateState(parsed);
    const plantedCount = Object.values(normalized.tiles).filter(t => t && t.crop).length;
    const basketCount = Object.values(normalized.harvested).reduce((a, b) => a + (b || 0), 0);
    const invUsed = normalized.inventorySlots.filter(Boolean).length;
    const chestUsed = normalized.chestSlots.filter(Boolean).length;
    const canTier = WATERING_CAN_TIERS[normalized.wateringCanTier] || WATERING_CAN_TIERS[0];
    return {
      exists: true,
      schemaVersion: normalized.schemaVersion,
      day: normalized.day,
      coins: normalized.coins,
      plantedCount,
      basketCount,
      invUsed,
      chestUsed,
      canName: canTier.name,
      savedAt: normalized.savedAt
    };
  } catch (e) {
    return null;
  }
}

export const gameStore = {
  state: defaultState(),
  hasActiveSave: false,
  gameStarted: false
};

export function setGameState(nextState) {
  gameStore.state = nextState;
}

export function getCurrentWateringCanTier() {
  const idx = Math.max(0, Math.min(MAX_WATERING_CAN_TIER, Number(gameStore.state.wateringCanTier) || 0));
  return WATERING_CAN_TIERS[idx];
}

export function getMaxWaterCharges() {
  return getCurrentWateringCanTier().maxCharges;
}

export function getSoilMoistureDuration() {
  return SOIL_CYCLE_SECONDS * getCurrentWateringCanTier().moistureMult;
}

export function clearCenterSpawnArea() {
  for (let r = 10; r <= 13; r++) {
    for (let c = 12; c <= 15; c++) {
      const k = tileKey(c, r);
      if (gameStore.state.tiles[k]) {
        gameStore.state.tiles[k].obstacle = null;
        gameStore.state.tiles[k].structure = null;
        if (gameStore.state.tiles[k].state === 'grass' && !gameStore.state.tiles[k].crop) {
          delete gameStore.state.tiles[k];
        }
      }
    }
  }
}

export function generateFreshWorldState() {
  const fresh = defaultState();
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const zone = isReservedZone(c, r);
      if (zone) continue;

      const distFromCenter = Math.hypot(c - 13.5, r - 11.5);
      if (distFromCenter < 3.4) continue;

      const hash = Math.abs(Math.sin(c * 127.1 + r * 311.7) * 43758.5453) % 1;
      let obstacle = null;
      if (hash < 0.10) {
        obstacle = 'rock';
      } else if (hash < 0.23) {
        obstacle = 'weed';
      }

      if (obstacle) {
        fresh.tiles[tileKey(c, r)] = {
          state: 'grass',
          watered: false,
          waterTimer: 0,
          emptyTimer: 0,
          crop: null,
          growth: 0,
          obstacle,
          structure: null
        };
      }
    }
  }
  gameStore.state = fresh;
  clearCenterSpawnArea();
}

export function saveGame() {
  syncLegacyMapsFromInventory(gameStore.state);
  gameStore.state.savedAt = new Date().toISOString();
  gameStore.state.schemaVersion = CURRENT_SCHEMA_VERSION;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(gameStore.state));
    gameStore.hasActiveSave = true;
  } catch (e) { /* ignore */ }
}

export function initWorldTiles(loadFromSave = true) {
  let loaded = null;
  if (loadFromSave) {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) loaded = JSON.parse(raw);
    } catch (e) { /* ignore */ }
  }

  if (loaded && typeof loaded === 'object' && loaded.tiles) {
    const oldVer = typeof loaded.schemaVersion === 'number' ? loaded.schemaVersion : 0;
    if (oldVer < CURRENT_SCHEMA_VERSION) {
      createBackupSnapshot(loaded, `pre-migration-v${oldVer}-to-v${CURRENT_SCHEMA_VERSION}`);
    }
    gameStore.state = normalizeAndMigrateState(loaded);
    clearCenterSpawnArea();
    gameStore.hasActiveSave = true;
    return;
  }

  generateFreshWorldState();
  gameStore.hasActiveSave = false;
}
