import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/examples/jsm/lights/RectAreaLightUniformsLib.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Tool } from '../tools';
import { BOX, DESK_Y, buildGarage, buildProp, buildToolbox, materials, type Prop } from './models';
import { dustSprite, rng } from './textures';

export type SceneState = 'closed' | 'opening' | 'open' | 'closing' | 'launching';

export interface SceneCallbacks {
  onState: (s: SceneState) => void;
  /** a tool was picked up (index into tools), or the box closed (null) */
  onSelect: (index: number | null) => void;
  onLaunch: (tool: Tool) => void;
}

interface Item {
  prop: Prop;
  body: CANNON.Body;
  home: { pos: CANNON.Vec3; quat: CANNON.Quaternion };
  toolIndex: number | null;
  tween?: { t: number; dur: number; fromP: THREE.Vector3; fromQ: THREE.Quaternion; toP: THREE.Vector3; toQ: THREE.Quaternion; arc: number; done?: () => void };
}

interface View { pos: THREE.Vector3; target: THREE.Vector3; fitWidth: number }

const FIXED_DT = 1 / 120;
const LID_MAX = 1.86; // ~107°, where the lid stay strap stops it
const FOAM_TOP = DESK_Y + BOX.FEET + BOX.T + BOX.FOAM;
const DRAG_Y = DESK_Y + BOX.FEET + BOX.H + 0.07;

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export class ToolboxScene {
  private renderer: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.02, 30);
  private world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  private items: Item[] = [];
  private toolbox: ReturnType<typeof buildToolbox>;
  private lidBody: CANNON.Body;
  private lidProbe = new THREE.Object3D();
  private hoverLight = new THREE.PointLight(0xfff0dc, 0, 0.35, 2);
  private dust: THREE.Points;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private pointerNorm = new THREE.Vector2();
  private raf = 0;
  private timer = new THREE.Timer();
  private acc = 0;
  private time = 0;
  private disposed = false;

  private state: SceneState = 'closed';
  private lid = { angle: 0, vel: 0, hand: 0 as -1 | 0 | 1 };
  private shake = 0;
  private views: Record<'intro' | 'closed' | 'open', View>;
  private cam = { pos: new THREE.Vector3(), target: new THREE.Vector3() };
  private camTween: { from: { pos: THREE.Vector3; target: THREE.Vector3 }; view: View; t: number; dur: number } | null = null;
  private currentView: View;

  private down: { x: number; y: number; item: Item | null; toolbox: boolean; pointerType: string } | null = null;
  private drag: { item: Item; target: THREE.Vector3; holdQuat: THREE.Quaternion } | null = null;
  private hovered: Item | null = null;
  private hoverBox = false;
  private longPress = 0;
  private paused = false;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private coarse = window.matchMedia('(pointer: coarse)').matches;

  constructor(
    private container: HTMLElement,
    private tools: Tool[],
    private cb: SceneCallbacks,
  ) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.coarse ? 1.75 : 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.setupLighting();
    const m = materials();
    const garage = buildGarage(m);
    this.scene.add(garage.group);
    this.toolbox = buildToolbox(m);
    this.scene.add(this.toolbox.group);
    this.toolbox.lid.add(this.lidProbe);
    this.lidProbe.position.set(0, BOX.LH - BOX.T / 2, BOX.D / 2);
    this.scene.add(this.hoverLight);
    this.dust = this.makeDust();
    this.scene.add(this.dust);

    this.setupPhysics();
    this.lidBody = new CANNON.Body({ type: CANNON.Body.KINEMATIC, shape: new CANNON.Box(new CANNON.Vec3(BOX.W / 2, 0.006, BOX.D / 2)) });
    this.world.addBody(this.lidBody);
    this.spawnItems(m);

    this.views = {
      intro: { pos: new THREE.Vector3(0.35, 1.7, 2.2), target: new THREE.Vector3(0, 1.05, -0.05), fitWidth: 1.5 },
      closed: { pos: new THREE.Vector3(0.1, 1.45, 1.36), target: new THREE.Vector3(0, 1.03, -0.05), fitWidth: 1.25 },
      open: { pos: new THREE.Vector3(0, 1.56, 0.36), target: new THREE.Vector3(0, FOAM_TOP, -0.005), fitWidth: 0.6 },
    };
    this.currentView = this.views.closed;
    this.resize();
    this.cam.pos.copy(this.fitted(this.views.intro).pos);
    this.cam.target.copy(this.views.intro.target);
    this.flyTo(this.views.closed, this.reducedMotion ? 0.01 : 2.2);

    // Let the contents settle before the first frame is shown.
    for (let i = 0; i < 120; i++) this.world.step(FIXED_DT);

    this.setupComposer();
    this.bindEvents();
    if (import.meta.env.DEV) (window as unknown as { __toolbox: ToolboxScene }).__toolbox = this;
    this.timer.connect(document);
    this.loop();
  }

  // ---------------------------------------------------------------- setup

  private setupLighting() {
    RectAreaLightUniformsLib.init();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environment = env;
    this.scene.environmentIntensity = 0.06;
    this.scene.background = new THREE.Color(0x0e0d0b);
    this.scene.fog = new THREE.Fog(0x0e0d0b, 3.5, 9);

    // LED shop light over the bench: an area light for broad, soft
    // highlights, plus a co-located spot to cast its (soft) shadows.
    const area = new THREE.RectAreaLight(0xfff2e0, 12, 1.18, 0.1);
    area.position.set(0, 2.2, 0.02);
    area.lookAt(0, 0, 0.02);
    this.scene.add(area);
    const spot = new THREE.SpotLight(0xfff2e0, 8, 6, 0.8, 0.9, 2);
    spot.position.set(0, 2.2, 0.05);
    spot.target.position.set(0, DESK_Y, 0);
    spot.castShadow = true;
    spot.shadow.mapSize.set(this.coarse ? 1024 : 2048, this.coarse ? 1024 : 2048);
    spot.shadow.radius = 6;
    spot.shadow.bias = -0.0002;
    spot.shadow.normalBias = 0.01;
    spot.shadow.camera.near = 0.3;
    spot.shadow.camera.far = 4;
    this.scene.add(spot, spot.target);

    // Late-afternoon sun raking in through an off-screen window.
    const sun = new THREE.DirectionalLight(0xffc48a, 2.4);
    sun.position.set(3.4, 2.3, 1.6);
    sun.target.position.set(0, DESK_Y, 0);
    sun.castShadow = !this.coarse;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.radius = 3;
    sun.shadow.bias = -0.0003;
    sun.shadow.normalBias = 0.01;
    const sc = sun.shadow.camera;
    sc.left = -1.3; sc.right = 1.3; sc.top = 1.3; sc.bottom = -1.3; sc.near = 1; sc.far = 8;
    this.scene.add(sun, sun.target);

    // Cool bounce from the open garage door side.
    const fill = new THREE.DirectionalLight(0x9fb4d6, 0.25);
    fill.position.set(-2, 1.5, 3);
    this.scene.add(fill);
  }

  private setupComposer() {
    if (this.coarse) return; // phones: plain render, AO is too expensive
    const { w, h } = this.size();
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    const ao = new GTAOPass(this.scene, this.camera, w, h);
    ao.updateGtaoMaterial({ radius: 0.12, distanceExponent: 1.5, thickness: 1, scale: 1, samples: 16 });
    ao.blendIntensity = 0.9;
    composer.addPass(ao);
    composer.addPass(new OutputPass());
    this.composer = composer;
    this.composer.setSize(w, h);
  }

  private setupPhysics() {
    const w = this.world;
    w.allowSleep = true;
    w.broadphase = new CANNON.SAPBroadphase(w);
    (w.solver as CANNON.GSSolver).iterations = 14;
    w.defaultContactMaterial.friction = 0.45;
    w.defaultContactMaterial.restitution = 0.18;
    w.defaultContactMaterial.contactEquationStiffness = 5e6;
    w.defaultContactMaterial.contactEquationRelaxation = 3;

    const floor = new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Plane() });
    floor.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    w.addBody(floor);
    w.addBody(new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(0.95, 0.025, 0.4)), position: new CANNON.Vec3(0, DESK_Y - 0.025, -0.02) }));
    w.addBody(new CANNON.Body({ type: CANNON.Body.STATIC, shape: new CANNON.Box(new CANNON.Vec3(4, 1.6, 0.05)), position: new CANNON.Vec3(0, 1.6, -0.46) }));

    // Toolbox shell: floor = foam top, four walls.
    const { W, D, H, T, FEET } = BOX;
    const base = DESK_Y + FEET;
    const shell = new CANNON.Body({ type: CANNON.Body.STATIC });
    const fh = (FOAM_TOP - base) / 2;
    shell.addShape(new CANNON.Box(new CANNON.Vec3(W / 2, fh, D / 2)), new CANNON.Vec3(0, base + fh, 0));
    const wt = 0.01;
    shell.addShape(new CANNON.Box(new CANNON.Vec3(W / 2, H / 2, wt)), new CANNON.Vec3(0, base + H / 2, D / 2 - T + wt));
    shell.addShape(new CANNON.Box(new CANNON.Vec3(W / 2, H / 2, wt)), new CANNON.Vec3(0, base + H / 2, -D / 2 + T - wt));
    shell.addShape(new CANNON.Box(new CANNON.Vec3(wt, H / 2, D / 2)), new CANNON.Vec3(W / 2 - T + wt, base + H / 2, 0));
    shell.addShape(new CANNON.Box(new CANNON.Vec3(wt, H / 2, D / 2)), new CANNON.Vec3(-W / 2 + T - wt, base + H / 2, 0));
    w.addBody(shell);
  }

  private spawnItems(m: ReturnType<typeof materials>) {
    const toolSlots: [number, number][] = [[-0.13, 0.058], [0.085, -0.045], [-0.16, -0.055], [-0.03, -0.06], [0.19, 0.03]];
    this.tools.forEach((tool, i) => {
      const [x, z] = toolSlots[i % toolSlots.length];
      this.addItem(buildProp(tool.model, m), x, z + Math.floor(i / toolSlots.length) * 0.01, i, Math.floor(i / toolSlots.length) * 0.04);
    });
    // Loose hardware that isn't a link — it's there to rattle around.
    this.addItem(buildProp('screwdriver', m), 0.09, 0.07, null);
    const r = rng(3);
    for (const [x, z] of [[-0.02, 0.02], [-0.05, -0.02], [0.2, -0.07], [0.02, 0.085]]) {
      const it = this.addItem(buildProp('nut', m), x, z, null);
      it.home.quat.setFromEuler(r() * 0.3, r() * 6, 0);
      it.body.quaternion.copy(it.home.quat);
    }
  }

  private addItem(prop: Prop, x: number, z: number, toolIndex: number | null, extraY = 0) {
    const body = new CANNON.Body({ mass: prop.mass, linearDamping: 0.05, angularDamping: 0.12, sleepSpeedLimit: 0.02, sleepTimeLimit: 0.4 });
    for (const s of prop.shapes) body.addShape(s.shape, s.offset, s.orientation);
    const pos = new CANNON.Vec3(x, FOAM_TOP + prop.restHalfHeight + 0.002 + extraY, z);
    const q = prop.restQuat;
    const quat = new CANNON.Quaternion(q.x, q.y, q.z, q.w);
    body.position.copy(pos);
    body.quaternion.copy(quat);
    this.world.addBody(body);
    this.scene.add(prop.group);
    prop.group.traverse((o) => { o.userData.itemId = this.items.length; });
    const item: Item = { prop, body, home: { pos, quat }, toolIndex };
    this.items.push(item);
    return item;
  }

  private makeDust() {
    const n = this.coarse ? 160 : 380;
    const r = rng(77);
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 2;
      pos[i * 3 + 1] = DESK_Y + 0.05 + r() * 1.3;
      pos[i * 3 + 2] = -0.35 + r() * 1.2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ size: 0.004, map: dustSprite(), transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffe6c4 });
    const p = new THREE.Points(geo, mat);
    p.userData.base = pos.slice();
    return p;
  }

  // ---------------------------------------------------------------- camera

  private size() {
    return { w: Math.max(1, this.container.clientWidth), h: Math.max(1, this.container.clientHeight) };
  }

  /** Pull the camera back along its view line if the viewport is too narrow for `fitWidth`. */
  private fitted(v: View) {
    const dist = v.pos.distanceTo(v.target);
    const visibleW = 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * this.camera.aspect;
    const k = Math.min(2.6, Math.max(1, v.fitWidth / visibleW));
    return { pos: v.target.clone().add(v.pos.clone().sub(v.target).multiplyScalar(k)), target: v.target };
  }

  private flyTo(view: View, dur: number) {
    this.currentView = view;
    this.camTween = { from: { pos: this.cam.pos.clone(), target: this.cam.target.clone() }, view, t: 0, dur: this.reducedMotion ? Math.min(dur, 0.01) : dur };
  }

  private updateCamera(dt: number) {
    if (this.camTween) {
      const tw = this.camTween;
      tw.t = Math.min(1, tw.t + dt / tw.dur);
      const e = easeInOut(tw.t);
      const f = this.fitted(tw.view);
      this.cam.pos.lerpVectors(tw.from.pos, f.pos, e);
      // lift the path a little mid-flight so it arcs rather than slides
      this.cam.pos.y += Math.sin(e * Math.PI) * 0.08;
      this.cam.target.lerpVectors(tw.from.target, f.target, e);
      if (tw.t >= 1) this.camTween = null;
    } else {
      const f = this.fitted(this.currentView);
      this.cam.pos.lerp(f.pos, 1 - Math.exp(-dt * 6));
      this.cam.target.lerp(f.target, 1 - Math.exp(-dt * 6));
    }
    this.camera.position.copy(this.cam.pos);
    if (!this.reducedMotion && !this.coarse && !this.drag) {
      // subtle head-movement parallax
      const s = this.state === 'open' ? 0.012 : 0.04;
      this.camera.position.x += this.pointerNorm.x * s;
      this.camera.position.y += this.pointerNorm.y * s * 0.5;
    }
    if (this.shake > 0.0005) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-dt * 18);
    }
    this.camera.lookAt(this.cam.target);
  }

  // ---------------------------------------------------------------- state

  private setState(s: SceneState) {
    if (this.state === s) return;
    this.state = s;
    this.cb.onState(s);
  }

  open() {
    if (this.state !== 'closed') return;
    this.setState('opening');
    this.lid.hand = 1;
    this.setFocus(null);
    window.setTimeout(() => {
      if (this.state === 'opening' || this.state === 'open') this.flyTo(this.views.open, 1.5);
    }, this.reducedMotion ? 0 : 250);
  }

  close() {
    if (this.state !== 'open' && this.state !== 'opening') return;
    this.endDrag();
    this.setFocus(null);
    this.cb.onSelect(null);
    this.setState('closing');
    this.flyTo(this.views.closed, 1.4);
    // Put anything that got moved back where it lives, then shut the lid.
    let pending = 0;
    const finish = () => { if (--pending <= 0 && this.state === 'closing') this.lid.hand = -1; };
    for (const it of this.items) {
      if (it.body.position.distanceTo(it.home.pos) > 0.015 || it.body.quaternion.vmult(new CANNON.Vec3(0, 1, 0)).distanceTo(it.home.quat.vmult(new CANNON.Vec3(0, 1, 0))) > 0.2) {
        pending++;
        this.tweenItem(it, it.home.pos, it.home.quat, 0.55, 0.08, finish);
      }
    }
    if (!pending) this.lid.hand = -1;
  }

  /** Browser back-button restored this page from bfcache: undo the launch. */
  restore() {
    for (const it of this.items) {
      if (!this.world.bodies.includes(it.body)) this.world.addBody(it.body);
      it.tween = undefined;
      it.body.type = CANNON.Body.DYNAMIC;
      it.body.position.copy(it.home.pos);
      it.body.quaternion.copy(it.home.quat);
      it.body.velocity.setZero();
      it.body.angularVelocity.setZero();
    }
    this.setState('open');
    this.lid.angle = LID_MAX;
    this.lid.vel = 0;
  }

  /** Open a tool from outside the canvas (the info panel's button). */
  launchTool(index: number) {
    const it = this.items.find((i) => i.toolIndex === index);
    if (it && this.state === 'open') this.launch(it);
  }

  /** Stop rendering entirely (list view is showing) to save power. */
  setPaused(paused: boolean) {
    if (paused === this.paused || this.disposed) return;
    this.paused = paused;
    if (paused) {
      cancelAnimationFrame(this.raf);
    } else {
      this.timer.update();
      this.loop();
    }
  }

  private launch(it: Item) {
    if (it.toolIndex === null) return;
    const tool = this.tools[it.toolIndex];
    this.endDrag();
    this.setFocus(null);
    this.setState('launching');
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    const to = this.camera.position.clone().add(dir.multiplyScalar(0.22));
    const toQ = this.camera.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2 - 0.35, 0, it.prop.restQuat.equals(new THREE.Quaternion()) ? 0 : -Math.PI / 2 + 0.25)));
    this.tweenItem(it, new CANNON.Vec3(to.x, to.y, to.z), new CANNON.Quaternion(toQ.x, toQ.y, toQ.z, toQ.w), 0.7, 0.05);
    this.cb.onLaunch(tool);
  }

  private tweenItem(it: Item, toP: CANNON.Vec3, toQ: CANNON.Quaternion, dur: number, arc: number, done?: () => void) {
    it.body.type = CANNON.Body.KINEMATIC;
    it.body.velocity.setZero();
    it.body.angularVelocity.setZero();
    it.tween = {
      t: 0,
      dur: this.reducedMotion ? 0.01 : dur,
      fromP: new THREE.Vector3(it.body.position.x, it.body.position.y, it.body.position.z),
      fromQ: new THREE.Quaternion(it.body.quaternion.x, it.body.quaternion.y, it.body.quaternion.z, it.body.quaternion.w),
      toP: new THREE.Vector3(toP.x, toP.y + 0.003, toP.z),
      toQ: new THREE.Quaternion(toQ.x, toQ.y, toQ.z, toQ.w),
      arc,
      done,
    };
  }

  // ---------------------------------------------------------------- physics step

  private stepLid(dt: number) {
    const L = this.lid;
    const comY = BOX.LH / 2, comZ = BOX.D / 2;
    const iOverM = (BOX.D * BOX.D + BOX.LH * BOX.LH) / 3;
    // horizontal offset of the lid's centre of mass in front of the hinge
    const zc = -comY * Math.sin(L.angle) + comZ * Math.cos(L.angle);
    const aGravity = (-9.81 * zc) / iOverM;
    let a = aGravity;
    if (L.hand === 1) {
      a = (3.4 - L.vel) * 25; // hand lifts at a steady pace, gravity compensated
      if (L.angle > 1.32) L.hand = 0; // let go, momentum carries it over
    } else if (L.hand === -1) {
      a = (-2.6 - L.vel) * 25;
      if (L.angle < 1.05) L.hand = 0; // push past the balance point, let it drop
    }
    a -= L.vel * 0.6 + Math.sign(L.vel) * 0.5; // hinge friction
    L.vel += a * dt;
    L.angle += L.vel * dt;

    const impact = (v: number) => {
      if (Math.abs(v) > 1.2) {
        this.shake = Math.max(this.shake, Math.min(0.012, Math.abs(v) * 0.0025));
        this.rattle(Math.abs(v));
      }
    };
    if (L.angle > LID_MAX) {
      impact(L.vel);
      L.angle = LID_MAX;
      L.vel = -L.vel * 0.28; // stay strap snaps taut
    }
    if (L.angle < 0) {
      impact(L.vel);
      L.angle = 0;
      L.vel = Math.abs(L.vel) < 0.25 ? 0 : -L.vel * 0.22;
    }
    if (L.hand === 0 && Math.abs(L.vel) < 0.05) {
      if (L.angle >= LID_MAX - 0.02 && this.state === 'opening') this.setState('open');
      if (L.angle <= 0.001 && this.state === 'closing') { L.vel = 0; this.setState('closed'); }
    }
    this.toolbox.lidPivot.rotation.x = -L.angle;
  }

  private rattle(strength: number) {
    const r = Math.min(1, strength / 6);
    for (const it of this.items) {
      if (it.tween || it.body.type !== CANNON.Body.DYNAMIC) continue;
      it.body.wakeUp();
      const m = it.body.mass;
      it.body.applyImpulse(new CANNON.Vec3((Math.random() - 0.5) * 0.05 * m * r, 0.18 * m * r * (0.6 + Math.random() * 0.6), (Math.random() - 0.5) * 0.05 * m * r));
      it.body.angularVelocity.set((Math.random() - 0.5) * 3 * r, (Math.random() - 0.5) * 3 * r, (Math.random() - 0.5) * 3 * r);
    }
  }

  private physics(dt: number) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= FIXED_DT) {
      this.stepLid(FIXED_DT);
      this.toolbox.group.updateMatrixWorld(true);
      const p = new THREE.Vector3(), q = new THREE.Quaternion();
      this.lidProbe.getWorldPosition(p);
      this.lidProbe.getWorldQuaternion(q);
      this.lidBody.position.set(p.x, p.y, p.z);
      this.lidBody.quaternion.set(q.x, q.y, q.z, q.w);
      for (const it of this.items) {
        if (!it.tween) continue;
        const tw = it.tween;
        tw.t = Math.min(1, tw.t + FIXED_DT / tw.dur);
        const e = easeInOut(tw.t);
        const pos = new THREE.Vector3().lerpVectors(tw.fromP, tw.toP, e);
        pos.y += Math.sin(e * Math.PI) * tw.arc;
        const quat = tw.fromQ.clone().slerp(tw.toQ, e);
        it.body.position.set(pos.x, pos.y, pos.z);
        it.body.quaternion.set(quat.x, quat.y, quat.z, quat.w);
        if (tw.t >= 1 && this.state !== 'launching') {
          it.tween = undefined;
          it.body.type = CANNON.Body.DYNAMIC;
          it.body.velocity.setZero();
          it.body.angularVelocity.setZero();
          it.body.wakeUp();
          tw.done?.();
        }
      }
      this.driveDrag();
      this.world.step(FIXED_DT);
      // Small props have almost no rotational inertia, so a glancing hit
      // can spin them absurdly fast; cap it at something a real nut does.
      for (const it of this.items) {
        const w = it.body.angularVelocity;
        const wl = w.length();
        if (wl > 18) w.scale(18 / wl, w);
      }
      // anything knocked off the bench goes back in the box
      for (const it of this.items) {
        if (it.body.position.y < DESK_Y - 0.2 && !it.tween) {
          it.body.position.copy(it.home.pos);
          it.body.position.y += 0.1;
          it.body.quaternion.copy(it.home.quat);
          it.body.velocity.setZero();
          it.body.angularVelocity.setZero();
        }
      }
      this.acc -= FIXED_DT;
    }
    for (const it of this.items) {
      it.prop.group.position.set(it.body.position.x, it.body.position.y, it.body.position.z);
      it.prop.group.quaternion.set(it.body.quaternion.x, it.body.quaternion.y, it.body.quaternion.z, it.body.quaternion.w);
      it.prop.update?.(dt, it.body);
    }
  }

  // ---------------------------------------------------------------- input

  private bindEvents() {
    const el = this.renderer.domElement;
    el.addEventListener('pointerdown', this.onDown);
    el.addEventListener('pointermove', this.onMove);
    el.addEventListener('pointerup', this.onUp);
    el.addEventListener('pointercancel', this.onCancel);
    el.addEventListener('pointerleave', this.onLeave);
    window.addEventListener('keydown', this.onKey);
    this.ro.observe(this.container);
  }

  private ro = new ResizeObserver(() => this.resize());

  private setPointer(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(e.clientX, e.clientY);
    this.pointerNorm.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private pick(): { item: Item | null; toolbox: boolean; point: THREE.Vector3 | null } {
    this.raycaster.setFromCamera(this.pointerNorm, this.camera);
    const targets: THREE.Object3D[] = [this.toolbox.group];
    if (this.state === 'open') for (const it of this.items) targets.push(it.prop.group);
    const hits = this.raycaster.intersectObjects(targets, true);
    for (const h of hits) {
      const id = h.object.userData.itemId as number | undefined;
      if (id !== undefined) {
        const it = this.items[id];
        return { item: it.toolIndex !== null ? it : null, toolbox: false, point: h.point };
      }
      return { item: null, toolbox: true, point: h.point };
    }
    return { item: null, toolbox: false, point: null };
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    this.setPointer(e);
    const hit = this.pick();
    // Loose hardware can be dragged too, so pick again ignoring the tool filter.
    const item = hit.item ?? (this.state === 'open' ? this.pickAnyItem() : null);
    this.down = { x: e.clientX, y: e.clientY, item, toolbox: hit.toolbox, pointerType: e.pointerType };
    this.renderer.domElement.setPointerCapture(e.pointerId);
    // Press and hold (without moving) also picks the thing up.
    window.clearTimeout(this.longPress);
    if (item && this.state === 'open') {
      const d = this.down;
      this.longPress = window.setTimeout(() => {
        if (this.down === d && !this.drag && this.state === 'open') this.startDrag(item);
      }, 280);
    }
  };

  private pickAnyItem(): Item | null {
    this.raycaster.setFromCamera(this.pointerNorm, this.camera);
    const hits = this.raycaster.intersectObjects([this.toolbox.group, ...this.items.map((i) => i.prop.group)], true);
    const id = hits[0]?.object.userData.itemId as number | undefined;
    return id !== undefined ? this.items[id] : null;
  }

  private onMove = (e: PointerEvent) => {
    this.setPointer(e);
    const d = this.down;
    if (d && !this.drag && d.item && this.state === 'open' && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) {
      this.startDrag(d.item);
    }
    if (this.drag) {
      this.updateDrag();
      return;
    }
    if (e.pointerType === 'mouse' && !d) this.updateHover();
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = null;
    window.clearTimeout(this.longPress);
    if (this.drag) {
      this.endDrag();
      return;
    }
    if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return;
    if (this.state === 'closed') {
      if (d.toolbox) this.open();
      return;
    }
    if (this.state !== 'open') return;
    const it = d.item;
    if (it && it.toolIndex !== null) {
      this.launch(it);
      return;
    }
    if (d.toolbox && !it) {
      // tapping the raised lid shuts the box
      this.raycaster.setFromCamera(this.pointerNorm, this.camera);
      if (this.raycaster.intersectObject(this.toolbox.lid, true).length) {
        this.close();
        return;
      }
    }
    this.setFocus(null);
  };

  private onCancel = () => {
    this.down = null;
    window.clearTimeout(this.longPress);
    this.endDrag();
  };

  private onLeave = () => {
    if (!this.down) {
      this.hovered = null;
      this.hoverBox = false;
      this.setFocus(null);
    }
    this.pointerNorm.set(0, 0);
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') this.close();
  };

  private updateHover() {
    const hit = this.pick();
    // Hovering a tool previews it in the info panel. It stays selected when
    // the pointer leaves, so the panel's Open button is still reachable.
    if (this.state === 'open' && hit.item && hit.item !== this.hovered && hit.item.toolIndex !== null) {
      this.cb.onSelect(hit.item.toolIndex);
    }
    this.hovered = hit.item;
    this.hoverBox = this.state === 'closed' && hit.toolbox;
    const el = this.renderer.domElement;
    if (this.hovered) el.style.cursor = 'pointer';
    else if (this.hoverBox) el.style.cursor = 'pointer';
    else if (this.state === 'open' && this.pickAnyItem()) el.style.cursor = 'grab';
    else el.style.cursor = '';
    if (this.state === 'open') this.setFocus(this.hovered);
    else if (this.state === 'closed') this.setFocus(this.hoverBox ? 'box' : null);
  }

  private focused: Item | 'box' | null = null;
  private setFocus(f: Item | 'box' | null) {
    if (this.focused === f) return;
    this.focused = f;
  }

  private startDrag(item: Item) {
    this.setFocus(null);
    if (item.toolIndex !== null) this.cb.onSelect(item.toolIndex);
    const q = item.body.quaternion;
    item.body.wakeUp();
    // While held, contacts can't spin it; driveDrag sets its rotation rate.
    item.body.fixedRotation = true;
    item.body.updateMassProperties();
    this.drag = {
      item,
      target: new THREE.Vector3(item.body.position.x, DRAG_Y, item.body.position.z),
      holdQuat: new THREE.Quaternion(q.x, q.y, q.z, q.w),
    };
    this.renderer.domElement.style.cursor = 'grabbing';
    this.updateDrag();
  }

  private updateDrag() {
    if (!this.drag) return;
    this.raycaster.setFromCamera(this.pointerNorm, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_Y);
    const p = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(plane, p)) return;
    p.x = THREE.MathUtils.clamp(p.x, -0.85, 0.85);
    p.z = THREE.MathUtils.clamp(p.z, -0.33, 0.36);
    this.drag.target.copy(p);
  }

  // Held objects are driven like a hand holds them: move toward the cursor
  // at a capped speed and keep the orientation they were picked up in, with
  // a slight swing into the direction of travel. Letting contacts spin them
  // freely made thin props (marker, nuts) whirl around.
  private driveDrag() {
    if (!this.drag) return;
    const { item, target, holdQuat } = this.drag;
    const b = item.body;
    b.wakeUp();
    const want = new THREE.Vector3(target.x - b.position.x, target.y - b.position.y, target.z - b.position.z).multiplyScalar(14);
    if (want.length() > 2.5) want.setLength(2.5);
    // Lift clear of the box before moving sideways, otherwise it gets
    // dragged along a wall and friction spins it.
    const rim = DESK_Y + BOX.FEET + BOX.H + 0.025;
    if (b.position.y < rim) {
      const k = Math.max(0.05, 1 - (rim - b.position.y) / 0.03);
      want.x *= k;
      want.z *= k;
      want.y = Math.max(want.y, 1.2);
    }
    b.velocity.x += (want.x - b.velocity.x) * 0.35;
    b.velocity.y += (want.y - b.velocity.y) * 0.35;
    b.velocity.z += (want.z - b.velocity.z) * 0.35;

    const swingAxis = new THREE.Vector3(b.velocity.z, 0, -b.velocity.x);
    const swing = Math.min(0.35, swingAxis.length() * 0.2);
    const goal = holdQuat.clone();
    if (swing > 1e-3) goal.premultiply(new THREE.Quaternion().setFromAxisAngle(swingAxis.normalize(), swing));
    const cur = new THREE.Quaternion(b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w);
    const err = goal.multiply(cur.invert());
    if (err.w < 0) err.set(-err.x, -err.y, -err.z, -err.w);
    const angle = 2 * Math.acos(Math.min(1, err.w));
    const s = Math.sqrt(Math.max(0, 1 - err.w * err.w));
    const w = s < 1e-4 ? new THREE.Vector3() : new THREE.Vector3(err.x / s, err.y / s, err.z / s).multiplyScalar(angle * 7);
    if (w.length() > 3.5) w.setLength(3.5);
    b.angularVelocity.set(w.x, w.y, w.z);
  }

  private endDrag() {
    if (!this.drag) return;
    const b = this.drag.item.body;
    b.fixedRotation = false;
    b.updateMassProperties();
    // keep the throw, but don't release it spinning like a top
    const w = b.angularVelocity;
    const wl = w.length();
    if (wl > 4) w.scale(4 / wl, w);
    this.drag = null;
    this.renderer.domElement.style.cursor = '';
  }

  // ---------------------------------------------------------------- frame

  private resize = () => {
    const { w, h } = this.size();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.composer?.setSize(w, h);
  };

  private loop = () => {
    if (this.disposed || this.paused) return;
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = this.timer.getDelta();
    this.adaptQuality(dt);
    this.frame(Math.min(dt, 0.1));
  };

  // Weak GPUs: step quality down (drop AO, then resolution) until frames
  // come in under ~30ms. Only ever steps down, never back up.
  private perf = { frames: 0, total: 0, level: 0 };
  private adaptQuality(dt: number) {
    const p = this.perf;
    if (p.level >= 3 || document.hidden) return;
    p.frames++;
    if (p.frames <= 20) return; // ignore warm-up / shader compiles
    p.total += dt;
    if (p.frames < 80) return;
    const avg = p.total / (p.frames - 20);
    p.frames = 0;
    p.total = 0;
    if (avg < 1 / 32) { p.level = 3; return; } // fast enough, stop measuring
    p.level++;
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    } else {
      this.renderer.setPixelRatio(this.renderer.getPixelRatio() > 1 ? 1 : 0.75);
      this.resize();
    }
  }

  /** Dev/debug aid: advance the simulation without requestAnimationFrame. */
  advance(seconds: number) {
    for (let t = 0; t < seconds; t += 1 / 60) this.frame(1 / 60);
  }

  private frame(dt: number) {
    this.time += dt;
    this.physics(dt);
    this.updateCamera(dt);
    this.updateDust(dt);
    this.updateHoverLight(dt);
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }

  private updateDust(_dt: number) {
    if (this.reducedMotion) return;
    const pos = this.dust.geometry.attributes.position as THREE.BufferAttribute;
    const base = this.dust.userData.base as Float32Array;
    const t = this.time * 0.15;
    for (let i = 0; i < pos.count; i++) {
      const bx = base[i * 3], by = base[i * 3 + 1], bz = base[i * 3 + 2];
      pos.setXYZ(i, bx + Math.sin(t + i) * 0.03, DESK_Y + 0.05 + (((by - DESK_Y - 0.05) + t * 0.02 * (1 + (i % 5))) % 1.3), bz + Math.cos(t * 0.7 + i * 1.3) * 0.03);
    }
    pos.needsUpdate = true;
  }

  private updateHoverLight(dt: number) {
    const f = this.drag?.item ?? (this.focused && this.focused !== 'box' ? this.focused : null);
    const target = f ? 0.25 : 0;
    this.hoverLight.intensity += (target - this.hoverLight.intensity) * (1 - Math.exp(-dt * 10));
    if (f) this.hoverLight.position.set(f.body.position.x, f.body.position.y + 0.06, f.body.position.z + 0.03);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.longPress);
    this.timer.dispose();
    const el = this.renderer.domElement;
    el.removeEventListener('pointerdown', this.onDown);
    el.removeEventListener('pointermove', this.onMove);
    el.removeEventListener('pointerup', this.onUp);
    el.removeEventListener('pointercancel', this.onCancel);
    el.removeEventListener('pointerleave', this.onLeave);
    window.removeEventListener('keydown', this.onKey);
    this.ro.disconnect();
    this.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mats = mesh.material ? (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) : [];
      for (const m of mats) {
        for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
        m.dispose();
      }
    });
    this.scene.environment?.dispose();
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    el.remove();
  }
}
