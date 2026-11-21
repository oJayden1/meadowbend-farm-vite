import * as THREE from 'three';
import { ROOM_Y, SHOP_ROOM, HOUSE_ROOM } from '../data/constants.js';
import { gridToWorld } from '../state/inventory.js';
import {
  toonGradient,
  toonMat,
  createWoodFloorTexture,
  createShopSignTexture
} from './textures.js';

export function buildBuildings(scene) {
  const exteriorZones = [];
  const exteriorSolidBoxes = [];
  const shopInteriorSolidBoxes = [];
  const houseInteriorSolidBoxes = [];
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x2b1d12 });

  let pipNpcHead = null;
  let pipNpcBody = null;

  // Exterior Cabin
  function buildCabinExterior() {
    const cabin = new THREE.Group();
    const pos = gridToWorld(4, 2.5);
    cabin.position.set(pos.x, 0, pos.z);

    const wall = new THREE.Mesh(new THREE.BoxGeometry(5.2, 2.8, 3.8), toonMat(0xf7ead2));
    wall.position.y = 1.4;
    wall.castShadow = true;
    wall.receiveShadow = true;
    cabin.add(wall);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 2.1, 4), toonMat(0xd96b43));
    roof.position.y = 3.75;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    cabin.add(roof);

    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.24, 1.85, 0.14), toonMat(0x5c361a));
    doorFrame.position.set(0, 0.92, 1.92);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.02, 1.72, 0.2), toonMat(0x8c522b));
    door.position.set(0, 0.86, 1.95);
    const welcomeMat = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.75), toonMat(0xc98a5b));
    welcomeMat.position.set(0, 0.025, 2.35);
    cabin.add(doorFrame, door, welcomeMat);

    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.8, 0.7), toonMat(0x9e8c7e));
    chimney.position.set(1.5, 3.6, -0.6);
    chimney.castShadow = true;
    cabin.add(chimney);

    scene.add(cabin);
    exteriorSolidBoxes.push({ minX: pos.x - 2.6, maxX: pos.x + 2.6, minZ: pos.z - 1.9, maxZ: pos.z + 1.9 });
    exteriorZones.push({
      id: 'enter_house',
      x: pos.x,
      z: pos.z + 2.55,
      radius: 2.1,
      hint: '🏡 Press [E] to enter Cozy Farmhouse'
    });
  }

  // Exterior Shop
  function buildShopExterior() {
    const topLeft = gridToWorld(21, 1);
    const bottomRight = gridToWorld(24, 4);
    const cx = (topLeft.x + bottomRight.x) * 0.5;
    const cz = (topLeft.z + bottomRight.z) * 0.5;

    const width = 5.6;
    const depth = 4.4;
    const wallHeight = 3.0;

    const shopGroup = new THREE.Group();
    shopGroup.position.set(cx, 0, cz);

    const porch = new THREE.Mesh(new THREE.BoxGeometry(width + 0.6, 0.16, 1.45), toonMat(0xc98d55));
    porch.position.set(0, 0.08, depth * 0.5 + 0.65);
    porch.receiveShadow = true;
    porch.castShadow = true;
    shopGroup.add(porch);

    [[-width * 0.45, depth * 0.5 + 1.25], [width * 0.45, depth * 0.5 + 1.25]].forEach(([px, pz]) => {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.55, 7), toonMat(0x6e4423));
      post.position.set(px, 1.28, pz);
      post.castShadow = true;
      shopGroup.add(post);
    });

    const wallMat = toonMat(0xfff1d6);
    const trimMat = toonMat(0x8c552b);
    const mainBody = new THREE.Mesh(new THREE.BoxGeometry(width, wallHeight, depth), wallMat);
    mainBody.position.y = wallHeight * 0.5;
    mainBody.castShadow = true;
    mainBody.receiveShadow = true;
    shopGroup.add(mainBody);

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(width + 0.16, 0.24, depth + 0.16), trimMat);
    plinth.position.y = 0.12;
    plinth.receiveShadow = true;
    shopGroup.add(plinth);

    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.28, wallHeight, 0.28), trimMat);
      pillar.position.set(sx * (width * 0.5 - 0.05), wallHeight * 0.5, sz * (depth * 0.5 - 0.05));
      pillar.castShadow = true;
      shopGroup.add(pillar);
    });

    const roofMat = toonMat(0xe07a38);
    const roofPeak = new THREE.Mesh(new THREE.ConeGeometry(4.65, 2.25, 4), roofMat);
    roofPeak.position.set(0, wallHeight + 1.05, 0.15);
    roofPeak.rotation.y = Math.PI / 4;
    roofPeak.scale.set(1.02, 1, 0.95);
    roofPeak.castShadow = true;
    shopGroup.add(roofPeak);

    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(width + 0.5, 0.18, 1.65), roofMat);
    porchRoof.position.set(0, 2.55, depth * 0.5 + 0.55);
    porchRoof.rotation.x = 0.14;
    porchRoof.castShadow = true;
    shopGroup.add(porchRoof);

    const doorFrame = new THREE.Mesh(new THREE.BoxGeometry(1.36, 1.98, 0.16), trimMat);
    doorFrame.position.set(0, 0.99, depth * 0.5 + 0.04);
    const thresholdMat = new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.05, 0.7), toonMat(0x7bc96f));
    thresholdMat.position.set(0, 0.18, depth * 0.5 + 0.55);
    shopGroup.add(doorFrame, thresholdMat);

    const glassMat = new THREE.MeshToonMaterial({
      color: 0x9be7ff,
      gradientMap: toonGradient
    });
    const frameMat = toonMat(0x6e4423);

    [-1.78, 1.78].forEach((wx) => {
      const wFrame = new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.15, 0.14), frameMat);
      wFrame.position.set(wx, 1.55, depth * 0.5 + 0.03);
      const wGlass = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.94, 0.16), glassMat);
      wGlass.position.set(wx, 1.55, depth * 0.5 + 0.04);
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.25, 0.34), trimMat);
      box.position.set(wx, 0.88, depth * 0.5 + 0.16);
      box.castShadow = true;
      const blooms = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.16, 0.22), toonMat(0xff758f));
      blooms.position.set(wx, 1.04, depth * 0.5 + 0.17);
      shopGroup.add(wFrame, wGlass, box, blooms);
    });

    const signTex = createShopSignTexture();
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(2.6, 0.72, 0.16),
      new THREE.MeshBasicMaterial({ map: signTex })
    );
    signBoard.position.set(0, 2.35, depth * 0.5 + 0.22);
    signBoard.castShadow = true;
    shopGroup.add(signBoard);

    scene.add(shopGroup);

    exteriorSolidBoxes.push({
      minX: cx - width * 0.5,
      maxX: cx + width * 0.5,
      minZ: cz - depth * 0.5,
      maxZ: cz + depth * 0.5
    });

    exteriorZones.push({
      id: 'enter_shop',
      x: cx,
      z: cz + depth * 0.5 + 1.15,
      radius: 2.15,
      hint: "🏪 Press [E] to step inside Pip's Valley Shop"
    });
  }

  // Shipping Bin
  function buildShippingBinExterior() {
    const pos = gridToWorld(18.5, 3.5);
    const bin = new THREE.Group();
    bin.position.set(pos.x, 0, pos.z);

    const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, 1.2), toonMat(0x8c5832));
    box.position.y = 0.52;
    box.castShadow = true;
    box.receiveShadow = true;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 1.3), toonMat(0xd49b4b));
    lid.position.y = 1.1;
    lid.castShadow = true;
    bin.add(box, lid);
    scene.add(bin);

    exteriorSolidBoxes.push({ minX: pos.x - 0.75, maxX: pos.x + 0.75, minZ: pos.z - 0.6, maxZ: pos.z + 0.6 });
    exteriorZones.push({
      id: 'bin',
      x: pos.x,
      z: pos.z + 1.25,
      radius: 1.95,
      hint: '📦 Press [E] to quick-ship all harvested crops'
    });
  }

  // Shop Interior
  function buildShopInterior() {
    const g = new THREE.Group();
    g.position.set(SHOP_ROOM.cx, ROOM_Y, SHOP_ROOM.cz);

    const floorMat = new THREE.MeshToonMaterial({
      map: createWoodFloorTexture('#cf9458', '#9e6734'),
      gradientMap: toonGradient
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(SHOP_ROOM.halfW * 2, 0.2, SHOP_ROOM.halfD * 2), floorMat);
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    g.add(floor);

    const wallMat = toonMat(0xfff3db);
    const wainscotMat = toonMat(0x9c6234);
    const wallH = 3.2;
    const wThick = 0.4;

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(SHOP_ROOM.halfW * 2 + wThick * 2, wallH, wThick), wallMat);
    backWall.position.set(0, wallH * 0.5, -SHOP_ROOM.halfD - wThick * 0.5);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    g.add(backWall);

    const backTrim = new THREE.Mesh(new THREE.BoxGeometry(SHOP_ROOM.halfW * 2, 1.0, 0.12), wainscotMat);
    backTrim.position.set(0, 0.5, -SHOP_ROOM.halfD + 0.06);
    g.add(backTrim);

    [-1, 1].forEach(side => {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(wThick, wallH, SHOP_ROOM.halfD * 2), wallMat);
      sideWall.position.set(side * (SHOP_ROOM.halfW + wThick * 0.5), wallH * 0.5, 0);
      sideWall.castShadow = true;
      sideWall.receiveShadow = true;
      g.add(sideWall);
    });

    const frontSegW = SHOP_ROOM.halfW - 1.1;
    [-1, 1].forEach(side => {
      const fSeg = new THREE.Mesh(new THREE.BoxGeometry(frontSegW, wallH, wThick), wallMat);
      fSeg.position.set(side * (1.1 + frontSegW * 0.5), wallH * 0.5, SHOP_ROOM.halfD + wThick * 0.5);
      fSeg.castShadow = true;
      g.add(fSeg);
    });

    const exitMat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 1.1), toonMat(0x7bc96f));
    exitMat.position.set(0, 0.02, SHOP_ROOM.halfD - 0.55);
    exitMat.receiveShadow = true;
    g.add(exitMat);

    const counterGroup = new THREE.Group();
    counterGroup.position.set(0, 0, -0.75);
    const counterBase = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.05, 1.1), toonMat(0x8c5228));
    counterBase.position.y = 0.525;
    counterBase.castShadow = true;
    counterBase.receiveShadow = true;
    const counterTop = new THREE.Mesh(new THREE.BoxGeometry(5.85, 0.14, 1.28), toonMat(0xe3a869));
    counterTop.position.y = 1.1;
    counterTop.castShadow = true;
    counterTop.receiveShadow = true;

    const basket = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.28, 10), toonMat(0xd99b4e));
    basket.position.set(-1.5, 1.3, 0.05);
    basket.castShadow = true;
    const sampleCrop = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), toonMat(0xff8c24));
    sampleCrop.position.set(-1.5, 1.48, 0.05);

    const coinBox = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.45), toonMat(0xffd166));
    coinBox.position.set(1.65, 1.28, 0);
    coinBox.castShadow = true;

    counterGroup.add(counterBase, counterTop, basket, sampleCrop, coinBox);
    g.add(counterGroup);

    [-4.6, 4.6].forEach((sx, idx) => {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.35, 2.4), toonMat(0xa86c3c));
      shelf.position.set(sx, 0.675, -1.4);
      shelf.castShadow = true;
      shelf.receiveShadow = true;
      g.add(shelf);

      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.25, 0.75),
        toonMat(idx === 0 ? 0x7bc96f : 0xffca28)
      );
      crate.position.set(sx, 1.47, -1.4);
      g.add(crate);

      shopInteriorSolidBoxes.push({
        minX: SHOP_ROOM.cx + sx - 0.55,
        maxX: SHOP_ROOM.cx + sx + 0.55,
        minZ: SHOP_ROOM.cz - 2.6,
        maxZ: SHOP_ROOM.cz - 0.2
      });
    });

    const pipGroup = new THREE.Group();
    pipGroup.position.set(0, 0, -1.85);

    const apron = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.78, 10), toonMat(0x56a852));
    apron.position.y = 0.65;
    apron.castShadow = true;

    const pHead = new THREE.Mesh(new THREE.SphereGeometry(0.35, 14, 12), toonMat(0xffdfb8));
    pHead.position.y = 1.26;
    pHead.castShadow = true;

    const pCap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.42, 0.22, 12), toonMat(0xe86f38));
    pCap.position.y = 1.56;
    pCap.castShadow = true;

    const pBrim = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.26), toonMat(0xc95422));
    pBrim.position.set(0, 1.48, 0.28);

    const pEyeL = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 6), eyeMat);
    pEyeL.position.set(-0.11, 1.28, 0.32);
    const pEyeR = new THREE.Mesh(new THREE.SphereGeometry(0.042, 6, 6), eyeMat);
    pEyeR.position.set(0.11, 1.28, 0.32);

    const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), toonMat(0xffd166));
    marker.position.y = 2.05;
    marker.name = 'pipMarker';

    pipGroup.add(apron, pHead, pCap, pBrim, pEyeL, pEyeR, marker);
    g.add(pipGroup);
    pipNpcHead = pHead;
    pipNpcBody = apron;

    scene.add(g);

    shopInteriorSolidBoxes.push({
      minX: SHOP_ROOM.cx - 2.85,
      maxX: SHOP_ROOM.cx + 2.85,
      minZ: SHOP_ROOM.cz - 1.32,
      maxZ: SHOP_ROOM.cz - 0.18
    });
  }

  // Farmhouse Interior
  function buildHouseInterior() {
    const g = new THREE.Group();
    g.position.set(HOUSE_ROOM.cx, ROOM_Y, HOUSE_ROOM.cz);

    const floorMat = new THREE.MeshToonMaterial({
      map: createWoodFloorTexture('#b87c46', '#8a572a'),
      gradientMap: toonGradient
    });
    const floor = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_ROOM.halfW * 2, 0.2, HOUSE_ROOM.halfD * 2), floorMat);
    floor.position.y = -0.1;
    floor.receiveShadow = true;
    g.add(floor);

    const rug = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.03, 2.6), toonMat(0xd96b52));
    rug.position.set(0, 0.015, 0.65);
    rug.receiveShadow = true;
    g.add(rug);

    const wallMat = toonMat(0xfaf0dc);
    const wallH = 3.2;
    const wThick = 0.4;

    const backWall = new THREE.Mesh(new THREE.BoxGeometry(HOUSE_ROOM.halfW * 2 + wThick * 2, wallH, wThick), wallMat);
    backWall.position.set(0, wallH * 0.5, -HOUSE_ROOM.halfD - wThick * 0.5);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    g.add(backWall);

    [-1, 1].forEach(side => {
      const sideWall = new THREE.Mesh(new THREE.BoxGeometry(wThick, wallH, HOUSE_ROOM.halfD * 2), wallMat);
      sideWall.position.set(side * (HOUSE_ROOM.halfW + wThick * 0.5), wallH * 0.5, 0);
      sideWall.castShadow = true;
      sideWall.receiveShadow = true;
      g.add(sideWall);
    });

    const frontSegW = HOUSE_ROOM.halfW - 1.1;
    [-1, 1].forEach(side => {
      const fSeg = new THREE.Mesh(new THREE.BoxGeometry(frontSegW, wallH, wThick), wallMat);
      fSeg.position.set(side * (1.1 + frontSegW * 0.5), wallH * 0.5, HOUSE_ROOM.halfD + wThick * 0.5);
      fSeg.castShadow = true;
      g.add(fSeg);
    });

    const exitMat = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.04, 1.1), toonMat(0xc98a5b));
    exitMat.position.set(0, 0.02, HOUSE_ROOM.halfD - 0.55);
    exitMat.receiveShadow = true;
    g.add(exitMat);

    const bedGroup = new THREE.Group();
    bedGroup.position.set(-3.3, 0, -1.6);
    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.45, 2.7), toonMat(0x7c4a27));
    bedFrame.position.y = 0.225;
    bedFrame.castShadow = true;
    bedFrame.receiveShadow = true;
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.24, 2.45), toonMat(0xfff9eb));
    mattress.position.y = 0.52;
    const quilt = new THREE.Mesh(new THREE.BoxGeometry(1.82, 0.26, 1.65), toonMat(0x5b8fd9));
    quilt.position.set(0, 0.53, 0.35);
    quilt.castShadow = true;
    const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.5), toonMat(0xffe8c2));
    pillow.position.set(0, 0.68, -0.85);
    const bedBeacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), toonMat(0x90e0ef));
    bedBeacon.position.set(0, 1.45, 0);
    bedBeacon.name = 'bedBeacon';
    bedGroup.add(bedFrame, mattress, quilt, pillow, bedBeacon);
    g.add(bedGroup);

    houseInteriorSolidBoxes.push({
      minX: HOUSE_ROOM.cx - 4.3,
      maxX: HOUSE_ROOM.cx - 2.3,
      minZ: HOUSE_ROOM.cz - 2.95,
      maxZ: HOUSE_ROOM.cz - 0.25
    });

    const deskGroup = new THREE.Group();
    deskGroup.position.set(3.3, 0, -1.5);
    const deskTop = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 1.15), toonMat(0x8f562c));
    deskTop.position.y = 0.45;
    deskTop.castShadow = true;
    deskTop.receiveShadow = true;
    const ledger = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.06, 0.48), toonMat(0xfff6d6));
    ledger.position.set(-0.25, 0.93, 0.05);
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.32, 8), toonMat(0xd4a359));
    lampBase.position.set(0.55, 1.06, -0.15);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.24, 10), toonMat(0xffe082));
    lampShade.position.set(0.55, 1.26, -0.15);
    const deskBeacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), toonMat(0xffb703));
    deskBeacon.position.set(0, 1.85, 0);
    deskBeacon.name = 'deskBeacon';
    deskGroup.add(deskTop, ledger, lampBase, lampShade, deskBeacon);
    g.add(deskGroup);

    houseInteriorSolidBoxes.push({
      minX: HOUSE_ROOM.cx + 2.35,
      maxX: HOUSE_ROOM.cx + 4.25,
      minZ: HOUSE_ROOM.cz - 2.08,
      maxZ: HOUSE_ROOM.cz - 0.92
    });

    const chestGroup = new THREE.Group();
    chestGroup.position.set(3.3, 0, -0.05);
    const chestBase = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.72, 0.96), toonMat(0xb8763b));
    chestBase.position.y = 0.36;
    chestBase.castShadow = true;
    chestBase.receiveShadow = true;
    const chestLid = new THREE.Mesh(new THREE.BoxGeometry(1.48, 0.22, 1.02), toonMat(0xd18c4a));
    chestLid.position.y = 0.79;
    chestLid.castShadow = true;
    const chestBandL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.86, 1.04), toonMat(0xffca3a));
    chestBandL.position.set(-0.42, 0.45, 0);
    const chestBandR = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.86, 1.04), toonMat(0xffca3a));
    chestBandR.position.set(0.42, 0.45, 0);
    const chestBeacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.15, 0), toonMat(0xffd166));
    chestBeacon.position.set(0, 1.35, 0);
    chestBeacon.name = 'chestBeacon';
    chestGroup.add(chestBase, chestLid, chestBandL, chestBandR, chestBeacon);
    g.add(chestGroup);

    houseInteriorSolidBoxes.push({
      minX: HOUSE_ROOM.cx + 2.55,
      maxX: HOUSE_ROOM.cx + 4.05,
      minZ: HOUSE_ROOM.cz - 0.55,
      maxZ: HOUSE_ROOM.cz + 0.45
    });

    const hearth = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.5, 0.85), toonMat(0x9e8f82));
    hearth.position.set(0, 0.75, -HOUSE_ROOM.halfD + 0.42);
    hearth.castShadow = true;
    const ember = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.55, 0.2), toonMat(0xff7b29));
    ember.position.set(0, 0.35, -HOUSE_ROOM.halfD + 0.82);
    g.add(hearth, ember);

    houseInteriorSolidBoxes.push({
      minX: HOUSE_ROOM.cx - 1.1,
      maxX: HOUSE_ROOM.cx + 1.1,
      minZ: HOUSE_ROOM.cz - HOUSE_ROOM.halfD,
      maxZ: HOUSE_ROOM.cz - HOUSE_ROOM.halfD + 0.9
    });

    scene.add(g);
  }

  buildCabinExterior();
  buildShopExterior();
  buildShippingBinExterior();
  buildShopInterior();
  buildHouseInterior();

  return {
    exteriorZones,
    exteriorSolidBoxes,
    shopInteriorSolidBoxes,
    houseInteriorSolidBoxes,
    pipNpcHead,
    pipNpcBody
  };
}
