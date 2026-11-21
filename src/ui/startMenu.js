import { INVENTORY_CAPACITY, CHEST_CAPACITY, CURRENT_SCHEMA_VERSION } from '../data/constants.js';
import { audio } from '../audio/cozyAudio.js';
import {
  gameStore,
  getStoredSavePreview,
  readBackupSnapshot,
  createBackupSnapshot,
  normalizeAndMigrateState,
  clearCenterSpawnArea,
  saveGame
} from '../state/saveSystem.js';
import { showToast, renderHotbar, updateHUD } from './hud.js';

export function renderStartMenu(onRestoreComplete) {
  const summaryEl = document.getElementById('start-save-summary');
  const backupContainer = document.getElementById('start-backup-container');
  const continueBtn = document.getElementById('btn-continue-farm');

  const preview = getStoredSavePreview();
  if (preview && preview.exists) {
    continueBtn.disabled = false;
    continueBtn.textContent = `▶️ Continue Farm (Day ${preview.day} · ${preview.coins}g)`;
    summaryEl.innerHTML = `
      <div class="save-summary-header">
        <span>💾 Saved Farm Found</span>
        <span>Schema v${preview.schemaVersion}</span>
      </div>
      <div class="save-summary-pills">
        <span class="save-pill">📅 Day ${preview.day}</span>
        <span class="save-pill">🪙 ${preview.coins}g</span>
        <span class="save-pill">🌱 ${preview.plantedCount} Growing</span>
        <span class="save-pill">🎒 ${preview.invUsed}/${INVENTORY_CAPACITY} Pack</span>
        <span class="save-pill">🧰 ${preview.chestUsed}/${CHEST_CAPACITY} Chest</span>
        <span class="save-pill">💧 ${preview.canName}</span>
      </div>
    `;
  } else {
    continueBtn.disabled = true;
    continueBtn.textContent = '▶️ Continue Farm (No Save Yet)';
    summaryEl.innerHTML = `
      <div class="save-summary-header">
        <span>🌱 Fresh Valley Ready</span>
        <span>Schema v${CURRENT_SCHEMA_VERSION}</span>
      </div>
      <div style="font-size:12.5px; color:#64482a;">
        No local save found yet — click <b>New Farm</b> to begin or <b>Import Save</b> to load an existing JSON save.
      </div>
    `;
  }

  const backup = readBackupSnapshot();
  if (backup) {
    const whenStr = backup.createdAt ? new Date(backup.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'recent';
    backupContainer.innerHTML = `
      <div class="backup-strip">
        <div>
          <b>🛡️ Backup Snapshot Available</b> · Day ${backup.day}, ${backup.coins}g (v${backup.schemaVersion} · ${whenStr})
        </div>
        <button class="cozy-btn" id="btn-restore-backup">Restore</button>
      </div>
    `;
    const restoreBtn = document.getElementById('btn-restore-backup');
    if (restoreBtn) {
      restoreBtn.onclick = () => {
        createBackupSnapshot(gameStore.state, 'before-backup-restore');
        gameStore.state = normalizeAndMigrateState(backup.state);
        clearCenterSpawnArea();
        saveGame();
        if (typeof onRestoreComplete === 'function') onRestoreComplete();
        renderHotbar();
        updateHUD();
        renderStartMenu(onRestoreComplete);
        audio.play('harvest');
        showToast(`🛡️ Restored backup from Day ${gameStore.state.day} (${gameStore.state.coins}g)!`);
      };
    }
  } else {
    backupContainer.innerHTML = '';
  }
}

export function openStartMenu(onRestoreComplete) {
  gameStore.gameStarted = false;
  document.getElementById('hud').classList.add('hidden-hud');
  document.getElementById('action-hint').classList.remove('visible');
  renderStartMenu(onRestoreComplete);
  document.getElementById('start-menu').classList.add('open');
}

export function enterGameplay(playerLocation = 'exterior', toastMsg = null) {
  gameStore.gameStarted = true;
  document.getElementById('start-menu').classList.remove('open');
  document.getElementById('hud').classList.remove('hidden-hud');
  updateHUD(playerLocation);
  renderHotbar();
  if (toastMsg) showToast(toastMsg);
}
