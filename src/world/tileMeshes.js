import * as THREE from 'three';
import { TILE_SIZE, GRID_COLS, GRID_ROWS } from '../data/constants.js';
import { CROPS } from '../data/crops.js';
import { gameStore } from '../state/saveSystem.js';
import { tileKey, gridToWorld, inBounds } from '../state/inventory.js';
import { toonGradient, toonMat, applyWindSway, createSoilTexture } from './textures.js';

export function createTileMeshManager(scene, refreshGrassInstances) {
  const tileMeshes = new Map();

  const drySoilTex = createSoilTexture(false);
  const wetSoilTex = createSoilTexture(true);

  const drySoilMat = new THREE.MeshToonMaterial({
    map: drySoilTex,
    gradientMap: toonGradient
  });
  const wetSoilMat = new THREE.MeshToonMaterial({
    map: wetSoilTex,
    gradientMap: toonGradient
  });

  const soilBaseGeo = new THREE.BoxGeometry(TILE_SIZE * 0.92, 0.13, TILE_SIZE * 0.92);
  const furrowRidgeGeo = new THREE.BoxGeometry(TILE_SIZE * 0.84, 0.05, 0.16);

  function createTilledSoilMesh(isWatered) {
    const mat = isWatered ? wetSoilMat : drySoilMat;
    const group = new THREE.Group();
    const base = new THREE.Mesh(soilBaseGeo, mat);
    base.position.y = 0.065;
    base.receiveShadow = true;
    group.add(base);

    [-0.42, 0, 0.42].forEach(rz => {
      const ridge = new THREE.Mesh(furrowRidgeGeo, mat);
      ridge.position.set(0, 0.135, rz);
      ridge.receiveShadow = true;
      group.add(ridge);
    });
    return group;
  }

  const rockMat = toonMat(0x9299a1);
  const mossMat = toonMat(0x5fa854);
  const weedMat = toonMat(0x4c8c3b);
  applyWindSway(weedMat, 0.15);

  const woodPostMat = toonMat(0xb57b45);
  const woodRailMat = toonMat(0xc98d55);
  const gateMat = toonMat(0xe0a96d);

  function createRockMesh() {
    const g = new THREE.Group();
    const main = new THREE.Mesh(new THREE.DodecahedronGeometry(0.52, 0), rockMat);
    main.position.y = 0.34;
    main.scale.set(1.15, 0.85, 1.0);
    main.castShadow = true;
    main.receiveShadow = true;
    const sub = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), rockMat);
    sub.position.set(0.36, 0.2, 0.24);
    sub.castShadow = true;
    const moss = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.4), mossMat);
    moss.position.set(-0.08, 0.56, -0.05);
    g.add(main, sub, moss);
    return g;
  }

  function createWeedMesh() {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const blade = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.65, 5), weedMat);
      blade.position.set(Math.cos(a) * 0.22, 0.3, Math.sin(a) * 0.22);
      blade.rotation.z = Math.cos(a) * 0.35;
      blade.rotation.x = Math.sin(a) * 0.35;
      blade.castShadow = true;
      g.add(blade);
    }
    return g;
  }

  function createCropMesh(cropId, stage) {
    const cfg = CROPS[cropId];
    const g = new THREE.Group();
    const leafMat = toonMat(cfg.accent || 0x52a847);
    const greenStemMat = toonMat(0x52a847);
    const cropMat = toonMat(cfg.color);

    if (stage === 0) {
      for (let i = -1; i <= 1; i += 2) {
        const seed = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), toonMat(0xd9b37c));
        seed.position.set(i * 0.18, 0.16, i * 0.12);
        g.add(seed);
      }
      return g;
    }

    if (stage === 1) {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.34, 6), greenStemMat);
      stem.position.y = 0.27;
      const l1 = new THREE.Mesh(new THREE.SphereGeometry(0.15, 7, 6), leafMat);
      l1.scale.set(1.35, 0.5, 0.85);
      l1.position.set(0.12, 0.38, 0);
      const l2 = new THREE.Mesh(new THREE.SphereGeometry(0.13, 7, 6), greenStemMat);
      l2.scale.set(1.25, 0.5, 0.85);
      l2.position.set(-0.11, 0.34, 0.06);
      g.add(stem, l1, l2);
      return g;
    }

    if (stage === 2) {
      if (cfg.archetype === 'stalk' || cfg.archetype === 'tall_flower' || cfg.archetype === 'spike_flower') {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 0.72, 6), greenStemMat);
        stalk.position.y = 0.48;
        stalk.castShadow = true;
        const midLeaf = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.14), leafMat);
        midLeaf.position.set(0.16, 0.52, 0);
        midLeaf.rotation.z = -0.35;
        g.add(stalk, midLeaf);
      } else {
        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.33, 1), leafMat);
        bush.position.y = 0.41;
        bush.castShadow = true;
        g.add(bush);
      }
      return g;
    }

    switch (cfg.archetype) {
      case 'gourd': {
        const isSquash = cropId === 'squash';
        const body = new THREE.Mesh(
          new THREE.SphereGeometry(isSquash ? 0.45 : 0.41, 12, 10),
          cropMat
        );
        body.scale.set(isSquash ? 1.25 : 1.15, isSquash ? 0.78 : 0.86, isSquash ? 1.1 : 1.15);
        body.position.y = 0.43;
        body.castShadow = true;
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.22, 6), greenStemMat);
        cap.position.y = 0.78;
        g.add(body, cap);
        break;
      }
      case 'tall_flower': {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.05, 6), greenStemMat);
        stalk.position.y = 0.62;
        stalk.castShadow = true;
        const petals = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.1, 12), cropMat);
        petals.rotation.x = Math.PI / 2.4;
        petals.position.set(0, 1.14, 0.1);
        const center = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), toonMat(cfg.accent));
        center.position.set(0, 1.14, 0.14);
        g.add(stalk, petals, center);
        break;
      }
      case 'stalk': {
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.18, 7), greenStemMat);
        stalk.position.y = 0.7;
        stalk.castShadow = true;
        [-0.22, 0.22].forEach((ox, idx) => {
          const cob = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.36, 8), cropMat);
          cob.position.set(ox, 0.68 + idx * 0.16, 0.08);
          cob.rotation.z = idx === 0 ? 0.42 : -0.42;
          cob.castShadow = true;
          g.add(cob);
        });
        const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.28, 6), cropMat);
        tassel.position.y = 1.38;
        g.add(stalk, tassel);
        break;
      }
      case 'rosette': {
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.26, 8, 6), i % 2 === 0 ? cropMat : leafMat);
          leaf.scale.set(1.1, 0.35, 0.85);
          leaf.position.set(Math.cos(a) * 0.2, 0.24, Math.sin(a) * 0.2);
          leaf.rotation.y = -a;
          leaf.rotation.z = -0.35;
          leaf.castShadow = true;
          g.add(leaf);
        }
        const heart = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 7), cropMat);
        heart.scale.set(1, 0.7, 1);
        heart.position.y = 0.32;
        g.add(heart);
        break;
      }
      case 'spike_flower': {
        [-0.18, 0, 0.18].forEach((sx, idx) => {
          const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.78, 5), greenStemMat);
          stem.position.set(sx, 0.48, (idx - 1) * 0.12);
          const spike = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.36, 7), cropMat);
          spike.position.set(sx, 0.92, (idx - 1) * 0.12);
          spike.castShadow = true;
          g.add(stem, spike);
        });
        break;
      }
      case 'bell_flower': {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.82, 6), greenStemMat);
        stem.position.y = 0.5;
        stem.castShadow = true;
        g.add(stem);
        [[-0.22, 0.76, 0.06], [0.22, 0.82, -0.06], [0, 1.02, 0.08]].forEach(([bx, by, bz]) => {
          const bell = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.24, 8), cropMat);
          bell.rotation.x = Math.PI;
          bell.position.set(bx, by, bz);
          bell.castShadow = true;
          const tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), toonMat(cfg.accent));
          tip.position.set(bx, by - 0.11, bz);
          g.add(bell, tip);
        });
        break;
      }
      case 'star': {
        const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.68, 6), greenStemMat);
        stem.position.y = 0.44;
        g.add(stem);
        const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.32, 0), cropMat);
        star.scale.set(1.25, 0.75, 1.25);
        star.position.y = 0.84;
        star.castShadow = true;
        g.add(star);
        break;
      }
      case 'vine_pod': {
        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 1), greenStemMat);
        bush.position.y = 0.44;
        bush.castShadow = true;
        g.add(bush);
        [[-0.24, 0.44, 0.2], [0.25, 0.5, 0.18], [0.05, 0.62, -0.22]].forEach(([px, py, pz]) => {
          const pod = new THREE.Mesh(new THREE.CapsuleGeometry(0.065, 0.22, 4, 6), cropMat);
          pod.position.set(px, py, pz);
          pod.rotation.z = 0.55;
          pod.castShadow = true;
          g.add(pod);
        });
        break;
      }
      case 'root': {
        const rootBody = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.46, 8), cropMat);
        rootBody.rotation.x = Math.PI;
        rootBody.position.y = 0.34;
        rootBody.castShadow = true;
        const topLeaves = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.34, 6), greenStemMat);
        topLeaves.position.y = 0.68;
        g.add(rootBody, topLeaves);
        break;
      }
      case 'bulb': {
        const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.27, 10, 8), cropMat);
        bulb.position.y = 0.29;
        bulb.castShadow = true;
        const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.44, 6), greenStemMat);
        leaves.position.y = 0.6;
        leaves.rotation.x = Math.PI;
        g.add(bulb, leaves);
        break;
      }
      case 'bush':
      default: {
        const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 1), greenStemMat);
        bush.position.y = 0.48;
        bush.castShadow = true;
        g.add(bush);
        [[-0.25, 0.57, 0.25], [0.26, 0.5, 0.22], [0, 0.7, -0.22], [0.18, 0.64, -0.1]].forEach(([bx, by, bz]) => {
          const b = new THREE.Mesh(new THREE.SphereGeometry(0.115, 8, 8), cropMat);
          b.position.set(bx, by, bz);
          g.add(b);
        });
        break;
      }
    }
    return g;
  }

  function hasFenceLikeNeighbor(c, r) {
    if (!inBounds(c, r)) return false;
    const td = gameStore.state.tiles[tileKey(c, r)];
    return td && (td.structure === 'fence' || td.structure === 'gate');
  }

  function createFenceMesh(c, r, type) {
    const g = new THREE.Group();
    const half = TILE_SIZE * 0.5;

    if (type === 'fence') {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 1.05, 7), woodPostMat);
      post.position.y = 0.52;
      post.castShadow = true;
      post.receiveShadow = true;
      g.add(post);

      const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 7, 6), woodRailMat);
      cap.position.y = 1.06;
      g.add(cap);

      const dirs = [
        { dc: 0, dr: -1, x: 0, z: -half * 0.5, rotY: Math.PI / 2 },
        { dc: 0, dr: 1, x: 0, z: half * 0.5, rotY: Math.PI / 2 },
        { dc: -1, dr: 0, x: -half * 0.5, z: 0, rotY: 0 },
        { dc: 1, dr: 0, x: half * 0.5, z: 0, rotY: 0 }
      ];
      dirs.forEach(d => {
        if (hasFenceLikeNeighbor(c + d.dc, r + d.dr)) {
          [0.38, 0.76].forEach(ry => {
            const rail = new THREE.Mesh(new THREE.BoxGeometry(half, 0.11, 0.08), woodRailMat);
            rail.position.set(d.x, ry, d.z);
            rail.rotation.y = d.rotY;
            rail.castShadow = true;
            g.add(rail);
          });
        }
      });
    } else if (type === 'gate') {
      [-0.58, 0.58].forEach(px => {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.12, 7), woodPostMat);
        p.position.set(px, 0.56, 0);
        p.castShadow = true;
        g.add(p);
      });
      const door = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.78, 0.1), gateMat);
      door.position.set(0, 0.52, 0);
      door.castShadow = true;
      door.name = 'gateDoor';
      g.add(door);
    }
    return g;
  }

  function rebuildTileVisual(c, r) {
    const key = tileKey(c, r);
    if (tileMeshes.has(key)) {
      scene.remove(tileMeshes.get(key));
      tileMeshes.delete(key);
    }

    const td = gameStore.state.tiles[key];
    if (!td) return;

    const group = new THREE.Group();
    const pos = gridToWorld(c, r);
    group.position.set(pos.x, 0, pos.z);

    if (td.state === 'tilled') {
      group.add(createTilledSoilMesh(td.watered));

      if (td.crop && CROPS[td.crop]) {
        const cfg = CROPS[td.crop];
        const ratio = Math.min(1, td.growth / cfg.growTime);
        const stage = ratio >= 1 ? 3 : ratio >= 0.6 ? 2 : ratio >= 0.25 ? 1 : 0;
        const cropMesh = createCropMesh(td.crop, stage);
        group.add(cropMesh);
      }
    }

    if (td.obstacle === 'rock') {
      group.add(createRockMesh());
    } else if (td.obstacle === 'weed') {
      group.add(createWeedMesh());
    }

    if (td.structure === 'fence' || td.structure === 'gate') {
      group.add(createFenceMesh(c, r, td.structure));
    }

    scene.add(group);
    tileMeshes.set(key, group);
  }

  function rebuildTileAndNeighbors(c, r) {
    rebuildTileVisual(c, r);
    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dc, dr]) => {
      if (inBounds(c + dc, r + dr)) rebuildTileVisual(c + dc, r + dr);
    });
  }

  function rebuildAllTiles() {
    for (const m of tileMeshes.values()) scene.remove(m);
    tileMeshes.clear();
    for (let r = 0; r < GRID_ROWS; r++) {
      for (let c = 0; c < GRID_COLS; c++) {
        if (gameStore.state.tiles[tileKey(c, r)]) rebuildTileVisual(c, r);
      }
    }
    refreshGrassInstances();
  }

  return {
    tileMeshes,
    rebuildTileVisual,
    rebuildTileAndNeighbors,
    rebuildAllTiles
  };
}
