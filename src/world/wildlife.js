import * as THREE from 'three';
import { HALF_W, HALF_H } from '../data/constants.js';
import { toonMat } from './textures.js';

export function buildWildlife(scene) {
  const wildlife = {
    butterflies: [],
    fireflies: [],
    bunnies: [],
    birds: []
  };

  const wingGeo = new THREE.PlaneGeometry(0.18, 0.14);
  const bflyColors = [0xffe066, 0x74c0fc, 0xffa94d, 0xf783ac];
  for (let i = 0; i < 12; i++) {
    const bGroup = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: bflyColors[i % bflyColors.length], side: THREE.DoubleSide });
    const leftW = new THREE.Mesh(wingGeo, mat);
    leftW.position.x = -0.09;
    const rightW = new THREE.Mesh(wingGeo, mat);
    rightW.position.x = 0.09;
    bGroup.add(leftW, rightW);
    const hx = (Math.sin(i * 19.3) * 0.7) * HALF_W;
    const hz = (Math.cos(i * 23.7) * 0.7) * HALF_H;
    bGroup.position.set(hx, 1.1, hz);
    scene.add(bGroup);
    wildlife.butterflies.push({
      group: bGroup, leftW, rightW,
      homeX: hx, homeZ: hz,
      phase: i * 1.4,
      speed: 0.8 + (i % 3) * 0.25
    });
  }

  const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xeaff7b, transparent: true, opacity: 0 });
  const fireflyGeo = new THREE.SphereGeometry(0.06, 6, 6);
  for (let i = 0; i < 24; i++) {
    const ff = new THREE.Mesh(fireflyGeo, fireflyMat);
    const fx = (Math.sin(i * 41.2) * 0.85) * HALF_W;
    const fz = (Math.cos(i * 17.9) * 0.85) * HALF_H;
    ff.position.set(fx, 0.8 + (i % 4) * 0.35, fz);
    scene.add(ff);
    wildlife.fireflies.push({ mesh: ff, bx: fx, bz: fz, phase: i * 0.9 });
  }

  function createBunny() {
    const g = new THREE.Group();
    const furMat = toonMat(0xf7f2eb);

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), furMat);
    body.scale.set(0.9, 0.85, 1.2);
    body.position.y = 0.26;
    body.castShadow = true;

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), furMat);
    head.position.set(0, 0.44, 0.26);
    head.castShadow = true;

    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), toonMat(0xffffff));
    tail.position.set(0, 0.26, -0.32);

    [-0.08, 0.08].forEach(ex => {
      const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.045, 0.22, 4, 6), furMat);
      ear.position.set(ex, 0.68, 0.22);
      ear.rotation.x = -0.15;
      g.add(ear);
    });

    g.add(body, head, tail);
    return g;
  }

  for (let i = 0; i < 4; i++) {
    const bMesh = createBunny();
    const bx = -10 + i * 7;
    const bz = -2 + (i % 2) * 9;
    bMesh.position.set(bx, 0, bz);
    scene.add(bMesh);
    wildlife.bunnies.push({
      mesh: bMesh,
      x: bx, z: bz,
      vx: 0, vz: 0,
      timer: 1 + i * 0.8,
      hopPhase: 0,
      moving: false
    });
  }

  function createBird() {
    const g = new THREE.Group();
    const bodyMat = toonMat(0x5aa9e6);
    const bellyMat = toonMat(0xffe484);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), bodyMat);
    body.position.y = 0.18;
    body.castShadow = true;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 8), bellyMat);
    belly.position.set(0, 0.16, 0.05);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.12, 5), toonMat(0xff922b));
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.22, 0.18);
    g.add(body, belly, beak);
    return g;
  }

  for (let i = 0; i < 5; i++) {
    const bird = createBird();
    const sx = -14 + i * 6.5;
    const sz = 4 - (i % 3) * 5;
    bird.position.set(sx, 0, sz);
    scene.add(bird);
    wildlife.birds.push({
      mesh: bird,
      x: sx, y: 0, z: sz,
      homeX: sx, homeZ: sz,
      state: 'ground',
      timer: i * 0.7
    });
  }

  return { wildlife, fireflyMat };
}

export function updateWildlife(wildlife, fireflyMat, player, gameStarted, isPositionBlocked, dt, timeSec, t) {
  const nightGlow = t >= 0.5 ? Math.sin(((t - 0.5) / 0.5) * Math.PI) : 0;
  fireflyMat.opacity = player.location === 'exterior' ? nightGlow * 0.9 : 0;

  wildlife.butterflies.forEach((b) => {
    b.phase += dt * b.speed;
    b.group.position.x = b.homeX + Math.sin(b.phase) * 2.4;
    b.group.position.z = b.homeZ + Math.cos(b.phase * 0.8) * 2.4;
    b.group.position.y = 0.95 + Math.sin(b.phase * 3.2) * 0.25;
    b.group.rotation.y = Math.atan2(Math.cos(b.phase), -Math.sin(b.phase * 0.8));
    const flap = Math.sin(timeSec * 18 + b.phase) * 0.7;
    b.leftW.rotation.y = flap;
    b.rightW.rotation.y = -flap;
  });

  wildlife.fireflies.forEach((ff) => {
    ff.mesh.position.x = ff.bx + Math.sin(timeSec * 0.9 + ff.phase) * 1.3;
    ff.mesh.position.z = ff.bz + Math.cos(timeSec * 0.7 + ff.phase) * 1.3;
    ff.mesh.position.y = 0.75 + Math.sin(timeSec * 1.6 + ff.phase) * 0.3;
  });

  wildlife.bunnies.forEach((b) => {
    const distToPlayer = (gameStarted && player.location === 'exterior') ? Math.hypot(b.x - player.x, b.z - player.z) : 99;
    if (distToPlayer < 2.6 && !b.moving) {
      const ang = Math.atan2(b.z - player.z, b.x - player.x);
      b.vx = Math.cos(ang) * 3.2;
      b.vz = Math.sin(ang) * 3.2;
      b.moving = true;
      b.timer = 0.8;
    }

    b.timer -= dt;
    if (b.timer <= 0) {
      b.moving = !b.moving;
      if (b.moving) {
        const ang = Math.random() * Math.PI * 2;
        b.vx = Math.cos(ang) * 1.8;
        b.vz = Math.sin(ang) * 1.8;
        b.timer = 0.7 + Math.random() * 0.9;
      } else {
        b.timer = 1.5 + Math.random() * 2.5;
      }
    }

    if (b.moving) {
      const nx = b.x + b.vx * dt;
      const nz = b.z + b.vz * dt;
      if (!isPositionBlocked(nx, nz)) {
        b.x = nx;
        b.z = nz;
      } else {
        b.vx *= -1;
        b.vz *= -1;
      }
      b.hopPhase += dt * 14;
      b.mesh.position.y = Math.abs(Math.sin(b.hopPhase)) * 0.24;
      b.mesh.rotation.y = Math.atan2(b.vx, b.vz);
    } else {
      b.mesh.position.y *= 0.8;
    }
    b.mesh.position.x = b.x;
    b.mesh.position.z = b.z;
  });

  wildlife.birds.forEach((bird) => {
    const dist = (gameStarted && player.location === 'exterior') ? Math.hypot(bird.x - player.x, bird.z - player.z) : 99;
    if (bird.state === 'ground') {
      bird.timer -= dt;
      bird.mesh.position.y = Math.abs(Math.sin(timeSec * 6 + bird.homeX)) * 0.05;
      if (dist < 2.8) {
        bird.state = 'flying';
        bird.timer = 3.2;
      }
    } else {
      bird.timer -= dt;
      bird.y = Math.min(3.5, bird.y + dt * 3.0);
      bird.x += Math.cos(timeSec * 2 + bird.homeX) * 2.4 * dt;
      bird.z += Math.sin(timeSec * 2 + bird.homeZ) * 2.4 * dt;
      bird.mesh.position.set(bird.x, bird.y, bird.z);
      if (bird.timer <= 0 && dist > 4.5) {
        bird.state = 'ground';
        bird.y = 0;
        bird.mesh.position.y = 0;
      }
    }
  });
}
