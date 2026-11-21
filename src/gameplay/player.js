import * as THREE from 'three';
import {
  SPAWN_POS,
  HALF_W,
  HALF_H,
  TILE_SIZE,
  SHOP_ROOM,
  HOUSE_ROOM
} from '../data/constants.js';
import { gameStore } from '../state/saveSystem.js';
import { tileKey, worldToGrid, inBounds, isReservedZone } from '../state/inventory.js';
import { toonMat } from '../world/textures.js';

export function createPlayerController(scene, worldRefs) {
  const {
    exteriorZones,
    exteriorSolidBoxes,
    shopInteriorSolidBoxes,
    houseInteriorSolidBoxes
  } = worldRefs;

  const player = {
    location: 'exterior',
    x: SPAWN_POS.x,
    y: 0,
    z: SPAWN_POS.z,
    rotY: 0,
    walkCycle: 0,
    swingTimer: 0,
    transitionLock: 0
  };

  const playerGroup = new THREE.Group();
  const overallsMat = toonMat(0x4b7bec);
  const skinMat = toonMat(0xffdbac);
  const hatMat = toonMat(0xf3d285);
  const ribbonMat = toonMat(0xeb4d4b);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2b1d12 });

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.78, 10), overallsMat);
  torso.position.y = 0.65;
  torso.castShadow = true;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 12), skinMat);
  head.position.y = 1.28;
  head.castShadow = true;

  const hatBrim = new THREE.Mesh(new THREE.CylinderGeometry(0.64, 0.68, 0.08, 14), hatMat);
  hatBrim.position.y = 1.52;
  hatBrim.castShadow = true;

  const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.4, 0.3, 12), hatMat);
  hatCrown.position.y = 1.68;
  hatCrown.castShadow = true;

  const hatRibbon = new THREE.Mesh(new THREE.CylinderGeometry(0.41, 0.41, 0.07, 12), ribbonMat);
  hatRibbon.position.y = 1.57;

  const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
  eyeL.position.set(-0.12, 1.3, 0.33);
  const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
  eyeR.position.set(0.12, 1.3, 0.33);

  const leftFoot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), toonMat(0x6e472b));
  leftFoot.position.set(-0.16, 0.14, 0);
  const rightFoot = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), toonMat(0x6e472b));
  rightFoot.position.set(0.16, 0.14, 0);

  playerGroup.add(torso, head, hatBrim, hatCrown, hatRibbon, eyeL, eyeR, leftFoot, rightFoot);
  playerGroup.position.set(player.x, player.y, player.z);
  scene.add(playerGroup);

  const cursorGeo = new THREE.RingGeometry(TILE_SIZE * 0.36, TILE_SIZE * 0.46, 4);
  const cursorMat = new THREE.MeshBasicMaterial({ color: 0xfff3b0, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
  const tileCursor = new THREE.Mesh(cursorGeo, cursorMat);
  tileCursor.rotation.x = -Math.PI / 2;
  tileCursor.rotation.z = Math.PI / 4;
  tileCursor.position.y = 0.04;
  scene.add(tileCursor);

  const particles = [];
  const partGeo = new THREE.DodecahedronGeometry(0.09, 0);

  function spawnBurst(x, y, z, color, count = 8) {
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(partGeo, mat);
      m.position.set(x, y, z);
      scene.add(m);
      const a = Math.random() * Math.PI * 2;
      const spd = 1.2 + Math.random() * 2.2;
      particles.push({
        mesh: m,
        vx: Math.cos(a) * spd,
        vy: 2.2 + Math.random() * 2.4,
        vz: Math.sin(a) * spd,
        life: 0.45 + Math.random() * 0.25
      });
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        scene.remove(p.mesh);
        particles.splice(i, 1);
      } else {
        p.vy -= 9.8 * dt;
        p.mesh.position.x += p.vx * dt;
        p.mesh.position.y += p.vy * dt;
        p.mesh.position.z += p.vz * dt;
        p.mesh.scale.setScalar(Math.max(0.01, p.life * 1.5));
      }
    }
  }

  function isPositionBlocked(nx, nz) {
    const margin = 0.36;

    if (player.location === 'shop_interior') {
      const minX = SHOP_ROOM.cx - SHOP_ROOM.halfW + margin;
      const maxX = SHOP_ROOM.cx + SHOP_ROOM.halfW - margin;
      const minZ = SHOP_ROOM.cz - SHOP_ROOM.halfD + margin;
      const maxZ = SHOP_ROOM.cz + SHOP_ROOM.halfD - margin;
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) return true;
      for (const b of shopInteriorSolidBoxes) {
        if (nx + margin > b.minX && nx - margin < b.maxX && nz + margin > b.minZ && nz - margin < b.maxZ) {
          return true;
        }
      }
      return false;
    }

    if (player.location === 'house_interior') {
      const minX = HOUSE_ROOM.cx - HOUSE_ROOM.halfW + margin;
      const maxX = HOUSE_ROOM.cx + HOUSE_ROOM.halfW - margin;
      const minZ = HOUSE_ROOM.cz - HOUSE_ROOM.halfD + margin;
      const maxZ = HOUSE_ROOM.cz + HOUSE_ROOM.halfD - margin;
      if (nx < minX || nx > maxX || nz < minZ || nz > maxZ) return true;
      for (const b of houseInteriorSolidBoxes) {
        if (nx + margin > b.minX && nx - margin < b.maxX && nz + margin > b.minZ && nz - margin < b.maxZ) {
          return true;
        }
      }
      return false;
    }

    if (nx < -HALF_W + 0.5 || nx > HALF_W - 0.5 || nz < -HALF_H + 0.5 || nz > HALF_H - 0.5) return true;

    for (const b of exteriorSolidBoxes) {
      if (nx + margin > b.minX && nx - margin < b.maxX && nz + margin > b.minZ && nz - margin < b.maxZ) {
        return true;
      }
    }

    const { c, r } = worldToGrid(nx, nz);
    if (!inBounds(c, r)) return true;

    const res = isReservedZone(c, r);
    if (res === 'water') return true;

    const td = gameStore.state.tiles[tileKey(c, r)];
    if (td) {
      if (td.obstacle === 'rock') return true;
      if (td.structure === 'fence') return true;
    }
    return false;
  }

  function getNearbyZone() {
    for (const z of exteriorZones) {
      const dist = Math.hypot(player.x - z.x, player.z - z.z);
      if (dist <= z.radius) return z;
    }
    return null;
  }

  function getInteriorInteraction() {
    if (player.location === 'shop_interior') {
      const distExit = Math.hypot(player.x - SHOP_ROOM.exitX, player.z - SHOP_ROOM.exitZ);
      if (distExit <= SHOP_ROOM.exitRadius) {
        return { type: 'exit_shop', hint: '🚪 Press [E] to step outside to Meadowbend Farm' };
      }
      const distNpc = Math.hypot(player.x - SHOP_ROOM.npcX, player.z - (SHOP_ROOM.npcZ + 1.1));
      if (distNpc <= SHOP_ROOM.npcInteractRadius) {
        return { type: 'talk_pip', hint: '🧑🌾 Press [E] or Click to talk with Pip (Buy & Sell)' };
      }
    } else if (player.location === 'house_interior') {
      const distExit = Math.hypot(player.x - HOUSE_ROOM.exitX, player.z - HOUSE_ROOM.exitZ);
      if (distExit <= HOUSE_ROOM.exitRadius) {
        return { type: 'exit_house', hint: '🚪 Press [E] to step outside to Meadowbend Farm' };
      }
      const distBed = Math.hypot(player.x - HOUSE_ROOM.bedX, player.z - (HOUSE_ROOM.bedZ + 1.2));
      if (distBed <= HOUSE_ROOM.bedInteractRadius) {
        return { type: 'use_bed', hint: '🛏️ Press [E] or Click to rest until Noon, Night, or Morning' };
      }
      const distChest = Math.hypot(player.x - HOUSE_ROOM.chestX, player.z - (HOUSE_ROOM.chestZ + 0.75));
      if (distChest <= HOUSE_ROOM.chestInteractRadius) {
        return { type: 'use_chest', hint: '🧰 Press [E] or Click to open 24-Slot Farmhouse Chest' };
      }
      const distDesk = Math.hypot(player.x - HOUSE_ROOM.deskX, player.z - (HOUSE_ROOM.deskZ + 0.75));
      if (distDesk <= HOUSE_ROOM.deskInteractRadius) {
        return { type: 'use_desk', hint: '📜 Press [E] or Click to check Farm Ledger & Saves' };
      }
    }
    return null;
  }

  function getTargetTile() {
    const reach = 1.15;
    const tx = player.x + Math.sin(player.rotY) * reach;
    const tz = player.z + Math.cos(player.rotY) * reach;
    return worldToGrid(tx, tz);
  }

  function getForwardStepTile(c, r) {
    const stepC = Math.round(Math.sin(player.rotY));
    const stepR = Math.round(Math.cos(player.rotY));
    return { c: c + stepC, r: r + stepR };
  }

  function updateMovement(keys, blocked, dt) {
    let mx = 0;
    let mz = 0;
    if (!blocked && player.transitionLock <= 0) {
      if (keys['KeyW'] || keys['ArrowUp']) mz -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) mz += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) mx += 1;
    }

    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      const moveSpeed = gameStore.state.upgrades.swiftBoots ? 7.6 : 5.8;
      const nx = player.x + mx * moveSpeed * dt;
      const nz = player.z + mz * moveSpeed * dt;

      if (!isPositionBlocked(nx, player.z)) player.x = nx;
      if (!isPositionBlocked(player.x, nz)) player.z = nz;

      const targetRot = Math.atan2(mx, mz);
      let diff = targetRot - player.rotY;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      player.rotY += diff * Math.min(1, dt * 14);

      player.walkCycle += dt * 13;
      playerGroup.position.y = player.y + Math.abs(Math.sin(player.walkCycle)) * 0.14;
      leftFoot.position.z = Math.sin(player.walkCycle) * 0.18;
      rightFoot.position.z = -Math.sin(player.walkCycle) * 0.18;
    } else {
      playerGroup.position.y += (player.y - playerGroup.position.y) * Math.min(1, dt * 12);
      leftFoot.position.z *= 0.8;
      rightFoot.position.z *= 0.8;
    }

    if (player.swingTimer > 0) {
      player.swingTimer -= dt;
      torso.rotation.x = Math.sin((player.swingTimer / 0.22) * Math.PI) * 0.35;
    } else {
      torso.rotation.x = 0;
    }

    playerGroup.position.x = player.x;
    playerGroup.position.z = player.z;
    playerGroup.rotation.y = player.rotY;
  }

  return {
    player,
    playerGroup,
    tileCursor,
    spawnBurst,
    updateParticles,
    isPositionBlocked,
    getNearbyZone,
    getInteriorInteraction,
    getTargetTile,
    getForwardStepTile,
    updateMovement
  };
}
