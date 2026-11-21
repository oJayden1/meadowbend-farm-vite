import { HOTBAR_SLOTS } from '../data/constants.js';
import { getItemMeta } from '../data/crops.js';
import { gameStore, getMaxWaterCharges } from '../state/saveSystem.js';
import { getTotalItemCountInSlots } from '../state/inventory.js';

export function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  const container = document.getElementById('toast-container');
  if (container) container.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

export function formatClockString(timeFraction) {
  const totalHours = (6 + timeFraction * 24) % 24;
  const hrs24 = Math.floor(totalHours);
  const mins = Math.floor((totalHours - hrs24) * 60);
  const ampm = hrs24 >= 12 ? 'PM' : 'AM';
  const hrs12 = hrs24 % 12 === 0 ? 12 : hrs24 % 12;
  return `${String(hrs12).padStart(2, '0')}:${String(mins).padStart(2, '0')} ${ampm}`;
}

export function resolveHotbarSlot(slotIdx) {
  const state = gameStore.state;
  const def = HOTBAR_SLOTS[slotIdx] || HOTBAR_SLOTS[0];
  if (!def.assignable) {
    return {
      key: def.key,
      type: def.fixedType,
      id: def.fixedId,
      label: def.defaultLabel,
      icon: def.defaultIcon,
      assignable: false
    };
  }

  let assigned = state.hotbarAssignments[slotIdx];
  if (!assigned || !getItemMeta(assigned.kind, assigned.id)) {
    assigned = def.defaultItem ? { ...def.defaultItem } : null;
    if (assigned) state.hotbarAssignments[slotIdx] = assigned;
  }

  if (assigned) {
    const meta = getItemMeta(assigned.kind, assigned.id);
    if (meta) {
      return {
        key: def.key,
        type: meta.kind,
        id: meta.id,
        label: meta.shortLabel,
        icon: meta.icon,
        assignable: true
      };
    }
  }

  return {
    key: def.key,
    type: 'empty',
    id: null,
    label: 'Empty',
    icon: '➕',
    assignable: true
  };
}

export function renderHotbar() {
  const state = gameStore.state;
  const hb = document.getElementById('hotbar');
  if (!hb) return;
  hb.innerHTML = '';
  const maxW = getMaxWaterCharges();
  HOTBAR_SLOTS.forEach((_slotDef, idx) => {
    const resolved = resolveHotbarSlot(idx);
    const el = document.createElement('div');
    el.className = `slot ${state.selectedSlot === idx ? 'active' : ''}`;
    let countBadge = '';
    if (resolved.type === 'tool' && resolved.id === 'water') {
      const emptyCls = state.waterCharges <= 0 ? 'water-empty' : 'water-badge';
      countBadge = `<span class="slot-count ${emptyCls}">${state.waterCharges}/${maxW}</span>`;
    } else if (resolved.type === 'seed' || resolved.type === 'crop' || resolved.type === 'placeable') {
      const qty = getTotalItemCountInSlots(state.inventorySlots, resolved.type, resolved.id);
      countBadge = `<span class="slot-count">${qty}</span>`;
    }
    el.innerHTML = `
      <span class="slot-key">${resolved.key}</span>
      <span class="slot-icon">${resolved.icon}</span>
      <span class="slot-label">${resolved.label}</span>
      ${countBadge}
    `;
    el.onclick = () => {
      state.selectedSlot = idx;
      renderHotbar();
    };
    hb.appendChild(el);
  });
}

export function updateHUD(playerLocation = 'exterior') {
  const state = gameStore.state;
  const locEl = document.getElementById('hud-location');
  if (locEl) {
    if (playerLocation === 'shop_interior') {
      locEl.textContent = "🏪 Pip's Shop (Inside)";
    } else if (playerLocation === 'house_interior') {
      locEl.textContent = '🏡 Farmhouse (Inside)';
    } else {
      locEl.textContent = '🌾 Meadowbend Farm';
    }
  }

  document.getElementById('hud-day').textContent = state.day;
  document.getElementById('hud-coins').textContent = state.coins;
  document.getElementById('hud-weather').textContent = state.weather === 'rainy' ? '🌧️ Rainy' : '☀️ Sunny';
  document.getElementById('hud-time').textContent = formatClockString(state.timeOfDay);
  document.getElementById('hud-phase').textContent = state.timeOfDay < 0.5 ? 'Day' : 'Night';
}
