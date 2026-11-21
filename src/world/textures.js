import * as THREE from 'three';

function createToonGradient() {
  const data = new Uint8Array([140, 205, 255]);
  const tex = new THREE.DataTexture(data, 3, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

export const toonGradient = createToonGradient();

export function toonMat(color, extra = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: toonGradient,
    ...extra
  });
}

export const windUniforms = {
  uTime: { value: 0 }
};

export function applyWindSway(material, amplitude = 0.14) {
  const ampStr = amplitude.toFixed(3);
  material.customProgramCacheKey = () => `meadowbend_wind_${ampStr}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.vertexShader = `
      uniform float uTime;
      ${shader.vertexShader}
    `.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>
      vec4 worldPosSway = modelMatrix * vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        worldPosSway = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      #endif
      float swayMask = clamp(transformed.y, 0.0, 2.5);
      float gust = sin(uTime * 1.9 + worldPosSway.x * 0.45 + worldPosSway.z * 0.35) * 0.65
                 + cos(uTime * 2.7 + worldPosSway.z * 0.6) * 0.35;
      transformed.x += gust * ${ampStr} * swayMask;
      transformed.z += gust * ${(amplitude * 0.55).toFixed(3)} * swayMask;
      `
    );
  };
}

export function createMeadowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#7ec868';
  ctx.fillRect(0, 0, 512, 512);

  const palette = ['#74bf5e', '#88d171', '#6eb859', '#92d979'];
  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = palette[i % palette.length];
    ctx.globalAlpha = 0.28;
    const x = (Math.sin(i * 73.1) * 0.5 + 0.5) * 512;
    const y = (Math.cos(i * 191.7) * 0.5 + 0.5) * 512;
    const r = 14 + (i % 26);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.45;
  for (let i = 0; i < 900; i++) {
    const x = (i * 97) % 512;
    const y = (i * 151) % 512;
    ctx.strokeStyle = i % 2 === 0 ? '#5ea649' : '#a3e388';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 2, y - 6);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(18, 18);
  return tex;
}

export function createWaterTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#48bce8';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 45; i++) {
    const x = (i * 59) % 256;
    const y = (i * 97) % 256;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(114, 221, 252, 0.32)' : 'rgba(38, 152, 209, 0.25)';
    ctx.beginPath();
    ctx.ellipse(x, y, 22, 12, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(224, 249, 255, 0.65)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 4; col++) {
      const wx = col * 64 + (row % 2) * 32 + 12;
      const wy = row * 32 + 16;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.quadraticCurveTo(wx + 12, wy - 5, wx + 24, wy);
      ctx.quadraticCurveTo(wx + 36, wy + 5, wx + 46, wy);
      ctx.stroke();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3.5, 3.5);
  return tex;
}

export function createSoilTexture(isWet) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = isWet ? '#59361d' : '#a87449';
  ctx.fillRect(0, 0, 256, 256);

  const ridgeCount = 6;
  const step = 256 / ridgeCount;
  for (let i = 0; i < ridgeCount; i++) {
    const y = i * step;
    ctx.fillStyle = isWet ? 'rgba(32, 18, 8, 0.45)' : 'rgba(112, 70, 38, 0.38)';
    ctx.fillRect(0, y, 256, step * 0.34);

    ctx.fillStyle = isWet ? 'rgba(118, 76, 44, 0.35)' : 'rgba(204, 154, 106, 0.42)';
    ctx.fillRect(0, y + step * 0.38, 256, step * 0.32);
  }

  for (let i = 0; i < 220; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const r = 1.5 + (i % 3);
    if (isWet) {
      ctx.fillStyle = i % 3 === 0 ? 'rgba(145, 198, 224, 0.25)' : 'rgba(30, 16, 7, 0.4)';
    } else {
      ctx.fillStyle = i % 2 === 0 ? 'rgba(219, 174, 126, 0.45)' : 'rgba(99, 60, 30, 0.35)';
    }
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return new THREE.CanvasTexture(canvas);
}

export function createWoodFloorTexture(baseHex = '#c68b52', plankHex = '#a86f3b') {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);

  const planks = 8;
  const ph = 256 / planks;
  for (let r = 0; r < planks; r++) {
    const y = r * ph;
    ctx.fillStyle = r % 2 === 0 ? 'rgba(255,235,200,0.12)' : 'rgba(40,20,5,0.1)';
    ctx.fillRect(0, y, 256, ph);
    ctx.fillStyle = plankHex;
    ctx.fillRect(0, y + ph - 2, 256, 2);

    const seamX = ((r * 83) % 180) + 38;
    ctx.fillRect(seamX, y, 2, ph);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}

export function createShopSignTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 140;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#5c3419';
  ctx.fillRect(0, 0, 512, 140);

  ctx.strokeStyle = '#f5b942';
  ctx.lineWidth = 10;
  ctx.strokeRect(8, 8, 496, 124);

  ctx.fillStyle = '#fff5d6';
  ctx.font = '900 58px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('🏪 SHOP', 256, 74);

  return new THREE.CanvasTexture(canvas);
}
