import * as THREE from 'three';

// All surface detail is generated on canvases at startup rather than shipped
// as image files: keeps the homepage a single small bundle with no texture
// downloads, and a seeded RNG makes every load look identical.

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

// Multi-octave value noise, built by upscaling small random canvases with
// smoothing on. Cheap and good enough for grime/concrete/paint variation.
function noiseLayer(w: number, h: number, rand: () => number, octaves = 5, base = 4) {
  const { c, ctx } = canvas(w, h);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  for (let o = 0; o < octaves; o++) {
    const cells = base * 2 ** o;
    const small = canvas(cells, Math.max(1, Math.round((cells * h) / w)));
    const img = small.ctx.createImageData(small.c.width, small.c.height);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = rand() * 255;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    small.ctx.putImageData(img, 0, 0);
    ctx.globalAlpha = 0.55 / (o + 1);
    ctx.drawImage(small.c, 0, 0, w, h);
  }
  ctx.globalAlpha = 1;
  return c;
}

function tex(c: HTMLCanvasElement, color: boolean, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  return t;
}

export interface PbrMaps {
  map: THREE.Texture;
  roughnessMap?: THREE.Texture;
  bumpMap?: THREE.Texture;
  metalnessMap?: THREE.Texture;
}

export function concrete(): PbrMaps {
  const rand = rng(11);
  const S = 1024;
  const n = noiseLayer(S, S, rand, 6, 3);
  const { c, ctx } = canvas(S);
  ctx.fillStyle = '#7d7a75';
  ctx.fillRect(0, 0, S, S);
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(n, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  // oil stains and damp patches
  for (let i = 0; i < 14; i++) {
    const x = rand() * S, y = rand() * S, r = 30 + rand() * 160;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(30,28,25,${0.08 + rand() * 0.18})`);
    g.addColorStop(1, 'rgba(30,28,25,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // aggregate speckle
  for (let i = 0; i < 9000; i++) {
    const v = rand() > 0.5 ? 255 : 0;
    ctx.fillStyle = `rgba(${v},${v},${v},${rand() * 0.12})`;
    ctx.fillRect(rand() * S, rand() * S, 1 + rand() * 2, 1 + rand() * 2);
  }
  // hairline cracks
  ctx.strokeStyle = 'rgba(20,20,20,0.35)';
  for (let i = 0; i < 5; i++) {
    ctx.lineWidth = 0.6 + rand();
    ctx.beginPath();
    let x = rand() * S, y = rand() * S;
    ctx.moveTo(x, y);
    for (let s = 0; s < 30; s++) {
      x += (rand() - 0.5) * 24;
      y += (rand() - 0.3) * 18;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  const rough = canvas(S);
  rough.ctx.fillStyle = '#c8c8c8';
  rough.ctx.fillRect(0, 0, S, S);
  rough.ctx.globalCompositeOperation = 'overlay';
  rough.ctx.drawImage(n, 0, 0);
  // stains read as slightly glossier (sealed by oil)
  rough.ctx.globalCompositeOperation = 'multiply';
  rough.ctx.globalAlpha = 0.5;
  rough.ctx.drawImage(c, 0, 0);

  return { map: tex(c, true, 3), roughnessMap: tex(rough.c, false, 3), bumpMap: tex(n, false, 3) };
}

// Butcher-block bench top: glued maple/oak strips running along the bench.
export function butcherBlock(): PbrMaps {
  const rand = rng(23);
  const W = 2048, H = 1024;
  const { c, ctx } = canvas(W, H);
  const bump = canvas(W, H);
  const strips = 17;
  const sh = H / strips;
  for (let s = 0; s < strips; s++) {
    const hue = 24 + rand() * 9;
    const light = 34 + rand() * 12;
    ctx.fillStyle = `hsl(${hue}, ${45 + rand() * 12}%, ${light}%)`;
    ctx.fillRect(0, s * sh, W, sh);
    bump.ctx.fillStyle = '#808080';
    bump.ctx.fillRect(0, s * sh, W, sh);
    // grain lines: long wavy strokes
    const lines = 26;
    for (let l = 0; l < lines; l++) {
      const y0 = s * sh + rand() * sh;
      const amp = 1 + rand() * 4;
      const freq = 0.002 + rand() * 0.006;
      const ph = rand() * 10;
      const dark = rand() < 0.3;
      ctx.strokeStyle = dark ? `hsla(${hue - 6},45%,${light - 22}%,0.35)` : `hsla(${hue},40%,${light - 10}%,0.25)`;
      ctx.lineWidth = dark ? 1.5 + rand() * 2 : 0.8 + rand();
      ctx.beginPath();
      bump.ctx.strokeStyle = 'rgba(40,40,40,0.4)';
      bump.ctx.lineWidth = ctx.lineWidth;
      bump.ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const y = Math.min(s * sh + sh - 1, Math.max(s * sh + 1, y0 + Math.sin(x * freq + ph) * amp));
        if (x === 0) { ctx.moveTo(x, y); bump.ctx.moveTo(x, y); } else { ctx.lineTo(x, y); bump.ctx.lineTo(x, y); }
      }
      ctx.stroke();
      bump.ctx.stroke();
    }
    // glue seam
    ctx.fillStyle = 'rgba(40,25,10,0.45)';
    ctx.fillRect(0, s * sh, W, 1.5);
    bump.ctx.fillStyle = '#404040';
    bump.ctx.fillRect(0, s * sh, W, 1.5);
    // staggered end joints
    const joint = rand() * W;
    ctx.fillRect(joint, s * sh, 2, sh);
  }
  // use-wear: scuffs, a ring stain and a few dents
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(255,240,220,${0.04 + rand() * 0.06})`;
    ctx.lineWidth = 0.5 + rand();
    const x = rand() * W, y = rand() * H, a = rand() * Math.PI, l = 20 + rand() * 120;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(70,40,15,0.22)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(W * 0.83, H * 0.36, 52, 0, Math.PI * 2);
  ctx.stroke();

  const grime = noiseLayer(W, H, rand, 5, 4);
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = 0.35;
  ctx.drawImage(grime, 0, 0);

  const rough = canvas(W, H);
  rough.ctx.fillStyle = '#9a9a9a';
  rough.ctx.fillRect(0, 0, W, H);
  rough.ctx.globalCompositeOperation = 'overlay';
  rough.ctx.drawImage(grime, 0, 0);

  return { map: tex(c, true), roughnessMap: tex(rough.c, false), bumpMap: tex(bump.c, false) };
}

// Tempered hardboard pegboard with 1" hole spacing.
export function pegboard(widthM: number, heightM: number): PbrMaps {
  const rand = rng(5);
  const pxPerM = 1000;
  const W = Math.round(widthM * pxPerM), H = Math.round(heightM * pxPerM);
  const { c, ctx } = canvas(W, H);
  const bump = canvas(W, H);
  ctx.fillStyle = '#8f6a44';
  ctx.fillRect(0, 0, W, H);
  const n = noiseLayer(W, H, rand, 5, 6);
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.6;
  ctx.drawImage(n, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  bump.ctx.fillStyle = '#ffffff';
  bump.ctx.fillRect(0, 0, W, H);
  const step = 0.0254 * pxPerM;
  for (let y = step / 2; y < H; y += step) {
    for (let x = step / 2; x < W; x += step) {
      ctx.fillStyle = '#1a120a';
      ctx.beginPath();
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      bump.ctx.fillStyle = '#000';
      bump.ctx.beginPath();
      bump.ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      bump.ctx.fill();
    }
  }
  return { map: tex(c, true), bumpMap: tex(bump.c, false) };
}

// Painted cinder-block wall: 40x20cm blocks, running bond.
export function blockWall(): PbrMaps {
  const rand = rng(31);
  const S = 1024; // covers 1.6 x 1.6 m per repeat
  const bw = S / 4, bh = S / 8;
  const { c, ctx } = canvas(S);
  const bump = canvas(S);
  ctx.fillStyle = '#8f8b83';
  ctx.fillRect(0, 0, S, S);
  const n = noiseLayer(S, S, rand, 6, 8);
  ctx.globalCompositeOperation = 'overlay';
  ctx.drawImage(n, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  bump.ctx.fillStyle = '#9a9a9a';
  bump.ctx.fillRect(0, 0, S, S);
  bump.ctx.globalCompositeOperation = 'overlay';
  bump.ctx.drawImage(n, 0, 0);
  bump.ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(60,58,52,0.55)';
  bump.ctx.fillStyle = '#202020';
  for (let r = 0; r < 8; r++) {
    const y = r * bh;
    ctx.fillRect(0, y, S, 5);
    bump.ctx.fillRect(0, y, S, 5);
    const off = r % 2 ? bw / 2 : 0;
    for (let x = off; x <= S; x += bw) {
      ctx.fillRect(x - 2, y, 5, bh);
      bump.ctx.fillRect(x - 2, y, 5, bh);
    }
  }
  // grime gathering near the bottom
  const g = ctx.createLinearGradient(0, S * 0.6, 0, S);
  g.addColorStop(0, 'rgba(50,45,40,0)');
  g.addColorStop(1, 'rgba(50,45,40,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return { map: tex(c, true), bumpMap: tex(bump.c, false) };
}

// Powder-coated steel with chips/scratches through to bare metal. Scratches
// go into the metalness map too, so they catch light like real exposed steel.
export function wornPaint(hex: string, seed: number): PbrMaps {
  const rand = rng(seed);
  const S = 1024;
  const { c, ctx } = canvas(S);
  const rough = canvas(S);
  const metal = canvas(S);
  ctx.fillStyle = hex;
  ctx.fillRect(0, 0, S, S);
  const n = noiseLayer(S, S, rand, 5, 4);
  ctx.globalCompositeOperation = 'soft-light';
  ctx.globalAlpha = 0.5;
  ctx.drawImage(n, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  rough.ctx.fillStyle = '#5a5a5a';
  rough.ctx.fillRect(0, 0, S, S);
  rough.ctx.globalCompositeOperation = 'overlay';
  rough.ctx.drawImage(n, 0, 0);
  rough.ctx.globalCompositeOperation = 'source-over';
  metal.ctx.fillStyle = '#000';
  metal.ctx.fillRect(0, 0, S, S);

  const scratch = (x: number, y: number, len: number, a: number, w: number) => {
    const draw = (g: CanvasRenderingContext2D, style: string) => {
      g.strokeStyle = style;
      g.lineWidth = w;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(x, y);
      const cx = x + Math.cos(a) * len * 0.5 + (rand() - 0.5) * 10;
      const cy = y + Math.sin(a) * len * 0.5 + (rand() - 0.5) * 10;
      g.quadraticCurveTo(cx, cy, x + Math.cos(a) * len, y + Math.sin(a) * len);
      g.stroke();
    };
    draw(ctx, `rgba(170,168,165,${0.5 + rand() * 0.4})`);
    draw(metal.ctx, '#fff');
    draw(rough.ctx, '#8a8a8a');
  };
  for (let i = 0; i < 70; i++) scratch(rand() * S, rand() * S, 8 + rand() * 60, rand() * Math.PI * 2, 0.6 + rand() * 1.2);
  // chips
  for (let i = 0; i < 25; i++) {
    const x = rand() * S, y = rand() * S, r = 1 + rand() * 4;
    for (const [g, style] of [[ctx, '#8e8b86'], [metal.ctx, '#fff'], [rough.ctx, '#707070']] as const) {
      g.fillStyle = style;
      g.beginPath();
      g.ellipse(x, y, r, r * (0.4 + rand() * 0.6), rand() * Math.PI, 0, Math.PI * 2);
      g.fill();
    }
  }
  // edges of every face get handled most: darken and scuff the border band
  const band = 40;
  for (const g of [ctx]) {
    const grads: [number, number, number, number][] = [[0, 0, 0, band], [0, S, 0, S - band], [0, 0, band, 0], [S, 0, S - band, 0]];
    for (const [x0, y0, x1, y1] of grads) {
      const gr = g.createLinearGradient(x0, y0, x1, y1);
      gr.addColorStop(0, 'rgba(40,20,15,0.25)');
      gr.addColorStop(1, 'rgba(40,20,15,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, S, S);
    }
  }
  return { map: tex(c, true), roughnessMap: tex(rough.c, false), metalnessMap: tex(metal.c, false) };
}

export function markerLabel(): THREE.Texture {
  const W = 1024, H = 256;
  const { c, ctx } = canvas(W, H);
  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f2f2ee';
  ctx.fillRect(0, 60, W, 136);
  ctx.fillStyle = '#111';
  ctx.font = 'bold 84px Impact, "Arial Black", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('REDACT', W * 0.36, 130);
  ctx.font = 'bold 30px Arial, sans-serif';
  ctx.fillText('PERMANENT · FINE', W * 0.78, 110);
  ctx.fillText('████ ███ ██', W * 0.78, 150);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function compassFace(): THREE.Texture {
  const S = 512;
  const { c, ctx } = canvas(S);
  const r = S / 2;
  ctx.fillStyle = '#efe8d6';
  ctx.fillRect(0, 0, S, S);
  ctx.translate(r, r);
  ctx.strokeStyle = '#2a241c';
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    const long = i % 9 === 0;
    ctx.lineWidth = long ? 3 : 1.5;
    ctx.beginPath();
    ctx.moveTo(Math.sin(a) * (r - 14), -Math.cos(a) * (r - 14));
    ctx.lineTo(Math.sin(a) * (r - (long ? 44 : 30)), -Math.cos(a) * (r - (long ? 44 : 30)));
    ctx.stroke();
  }
  ctx.fillStyle = '#2a241c';
  ctx.font = 'bold 56px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const labels: [string, number][] = [['N', 0], ['E', 90], ['S', 180], ['W', 270]];
  for (const [l, deg] of labels) {
    const a = (deg * Math.PI) / 180;
    ctx.fillStyle = l === 'N' ? '#a3261d' : '#2a241c';
    ctx.fillText(l, Math.sin(a) * (r - 84), -Math.cos(a) * (r - 84));
  }
  // rose
  ctx.fillStyle = 'rgba(42,36,28,0.2)';
  for (let i = 0; i < 8; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI) / 4 + Math.PI / 8);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.45);
    ctx.lineTo(12, 0);
    ctx.lineTo(-12, 0);
    ctx.fill();
    ctx.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Woven wire grille for the microphone head (used as a bump map).
export function wireMesh(): THREE.Texture {
  const S = 256;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, S, S);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  for (let i = 0; i <= S; i += 8) {
    ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, S); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(S, i); ctx.stroke();
  }
  const t = tex(c, false);
  t.repeat.set(6, 3);
  return t;
}

// Soft round sprite for dust motes.
export function dustSprite(): THREE.Texture {
  const { c, ctx } = canvas(64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Closed-cell foam liner: fine pitted noise.
export function foamBump(): THREE.Texture {
  const rand = rng(61);
  const S = 512;
  const { c, ctx } = canvas(S);
  ctx.fillStyle = '#909090';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 14000; i++) {
    const v = Math.floor(rand() * 120);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.beginPath();
    ctx.arc(rand() * S, rand() * S, 0.6 + rand() * 1.4, 0, Math.PI * 2);
    ctx.fill();
  }
  return tex(c, false, 2);
}
