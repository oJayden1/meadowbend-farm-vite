import {
  INVENTORY_CAPACITY,
  HOTBAR_SLOTS,
  GRID_COLS,
  GRID_ROWS,
  TILE_SIZE
} from '../data/constants.js';
import { CROP_KEYS, getItemMeta } from '../data/crops.js';

export function makeEmptySlots(capacity) {
  const arr = [];
  for (let i = 0; i < capacity; i++) arr.push(null);
  return arr;
}

export function getDefaultHotbarAssignments() {
  const map = {};
  HOTBAR_SLOTS.forEach((slot, idx) => {
    if (slot.assignable && slot.defaultItem) {
      map[idx] = { ...slot.defaultItem };
    }
  });
  return map;
}

export function packLegacyCountsIntoSlots(rawObj) {
  const slots = makeEmptySlots(INVENTORY_CAPACITY);
  let cursor = 0;

  const pushStack = (kind, id, qty) => {
    const cleanQty = Math.floor(Number(qty) || 0);
    if (cleanQty <= 0) return;
    if (!getItemMeta(kind, id)) return;
    if (cursor < INVENTORY_CAPACITY) {
      slots[cursor++] = { kind, id, count: cleanQty };
    } else {
      const existing = slots.find(s => s && s.kind === kind && s.id === id);
      if (existing) existing.count += cleanQty;
    }
  };

  const rawSeeds = rawObj.seeds && typeof rawObj.seeds === 'object' ? rawObj.seeds : {};
  Object.keys(rawSeeds).forEach(cropId => pushStack('seed', cropId, rawSeeds[cropId]));

  const rawHarvested = rawObj.harvested && typeof rawObj.harvested === 'object' ? rawObj.harvested : {};
  Object.keys(rawHarvested).forEach(cropId => pushStack('crop', cropId, rawHarvested[cropId]));

  const rawItems = rawObj.items && typeof rawObj.items === 'object' ? rawObj.items : {};
  pushStack('placeable', 'fence', rawItems.fence);
  pushStack('placeable', 'gate', rawItems.gate);

  return slots;
}

export function sanitizeSlotArray(arr, capacity) {
  const out = makeEmptySlots(capacity);
  if (!Array.isArray(arr)) return out;
  for (let i = 0; i < capacity; i++) {
    const item = arr[i];
    if (!item || typeof item !== 'object') continue;
    const count = Math.floor(Number(item.count) || 0);
    if (count <= 0) continue;
    if (!getItemMeta(item.kind, item.id)) continue;
    out[i] = { kind: item.kind, id: item.id, count };
  }
  return out;
}

export function syncLegacyMapsFromInventory(st) {
  const nextSeeds = {};
  const nextHarvested = {};
  CROP_KEYS.forEach(k => {
    nextSeeds[k] = 0;
    nextHarvested[k] = 0;
  });
  let fences = 0;
  let gates = 0;

  st.inventorySlots.forEach(slot => {
    if (!slot || slot.count <= 0) return;
    if (slot.kind === 'seed' && CROP_KEYS.includes(slot.id)) {
      nextSeeds[slot.id] = (nextSeeds[slot.id] || 0) + slot.count;
    } else if (slot.kind === 'crop' && CROP_KEYS.includes(slot.id)) {
      nextHarvested[slot.id] = (nextHarvested[slot.id] || 0) + slot.count;
    } else if (slot.kind === 'placeable' && slot.id === 'fence') {
      fences += slot.count;
    } else if (slot.kind === 'placeable' && slot.id === 'gate') {
      gates += slot.count;
    }
  });

  st.seeds = nextSeeds;
  st.harvested = nextHarvested;
  st.items = { fence: fences, gate: gates };
}

export function getTotalItemCountInSlots(slots, kind, id) {
  let total = 0;
  for (const s of slots) {
    if (s && s.kind === kind && s.id === id) {
      total += s.count;
    }
  }
  return total;
}

export function addItemToSlots(slots, kind, id, qty) {
  const remaining = Math.floor(Number(qty) || 0);
  if (remaining <= 0 || !getItemMeta(kind, id)) return 0;

  for (let i = 0; i < slots.length; i++) {
    const s = slots[i];
    if (s && s.kind === kind && s.id === id) {
      s.count += remaining;
      return remaining;
    }
  }

  for (let i = 0; i < slots.length; i++) {
    if (!slots[i]) {
      slots[i] = { kind, id, count: remaining };
      return remaining;
    }
  }

  return 0;
}

export function consumeItemFromSlots(slots, kind, id, qty) {
  let needed = Math.floor(Number(qty) || 0);
  if (needed <= 0) return true;
  const available = getTotalItemCountInSlots(slots, kind, id);
  if (available < needed) return false;

  for (let i = 0; i < slots.length && needed > 0; i++) {
    const s = slots[i];
    if (s && s.kind === kind && s.id === id) {
      const take = Math.min(s.count, needed);
      s.count -= take;
      needed -= take;
      if (s.count <= 0) slots[i] = null;
    }
  }
  return true;
}

export function transferBetweenSlotArrays(fromSlots, fromIdx, toSlots, qty = null) {
  const src = fromSlots[fromIdx];
  if (!src || src.count <= 0) return { moved: 0, error: 'Slot is empty.' };

  const moveQty = qty === null ? src.count : Math.min(src.count, Math.max(1, Math.floor(qty)));

  let targetSlot = toSlots.find(s => s && s.kind === src.kind && s.id === src.id);
  if (!targetSlot) {
    const emptyIdx = toSlots.findIndex(s => !s);
    if (emptyIdx === -1) {
      return { moved: 0, error: 'Destination storage is full (24/24 slots).' };
    }
    toSlots[emptyIdx] = { kind: src.kind, id: src.id, count: 0 };
    targetSlot = toSlots[emptyIdx];
  }

  targetSlot.count += moveQty;
  src.count -= moveQty;
  const movedKind = src.kind;
  const movedId = src.id;
  if (src.count <= 0) fromSlots[fromIdx] = null;

  return { moved: moveQty, kind: movedKind, id: movedId, error: null };
}

export function tileKey(c, r) {
  return `${c},${r}`;
}

export function gridToWorld(c, r) {
  return {
    x: (c - GRID_COLS / 2 + 0.5) * TILE_SIZE,
    z: (r - GRID_ROWS / 2 + 0.5) * TILE_SIZE
  };
}

export function worldToGrid(x, z) {
  const c = Math.floor(x / TILE_SIZE + GRID_COLS / 2);
  const r = Math.floor(z / TILE_SIZE + GRID_ROWS / 2);
  return { c, r };
}

export function inBounds(c, r) {
  return c >= 0 && c < GRID_COLS && r >= 0 && r < GRID_ROWS;
}

export function isReservedZone(c, r) {
  if (c >= 2 && c <= 6 && r >= 1 && r <= 4) return 'cabin';
  if (c >= 21 && c <= 24 && r >= 1 && r <= 4) return 'shop';
  if (c >= 18 && c <= 19 && r >= 3 && r <= 4) return 'bin';
  if (c >= 2 && c <= 25 && r >= 5 && r <= 6) return 'path';
  if (c >= 12 && c <= 15 && r >= 10 && r <= 13) return 'spawn';
  if (c >= 20 && r >= 17 && (c - 20) + (r - 17) >= 4) return 'water';
  return null;
}
