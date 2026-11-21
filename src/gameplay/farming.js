import {
  GRID_COLS,
  GRID_ROWS,
  SOIL_CYCLE_SECONDS,
  TIME_MORNING,
  TIME_NOON,
  TIME_NIGHT
} from '../data/constants.js';
import { CROPS, CROP_KEYS } from '../data/crops.js';
import { audio } from '../audio/cozyAudio.js';
import {
  gameStore,
  saveGame,
  getCurrentWateringCanTier,
  getSoilMoistureDuration,
  clearCenterSpawnArea
} from '../state/saveSystem.js';
import {
  tileKey,
  gridToWorld,
  inBounds,
  isReservedZone,
  addItemToSlots,
  consumeItemFromSlots,
  getTotalItemCountInSlots
} from '../state/inventory.js';
import { showToast, renderHotbar, updateHUD, resolveHotbarSlot } from '../ui/hud.js';
import { isInputBlocked, computeCycleDelta } from '../ui/modals.js';

export function createFarmingController({
  playerCtrl,
  tileCtrl,
  envRefs,
  refreshGrassInstances,
  triggerInteract
}) {
  const { player, spawnBurst, getTargetTile, getForwardStepTile, getInteriorInteraction } = playerCtrl;
  const { rebuildTileVisual, rebuildTileAndNeighbors, rebuildAllTiles } = tileCtrl;
  const { brookCenterX, brookCenterZ, brookRadius } = envRefs;

  function isNearBrook() {
    if (player.location !== 'exterior') return false;
    const distToBrookCenter = Math.hypot(player.x - brookCenterX, player.z - brookCenterZ);
    if (distToBrookCenter <= brookRadius + 2.1) return true;
    const tgt = getTargetTile();
    if (inBounds(tgt.c, tgt.r) && isReservedZone(tgt.c, tgt.r) === 'water') return true;
    return false;
  }

  function refillWateringCan() {
    const state = gameStore.state;
    const tierCfg = getCurrentWateringCanTier();
    const maxW = tierCfg.maxCharges;
    if (state.waterCharges >= maxW) {
      showToast(`💧 ${tierCfg.name} is already full (${maxW}/${maxW})!`);
      return;
    }
    state.waterCharges = maxW;
    player.swingTimer = 0.22;
    audio.play('refill');
    spawnBurst(player.x, 0.5, player.z, 0x5ec8f2, 14);
    showToast(`💧 Refilled ${tierCfg.name} at the brook! (${maxW}/${maxW})`);
    renderHotbar();
    saveGame();
  }

  function ensureTileData(c, r) {
    const k = tileKey(c, r);
    if (!gameStore.state.tiles[k]) {
      gameStore.state.tiles[k] = {
        state: 'grass',
        watered: false,
        waterTimer: 0,
        emptyTimer: 0,
        crop: null,
        growth: 0,
        obstacle: null,
        structure: null
      };
    }
    return gameStore.state.tiles[k];
  }

  function useActiveItem() {
    if (player.transitionLock > 0 || isInputBlocked()) return;

    if (player.location !== 'exterior') {
      const inter = getInteriorInteraction();
      if (inter) {
        triggerInteract();
      } else {
        showToast("You're indoors — walk up to Pip, the Bed, Chest, Desk, or Door!");
      }
      return;
    }

    const state = gameStore.state;
    const slot = resolveHotbarSlot(state.selectedSlot);
    const { c, r } = getTargetTile();

    if (slot.type === 'tool' && slot.id === 'water' && isNearBrook()) {
      refillWateringCan();
      return;
    }

    if (slot.type === 'empty') {
      audio.play('error');
      showToast('Press [I] to open your 24-slot Inventory and assign an item to this hotbar slot!');
      return;
    }

    if (!inBounds(c, r)) {
      audio.play('error');
      return;
    }

    const reserved = isReservedZone(c, r);
    if (reserved && reserved !== 'spawn') {
      audio.play('error');
      if (reserved === 'water') {
        showToast('Equip Watering Can [2] and press [Space] or [E] here to refill!');
      } else if (reserved === 'shop') {
        showToast("Walk up to Pip's Shop doorway and press [E] to go inside!");
      } else if (reserved === 'cabin') {
        showToast('Walk up to your Farmhouse door and press [E] to go inside!');
      } else {
        showToast("Can't farm on buildings or stone paths!");
      }
      return;
    }

    const td = ensureTileData(c, r);
    const wp = gridToWorld(c, r);
    player.swingTimer = 0.22;

    if (slot.type === 'tool' && slot.id === 'hoe') {
      if (td.obstacle === 'rock') {
        audio.play('error');
        showToast('⛏️ Clear the rock first using slot [4]!');
        return;
      }
      if (td.obstacle === 'weed') {
        audio.play('error');
        showToast('🌿 Clear the weeds first using slot [4]!');
        return;
      }
      if (td.structure) {
        audio.play('error');
        showToast('🪵 Pick up the fence first using slot [4]!');
        return;
      }
      if (td.state === 'tilled') {
        showToast('Soil is already tilled!');
        return;
      }
      td.state = 'tilled';
      td.watered = state.weather === 'rainy';
      td.waterTimer = td.watered ? getSoilMoistureDuration() : 0;
      td.emptyTimer = SOIL_CYCLE_SECONDS;
      audio.play('till');
      spawnBurst(wp.x, 0.2, wp.z, 0x9c6b43, 10);
      rebuildTileVisual(c, r);
      refreshGrassInstances();
      saveGame();
      return;
    }

    if (slot.type === 'tool' && slot.id === 'water') {
      const tierCfg = getCurrentWateringCanTier();
      if (state.waterCharges <= 0) {
        audio.play('error');
        showToast(`💧 ${tierCfg.name} is empty! Walk to the bottom-right brook to refill.`);
        return;
      }

      const coords = [[c, r]];
      if (tierCfg.forwardPair) {
        const ahead = getForwardStepTile(c, r);
        coords.push([ahead.c, ahead.r]);
      }

      const moistureDuration = getSoilMoistureDuration();
      let wateredAny = false;
      coords.forEach(([wc, wr]) => {
        if (!inBounds(wc, wr)) return;
        const wtd = state.tiles[tileKey(wc, wr)];
        if (wtd && wtd.state === 'tilled') {
          wtd.watered = true;
          wtd.waterTimer = moistureDuration;
          if (!wtd.crop) {
            wtd.emptyTimer = SOIL_CYCLE_SECONDS;
          }
          wateredAny = true;
          const p = gridToWorld(wc, wr);
          spawnBurst(p.x, 0.25, p.z, 0x5ec8f2, 6);
          rebuildTileVisual(wc, wr);
        }
      });

      if (wateredAny) {
        state.waterCharges = Math.max(0, state.waterCharges - 1);
        audio.play('water');
        renderHotbar();
        if (state.waterCharges === 0) {
          showToast('💧 Last drop used! Refill at the brook.');
        }
        saveGame();
      } else {
        audio.play('error');
        showToast('Till soil first before watering (or walk to brook to refill)!');
      }
      return;
    }

    if (slot.type === 'tool' && slot.id === 'harvest') {
      if (td.crop && CROPS[td.crop]) {
        const cfg = CROPS[td.crop];
        if (td.growth >= cfg.growTime) {
          const added = addItemToSlots(state.inventorySlots, 'crop', td.crop, 1);
          if (added <= 0) {
            audio.play('error');
            showToast('🎒 Your 24-slot Inventory is full! Free a slot or store items in the Farmhouse Chest.');
            return;
          }
          audio.play('harvest');
          spawnBurst(wp.x, 0.5, wp.z, cfg.color, 12);
          showToast(`Harvested ${cfg.harvestIcon} ${cfg.name} into Inventory!`);
          if (cfg.regrows) {
            td.growth = Math.floor(cfg.growTime * 0.45);
          } else {
            td.crop = null;
            td.growth = 0;
            td.emptyTimer = SOIL_CYCLE_SECONDS;
          }
          rebuildTileVisual(c, r);
          renderHotbar();
          saveGame();
          return;
        } else {
          const pct = Math.floor((td.growth / cfg.growTime) * 100);
          showToast(`Still growing (${pct}%) — ${td.watered ? 'watered!' : 'needs water!'}`);
          return;
        }
      }
      showToast('Nothing ripe to harvest here.');
      return;
    }

    if (slot.type === 'tool' && slot.id === 'clear') {
      if (td.obstacle === 'rock') {
        td.obstacle = null;
        const bonus = 4;
        state.coins += bonus;
        audio.play('clear');
        spawnBurst(wp.x, 0.35, wp.z, 0x9299a1, 12);
        showToast(`⛏️ Smashed rock! (+${bonus}g)`);
        rebuildTileVisual(c, r);
        refreshGrassInstances();
        updateHUD(player.location);
        saveGame();
        return;
      }
      if (td.obstacle === 'weed') {
        td.obstacle = null;
        audio.play('clear');
        spawnBurst(wp.x, 0.3, wp.z, 0x58ab4b, 10);
        if (Math.random() < 0.35) {
          const addedSeed = addItemToSlots(state.inventorySlots, 'seed', 'turnip', 1);
          if (addedSeed > 0) {
            showToast('🌿 Cleared weeds & found a Turnip Seed in Inventory!');
            renderHotbar();
          } else {
            state.coins += 2;
            showToast('🌿 Cleared weeds! (+2g, pack full)');
            updateHUD(player.location);
          }
        } else {
          state.coins += 2;
          showToast('🌿 Cleared weeds! (+2g)');
          updateHUD(player.location);
        }
        rebuildTileVisual(c, r);
        refreshGrassInstances();
        saveGame();
        return;
      }
      if (td.structure === 'fence' || td.structure === 'gate') {
        const itemType = td.structure;
        const added = addItemToSlots(state.inventorySlots, 'placeable', itemType, 1);
        if (added <= 0) {
          audio.play('error');
          showToast('🎒 Inventory is full — cannot pick up fence right now.');
          return;
        }
        td.structure = null;
        audio.play('build');
        spawnBurst(wp.x, 0.4, wp.z, 0xc98d55, 8);
        showToast(`Picked up ${itemType === 'fence' ? 'Wooden Fence' : 'Fence Gate'} into Inventory`);
        rebuildTileAndNeighbors(c, r);
        refreshGrassInstances();
        renderHotbar();
        saveGame();
        return;
      }
      if (td.state === 'tilled' && !td.crop) {
        td.state = 'grass';
        td.watered = false;
        td.waterTimer = 0;
        td.emptyTimer = 0;
        audio.play('till');
        rebuildTileVisual(c, r);
        refreshGrassInstances();
        showToast('Restored meadow grass');
        saveGame();
        return;
      }
      audio.play('error');
      showToast('Nothing to clear here.');
      return;
    }

    if (slot.type === 'seed') {
      const cropId = slot.id;
      const count = getTotalItemCountInSlots(state.inventorySlots, 'seed', cropId);
      if (count <= 0) {
        audio.play('error');
        showToast(`Out of ${CROPS[cropId].name} seeds in Inventory! Check Chest or Pip's Shop.`);
        return;
      }
      if (td.state !== 'tilled') {
        audio.play('error');
        showToast('Till the ground with your Hoe [1] first!');
        return;
      }
      if (td.crop) {
        audio.play('error');
        showToast('Already planted here!');
        return;
      }
      consumeItemFromSlots(state.inventorySlots, 'seed', cropId, 1);
      td.crop = cropId;
      td.growth = 0;
      td.emptyTimer = 0;
      audio.play('plant');
      spawnBurst(wp.x, 0.25, wp.z, 0x7bc96f, 7);
      rebuildTileVisual(c, r);
      renderHotbar();
      saveGame();
      return;
    }

    if (slot.type === 'placeable') {
      const itemId = slot.id;
      const count = getTotalItemCountInSlots(state.inventorySlots, 'placeable', itemId);
      if (count <= 0) {
        audio.play('error');
        showToast(`No ${itemId === 'fence' ? 'Wooden Fences' : 'Fence Gates'} in Inventory!`);
        return;
      }
      if (td.obstacle) {
        audio.play('error');
        showToast('Clear rocks/weeds with [4] before placing a fence!');
        return;
      }
      if (td.state === 'tilled') {
        audio.play('error');
        showToast('Cannot place fences on tilled soil!');
        return;
      }
      if (td.structure) {
        audio.play('error');
        showToast('Something is already built here!');
        return;
      }
      consumeItemFromSlots(state.inventorySlots, 'placeable', itemId, 1);
      td.structure = itemId;
      audio.play('build');
      spawnBurst(wp.x, 0.4, wp.z, 0xc98d55, 8);
      rebuildTileAndNeighbors(c, r);
      refreshGrassInstances();
      renderHotbar();
      saveGame();
    }
  }

  function applyCropRestBoost(boostUnits) {
    const state = gameStore.state;
    const speedMult = state.upgrades.richSoil ? 1.3 : 1.0;
    for (const k of Object.keys(state.tiles)) {
      const td = state.tiles[k];
      if (td.state === 'tilled' && td.crop && td.watered) {
        td.growth += boostUnits * speedMult;
      }
    }
  }

  function rollNewMorningState() {
    const state = gameStore.state;
    state.day += 1;
    state.weather = Math.random() < 0.28 ? 'rainy' : 'sunny';
    state.hotCrop = CROP_KEYS[state.day % CROP_KEYS.length];
    const moistureDuration = getSoilMoistureDuration();

    for (const k of Object.keys(state.tiles)) {
      const td = state.tiles[k];
      if (td.state === 'tilled') {
        if (state.weather === 'rainy') {
          td.watered = true;
          td.waterTimer = moistureDuration;
        } else {
          td.watered = false;
          td.waterTimer = 0;
        }
      }
    }

    for (let i = 0; i < 2; i++) {
      const rc = Math.floor(Math.random() * GRID_COLS);
      const rr = Math.floor(Math.random() * GRID_ROWS);
      if (!isReservedZone(rc, rr) && !state.tiles[tileKey(rc, rr)]) {
        state.tiles[tileKey(rc, rr)] = {
          state: 'grass',
          watered: false,
          waterTimer: 0,
          emptyTimer: 0,
          crop: null,
          growth: 0,
          obstacle: 'weed',
          structure: null
        };
      }
    }
    clearCenterSpawnArea();
  }

  function restUntilTarget(targetPhase) {
    const state = gameStore.state;
    const curT = state.timeOfDay;
    const delta = computeCycleDelta(curT, targetPhase);
    const crossesMorning = curT + delta >= 1.0 - 1e-9;

    if (targetPhase === TIME_MORNING) {
      applyCropRestBoost(22);
      rollNewMorningState();
      state.timeOfDay = TIME_MORNING;
      rebuildAllTiles();
      updateHUD(player.location);
      saveGame();
      document.getElementById('bed-modal').classList.remove('open');
      audio.play('harvest');
      showToast(`☀️ Good morning! Day ${state.day} (${state.weather === 'rainy' ? 'Rainy Day — crops auto-watered!' : 'Sunny'})`);
      return;
    }

    const boost = Math.max(4, Math.round(delta * 32));
    applyCropRestBoost(boost);
    if (crossesMorning) {
      rollNewMorningState();
    }
    state.timeOfDay = targetPhase;
    rebuildAllTiles();
    updateHUD(player.location);
    saveGame();
    document.getElementById('bed-modal').classList.remove('open');
    audio.play('harvest');

    if (targetPhase === TIME_NOON) {
      showToast(`☀️ Rested until Noon (12:00 PM) on Day ${state.day}!`);
    } else if (targetPhase === TIME_NIGHT) {
      showToast(`🌙 Rested until Night (06:00 PM) on Day ${state.day} — fireflies are out!`);
    }
  }

  function stepSimulation(step) {
    const state = gameStore.state;
    const speedMult = state.upgrades.richSoil ? 1.3 : 1.0;
    const moistureDuration = getSoilMoistureDuration();
    let grassNeedsRefresh = false;

    for (const k of Object.keys(state.tiles)) {
      const td = state.tiles[k];
      if (td.state !== 'tilled') continue;

      const [cc, rr] = k.split(',').map(Number);
      let visualDirty = false;

      if (td.watered) {
        if (state.weather === 'rainy') {
          td.waterTimer = moistureDuration;
        } else {
          td.waterTimer = (td.waterTimer || 0) - step;
          if (td.waterTimer <= 0) {
            td.watered = false;
            td.waterTimer = 0;
            visualDirty = true;
          }
        }
      }

      if (td.crop && CROPS[td.crop]) {
        td.emptyTimer = 0;
        if (td.watered) {
          const cfg = CROPS[td.crop];
          const prevStage = td.growth >= cfg.growTime ? 3 : td.growth >= cfg.growTime * 0.6 ? 2 : td.growth >= cfg.growTime * 0.25 ? 1 : 0;
          td.growth += step * speedMult;
          const newStage = td.growth >= cfg.growTime ? 3 : td.growth >= cfg.growTime * 0.6 ? 2 : td.growth >= cfg.growTime * 0.25 ? 1 : 0;
          if (newStage !== prevStage) visualDirty = true;
        }
      } else {
        if (typeof td.emptyTimer !== 'number' || td.emptyTimer <= 0) {
          td.emptyTimer = SOIL_CYCLE_SECONDS;
        }
        td.emptyTimer -= step;
        if (td.emptyTimer <= 0) {
          td.state = 'grass';
          td.watered = false;
          td.waterTimer = 0;
          td.emptyTimer = 0;
          visualDirty = true;
          grassNeedsRefresh = true;
        }
      }

      if (visualDirty) {
        rebuildTileVisual(cc, rr);
      }
    }

    if (grassNeedsRefresh) {
      refreshGrassInstances();
    }
    updateHUD(player.location);
  }

  return {
    isNearBrook,
    refillWateringCan,
    useActiveItem,
    applyCropRestBoost,
    rollNewMorningState,
    restUntilTarget,
    stepSimulation
  };
}
