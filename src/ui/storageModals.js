import { INVENTORY_CAPACITY, CHEST_CAPACITY, HOTBAR_SLOTS } from '../data/constants.js';
import { getItemMeta } from '../data/crops.js';
import { audio } from '../audio/cozyAudio.js';
import { gameStore, saveGame } from '../state/saveSystem.js';
import { getTotalItemCountInSlots, transferBetweenSlotArrays } from '../state/inventory.js';
import { showToast, renderHotbar } from './hud.js';

let selectedInvSlotIdx = 0;
let selectedChestSlotIdx = 0;

export function assignItemToNextHotbarSlot(kind, id, preferredSlotIdx = null) {
  const state = gameStore.state;
  let targetIdx = preferredSlotIdx;
  if (targetIdx === null || !HOTBAR_SLOTS[targetIdx] || !HOTBAR_SLOTS[targetIdx].assignable) {
    targetIdx = null;
    for (let i = 4; i < HOTBAR_SLOTS.length; i++) {
      const cur = state.hotbarAssignments[i];
      if (cur && cur.kind === kind && cur.id === id) {
        targetIdx = i;
        break;
      }
    }
    if (targetIdx === null) {
      for (let i = 4; i < HOTBAR_SLOTS.length; i++) {
        const cur = state.hotbarAssignments[i];
        if (!cur || getTotalItemCountInSlots(state.inventorySlots, cur.kind, cur.id) <= 0) {
          targetIdx = i;
          break;
        }
      }
    }
    if (targetIdx === null) targetIdx = 4;
  }

  state.hotbarAssignments[targetIdx] = { kind, id };
  state.selectedSlot = targetIdx;
  renderHotbar();
  saveGame();
  const meta = getItemMeta(kind, id);
  showToast(`Assigned ${meta ? meta.name : id} to hotbar [${HOTBAR_SLOTS[targetIdx].key}]!`);
}

export function renderInventoryModal() {
  const state = gameStore.state;
  const used = state.inventorySlots.filter(Boolean).length;
  document.getElementById('inv-usage-label').textContent = `${used} / ${INVENTORY_CAPACITY} Slots Used`;

  const gridEl = document.getElementById('player-inventory-grid');
  gridEl.innerHTML = '';

  for (let i = 0; i < INVENTORY_CAPACITY; i++) {
    const slot = state.inventorySlots[i];
    const cell = document.createElement('div');
    cell.className = `inv-cell ${slot ? '' : 'empty'} ${selectedInvSlotIdx === i ? 'selected' : ''}`;

    if (slot) {
      const meta = getItemMeta(slot.kind, slot.id);
      cell.innerHTML = `
        <span class="inv-cell-idx">${i + 1}</span>
        <span class="inv-cell-icon">${meta ? meta.icon : '📦'}</span>
        <span class="inv-cell-name">${meta ? meta.shortLabel : slot.id}</span>
        <span class="inv-cell-tag">${meta ? meta.category : slot.kind}</span>
        <span class="inv-cell-qty">×${slot.count}</span>
      `;
    } else {
      cell.innerHTML = `
        <span class="inv-cell-idx">${i + 1}</span>
        <span class="inv-cell-icon" style="opacity:0.35;">·</span>
        <span class="inv-cell-name" style="opacity:0.55;">Empty</span>
      `;
    }

    cell.onclick = () => {
      selectedInvSlotIdx = i;
      renderInventoryModal();
    };
    gridEl.appendChild(cell);
  }

  const summaryEl = document.getElementById('inv-selected-summary');
  const actionsEl = document.getElementById('inv-selected-actions');
  actionsEl.innerHTML = '';

  const cur = state.inventorySlots[selectedInvSlotIdx];
  if (!cur) {
    summaryEl.textContent = `Slot #${selectedInvSlotIdx + 1} is empty.`;
    return;
  }

  const meta = getItemMeta(cur.kind, cur.id);
  summaryEl.innerHTML = `${meta.icon} <b>${meta.name}</b> (${meta.category}) · Stack: <b>×${cur.count}</b>`;

  if (cur.kind === 'seed' || cur.kind === 'placeable') {
    const hotbarTarget = state.selectedSlot >= 4 ? state.selectedSlot : 4;
    const hotKey = HOTBAR_SLOTS[hotbarTarget].key;
    const btnSetSel = document.createElement('button');
    btnSetSel.className = 'cozy-btn primary';
    btnSetSel.textContent = `📌 Put on Hotbar [${hotKey}]`;
    btnSetSel.onclick = () => {
      assignItemToNextHotbarSlot(cur.kind, cur.id, hotbarTarget);
      renderInventoryModal();
    };
    actionsEl.appendChild(btnSetSel);

    const btnAutoHot = document.createElement('button');
    btnAutoHot.className = 'cozy-btn accent';
    btnAutoHot.textContent = '⚡ Quick-Equip';
    btnAutoHot.onclick = () => {
      assignItemToNextHotbarSlot(cur.kind, cur.id, null);
      renderInventoryModal();
    };
    actionsEl.appendChild(btnAutoHot);
  }

  if (selectedInvSlotIdx < INVENTORY_CAPACITY - 1) {
    const nextIdx = selectedInvSlotIdx + 1;
    const btnShift = document.createElement('button');
    btnShift.className = 'cozy-btn';
    btnShift.textContent = `⇄ Swap #${selectedInvSlotIdx + 1} ↔ #${nextIdx + 1}`;
    btnShift.onclick = () => {
      const tmp = state.inventorySlots[selectedInvSlotIdx];
      state.inventorySlots[selectedInvSlotIdx] = state.inventorySlots[nextIdx];
      state.inventorySlots[nextIdx] = tmp;
      selectedInvSlotIdx = nextIdx;
      saveGame();
      renderInventoryModal();
    };
    actionsEl.appendChild(btnShift);
  }
}

export function openInventoryModal() {
  if (selectedInvSlotIdx < 0 || selectedInvSlotIdx >= INVENTORY_CAPACITY) selectedInvSlotIdx = 0;
  renderInventoryModal();
  document.getElementById('inventory-modal').classList.add('open');
}

export function renderChestModal() {
  const state = gameStore.state;
  const chestUsed = state.chestSlots.filter(Boolean).length;
  const invUsed = state.inventorySlots.filter(Boolean).length;
  document.getElementById('chest-usage-label').textContent = `Chest: ${chestUsed}/${CHEST_CAPACITY} · Pack: ${invUsed}/${INVENTORY_CAPACITY}`;

  const chestGrid = document.getElementById('chest-storage-grid');
  const invGrid = document.getElementById('chest-inv-grid');
  const statusLine = document.getElementById('chest-status-line');
  chestGrid.innerHTML = '';
  invGrid.innerHTML = '';

  for (let i = 0; i < CHEST_CAPACITY; i++) {
    const slot = state.chestSlots[i];
    const cell = document.createElement('div');
    cell.className = `inv-cell ${slot ? '' : 'empty'} ${selectedChestSlotIdx === i ? 'selected' : ''}`;
    if (slot) {
      const meta = getItemMeta(slot.kind, slot.id);
      cell.innerHTML = `
        <span class="inv-cell-idx">${i + 1}</span>
        <span class="inv-cell-icon">${meta ? meta.icon : '📦'}</span>
        <span class="inv-cell-name">${meta ? meta.shortLabel : slot.id}</span>
        <span class="inv-cell-qty">×${slot.count}</span>
      `;
    } else {
      cell.innerHTML = `
        <span class="inv-cell-idx">${i + 1}</span>
        <span class="inv-cell-icon" style="opacity:0.35;">·</span>
        <span class="inv-cell-name" style="opacity:0.55;">Empty</span>
      `;
    }
    cell.onclick = () => {
      selectedChestSlotIdx = i;
      if (!slot) {
        renderChestModal();
        return;
      }
      const res = transferBetweenSlotArrays(state.chestSlots, i, state.inventorySlots, null);
      if (res.error) {
        audio.play('error');
        showToast(res.error);
      } else {
        audio.play('build');
        const meta = getItemMeta(res.kind, res.id);
        statusLine.textContent = `Withdrew ${res.moved}× ${meta ? meta.name : res.id} to your Inventory.`;
        saveGame();
        renderHotbar();
      }
      renderChestModal();
    };
    chestGrid.appendChild(cell);
  }

  for (let i = 0; i < INVENTORY_CAPACITY; i++) {
    const slot = state.inventorySlots[i];
    const cell = document.createElement('div');
    cell.className = `inv-cell ${slot ? '' : 'empty'} ${selectedInvSlotIdx === i ? 'selected' : ''}`;
    if (slot) {
      const meta = getItemMeta(slot.kind, slot.id);
      cell.innerHTML = `
        <span class="inv-cell-idx">${i + 1}</span>
        <span class="inv-cell-icon">${meta ? meta.icon : '📦'}</span>
        <span class="inv-cell-name">${meta ? meta.shortLabel : slot.id}</span>
        <span class="inv-cell-qty">×${slot.count}</span>
      `;
    } else {
      cell.innerHTML = `
        <span class="inv-cell-idx">${i + 1}</span>
        <span class="inv-cell-icon" style="opacity:0.35;">·</span>
        <span class="inv-cell-name" style="opacity:0.55;">Empty</span>
      `;
    }
    cell.onclick = () => {
      selectedInvSlotIdx = i;
      if (!slot) {
        renderChestModal();
        return;
      }
      const res = transferBetweenSlotArrays(state.inventorySlots, i, state.chestSlots, null);
      if (res.error) {
        audio.play('error');
        showToast(res.error);
      } else {
        audio.play('build');
        const meta = getItemMeta(res.kind, res.id);
        statusLine.textContent = `Deposited ${res.moved}× ${meta ? meta.name : res.id} into the Farmhouse Chest.`;
        saveGame();
        renderHotbar();
      }
      renderChestModal();
    };
    invGrid.appendChild(cell);
  }
}

export function openChestModal() {
  if (selectedChestSlotIdx < 0 || selectedChestSlotIdx >= CHEST_CAPACITY) selectedChestSlotIdx = 0;
  if (selectedInvSlotIdx < 0 || selectedInvSlotIdx >= INVENTORY_CAPACITY) selectedInvSlotIdx = 0;
  renderChestModal();
  document.getElementById('chest-modal').classList.add('open');
}
