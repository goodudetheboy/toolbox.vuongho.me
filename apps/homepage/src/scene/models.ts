import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { ToolModel } from '../tools';
import {
  blockWall,
  butcherBlock,
  compassFace,
  concrete,
  markerLabel,
  pegboard,
  rng,
  wireMesh,
  wornPaint,
  foamBump,
} from './textures';

// All dimensions are in metres so lights and physics use real-world units.
export const DESK_Y = 0.9;
export const BOX = { W: 0.52, D: 0.25, H: 0.19, LH: 0.075, T: 0.007, FEET: 0.008, FOAM: 0.085 };

function shadow<T extends THREE.Object3D>(o: T, cast = true, receive = true): T {
  o.traverse((c) => {
    if ((c as THREE.Mesh).isMesh) {
      c.castShadow = cast;
      c.receiveShadow = receive;
    }
  });
  return o;
}

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

export const materials = () => ({
  chrome: new THREE.MeshStandardMaterial({ color: 0xdadde0, metalness: 1, roughness: 0.18 }),
  brushed: new THREE.MeshStandardMaterial({ color: 0xb8bbbe, metalness: 1, roughness: 0.38 }),
  darkSteel: new THREE.MeshStandardMaterial({ color: 0x3b3d40, metalness: 0.9, roughness: 0.45 }),
  blackPlastic: new THREE.MeshPhysicalMaterial({ color: 0x0c0c0d, roughness: 0.35, clearcoat: 0.4, clearcoatRoughness: 0.3 }),
  rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.92 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x9c7348, roughness: 0.7 }),
});
type Mats = ReturnType<typeof materials>;

// ---------------------------------------------------------------------------
// Garage: floor, walls, workbench, pegboard, shelf, shop light.

export interface Garage {
  group: THREE.Group;
  shopLightDiffuser: THREE.Mesh;
}

export function buildGarage(m: Mats): Garage {
  const g = new THREE.Group();

  const floorMaps = concrete();
  const floor = mesh(
    new THREE.PlaneGeometry(10, 10),
    new THREE.MeshStandardMaterial({ ...floorMaps, bumpScale: 0.6, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  g.add(floor);

  const wallMaps = blockWall();
  for (const t of Object.values(wallMaps)) (t as THREE.Texture).repeat.set(5, 2);
  const wallMat = new THREE.MeshStandardMaterial({ ...wallMaps, bumpScale: 1.5, roughness: 0.92 });
  const back = mesh(new THREE.PlaneGeometry(8, 3.2), wallMat, 0, 1.6, -0.45);
  back.receiveShadow = true;
  g.add(back);
  const leftMaps = blockWall();
  for (const t of Object.values(leftMaps)) (t as THREE.Texture).repeat.set(3, 2);
  const left = mesh(new THREE.PlaneGeometry(5, 3.2), new THREE.MeshStandardMaterial({ ...leftMaps, bumpScale: 1.5, roughness: 0.92 }), -2.1, 1.6, 2);
  left.rotation.y = Math.PI / 2;
  left.receiveShadow = true;
  g.add(left);
  const ceiling = mesh(new THREE.PlaneGeometry(8, 6), new THREE.MeshStandardMaterial({ color: 0x5a5854, roughness: 1 }), 0, 2.9, 2);
  ceiling.rotation.x = Math.PI / 2;
  g.add(ceiling);

  // --- workbench
  const bench = new THREE.Group();
  const topMaps = butcherBlock();
  const topMat = new THREE.MeshStandardMaterial({ ...topMaps, bumpScale: 0.4, roughness: 1 });
  const top = mesh(new RoundedBoxGeometry(1.9, 0.05, 0.8, 3, 0.006), topMat, 0, DESK_Y - 0.025, -0.02);
  bench.add(top);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x8a6440, roughness: 0.8 });
  for (const x of [-0.88, 0.88]) {
    for (const z of [-0.37, 0.33]) bench.add(mesh(new THREE.BoxGeometry(0.08, DESK_Y - 0.05, 0.08), frameMat, x, (DESK_Y - 0.05) / 2, z));
  }
  bench.add(mesh(new THREE.BoxGeometry(1.84, 0.1, 0.035), frameMat, 0, DESK_Y - 0.1, 0.36));
  bench.add(mesh(new THREE.BoxGeometry(1.84, 0.025, 0.72), frameMat, 0, 0.18, -0.02));
  // stuff on the lower shelf
  const crate = mesh(new RoundedBoxGeometry(0.45, 0.24, 0.35, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0x2d4f7a, roughness: 0.6 }), -0.45, 0.31, -0.05);
  crate.rotation.y = 0.1;
  bench.add(crate);
  const bucket = mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.34, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0xd96a12, roughness: 0.5, side: THREE.DoubleSide }), 0.45, 0.36, -0.05);
  bench.add(bucket);
  g.add(shadow(bench));

  // --- pegboard + things hanging on it
  const pbW = 1.8, pbH = 0.95;
  const pbMaps = pegboard(pbW, pbH);
  const pb = mesh(new THREE.BoxGeometry(pbW, pbH, 0.006), new THREE.MeshStandardMaterial({ ...pbMaps, bumpScale: 3, roughness: 0.75 }), 0, DESK_Y + 0.12 + pbH / 2, -0.41);
  pb.receiveShadow = true;
  g.add(pb);
  const hangZ = -0.395;
  g.add(shadow(hangingTools(m, hangZ)));

  // --- shelf above the pegboard
  const shelf = new THREE.Group();
  shelf.add(mesh(new THREE.BoxGeometry(1.6, 0.025, 0.26), m.wood, 0, 2.18, -0.32));
  for (const x of [-0.6, 0.6]) shelf.add(mesh(new THREE.BoxGeometry(0.025, 0.18, 0.2), m.darkSteel, x, 2.08, -0.35));
  const rand = rng(99);
  const canColors = [0x2b5e8c, 0xe8e2d0, 0x6e8b3d, 0xb33a2a, 0x3a3a3a];
  let cx = -0.7;
  for (let i = 0; i < 6; i++) {
    const r = 0.06 + rand() * 0.035, h = 0.1 + rand() * 0.09;
    const col = canColors[i % canColors.length];
    const can = new THREE.Group();
    can.add(mesh(new THREE.CylinderGeometry(r, r, h, 32), m.brushed, 0, h / 2, 0));
    const band = mesh(new THREE.CylinderGeometry(r + 0.0015, r + 0.0015, h * 0.62, 32, 1, true), new THREE.MeshStandardMaterial({ color: col, roughness: 0.55 }), 0, h * 0.48, 0);
    can.add(band);
    can.add(mesh(new THREE.TorusGeometry(r - 0.004, 0.003, 8, 32), m.chrome, 0, h, 0).rotateX(Math.PI / 2));
    can.position.set(cx + r, 2.1925, -0.33 + (rand() - 0.5) * 0.05);
    cx += r * 2 + 0.03 + rand() * 0.06;
    if (cx > 0.1 && cx < 0.3) cx = 0.32;
    shelf.add(can);
  }
  g.add(shadow(shelf));

  // --- hanging LED shop light
  const fixture = new THREE.Group();
  fixture.position.set(0, 2.25, 0.02);
  fixture.add(mesh(new RoundedBoxGeometry(1.22, 0.045, 0.13, 2, 0.008), new THREE.MeshStandardMaterial({ color: 0xe6e6e2, metalness: 0.2, roughness: 0.45 })));
  const diffuser = mesh(new THREE.PlaneGeometry(1.18, 0.1), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xfff2e0, emissiveIntensity: 6 }), 0, -0.0235, 0);
  diffuser.rotation.x = Math.PI / 2;
  fixture.add(diffuser);
  for (const x of [-0.5, 0.5]) fixture.add(mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.65, 6), m.darkSteel, x, 0.33, 0));
  g.add(fixture);

  // --- desk clutter
  g.add(shadow(mug(), true, true));
  const pencil = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.17, 6), new THREE.MeshStandardMaterial({ color: 0xe8b21c, roughness: 0.55 }), 0.48, DESK_Y + 0.0035, 0.2);
  pencil.rotation.set(0, 0.5, Math.PI / 2);
  g.add(shadow(pencil));
  const rand2 = rng(7);
  for (let i = 0; i < 5; i++) {
    const screw = new THREE.Group();
    screw.add(mesh(new THREE.CylinderGeometry(0.0022, 0.0015, 0.035, 8), m.brushed, 0, 0, 0));
    screw.add(mesh(new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 12), m.brushed, 0, 0.018, 0));
    screw.position.set(-0.5 + rand2() * 0.14, DESK_Y + 0.0045, 0.18 + rand2() * 0.1);
    screw.rotation.set(0, rand2() * 6, Math.PI / 2);
    g.add(shadow(screw));
  }

  return { group: g, shopLightDiffuser: diffuser };
}

function mug() {
  const pts: THREE.Vector2[] = [];
  const r = 0.042, h = 0.095;
  pts.push(new THREE.Vector2(0, 0.004));
  pts.push(new THREE.Vector2(r - 0.004, 0));
  pts.push(new THREE.Vector2(r, 0.006));
  pts.push(new THREE.Vector2(r + 0.001, h));
  pts.push(new THREE.Vector2(r - 0.004, h));
  pts.push(new THREE.Vector2(r - 0.005, 0.012));
  pts.push(new THREE.Vector2(0, 0.01));
  const ceramic = new THREE.MeshPhysicalMaterial({ color: 0x24394f, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 48), ceramic));
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.0065, 12, 32, Math.PI * 1.1), ceramic);
  handle.position.set(r + 0.004, h * 0.5, 0);
  handle.rotation.z = -Math.PI * 0.55;
  g.add(handle);
  const coffee = new THREE.Mesh(new THREE.CircleGeometry(r - 0.005, 32), new THREE.MeshPhysicalMaterial({ color: 0x1c0f07, roughness: 0.05, clearcoat: 1 }));
  coffee.rotation.x = -Math.PI / 2;
  coffee.position.y = h * 0.8;
  g.add(coffee);
  g.position.set(0.62, DESK_Y, -0.05);
  g.rotation.y = -0.6;
  return g;
}

function combinationWrench(len: number, m: Mats) {
  const w = len * 0.1;
  const t = len * 0.028;
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new RoundedBoxGeometry(w * 0.7, len * 0.72, t, 2, t * 0.4), m.chrome);
  g.add(handle);
  // box end (ring)
  const ring = new THREE.Shape();
  ring.absarc(0, 0, w * 0.95, 0, Math.PI * 2, false);
  const hole = new THREE.Path();
  hole.absarc(0, 0, w * 0.55, 0, Math.PI * 2, true);
  ring.holes.push(hole);
  const ext = { depth: t, bevelEnabled: true, bevelThickness: t * 0.2, bevelSize: t * 0.2, bevelSegments: 2, curveSegments: 24 };
  const ringMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(ring, ext), m.chrome);
  ringMesh.position.set(0, -len * 0.4, -t / 2);
  g.add(ringMesh);
  // open end: a disc with a slot cut into it
  const jaw = new THREE.Shape();
  const r = w * 1.05, s = w * 0.5;
  const a = Math.asin(s / r);
  jaw.moveTo(Math.sin(a) * r * 0.45, 0.2 * r);
  jaw.lineTo(s, r * Math.cos(a));
  jaw.absarc(0, 0, r, Math.PI / 2 - a, Math.PI / 2 + a - Math.PI * 2, true);
  jaw.lineTo(-s * 0.9, 0.2 * r);
  jaw.closePath();
  const jawMesh = new THREE.Mesh(new THREE.ExtrudeGeometry(jaw, ext), m.chrome);
  jawMesh.position.set(0, len * 0.4, -t / 2);
  g.add(jawMesh);
  return g;
}

function hammer(m: Mats) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0xc08a50, roughness: 0.55 }), 0, -0.02, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 16), m.rubber, 0, -0.12, 0));
  const head = new THREE.Group();
  head.add(mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.07, 20), m.darkSteel, 0.035, 0, 0).rotateZ(Math.PI / 2));
  head.add(mesh(new THREE.BoxGeometry(0.03, 0.026, 0.022), m.darkSteel));
  const claw = mesh(new THREE.TorusGeometry(0.05, 0.008, 8, 16, 0.9), m.darkSteel, -0.012, -0.05, 0);
  claw.rotation.z = Math.PI * 0.55;
  head.add(claw);
  head.position.y = 0.14;
  g.add(head);
  return g;
}

function hangingTools(m: Mats, z: number) {
  const g = new THREE.Group();
  const hook = (x: number, y: number) => {
    const h = mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.04, 6), m.chrome, x, y, z + 0.012);
    h.rotation.x = Math.PI / 2;
    g.add(h);
  };
  const sizes = [0.13, 0.16, 0.19, 0.22];
  sizes.forEach((len, i) => {
    const w = combinationWrench(len, m);
    const x = -0.72 + i * 0.07;
    w.position.set(x, 1.55 - len * 0.4 + 0.1, z + 0.01);
    hook(x, 1.55 - 0.4 * len + 0.1 + len * 0.4);
    g.add(w);
  });
  const hm = hammer(m);
  hm.position.set(-0.28, 1.46, z + 0.03);
  hm.rotation.z = 0.05;
  hook(-0.3, 1.58);
  hook(-0.26, 1.58);
  g.add(hm);
  // screwdrivers in a rack
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.02, 0.05), m.darkSteel, 0.1, 1.72, z + 0.025));
  const colors = [0xd6301f, 0xf2c21b, 0x1f5bd6, 0xd6301f, 0x2a2a2a];
  colors.forEach((c, i) => {
    const sd = new THREE.Group();
    sd.add(mesh(new THREE.CylinderGeometry(0.011, 0.013, 0.09, 12), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 0.8 }), 0, 0.06, 0));
    sd.add(mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.1 + i * 0.015, 8), m.chrome, 0, -0.04 - i * 0.007, 0));
    sd.position.set(-0.02 + i * 0.06, 1.72, z + 0.03);
    g.add(sd);
  });
  // extension cord coil
  const cord = new THREE.Group();
  const orange = new THREE.MeshStandardMaterial({ color: 0xe0561a, roughness: 0.6 });
  for (let i = 0; i < 6; i++) {
    const t = mesh(new THREE.TorusGeometry(0.1 + i * 0.003, 0.0055, 8, 48), orange, (i - 3) * 0.004, 0, i * 0.004);
    t.rotation.y = (i - 3) * 0.05;
    cord.add(t);
  }
  cord.position.set(0.62, 1.42, z + 0.03);
  hook(0.62, 1.53);
  g.add(cord);
  // tape measure
  const tape = new THREE.Group();
  tape.add(mesh(new RoundedBoxGeometry(0.075, 0.075, 0.038, 3, 0.012), new THREE.MeshPhysicalMaterial({ color: 0xf2c200, roughness: 0.4, clearcoat: 0.5 })));
  tape.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.04, 24), m.blackPlastic).rotateX(Math.PI / 2));
  tape.position.set(0.32, 1.35, z + 0.022);
  g.add(tape);
  return g;
}

// ---------------------------------------------------------------------------
// Toolbox. Origin = centre of the box's footprint on the desk surface.
// The lid is a child of `lidPivot`, which sits on the hinge line.

export interface Toolbox {
  group: THREE.Group;
  lidPivot: THREE.Group;
  lid: THREE.Group;
  paint: THREE.MeshPhysicalMaterial;
}

export function buildToolbox(m: Mats): Toolbox {
  const { W, D, H, LH, T, FEET, FOAM } = BOX;
  const paint = new THREE.MeshPhysicalMaterial({
    ...wornPaint('#a3141c', 42),
    color: 0xffffff,
    roughness: 1,
    metalness: 1,
    clearcoat: 0.35,
    clearcoatRoughness: 0.28,
  });
  const g = new THREE.Group();
  g.position.y = DESK_Y;
  const body = new THREE.Group();
  body.position.y = FEET;
  g.add(body);
  const panel = (w: number, h: number, d: number, x: number, y: number, z: number, parent: THREE.Object3D) => {
    const p = mesh(new RoundedBoxGeometry(w, h, d, 2, Math.min(w, h, d) * 0.45), paint, x, y, z);
    parent.add(p);
    return p;
  };
  panel(W, T, D, 0, T / 2, 0, body);
  panel(W, H, T, 0, H / 2, D / 2 - T / 2, body);
  panel(W, H, T, 0, H / 2, -D / 2 + T / 2, body);
  panel(T, H, D, W / 2 - T / 2, H / 2, 0, body);
  panel(T, H, D, -W / 2 + T / 2, H / 2, 0, body);
  // pressed stiffening ribs on the front
  for (const y of [H * 0.3, H * 0.34]) panel(W * 0.86, 0.004, 0.003, 0, y, D / 2 + 0.001, body);
  // rolled rim around the opening
  const R = 0.011;
  panel(W + 0.004, 0.009, R, 0, H - 0.0045, D / 2 - R / 2 + 0.002, body);
  panel(W + 0.004, 0.009, R, 0, H - 0.0045, -D / 2 + R / 2 - 0.002, body);
  panel(R, 0.009, D + 0.004, W / 2 - R / 2 + 0.002, H - 0.0045, 0, body);
  panel(R, 0.009, D + 0.004, -W / 2 + R / 2 - 0.002, H - 0.0045, 0, body);
  // foam insert the tools rest on
  const foam = mesh(new RoundedBoxGeometry(W - 2 * T - 0.002, FOAM, D - 2 * T - 0.002, 2, 0.006), new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.97, bumpMap: foamBump(), bumpScale: 1.2 }), 0, T + FOAM / 2, 0);
  body.add(foam);
  // latches
  for (const x of [-W * 0.32, W * 0.32]) {
    const latch = new THREE.Group();
    latch.add(mesh(new RoundedBoxGeometry(0.036, 0.034, 0.008, 2, 0.003), m.chrome));
    latch.add(mesh(new RoundedBoxGeometry(0.03, 0.026, 0.005, 2, 0.002), m.brushed, 0, 0.016, 0.004));
    latch.position.set(x, H - 0.012, D / 2 + 0.004);
    body.add(latch);
  }
  // side carry bails
  for (const s of [-1, 1]) {
    const bail = mesh(new THREE.TorusGeometry(0.03, 0.0035, 10, 24, Math.PI), m.chrome, s * (W / 2 + 0.004), H * 0.62, 0);
    bail.rotation.set(Math.PI, s * Math.PI / 2, 0);
    body.add(bail);
    body.add(mesh(new THREE.BoxGeometry(0.004, 0.016, 0.016), m.chrome, s * (W / 2 + 0.002), H * 0.62, 0.03));
    body.add(mesh(new THREE.BoxGeometry(0.004, 0.016, 0.016), m.chrome, s * (W / 2 + 0.002), H * 0.62, -0.03));
  }
  // piano hinge
  const hinge = mesh(new THREE.CylinderGeometry(0.0045, 0.0045, W * 0.94, 16), m.brushed, 0, H + 0.001, -D / 2 - 0.002);
  hinge.rotation.z = Math.PI / 2;
  body.add(hinge);
  // rubber feet
  for (const x of [-W / 2 + 0.04, W / 2 - 0.04]) for (const z of [-D / 2 + 0.035, D / 2 - 0.035]) {
    g.add(mesh(new THREE.CylinderGeometry(0.012, 0.014, FEET, 16), m.rubber, x, FEET / 2, z));
  }

  // --- lid
  const lidPivot = new THREE.Group();
  lidPivot.position.set(0, FEET + H + 0.001, -D / 2 - 0.002);
  g.add(lidPivot);
  const lid = new THREE.Group();
  lid.position.z = 0.002;
  lidPivot.add(lid);
  panel(W + 0.004, T, D + 0.004, 0, LH - T / 2, D / 2, lid);
  panel(W + 0.004, LH, T, 0, LH / 2, D + 0.002 - T / 2, lid);
  panel(W + 0.004, LH, T, 0, LH / 2, -0.002 + T / 2, lid);
  panel(T, LH, D + 0.004, W / 2 + 0.002 - T / 2, LH / 2, D / 2, lid);
  panel(T, LH, D + 0.004, -W / 2 - 0.002 + T / 2, LH / 2, D / 2, lid);
  // carry handle: two posts + rubber grip
  for (const x of [-0.11, 0.11]) lid.add(mesh(new RoundedBoxGeometry(0.02, 0.03, 0.03, 2, 0.006), m.blackPlastic, x, LH + 0.015, D / 2));
  const grip = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.22, 24), m.rubber, 0, LH + 0.03, D / 2);
  grip.rotation.z = Math.PI / 2;
  lid.add(grip);
  // hasp tabs matching the latches
  for (const x of [-W * 0.32, W * 0.32]) lid.add(mesh(new RoundedBoxGeometry(0.03, 0.022, 0.005, 2, 0.002), m.chrome, x, 0.012, D + 0.004));
  // a sticker, because every real toolbox has one
  const stickerCanvas = document.createElement('canvas');
  stickerCanvas.width = 512;
  stickerCanvas.height = 160;
  const sc = stickerCanvas.getContext('2d')!;
  sc.fillStyle = '#f3efe4';
  sc.fillRect(0, 0, 512, 160);
  sc.fillStyle = '#1b1b1b';
  sc.fillRect(8, 8, 496, 144);
  sc.fillStyle = '#f3efe4';
  sc.font = 'bold 64px Impact, "Arial Black", sans-serif';
  sc.textAlign = 'center';
  sc.textBaseline = 'middle';
  sc.fillText("VUONG'S", 256, 60);
  sc.font = 'bold 34px Arial, sans-serif';
  sc.fillText('TOOLBOX · EST. 2026', 256, 118);
  const stex = new THREE.CanvasTexture(stickerCanvas);
  stex.colorSpace = THREE.SRGBColorSpace;
  const sticker = mesh(new THREE.PlaneGeometry(0.16, 0.05), new THREE.MeshStandardMaterial({ map: stex, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2 }), 0.02, LH * 0.5, D + 0.0026);
  sticker.rotation.z = -0.03;
  lid.add(sticker);

  shadow(g);
  return { group: g, lidPivot, lid, paint };
}

// ---------------------------------------------------------------------------
// Props that live inside the box. Built in body-local space with the long
// axis along +Y, matching cannon's Cylinder orientation.

export interface Prop {
  group: THREE.Group;
  shapes: { shape: CANNON.Shape; offset?: CANNON.Vec3; orientation?: CANNON.Quaternion }[];
  mass: number;
  /** half-height of the resting footprint, used to seat it on the foam */
  restHalfHeight: number;
  /** rest orientation (lying down) */
  restQuat: THREE.Quaternion;
  update?: (dt: number, body: CANNON.Body) => void;
}

const lying = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));

export function buildProp(kind: ToolModel | 'screwdriver' | 'nut', m: Mats): Prop {
  const g = new THREE.Group();
  switch (kind) {
    case 'marker': {
      const label = markerLabel();
      label.center.set(0.5, 0.5);
      label.rotation = Math.PI / 2;
      const barrel = new THREE.MeshPhysicalMaterial({ map: label, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
      g.add(mesh(new THREE.CylinderGeometry(0.0085, 0.0085, 0.1, 32), barrel, 0, -0.015, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.0085, 0.006, 0.012, 32), m.blackPlastic, 0, -0.071, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.0022, 0.0035, 0.008, 12), new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.95 }), 0, -0.081, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.0096, 0.0096, 0.05, 32), m.blackPlastic, 0, 0.055, 0));
      g.add(mesh(new THREE.SphereGeometry(0.0096, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), m.blackPlastic, 0, 0.08, 0));
      g.add(mesh(new RoundedBoxGeometry(0.004, 0.04, 0.0035, 2, 0.0015), m.blackPlastic, 0, 0.055, 0.011));
      return { group: shadow(g), shapes: [{ shape: new CANNON.Cylinder(0.0105, 0.0105, 0.17, 12) }], mass: 0.08, restHalfHeight: 0.0105, restQuat: lying.clone() };
    }
    case 'microphone': {
      const handle = new THREE.MeshPhysicalMaterial({ color: 0x1a1a1c, roughness: 0.5, metalness: 0.4, clearcoat: 0.3 });
      g.add(mesh(new THREE.CylinderGeometry(0.018, 0.013, 0.13, 32), handle, 0, -0.025, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.0135, 0.0135, 0.012, 32), m.chrome, 0, -0.095, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.021, 0.019, 0.016, 32), m.chrome, 0, 0.046, 0));
      const grilleMat = new THREE.MeshStandardMaterial({ color: 0xc9cbce, metalness: 1, roughness: 0.42, bumpMap: wireMesh(), bumpScale: 2 });
      const grille = mesh(new THREE.SphereGeometry(0.029, 48, 32), grilleMat, 0, 0.074, 0);
      grille.scale.y = 0.95;
      g.add(grille);
      g.add(mesh(new RoundedBoxGeometry(0.008, 0.02, 0.005, 2, 0.002), m.brushed, 0, -0.005, 0.017));
      return {
        group: shadow(g),
        shapes: [
          { shape: new CANNON.Cylinder(0.018, 0.014, 0.14, 12), offset: new CANNON.Vec3(0, -0.028, 0) },
          { shape: new CANNON.Sphere(0.029), offset: new CANNON.Vec3(0, 0.074, 0) },
        ],
        mass: 0.3,
        restHalfHeight: 0.029,
        restQuat: lying.clone(),
      };
    }
    case 'compass': {
      const brass = new THREE.MeshStandardMaterial({ color: 0xc9a24a, metalness: 1, roughness: 0.28 });
      g.add(mesh(new THREE.CylinderGeometry(0.034, 0.033, 0.014, 48), brass));
      const bezel = mesh(new THREE.TorusGeometry(0.0315, 0.0028, 12, 48), brass, 0, 0.0072, 0);
      bezel.rotation.x = Math.PI / 2;
      g.add(bezel);
      const face = mesh(new THREE.CircleGeometry(0.03, 48), new THREE.MeshStandardMaterial({ map: compassFace(), roughness: 0.6 }), 0, 0.0071, 0);
      face.rotation.x = -Math.PI / 2;
      g.add(face);
      const needle = new THREE.Group();
      needle.position.y = 0.0085;
      const nShape = (len: number) => {
        const s = new THREE.Shape();
        s.moveTo(0, len);
        s.lineTo(0.003, 0);
        s.lineTo(-0.003, 0);
        s.closePath();
        return new THREE.ShapeGeometry(s);
      };
      const north = mesh(nShape(0.024), new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.4, side: THREE.DoubleSide }));
      const south = mesh(nShape(0.024), new THREE.MeshStandardMaterial({ color: 0xe8e6e0, roughness: 0.4, side: THREE.DoubleSide }));
      south.rotation.z = Math.PI;
      const needleFlat = new THREE.Group();
      needleFlat.rotation.x = -Math.PI / 2;
      needleFlat.add(north, south);
      needle.add(needleFlat);
      needle.add(mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.002, 16), brass, 0, 0.0005, 0));
      g.add(needle);
      const glass = mesh(new THREE.CircleGeometry(0.031, 48), new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transparent: true, opacity: 0.12, clearcoat: 1, depthWrite: false }), 0, 0.0098, 0);
      glass.rotation.x = -Math.PI / 2;
      g.add(glass);
      const bail = mesh(new THREE.TorusGeometry(0.009, 0.0022, 10, 24), brass, 0, 0, -0.04);
      bail.rotation.x = Math.PI / 2;
      g.add(bail);
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 12), brass, 0, 0, -0.034).rotateX(Math.PI / 2));
      // The needle swings toward world north (-Z) like a damped pendulum.
      let angle = 0.8, vel = 0;
      const q = new THREE.Quaternion();
      const fwd = new THREE.Vector3();
      return {
        group: shadow(g),
        shapes: [{ shape: new CANNON.Cylinder(0.034, 0.034, 0.016, 16) }],
        mass: 0.12,
        restHalfHeight: 0.008,
        restQuat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, 0)),
        update: (dt, body) => {
          q.set(body.quaternion.x, body.quaternion.y, body.quaternion.z, body.quaternion.w);
          fwd.set(0, 0, -1).applyQuaternion(q.invert());
          const target = Math.atan2(-fwd.x, -fwd.z);
          let err = target - angle;
          err = Math.atan2(Math.sin(err), Math.cos(err));
          const w = body.angularVelocity;
          vel += (err * 60 - vel * 2.2) * dt - w.y * dt * 8;
          angle += vel * dt;
          needle.rotation.y = angle;
        },
      };
    }
    case 'screwdriver': {
      const handle = new THREE.MeshPhysicalMaterial({ color: 0xe8a90c, roughness: 0.18, clearcoat: 1});
      g.add(mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.1, 6), handle, 0, 0.05, 0));
      g.add(mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 12), m.chrome, 0, -0.06, 0));
      g.add(mesh(new THREE.BoxGeometry(0.007, 0.012, 0.0015), m.chrome, 0, -0.125, 0));
      return {
        group: shadow(g),
        shapes: [
          { shape: new CANNON.Cylinder(0.016, 0.016, 0.1, 8), offset: new CANNON.Vec3(0, 0.05, 0) },
          { shape: new CANNON.Cylinder(0.006, 0.006, 0.13, 6), offset: new CANNON.Vec3(0, -0.065, 0) },
        ],
        mass: 0.12,
        restHalfHeight: 0.016,
        restQuat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.15, Math.PI / 2)),
      };
    }
    case 'nut': {
      const s = new THREE.Shape();
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const p = [Math.cos(a) * 0.009, Math.sin(a) * 0.009] as const;
        if (i) s.lineTo(...p); else s.moveTo(...p);
      }
      s.closePath();
      const hole = new THREE.Path();
      hole.absarc(0, 0, 0.0045, 0, Math.PI * 2, true);
      s.holes.push(hole);
      const nut = mesh(new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelSize: 0.0006, bevelThickness: 0.0006, bevelSegments: 1 }), m.brushed, 0, 0.003, 0);
      nut.rotation.x = Math.PI / 2;
      g.add(nut);
      return { group: shadow(g), shapes: [{ shape: new CANNON.Cylinder(0.0095, 0.0095, 0.007, 6) }], mass: 0.01, restHalfHeight: 0.0035, restQuat: new THREE.Quaternion() };
    }
    case 'wrench':
    default: {
      const w = combinationWrench(0.17, m);
      w.rotation.x = Math.PI / 2;
      g.add(w);
      return { group: shadow(g), shapes: [{ shape: new CANNON.Box(new CANNON.Vec3(0.017, 0.004, 0.09)) }], mass: 0.2, restHalfHeight: 0.004, restQuat: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)) };
    }
  }
}
