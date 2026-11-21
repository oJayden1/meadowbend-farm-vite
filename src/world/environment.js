import * as THREE from 'three';
import { HALF_W, HALF_H, GRID_COLS, GRID_ROWS, TILE_SIZE } from '../data/constants.js';
import { gameStore } from '../state/saveSystem.js';
import { tileKey, gridToWorld, worldToGrid, inBounds, isReservedZone } from '../state/inventory.js';
import {
  toonGradient,
  toonMat,
  applyWindSway,
  createMeadowTexture,
  createWaterTexture
} from './textures.js';

export function buildEnvironment(scene) {
  const groundGeo = new THREE.PlaneGeometry(180, 180);
  const groundMat = new THREE.MeshToonMaterial({
    map: createMeadowTexture(),
    gradientMap: toonGradient
  });
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.receiveShadow = true;
  scene.add(groundMesh);

  const borderMat = toonMat(0xb8b2a6);
  const borderGeo = new THREE.DodecahedronGeometry(0.45, 0);
  for (let x = -HALF_W - 0.8; x <= HALF_W + 0.8; x += 2.2) {
    [-HALF_H - 0.8, HALF_H + 0.8].forEach((z, idx) => {
      if (idx === 1 && x > HALF_W - 12) return;
      const stone = new THREE.Mesh(borderGeo, borderMat);
      stone.position.set(x, 0.15, z);
      stone.scale.set(1.2, 0.55, 1.1);
      stone.rotation.y = x * 0.7;
      stone.receiveShadow = true;
      stone.castShadow = true;
      scene.add(stone);
    });
  }
  for (let z = -HALF_H - 0.8; z <= HALF_H + 0.8; z += 2.2) {
    [-HALF_W - 0.8, HALF_W + 0.8].forEach((x, idx) => {
      if (idx === 1 && z > HALF_H - 11) return;
      const stone = new THREE.Mesh(borderGeo, borderMat);
      stone.position.set(x, 0.15, z);
      stone.scale.set(1.1, 0.55, 1.2);
      stone.rotation.y = z * 0.7;
      stone.receiveShadow = true;
      stone.castShadow = true;
      scene.add(stone);
    });
  }

  const pathGeo = new THREE.PlaneGeometry(24 * TILE_SIZE, 2 * TILE_SIZE);
  const pathMat = toonMat(0xe3c798);
  const pathMesh = new THREE.Mesh(pathGeo, pathMat);
  pathMesh.rotation.x = -Math.PI / 2;
  pathMesh.position.set(0, 0.012, (-GRID_ROWS / 2 + 5.5) * TILE_SIZE);
  pathMesh.receiveShadow = true;
  scene.add(pathMesh);

  // Brook
  const brookGroup = new THREE.Group();
  const brookCenterX = HALF_W - 2.5;
  const brookCenterZ = HALF_H - 2.5;
  const brookRadius = 9.5;

  const foamGeo = new THREE.RingGeometry(brookRadius - 0.45, brookRadius + 0.15, 32);
  const foamMat = new THREE.MeshBasicMaterial({ color: 0xdff8ff, side: THREE.DoubleSide, transparent: true, opacity: 0.75 });
  const foamMesh = new THREE.Mesh(foamGeo, foamMat);
  foamMesh.rotation.x = -Math.PI / 2;
  foamMesh.position.set(brookCenterX, 0.018, brookCenterZ);
  brookGroup.add(foamMesh);

  const waterTex = createWaterTexture();
  const waterGeo = new THREE.CircleGeometry(brookRadius, 32);
  const waterMat = new THREE.MeshToonMaterial({
    map: waterTex,
    gradientMap: toonGradient
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.set(brookCenterX, 0.025, brookCenterZ);
  waterMesh.receiveShadow = true;
  brookGroup.add(waterMesh);

  const reedMat = toonMat(0x4e9c42);
  applyWindSway(reedMat, 0.18);
  const reedGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.85, 5);
  for (let a = Math.PI * 0.95; a <= Math.PI * 1.55; a += 0.08) {
    const px = brookCenterX + Math.cos(a) * (brookRadius + 0.1);
    const pz = brookCenterZ + Math.sin(a) * (brookRadius + 0.1);
    const peb = new THREE.Mesh(borderGeo, toonMat(0x9aa3ab));
    peb.position.set(px, 0.14, pz);
    peb.scale.set(1.15, 0.5, 0.95);
    peb.receiveShadow = true;
    brookGroup.add(peb);

    if (Math.round(a * 20) % 2 === 0) {
      const reed = new THREE.Mesh(reedGeo, reedMat);
      reed.position.set(px - 0.25, 0.4, pz - 0.25);
      brookGroup.add(reed);
    }
  }
  scene.add(brookGroup);

  // Rolling Hills
  const hillMat = toonMat(0x6ab85c);
  const hillGeo = new THREE.SphereGeometry(14, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
  const hillCoords = [
    [-48, -48, 1.3], [-16, -52, 1.4], [18, -52, 1.4], [50, -48, 1.3],
    [-56, -12, 1.4], [-54, 24, 1.3], [56, -10, 1.3], [54, 26, 1.2],
    [-36, 48, 1.4], [4, 52, 1.3], [38, 48, 1.2]
  ];
  hillCoords.forEach(([hx, hz, hs]) => {
    const hill = new THREE.Mesh(hillGeo, hillMat);
    hill.position.set(hx, -1.5, hz);
    hill.scale.set(hs * 1.3, hs * 0.52, hs * 1.3);
    hill.receiveShadow = true;
    scene.add(hill);
  });

  // Instanced 3D Grass
  const GRASS_PER_TILE = 7;
  const MAX_GRASS = GRID_COLS * GRID_ROWS * GRASS_PER_TILE + 1200;

  function createGrassTuftGeo() {
    const shape = new THREE.Shape();
    shape.moveTo(-0.04, 0);
    shape.lineTo(0.04, 0);
    shape.lineTo(0.0, 0.36);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.01, bevelEnabled: false });
  }

  const grassBladeGeo = createGrassTuftGeo();
  const grassBladeMat = toonMat(0x73c45c);
  applyWindSway(grassBladeMat, 0.22);

  const grassInstanced = new THREE.InstancedMesh(grassBladeGeo, grassBladeMat, MAX_GRASS);
  grassInstanced.receiveShadow = true;
  scene.add(grassInstanced);

  const grassSlotMeta = [];
  const grassColors = [new THREE.Color(0x6ec257), new THREE.Color(0x84d468), new THREE.Color(0x5db048), new THREE.Color(0x98de78)];

  let grassIdx = 0;
  for (let r = 0; r < GRID_ROWS; r++) {
    for (let c = 0; c < GRID_COLS; c++) {
      const zone = isReservedZone(c, r);
      if (zone === 'water' || zone === 'cabin' || zone === 'shop' || zone === 'bin' || zone === 'path' || zone === 'spawn') continue;
      const base = gridToWorld(c, r);
      for (let k = 0; k < GRASS_PER_TILE; k++) {
        const ox = (Math.sin(c * 31 + r * 17 + k * 7) * 0.5) * (TILE_SIZE * 0.85);
        const oz = (Math.cos(c * 19 + r * 43 + k * 11) * 0.5) * (TILE_SIZE * 0.85);
        const scale = 0.75 + ((c + r + k) % 5) * 0.14;
        const rotY = (c * 1.3 + r * 2.1 + k) % (Math.PI * 2);
        grassSlotMeta.push({ c, r, x: base.x + ox, z: base.z + oz, rotY, scale });
        grassInstanced.setColorAt(grassIdx, grassColors[(c + r + k) % grassColors.length]);
        grassIdx++;
      }
    }
  }
  for (let i = 0; i < 1100 && grassIdx < MAX_GRASS; i++) {
    const angle = i * 2.39996;
    const distFactor = (i % 18) * 1.2;
    const gx = Math.cos(angle) * (HALF_W + 3.2 + distFactor);
    const gz = Math.sin(angle) * (HALF_H + 3.2 + distFactor);
    if (Math.abs(gx) <= HALF_W + 2.2 && Math.abs(gz) <= HALF_H + 2.2) continue;
    grassSlotMeta.push({ c: -1, r: -1, x: gx, z: gz, rotY: angle, scale: 0.9 + (i % 4) * 0.18 });
    grassInstanced.setColorAt(grassIdx, grassColors[i % grassColors.length]);
    grassIdx++;
  }
  grassInstanced.count = grassIdx;
  if (grassInstanced.instanceColor) grassInstanced.instanceColor.needsUpdate = true;

  const dummyObj = new THREE.Object3D();
  function refreshGrassInstances() {
    for (let i = 0; i < grassSlotMeta.length; i++) {
      const m = grassSlotMeta[i];
      let hidden = false;
      if (m.c >= 0 && m.r >= 0) {
        const td = gameStore.state.tiles[tileKey(m.c, m.r)];
        if (td && (td.state === 'tilled' || td.obstacle === 'rock' || td.structure)) {
          hidden = true;
        }
      }
      dummyObj.position.set(m.x, 0, m.z);
      dummyObj.rotation.set(0, m.rotY, 0);
      const s = hidden ? 0.0001 : m.scale;
      dummyObj.scale.set(s, s, s);
      dummyObj.updateMatrix();
      grassInstanced.setMatrixAt(i, dummyObj.matrix);
    }
    grassInstanced.instanceMatrix.needsUpdate = true;
  }

  // Wildflowers
  const flowerGroup = new THREE.Group();
  const stemMat = toonMat(0x529e42);
  applyWindSway(stemMat, 0.16);
  const petalColors = [0xfff59d, 0xffab91, 0xce93d8, 0x81d4fa, 0xffffff];
  const petalMats = petalColors.map(col => {
    const mat = toonMat(col);
    applyWindSway(mat, 0.16);
    return mat;
  });
  const stemGeo = new THREE.CylinderGeometry(0.02, 0.025, 0.28, 5);
  const headGeo = new THREE.DodecahedronGeometry(0.08, 0);

  for (let i = 0; i < 85; i++) {
    const angle = i * 1.73;
    const dist = 6 + (i * 0.37) % 26;
    const fx = Math.cos(angle) * dist;
    const fz = Math.sin(angle) * dist;
    if (Math.hypot(fx, fz) < 3.6) continue;
    const g = worldToGrid(fx, fz);
    if (inBounds(g.c, g.r) && isReservedZone(g.c, g.r)) continue;

    const cluster = new THREE.Group();
    cluster.position.set(fx, 0, fz);
    const pMat = petalMats[i % petalMats.length];
    for (let b = 0; b < 3; b++) {
      const stem = new THREE.Mesh(stemGeo, stemMat);
      stem.position.set((b - 1) * 0.12, 0.14, (b % 2) * 0.1);
      const head = new THREE.Mesh(headGeo, pMat);
      head.position.set((b - 1) * 0.12, 0.29, (b % 2) * 0.1);
      cluster.add(stem, head);
    }
    flowerGroup.add(cluster);
  }
  scene.add(flowerGroup);

  // Stylized Trees
  const pineMatShared = toonMat(0x3f8f54);
  applyWindSway(pineMatShared, 0.07);
  const oakMatShared = toonMat(0x58ab4b);
  applyWindSway(oakMatShared, 0.08);
  const blossomMatShared = toonMat(0xf7a8c4);
  applyWindSway(blossomMatShared, 0.08);
  const trunkMatShared = toonMat(0x7c5334);

  function createStylizedTree(type = 'oak') {
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.38, 1.8, 7), trunkMatShared);
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    tree.add(trunk);

    if (type === 'pine') {
      [1.7, 2.5, 3.2].forEach((py, idx) => {
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.35 - idx * 0.28, 1.4, 8), pineMatShared);
        cone.position.y = py;
        cone.castShadow = true;
        cone.receiveShadow = true;
        tree.add(cone);
      });
    } else {
      const canopyMat = type === 'blossom' ? blossomMatShared : oakMatShared;
      const puffs = [
        [0, 2.4, 0, 1.35],
        [-0.75, 2.05, 0.45, 0.95],
        [0.75, 2.1, -0.35, 1.0],
        [0.1, 2.95, 0.25, 0.92]
      ];
      puffs.forEach(([px, py, pz, pr]) => {
        const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(pr, 1), canopyMat);
        puff.position.set(px, py, pz);
        puff.castShadow = true;
        puff.receiveShadow = true;
        tree.add(puff);
      });
    }
    return tree;
  }

  const treeTypes = ['oak', 'oak', 'pine', 'blossom'];
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2 + 0.08;
    const rx = HALF_W + 6.5 + (i % 3) * 2.6;
    const rz = HALF_H + 6.5 + ((i + 1) % 3) * 2.6;
    const tx = Math.cos(a) * rx;
    const tz = Math.sin(a) * rz;
    const tree = createStylizedTree(treeTypes[i % treeTypes.length]);
    tree.position.set(tx, 0, tz);
    const sc = 0.9 + (i % 4) * 0.16;
    tree.scale.set(sc, sc, sc);
    scene.add(tree);
  }

  return {
    waterTex,
    brookCenterX,
    brookCenterZ,
    brookRadius,
    refreshGrassInstances
  };
}
