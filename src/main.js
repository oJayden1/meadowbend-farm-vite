import * as THREE from 'three';
import {
  SPAWN_POS,
  FULL_CYCLE_SECONDS,
  TIME_MORNING,
  TIME_NOON,
  TIME_NIGHT,
  ROOM_Y,
  SHOP_ROOM,
  HOUSE_ROOM,
  HOTBAR_SLOTS,
  SAVE_KEY
} from './data/constants.js';
import { audio } from './audio/cozyAudio.js';
import {
  gameStore,
  initWorldTiles,
  generateFreshWorldState,
  saveGame,
  createBackupSnapshot,
  hasStoredSave,
  getMaxWaterCharges
} from './state/saveSystem.js';
import { gridToWorld, worldToGrid, inBounds, transferBetweenSlotArrays } from './state/inventory.js';
import { windUniforms } from './world/textures.js';
import { buildEnvironment } from './world/environment.js';
import { buildBuildings } from './world/buildings.js';
import { createTileMeshManager } from './world/tileMeshes.js';
import { buildWildlife, updateWildlife } from './world/wildlife.js';
import { createPlayerController } from './gameplay/player.js';
import { createFarmingController } from './gameplay/farming.js';
import { showToast, renderHotbar, updateHUD } from './ui/hud.js';
import { openInventoryModal, openChestModal, renderChestModal } from './ui/storageModals.js';
import {
  anyModalOpen,
  isInputBlocked,
  openBedModal,
  openDeskModal,
  openShop,
  sellAllCrops,
  buildExportEnvelope,
  openSaveTransferModal,
  parseAndApplyImportedSave
} from './ui/modals.js';
import { openStartMenu, enterGameplay, renderStartMenu } from './ui/startMenu.js';

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function boot() {
  window.__updateLoader(28, 'Reading & migrating farm save...');
  await nextFrame();
  initWorldTiles(true);

  const container = document.getElementById('canvas-container');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9be0f5);
  scene.fog = new THREE.FogExp2(0x9be0f5, 0.0115);

  const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 220);
  camera.position.set(SPAWN_POS.x, 16.5, SPAWN_POS.z + 13.5);
  camera.lookAt(camera.position.x, 0, camera.position.z - 13.5);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  const hemiLight = new THREE.HemisphereLight(0xfff8e7, 0x6ea86b, 0.98);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff1d0, 1.45);
  sunLight.position.set(22, 34, 20);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(1024, 1024);
  sunLight.shadow.camera.near = 5;
  sunLight.shadow.camera.far = 110;
  const d = 34;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0005;
  scene.add(sunLight);

  const indoorLight = new THREE.PointLight(0xffdf9e, 1.4, 22);
  indoorLight.position.set(SHOP_ROOM.cx, ROOM_Y + 3.6, SHOP_ROOM.cz);
  scene.add(indoorLight);

  window.__updateLoader(48, 'Painting meadow, brook, grass & trees...');
  await nextFrame();
  const envRefs = buildEnvironment(scene);

  window.__updateLoader(68, 'Building farmhouse, shop & interior rooms...');
  await nextFrame();
  const buildingRefs = buildBuildings(scene);

  window.__updateLoader(78, 'Laying out garden plots, 20-crop meshes & fences...');
  await nextFrame();
  const tileCtrl = createTileMeshManager(scene, envRefs.refreshGrassInstances);
  tileCtrl.rebuildAllTiles();

  window.__updateLoader(88, 'Inviting butterflies, bunnies & songbirds...');
  await nextFrame();
  const { wildlife, fireflyMat } = buildWildlife(scene);

  const playerCtrl = createPlayerController(scene, buildingRefs);
  const { player, playerGroup, tileCursor } = playerCtrl;

  const roomFadeEl = document.getElementById('room-fade');
  function transitionToLocation(targetLoc, tx, ty, tz, rotY, toastMsg) {
    if (player.transitionLock > 0) return;
    player.transitionLock = 0.45;
    audio.play('door');
    roomFadeEl.classList.add('active');

    setTimeout(() => {
      player.location = targetLoc;
      player.x = tx;
      player.y = ty;
      player.z = tz;
      player.rotY = rotY;
      playerGroup.position.set(player.x, player.y, player.z);
      playerGroup.rotation.y = player.rotY;

      if (targetLoc === 'shop_interior') {
        indoorLight.position.set(SHOP_ROOM.cx, ROOM_Y + 3.4, SHOP_ROOM.cz);
        camera.position.set(SHOP_ROOM.cx, ROOM_Y + 10.2, SHOP_ROOM.cz + 8.6);
      } else if (targetLoc === 'house_interior') {
        indoorLight.position.set(HOUSE_ROOM.cx, ROOM_Y + 3.4, HOUSE_ROOM.cz);
        camera.position.set(HOUSE_ROOM.cx, ROOM_Y + 10.4, HOUSE_ROOM.cz + 8.8);
      } else {
        camera.position.set(player.x, 16.5, player.z + 13.5);
      }

      updateHUD(player.location);
      if (toastMsg && gameStore.gameStarted) showToast(toastMsg);
      roomFadeEl.classList.remove('active');
    }, 170);
  }

  let farmingCtrl = null;

  function triggerInteract() {
    if (player.transitionLock > 0 || isInputBlocked()) return;

    if (player.location !== 'exterior') {
      const inter = playerCtrl.getInteriorInteraction();
      if (!inter) {
        audio.play('error');
        if (player.location === 'shop_interior') {
          showToast("Walk up to Pip's counter to buy/sell, or to the front door to exit.");
        } else {
          showToast('Walk up to the Bed, Chest, Desk, or Door and press [E].');
        }
        return;
      }
      if (inter.type === 'exit_shop') {
        const shopDoorWorld = gridToWorld(22.5, 4.5);
        transitionToLocation('exterior', shopDoorWorld.x, 0, shopDoorWorld.z + 1.25, Math.PI, 'Stepped outside to Meadowbend Farm');
      } else if (inter.type === 'exit_house') {
        const cabinDoorWorld = gridToWorld(4, 2.5);
        transitionToLocation('exterior', cabinDoorWorld.x, 0, cabinDoorWorld.z + 2.65, Math.PI, 'Stepped outside to Meadowbend Farm');
      } else if (inter.type === 'talk_pip') {
        openShop(player.location);
      } else if (inter.type === 'use_bed') {
        openBedModal();
      } else if (inter.type === 'use_chest') {
        openChestModal();
      } else if (inter.type === 'use_desk') {
        openDeskModal();
      }
      return;
    }

    if (farmingCtrl.isNearBrook()) {
      farmingCtrl.refillWateringCan();
      return;
    }

    const zone = playerCtrl.getNearbyZone();
    if (zone) {
      if (zone.id === 'enter_shop') {
        transitionToLocation('shop_interior', SHOP_ROOM.spawnX, ROOM_Y, SHOP_ROOM.spawnZ, Math.PI, "Entered Pip's Valley Shop");
      } else if (zone.id === 'enter_house') {
        transitionToLocation('house_interior', HOUSE_ROOM.spawnX, ROOM_Y, HOUSE_ROOM.spawnZ, Math.PI, 'Entered Cozy Farmhouse');
      } else if (zone.id === 'bin') {
        sellAllCrops(player.location);
      }
    }
  }

  farmingCtrl = createFarmingController({
    playerCtrl,
    tileCtrl,
    envRefs,
    refreshGrassInstances: envRefs.refreshGrassInstances,
    triggerInteract
  });

  renderHotbar();
  updateHUD(player.location);

  window.__onLoadingComplete = () => {
    openStartMenu(tileCtrl.rebuildAllTiles);
  };

  // Input Handling
  const keys = {};
  const inventoryModal = document.getElementById('inventory-modal');
  const chestModal = document.getElementById('chest-modal');
  const shopModal = document.getElementById('shop-modal');
  const bedModal = document.getElementById('bed-modal');
  const deskModal = document.getElementById('desk-modal');
  const saveTransferModal = document.getElementById('save-transfer-modal');
  const startMenuEl = document.getElementById('start-menu');

  window.addEventListener('keydown', (e) => {
    if (saveTransferModal.classList.contains('open')) {
      if (e.key === 'Escape') saveTransferModal.classList.remove('open');
      return;
    }
    if (anyModalOpen()) {
      if (e.key === 'Escape' || (e.code === 'KeyI' && inventoryModal.classList.contains('open'))) {
        inventoryModal.classList.remove('open');
        chestModal.classList.remove('open');
        shopModal.classList.remove('open');
        bedModal.classList.remove('open');
        deskModal.classList.remove('open');
      }
      return;
    }
    if (!gameStore.gameStarted || startMenuEl.classList.contains('open')) return;

    keys[e.code] = true;

    if (e.code === 'KeyI') {
      e.preventDefault();
      openInventoryModal();
      return;
    }

    const keyMap = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-'];
    const idx = keyMap.indexOf(e.key);
    if (idx !== -1) {
      gameStore.state.selectedSlot = idx;
      renderHotbar();
    }

    if (e.code === 'Space') {
      e.preventDefault();
      farmingCtrl.useActiveItem();
    }

    if (e.code === 'KeyE') {
      triggerInteract();
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
  });

  window.addEventListener('wheel', (e) => {
    if (isInputBlocked()) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    gameStore.state.selectedSlot = (gameStore.state.selectedSlot + dir + HOTBAR_SLOTS.length) % HOTBAR_SLOTS.length;
    renderHotbar();
  }, { passive: true });

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    if (isInputBlocked()) return;
    farmingCtrl.useActiveItem();
  });

  // UI Button Bindings
  document.getElementById('btn-open-inventory').onclick = () => {
    if (!gameStore.gameStarted) return;
    openInventoryModal();
  };
  document.getElementById('close-inventory').onclick = () => inventoryModal.classList.remove('open');
  document.getElementById('close-chest').onclick = () => chestModal.classList.remove('open');

  document.getElementById('btn-deposit-all-crops').onclick = () => {
    const state = gameStore.state;
    let movedAny = 0;
    for (let i = 0; i < state.inventorySlots.length; i++) {
      const s = state.inventorySlots[i];
      if (s && s.kind === 'crop' && s.count > 0) {
        const res = transferBetweenSlotArrays(state.inventorySlots, i, state.chestSlots, null);
        movedAny += res.moved;
      }
    }
    if (movedAny > 0) {
      audio.play('build');
      saveGame();
      renderHotbar();
      renderChestModal();
      showToast(`📦 Deposited ${movedAny} harvested crop(s) into the Farmhouse Chest!`);
    } else {
      audio.play('error');
      showToast('No harvested crops in your Inventory to deposit.');
    }
  };

  document.getElementById('btn-continue-farm').onclick = () => {
    if (!hasStoredSave()) {
      audio.play('error');
      return;
    }
    initWorldTiles(true);
    tileCtrl.rebuildAllTiles();
    audio.play('door');
    enterGameplay(player.location, `Welcome back! Day ${gameStore.state.day} · ${gameStore.state.coins}g`);
  };

  document.getElementById('btn-start-new-farm').onclick = () => {
    if (gameStore.hasActiveSave || hasStoredSave()) {
      createBackupSnapshot(gameStore.state, 'before-new-farm');
    }
    generateFreshWorldState();
    saveGame();
    tileCtrl.rebuildAllTiles();
    player.location = 'exterior';
    player.x = SPAWN_POS.x;
    player.y = 0;
    player.z = SPAWN_POS.z;
    player.rotY = 0;
    camera.position.set(SPAWN_POS.x, 16.5, SPAWN_POS.z + 13.5);
    audio.play('build');
    enterGameplay(player.location, '🌱 Started a fresh farm on Day 1!');
  };

  document.getElementById('btn-start-export').onclick = () => openSaveTransferModal('export');
  document.getElementById('btn-start-import').onclick = () => openSaveTransferModal('import');

  document.getElementById('btn-menu').onclick = () => {
    saveGame();
    openStartMenu(tileCtrl.rebuildAllTiles);
  };

  document.getElementById('close-save-transfer').onclick = () => saveTransferModal.classList.remove('open');

  document.getElementById('btn-copy-save-json').onclick = () => {
    const textarea = document.getElementById('save-json-textarea');
    const feedback = document.getElementById('save-transfer-feedback');
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (e) { copied = false; }
    if (copied) {
      feedback.style.color = '#1b5e20';
      feedback.textContent = '📋 Copied save JSON to clipboard!';
      audio.play('coin');
    } else {
      feedback.style.color = '#8f5300';
      feedback.textContent = 'Text selected — press Ctrl/Cmd + C to copy JSON.';
    }
  };

  document.getElementById('btn-download-save-json').onclick = () => {
    const jsonStr = buildExportEnvelope();
    const feedback = document.getElementById('save-transfer-feedback');
    try {
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `meadowbend-farm-day${gameStore.state.day}-${dateStamp}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
      feedback.style.color = '#1b5e20';
      feedback.textContent = '💾 Save .json download triggered (JSON text also shown above).';
      audio.play('coin');
    } catch (err) {
      feedback.style.color = '#8f5300';
      feedback.textContent = 'File download is blocked in this sandbox — copy the JSON text above instead!';
    }
  };

  const applyImportChanges = () => {
    tileCtrl.rebuildAllTiles();
    renderHotbar();
    updateHUD(player.location);
    if (startMenuEl.classList.contains('open')) renderStartMenu(tileCtrl.rebuildAllTiles);
  };

  document.getElementById('save-file-input').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      document.getElementById('save-json-textarea').value = String(reader.result || '');
      parseAndApplyImportedSave(String(reader.result || ''), applyImportChanges);
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-apply-import-json').onclick = () => {
    const txt = document.getElementById('save-json-textarea').value;
    parseAndApplyImportedSave(txt, applyImportChanges);
  };

  document.getElementById('close-shop').onclick = () => shopModal.classList.remove('open');
  document.getElementById('btn-sell-all').onclick = () => sellAllCrops(player.location);
  document.getElementById('close-bed').onclick = () => bedModal.classList.remove('open');
  document.getElementById('btn-cancel-sleep').onclick = () => bedModal.classList.remove('open');
  document.getElementById('btn-sleep-noon').onclick = () => farmingCtrl.restUntilTarget(TIME_NOON);
  document.getElementById('btn-sleep-night').onclick = () => farmingCtrl.restUntilTarget(TIME_NIGHT);
  document.getElementById('btn-sleep-morning').onclick = () => farmingCtrl.restUntilTarget(TIME_MORNING);
  document.getElementById('close-desk').onclick = () => deskModal.classList.remove('open');
  document.getElementById('btn-desk-export').onclick = () => openSaveTransferModal('export');
  document.getElementById('btn-desk-import').onclick = () => openSaveTransferModal('import');

  document.getElementById('btn-audio').onclick = (e) => {
    audio.enabled = !audio.enabled;
    e.target.textContent = audio.enabled ? '🔊 SFX: On' : '🔇 SFX: Off';
  };

  document.getElementById('btn-unstuck').onclick = () => {
    if (player.location !== 'exterior') {
      transitionToLocation('exterior', SPAWN_POS.x, 0, SPAWN_POS.z, 0, '🧭 Returned to Meadowbend Farm center!');
    } else {
      player.x = SPAWN_POS.x;
      player.y = 0;
      player.z = SPAWN_POS.z;
      player.rotY = 0;
      audio.play('build');
      playerCtrl.spawnBurst(player.x, 0.5, player.z, 0xfff3b0, 12);
      showToast('🧭 Returned to the center of Meadowbend Farm!');
    }
  };

  document.getElementById('btn-wipe-save').onclick = () => {
    createBackupSnapshot(gameStore.state, 'before-fresh-farm-reset');
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    generateFreshWorldState();
    saveGame();
    tileCtrl.rebuildAllTiles();
    renderHotbar();
    deskModal.classList.remove('open');
    transitionToLocation('exterior', SPAWN_POS.x, 0, SPAWN_POS.z, 0, 'Started a fresh farm (previous state backed up)!');
    updateHUD(player.location);
  };

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Lighting & Main Loop
  const colMorning = new THREE.Color(0xffdfa8);
  const colNoon = new THREE.Color(0xfff6e0);
  const colSunset = new THREE.Color(0xff9a6c);
  const colNight = new THREE.Color(0x4b6cb7);

  const skyDay = new THREE.Color(0x9be0f5);
  const skySunset = new THREE.Color(0xf4a261);
  const skyNight = new THREE.Color(0x1b2845);
  const indoorBg = new THREE.Color(0x2b1d12);

  let lastTime = performance.now();
  let simTickAccum = 0;
  let firstFrameRendered = false;

  function animate(now) {
    requestAnimationFrame(animate);
    const dt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;

    if (player.transitionLock > 0) {
      player.transitionLock = Math.max(0, player.transitionLock - dt);
    }

    windUniforms.uTime.value += dt;
    envRefs.waterTex.offset.x = (envRefs.waterTex.offset.x + dt * 0.045) % 1;
    envRefs.waterTex.offset.y = (envRefs.waterTex.offset.y + dt * 0.03) % 1;

    const state = gameStore.state;

    // 1. Day/Night Cycle
    if (gameStore.gameStarted && !anyModalOpen()) {
      const prevPhase = state.timeOfDay < 0.5 ? 'day' : 'night';
      state.timeOfDay += dt / FULL_CYCLE_SECONDS;
      if (state.timeOfDay >= 1.0) {
        state.timeOfDay -= 1.0;
        farmingCtrl.applyCropRestBoost(22);
        farmingCtrl.rollNewMorningState();
        tileCtrl.rebuildAllTiles();
        saveGame();
        showToast(`🌅 Day ${state.day} has begun!`);
      }
      const curPhase = state.timeOfDay < 0.5 ? 'day' : 'night';
      if (prevPhase === 'day' && curPhase === 'night') {
        showToast('🌙 Nightfall! Fireflies are coming out.');
      }
    }

    const t = state.timeOfDay;
    if (player.location !== 'exterior') {
      scene.background.copy(indoorBg);
      scene.fog.color.copy(indoorBg);
      sunLight.intensity = 0.25;
    } else {
      if (t < 0.1) {
        const f = t / 0.1;
        sunLight.color.copy(colMorning).lerp(colNoon, f);
        scene.background.copy(skySunset).lerp(skyDay, f);
        sunLight.intensity = 1.0 + f * 0.45;
      } else if (t < 0.42) {
        sunLight.color.copy(colNoon);
        scene.background.copy(skyDay);
        sunLight.intensity = 1.45;
      } else if (t < 0.52) {
        const f = (t - 0.42) / 0.1;
        sunLight.color.copy(colNoon).lerp(colSunset, f);
        scene.background.copy(skyDay).lerp(skySunset, f);
        sunLight.intensity = 1.45 - f * 0.45;
      } else if (t < 0.58) {
        const f = (t - 0.52) / 0.06;
        sunLight.color.copy(colSunset).lerp(colNight, f);
        scene.background.copy(skySunset).lerp(skyNight, f);
        sunLight.intensity = 1.0 - f * 0.48;
      } else if (t < 0.94) {
        sunLight.color.copy(colNight);
        scene.background.copy(skyNight);
        sunLight.intensity = 0.52;
      } else {
        const f = (t - 0.94) / 0.06;
        sunLight.color.copy(colNight).lerp(colMorning, f);
        scene.background.copy(skyNight).lerp(skySunset, f);
        sunLight.intensity = 0.52 + f * 0.48;
      }
      scene.fog.color.copy(scene.background);
    }

    // 2. Player Movement & NPC animations
    playerCtrl.updateMovement(keys, isInputBlocked(), dt);

    const timeSec = windUniforms.uTime.value;
    if (buildingRefs.pipNpcHead && buildingRefs.pipNpcBody) {
      const dx = player.x - SHOP_ROOM.npcX;
      const dz = player.z - SHOP_ROOM.npcZ;
      const lookAng = Math.atan2(dx, dz);
      buildingRefs.pipNpcHead.rotation.y = Math.max(-0.9, Math.min(0.9, lookAng));
      buildingRefs.pipNpcBody.scale.y = 1 + Math.sin(timeSec * 3) * 0.02;
    }
    const pipMarker = scene.getObjectByName('pipMarker');
    if (pipMarker) {
      pipMarker.position.y = 2.05 + Math.sin(timeSec * 4) * 0.08;
      pipMarker.rotation.y = timeSec * 2;
    }

    const pGrid = worldToGrid(player.x, player.z);
    for (const [k, grp] of tileCtrl.tileMeshes.entries()) {
      const door = grp.getObjectByName('gateDoor');
      if (door) {
        const [gc, gr] = k.split(',').map(Number);
        const nearGate = gameStore.gameStarted && player.location === 'exterior' && Math.abs(gc - pGrid.c) <= 1 && Math.abs(gr - pGrid.r) <= 1;
        const targetAngle = nearGate ? Math.PI * 0.45 : 0;
        door.rotation.y += (targetAngle - door.rotation.y) * Math.min(1, dt * 10);
      }
    }

    // 3. Target Cursor & Contextual Interaction Prompt
    const hintEl = document.getElementById('action-hint');
    if (!gameStore.gameStarted || startMenuEl.classList.contains('open')) {
      tileCursor.visible = false;
      hintEl.classList.remove('visible');
    } else if (player.location !== 'exterior') {
      tileCursor.visible = false;
      const inter = playerCtrl.getInteriorInteraction();
      if (inter) {
        hintEl.textContent = inter.hint;
        hintEl.classList.add('visible');
      } else {
        hintEl.classList.remove('visible');
      }
    } else {
      const tgt = playerCtrl.getTargetTile();
      if (inBounds(tgt.c, tgt.r)) {
        const wp = gridToWorld(tgt.c, tgt.r);
        tileCursor.visible = true;
        tileCursor.position.set(wp.x, 0.04, wp.z);
      } else {
        tileCursor.visible = false;
      }

      if (farmingCtrl.isNearBrook()) {
        hintEl.textContent = `💧 Press [E] or use Watering Can [2] to refill water (${state.waterCharges}/${getMaxWaterCharges()})`;
        hintEl.classList.add('visible');
      } else {
        const nearby = playerCtrl.getNearbyZone();
        if (nearby) {
          hintEl.textContent = nearby.hint;
          hintEl.classList.add('visible');
        } else {
          hintEl.classList.remove('visible');
        }
      }
    }

    // 4. Simulation Tick
    if (gameStore.gameStarted && !anyModalOpen()) {
      simTickAccum += dt;
      if (simTickAccum >= 1.0) {
        const step = simTickAccum;
        simTickAccum = 0;
        farmingCtrl.stepSimulation(step);
      }
    }

    // 5. Wildlife & Particles
    updateWildlife(wildlife, fireflyMat, player, gameStore.gameStarted, playerCtrl.isPositionBlocked, dt, timeSec, t);
    playerCtrl.updateParticles(dt);

    // 6. Camera Follow
    if (player.location === 'shop_interior') {
      const camX = SHOP_ROOM.cx + (player.x - SHOP_ROOM.cx) * 0.25;
      const camY = ROOM_Y + 10.2;
      const camZ = SHOP_ROOM.cz + 8.6;
      camera.position.x += (camX - camera.position.x) * Math.min(1, dt * 8);
      camera.position.y += (camY - camera.position.y) * Math.min(1, dt * 8);
      camera.position.z += (camZ - camera.position.z) * Math.min(1, dt * 8);
      camera.lookAt(SHOP_ROOM.cx, ROOM_Y + 0.5, SHOP_ROOM.cz - 0.5);
    } else if (player.location === 'house_interior') {
      const camX = HOUSE_ROOM.cx + (player.x - HOUSE_ROOM.cx) * 0.25;
      const camY = ROOM_Y + 10.4;
      const camZ = HOUSE_ROOM.cz + 8.8;
      camera.position.x += (camX - camera.position.x) * Math.min(1, dt * 8);
      camera.position.y += (camY - camera.position.y) * Math.min(1, dt * 8);
      camera.position.z += (camZ - camera.position.z) * Math.min(1, dt * 8);
      camera.lookAt(HOUSE_ROOM.cx, ROOM_Y + 0.5, HOUSE_ROOM.cz - 0.5);
    } else {
      const camTargetX = player.x;
      const camTargetZ = player.z + 13.5;
      const camTargetY = 16.5;
      camera.position.x += (camTargetX - camera.position.x) * Math.min(1, dt * 6);
      camera.position.y += (camTargetY - camera.position.y) * Math.min(1, dt * 6);
      camera.position.z += (camTargetZ - camera.position.z) * Math.min(1, dt * 6);
      camera.lookAt(camera.position.x, 0, camera.position.z - 13.5);
    }

    renderer.render(scene, camera);

    if (!firstFrameRendered) {
      firstFrameRendered = true;
      window.__dismissLoader();
    }
  }

  window.__updateLoader(96, 'Rendering first meadow frame...');
  await nextFrame();
  requestAnimationFrame(animate);
}

boot();
