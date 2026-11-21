import {
  CURRENT_SCHEMA_VERSION,
  TIME_NOON,
  TIME_NIGHT,
  WATERING_CAN_TIERS,
  MAX_WATERING_CAN_TIER
} from '../data/constants.js';
import { CROPS, CROP_KEYS } from '../data/crops.js';
import { audio } from '../audio/cozyAudio.js';
import {
  gameStore,
  saveGame,
  getCurrentWateringCanTier,
  createBackupSnapshot,
  runSequentialMigrations,
  normalizeAndMigrateState,
  clearCenterSpawnArea
} from '../state/saveSystem.js';
import { addItemToSlots, consumeItemFromSlots, getTotalItemCountInSlots } from '../state/inventory.js';
import { showToast, formatClockString, renderHotbar, updateHUD } from './hud.js';

export function anyModalOpen() {
  return (
    document.getElementById('inventory-modal').classList.contains('open') ||
    document.getElementById('chest-modal').classList.contains('open') ||
    document.getElementById('shop-modal').classList.contains('open') ||
    document.getElementById('bed-modal').classList.contains('open') ||
    document.getElementById('desk-modal').classList.contains('open') ||
    document.getElementById('save-transfer-modal').classList.contains('open')
  );
}

export function isInputBlocked() {
  return !gameStore.gameStarted || document.getElementById('start-menu').classList.contains('open') || anyModalOpen();
}

export function computeCycleDelta(currentT, targetT) {
  const wrapped = ((targetT - currentT) % 1 + 1) % 1;
  return wrapped === 0 ? 1 : wrapped;
}

export function openBedModal() {
  const state = gameStore.state;
  const curT = state.timeOfDay;
  const dNoon = computeCycleDelta(curT, TIME_NOON);
  const dNight = computeCycleDelta(curT, TIME_NIGHT);

  document.getElementById('bed-current-status').textContent =
    `Day ${state.day} · ${formatClockString(curT)} (${curT < 0.5 ? 'Day' : 'Night'})`;

  const noonDayShift = Math.floor((curT + dNoon) - 1e-9);
  document.getElementById('bed-noon-sub').textContent =
    `${noonDayShift > 0 ? `Day ${state.day + noonDayShift}` : 'Today'} · +${Math.max(4, Math.round(dNoon * 32))} crop growth`;

  const nightDayShift = Math.floor((curT + dNight) - 1e-9);
  document.getElementById('bed-night-sub').textContent =
    `${nightDayShift > 0 ? `Day ${state.day + nightDayShift}` : 'Tonight'} · +${Math.max(6, Math.round(dNight * 32))} crop growth`;

  document.getElementById('bed-morning-sub').textContent =
    `Day ${state.day + 1} · New weather · +22 crop growth`;

  document.getElementById('bed-modal').classList.add('open');
}

export function openDeskModal() {
  const state = gameStore.state;
  const plantedCount = Object.values(state.tiles).filter(t => t && t.crop).length;
  const basketCount = CROP_KEYS.reduce((sum, id) => sum + getTotalItemCountInSlots(state.inventorySlots, 'crop', id), 0);
  const chestUsed = state.chestSlots.filter(Boolean).length;
  const invUsed = state.inventorySlots.filter(Boolean).length;
  const canTier = getCurrentWateringCanTier();
  const upgCount =
    (canTier.tier > 0 ? 1 : 0) +
    (state.upgrades.swiftBoots ? 1 : 0) +
    (state.upgrades.richSoil ? 1 : 0);
  document.getElementById('farm-ledger-stats').innerHTML = `
    <div><b>📅 Current Day:</b> Day ${state.day}</div>
    <div><b>🪙 Treasury:</b> ${state.coins}g</div>
    <div><b>🌱 Active Crops:</b> ${plantedCount} (${CROP_KEYS.length} species)</div>
    <div><b>🧺 Harvest In Pack:</b> ${basketCount}</div>
    <div><b>🎒 Pack / 🧰 Chest:</b> ${invUsed}/24 · ${chestUsed}/24</div>
    <div><b>✨ Upgrades:</b> ${upgCount}/3 · Schema v${state.schemaVersion}</div>
  `;
  document.getElementById('desk-modal').classList.add('open');
}

export function getUnitSellPrice(cropId) {
  const mult = gameStore.state.hotCrop === cropId ? 1.5 : 1.0;
  return Math.round(CROPS[cropId].sellPrice * mult);
}

export function sellSingleCropType(cropId, playerLocation = 'shop_interior') {
  const state = gameStore.state;
  const qty = getTotalItemCountInSlots(state.inventorySlots, 'crop', cropId);
  if (qty <= 0) {
    audio.play('error');
    showToast(`You don't have any ${CROPS[cropId].name} in your Inventory to sell!`);
    return;
  }
  consumeItemFromSlots(state.inventorySlots, 'crop', cropId, qty);
  const unitPrice = getUnitSellPrice(cropId);
  const earned = qty * unitPrice;
  state.coins += earned;
  audio.play('coin');
  showToast(`Pip paid +${earned}g for ${qty}× ${CROPS[cropId].name}!`);
  updateHUD(playerLocation);
  renderHotbar();
  renderShop(playerLocation);
  saveGame();
}

export function sellAllCrops(playerLocation = 'exterior') {
  const state = gameStore.state;
  let total = 0;
  let soldCount = 0;
  for (const id of CROP_KEYS) {
    const qty = getTotalItemCountInSlots(state.inventorySlots, 'crop', id);
    if (qty > 0) {
      consumeItemFromSlots(state.inventorySlots, 'crop', id, qty);
      total += qty * getUnitSellPrice(id);
      soldCount += qty;
    }
  }
  if (soldCount > 0) {
    state.coins += total;
    audio.play('coin');
    showToast(`Sold ${soldCount} crops for +${total}g!`);
    updateHUD(playerLocation);
    renderHotbar();
    if (document.getElementById('shop-modal').classList.contains('open')) renderShop(playerLocation);
    saveGame();
  } else {
    audio.play('error');
    showToast('No harvested crops in your Inventory to sell!');
  }
}

function tryGrantItemToInventory(kind, id, qty) {
  const state = gameStore.state;
  const existing = getTotalItemCountInSlots(state.inventorySlots, kind, id);
  const hasEmpty = state.inventorySlots.some(s => !s);
  if (existing <= 0 && !hasEmpty) {
    audio.play('error');
    showToast('🎒 Your 24-slot Inventory is full! Free a slot or store items in the Farmhouse Chest.');
    return false;
  }
  return addItemToSlots(state.inventorySlots, kind, id, qty) > 0;
}

export function renderShop(playerLocation = 'shop_interior') {
  const state = gameStore.state;
  document.getElementById('shop-coins').textContent = state.coins;
  const hotCfg = CROPS[state.hotCrop];
  document.getElementById('hot-crop-label').textContent = `${hotCfg.harvestIcon} ${hotCfg.name}`;

  const body = document.getElementById('shop-body');
  body.innerHTML = '';

  const sellHeader = document.createElement('div');
  sellHeader.className = 'shop-section-title';
  sellHeader.textContent = '🧺 Sell Harvested Crops from Inventory to Pip';
  body.appendChild(sellHeader);

  CROP_KEYS.forEach(id => {
    const c = CROPS[id];
    const qty = getTotalItemCountInSlots(state.inventorySlots, 'crop', id);
    const unitPrice = getUnitSellPrice(id);
    const totalValue = qty * unitPrice;
    const isHot = state.hotCrop === id;

    const item = document.createElement('div');
    item.className = 'shop-item';
    item.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${c.harvestIcon} ${c.name} (Pack: ${qty})${isHot ? '<span class="hot-tag">1.5× HOT</span>' : ''}</div>
        <div class="shop-item-desc">${unitPrice}g each${qty > 0 ? ` · Batch: +${totalValue}g` : ''}</div>
      </div>
      <button class="cozy-btn primary" ${qty <= 0 ? 'disabled' : ''} data-sell-crop="${id}">
        ${qty > 0 ? `Sell (${totalValue}g)` : 'None'}
      </button>
    `;
    body.appendChild(item);
  });

  const seedHeader = document.createElement('div');
  seedHeader.className = 'shop-section-title';
  seedHeader.textContent = '🌱 Buy Seeds from Pip (All 20 Crops)';
  body.appendChild(seedHeader);

  CROP_KEYS.forEach(id => {
    const c = CROPS[id];
    const owned = getTotalItemCountInSlots(state.inventorySlots, 'seed', id);
    const item = document.createElement('div');
    item.className = 'shop-item';
    item.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${c.icon} ${c.name} Seeds (Pack: ${owned})</div>
        <div class="shop-item-desc">Sell: ${c.sellPrice}g · ${c.growTime}s${c.regrows ? ' · Regrows!' : ''}</div>
      </div>
      <button class="cozy-btn primary" data-buy-seed="${id}">Buy ${c.seedCost}g</button>
    `;
    body.appendChild(item);
  });

  const buildHeader = document.createElement('div');
  buildHeader.className = 'shop-section-title';
  buildHeader.textContent = '🪵 Fences & Farm Structures';
  body.appendChild(buildHeader);

  const craftables = [
    { id: 'fence', icon: '🪵', name: 'Wooden Fence (x1)', cost: 15, desc: `Auto-connects rails · Pack: ${getTotalItemCountInSlots(state.inventorySlots, 'placeable', 'fence')}` },
    { id: 'fence5', icon: '🪵', name: 'Wooden Fence Bundle (x5)', cost: 65, desc: `Save 10g on 5 fences · Pack: ${getTotalItemCountInSlots(state.inventorySlots, 'placeable', 'fence')}` },
    { id: 'gate', icon: '🚪', name: 'Swinging Fence Gate', cost: 25, desc: `Walk-through gate · Pack: ${getTotalItemCountInSlots(state.inventorySlots, 'placeable', 'gate')}` }
  ];

  craftables.forEach(cf => {
    const item = document.createElement('div');
    item.className = 'shop-item';
    item.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${cf.icon} ${cf.name}</div>
        <div class="shop-item-desc">${cf.desc}</div>
      </div>
      <button class="cozy-btn primary" data-buy-craft="${cf.id}">Craft ${cf.cost}g</button>
    `;
    body.appendChild(item);
  });

  const upgHeader = document.createElement('div');
  upgHeader.className = 'shop-section-title';
  upgHeader.textContent = '✨ Tool & Farm Upgrades';
  body.appendChild(upgHeader);

  const curCan = getCurrentWateringCanTier();
  const nextCan = curCan.tier < MAX_WATERING_CAN_TIER
    ? WATERING_CAN_TIERS[curCan.tier + 1]
    : null;

  const canItem = document.createElement('div');
  canItem.className = 'shop-item';
  if (nextCan) {
    canItem.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${nextCan.icon} Upgrade to ${nextCan.name}</div>
        <div class="shop-item-desc">Current: ${curCan.name} (Tier ${curCan.tier}/${MAX_WATERING_CAN_TIER}, ${curCan.maxCharges} charges) · Next: ${nextCan.summary}</div>
      </div>
      <button class="cozy-btn primary" data-buy-can-tier="${nextCan.tier}">${nextCan.cost}g</button>
    `;
  } else {
    canItem.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${curCan.icon} ${curCan.name} (Tier ${curCan.tier}/${MAX_WATERING_CAN_TIER})</div>
        <div class="shop-item-desc">${curCan.summary}</div>
      </div>
      <button class="cozy-btn" disabled>✓ Max Tier</button>
    `;
  }
  body.appendChild(canItem);

  const upgrades = [
    { key: 'swiftBoots', icon: '👢', name: 'Meadow Runner Boots', cost: 110, desc: '+30% faster walking speed' },
    { key: 'richSoil', icon: '🧪', name: 'Organic Compost Boost', cost: 160, desc: 'Crops grow 30% faster' }
  ];

  upgrades.forEach(u => {
    const owned = state.upgrades[u.key];
    const item = document.createElement('div');
    item.className = 'shop-item';
    item.innerHTML = `
      <div class="shop-item-info">
        <div class="shop-item-name">${u.icon} ${u.name}</div>
        <div class="shop-item-desc">${u.desc}</div>
      </div>
      <button class="cozy-btn ${owned ? '' : 'primary'}" ${owned ? 'disabled' : ''} data-buy-upg="${u.key}">
        ${owned ? '✓ Owned' : `${u.cost}g`}
      </button>
    `;
    body.appendChild(item);
  });

  body.querySelectorAll('[data-sell-crop]').forEach(btn => {
    btn.onclick = () => sellSingleCropType(btn.getAttribute('data-sell-crop'), playerLocation);
  });

  body.querySelectorAll('[data-buy-seed]').forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute('data-buy-seed');
      const cost = CROPS[id].seedCost;
      if (state.coins < cost) {
        audio.play('error');
        showToast('Not enough coins!');
        return;
      }
      if (!tryGrantItemToInventory('seed', id, 1)) return;
      state.coins -= cost;
      audio.play('coin');
      updateHUD(playerLocation);
      renderHotbar();
      renderShop(playerLocation);
      saveGame();
    };
  });

  body.querySelectorAll('[data-buy-craft]').forEach(btn => {
    btn.onclick = () => {
      const cid = btn.getAttribute('data-buy-craft');
      if (cid === 'fence') {
        if (state.coins < 15) { audio.play('error'); showToast('Not enough coins!'); return; }
        if (!tryGrantItemToInventory('placeable', 'fence', 1)) return;
        state.coins -= 15;
      } else if (cid === 'fence5') {
        if (state.coins < 65) { audio.play('error'); showToast('Not enough coins!'); return; }
        if (!tryGrantItemToInventory('placeable', 'fence', 5)) return;
        state.coins -= 65;
      } else if (cid === 'gate') {
        if (state.coins < 25) { audio.play('error'); showToast('Not enough coins!'); return; }
        if (!tryGrantItemToInventory('placeable', 'gate', 1)) return;
        state.coins -= 25;
      }
      audio.play('build');
      updateHUD(playerLocation);
      renderHotbar();
      renderShop(playerLocation);
      saveGame();
    };
  });

  const canBuyBtn = body.querySelector('[data-buy-can-tier]');
  if (canBuyBtn) {
    canBuyBtn.onclick = () => {
      const currentTier = getCurrentWateringCanTier();
      if (currentTier.tier >= MAX_WATERING_CAN_TIER) return;
      const targetTier = WATERING_CAN_TIERS[currentTier.tier + 1];
      if (state.coins >= targetTier.cost) {
        state.coins -= targetTier.cost;
        state.wateringCanTier = targetTier.tier;
        state.waterCharges = targetTier.maxCharges;
        audio.play('harvest');
        showToast(`💧 Upgraded to ${targetTier.name} (${targetTier.maxCharges} charges)!`);
        updateHUD(playerLocation);
        renderHotbar();
        renderShop(playerLocation);
        saveGame();
      } else {
        audio.play('error');
        showToast('Not enough coins for this watering can upgrade!');
      }
    };
  }

  body.querySelectorAll('[data-buy-upg]').forEach(btn => {
    btn.onclick = () => {
      const key = btn.getAttribute('data-buy-upg');
      const costs = { swiftBoots: 110, richSoil: 160 };
      const cost = costs[key];
      if (!state.upgrades[key] && state.coins >= cost) {
        state.coins -= cost;
        state.upgrades[key] = true;
        audio.play('harvest');
        showToast('Upgrade unlocked!');
        updateHUD(playerLocation);
        renderHotbar();
        renderShop(playerLocation);
        saveGame();
      } else {
        audio.play('error');
        showToast('Not enough coins!');
      }
    };
  });
}

export function openShop(playerLocation = 'shop_interior') {
  renderShop(playerLocation);
  document.getElementById('shop-modal').classList.add('open');
}

export function buildExportEnvelope() {
  saveGame();
  return JSON.stringify(
    {
      game: 'meadowbend_farm',
      schemaVersion: CURRENT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      state: gameStore.state
    },
    null,
    2
  );
}

export function openSaveTransferModal(mode) {
  const titleEl = document.getElementById('save-transfer-title');
  const descEl = document.getElementById('save-transfer-desc');
  const fileRow = document.getElementById('import-file-row');
  const textarea = document.getElementById('save-json-textarea');
  const feedback = document.getElementById('save-transfer-feedback');
  const copyBtn = document.getElementById('btn-copy-save-json');
  const dlBtn = document.getElementById('btn-download-save-json');
  const applyBtn = document.getElementById('btn-apply-import-json');
  const fileInput = document.getElementById('save-file-input');

  feedback.textContent = '';
  feedback.style.color = '#4a3219';
  if (fileInput) fileInput.value = '';

  if (mode === 'export') {
    titleEl.textContent = '📤 Export Farm Save';
    descEl.textContent = 'Download a .json backup file or copy the JSON text below to keep your 20-crop farm, inventory, and chest safe.';
    fileRow.style.display = 'none';
    copyBtn.style.display = 'inline-block';
    dlBtn.style.display = 'inline-block';
    applyBtn.style.display = 'none';
    textarea.readOnly = true;
    textarea.value = buildExportEnvelope();
  } else {
    titleEl.textContent = '📥 Import Farm Save';
    descEl.textContent = 'Select a .json save file or paste exported/legacy save JSON below. Older schemas are migrated automatically and a backup is saved first.';
    fileRow.style.display = 'flex';
    copyBtn.style.display = 'none';
    dlBtn.style.display = 'none';
    applyBtn.style.display = 'inline-block';
    textarea.readOnly = false;
    textarea.value = '';
  }

  document.getElementById('save-transfer-modal').classList.add('open');
}

export function parseAndApplyImportedSave(rawText, onApplied) {
  const feedback = document.getElementById('save-transfer-feedback');
  const trimmed = (rawText || '').trim();
  if (!trimmed) {
    feedback.style.color = '#b91c1c';
    feedback.textContent = 'Please paste save JSON or choose a .json file first.';
    audio.play('error');
    return false;
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    feedback.style.color = '#b91c1c';
    feedback.textContent = 'Invalid JSON syntax — please check your pasted text or file.';
    audio.play('error');
    return false;
  }

  if (!parsed || typeof parsed !== 'object') {
    feedback.style.color = '#b91c1c';
    feedback.textContent = 'Save data must be a JSON object.';
    audio.play('error');
    return false;
  }

  if (parsed.game && parsed.game !== 'meadowbend_farm') {
    feedback.style.color = '#b91c1c';
    feedback.textContent = `This save belongs to "${parsed.game}", not Meadowbend Farm.`;
    audio.play('error');
    return false;
  }

  const candidateState = parsed.state && typeof parsed.state === 'object' ? parsed.state : parsed;
  const incomingVersion = typeof parsed.schemaVersion === 'number'
    ? parsed.schemaVersion
    : (typeof candidateState.schemaVersion === 'number' ? candidateState.schemaVersion : 0);

  if (!candidateState || typeof candidateState !== 'object' || (!candidateState.tiles && typeof candidateState.coins !== 'number' && typeof candidateState.day !== 'number')) {
    feedback.style.color = '#b91c1c';
    feedback.textContent = 'Unrecognized Meadowbend Farm save structure.';
    audio.play('error');
    return false;
  }

  createBackupSnapshot(gameStore.state, 'pre-import');

  const preparedForMigration = {
    ...candidateState,
    schemaVersion: typeof candidateState.schemaVersion === 'number' ? candidateState.schemaVersion : incomingVersion
  };
  const { migratedSteps } = runSequentialMigrations(preparedForMigration);
  gameStore.state = normalizeAndMigrateState(preparedForMigration);
  clearCenterSpawnArea();
  saveGame();

  if (typeof onApplied === 'function') onApplied();

  audio.play('harvest');
  const migNote = migratedSteps > 0 ? ` (migrated ${migratedSteps} schema step${migratedSteps > 1 ? 's' : ''})` : '';
  showToast(`📥 Imported Day ${gameStore.state.day} farm (${gameStore.state.coins}g)${migNote}!`);
  document.getElementById('save-transfer-modal').classList.remove('open');
  return true;
}
