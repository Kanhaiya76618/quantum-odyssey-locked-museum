// The museum building: a stacked Paper & Ink tower drawn with three.js.
// One storey per floor of the timeline, milestone plaques on the front wall,
// a door and a staircase on the right, an observatory on the roof.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const INK = 0x2b2b2b;
const CARD = 0xfaf8f3;
const PAPER2 = 0xeae7df;
const GRID = 0xcfcabd;
const ACCENT = 0xb9c4d6;
const QUANTUM = 0x34507a;
const CLASSICAL = 0x8a5a2b;

const W = 6;
const D = 4;
const H = 1.25;
const GAP = 0.4;
const STEP = H + GAP;

function textSprite(text, { size = 56, italic = true, color = '#2B2B2B', width = 2.6 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = color;
  g.font = `${italic ? 'italic ' : ''}700 ${size}px 'Playfair Display', Georgia, serif`;
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.fillText(text, 8, 64);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sprite.renderOrder = 10;
  sprite.scale.set(width, width / 4, 1);
  return sprite;
}

function outline(mesh, material) {
  const lines = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), material);
  lines.position.copy(mesh.position);
  lines.rotation.copy(mesh.rotation);
  lines.scale.copy(mesh.scale);
  return lines;
}

/**
 * floors: [{ range, events: [...] }]
 * opts: { onPick(index) }  index === floors.length means the roof
 * Returns { update(view) } or null when WebGL is not available.
 */
export function createTower(container, floors, opts) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    if (!renderer.getContext()) return null;
  } catch (err) {
    console.warn('WebGL unavailable, showing the floor list only.', err);
    return null;
  }
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.domElement.setAttribute('aria-hidden', 'true');
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 200);
  const towerHeight = floors.length * STEP + 1.6;
  camera.position.set(13, towerHeight * 0.75, 16);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, towerHeight / 2 - 0.6, 0);
  controls.enableZoom = false;
  controls.enablePan = false;
  controls.autoRotate = !reduced;
  controls.autoRotateSpeed = 0.5;
  controls.minPolarAngle = 0.7;
  controls.maxPolarAngle = 1.5;
  controls.update();

  const ink = new THREE.LineBasicMaterial({ color: INK });
  const pickables = [];

  const storeys = floors.map((floor, i) => {
    const group = new THREE.Group();
    group.position.y = i * STEP;

    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.5, 0.16, D + 0.5), new THREE.MeshBasicMaterial({ color: CARD }));
    slab.position.y = -0.08;
    group.add(slab, outline(slab, ink));

    const roomMat = new THREE.MeshBasicMaterial({ color: PAPER2, transparent: true, opacity: 0.6, depthWrite: false });
    const room = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), roomMat);
    room.position.y = H / 2;
    room.userData.floor = i;
    pickables.push(room);
    group.add(room, outline(room, ink));

    // Plaques: one per milestone on the front wall, in up to two rows.
    const n = floor.events.length;
    const perRow = Math.min(13, Math.max(1, Math.ceil(n / 2)));
    const rows = Math.ceil(n / perRow);
    const spacing = (W - 0.6) / perRow;
    const plaques = floor.events.map((ev, k) => {
      const r = Math.floor(k / perRow);
      const c = k % perRow;
      const mat = new THREE.MeshBasicMaterial({ color: CARD, side: THREE.DoubleSide });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(0.28, spacing * 0.7), 0.36), mat);
      p.position.set(-W / 2 + 0.3 + spacing * (c + 0.5), H / 2 + (rows === 1 ? 0 : r === 0 ? 0.24 : -0.24), D / 2 + 0.012);
      group.add(p, outline(p, ink));
      return { id: ev.id, mat };
    });

    // The locked door on the right wall, and the stairs it guards.
    const doorMat = new THREE.MeshBasicMaterial({ color: CLASSICAL, side: THREE.DoubleSide });
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.95), doorMat);
    door.rotation.y = Math.PI / 2;
    door.position.set(W / 2 + 0.012, 0.55, D / 2 - 0.6);
    group.add(door, outline(door, ink));
    const steps = [];
    const n2 = 6;
    for (let s = 0; s <= n2; s++) {
      const z = D / 2 - 1.1 - (s / n2) * 2.2;
      const y = (s / n2) * STEP;
      steps.push(new THREE.Vector3(W / 2 + 0.35, y, z));
      if (s < n2) steps.push(new THREE.Vector3(W / 2 + 0.35, ((s + 1) / n2) * STEP, z));
    }
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(steps), ink));

    const label = textSprite(floor.range, { width: 2.2 });
    label.position.set(-W / 2 + 1.0, H + 0.2, D / 2 + 0.25);
    group.add(label);

    scene.add(group);
    return { roomMat, plaques, doorMat };
  });

  // Roof: the observatory.
  const roofMat = new THREE.MeshBasicMaterial({ color: GRID, transparent: true, opacity: 0.85 });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(W * 0.62, 1.7, 4, 1), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = D / W;
  roof.position.y = floors.length * STEP + 0.85 - GAP + 0.05;
  roof.userData.floor = floors.length;
  pickables.push(roof);
  scene.add(roof, outline(roof, ink));

  const marker = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 16), new THREE.MeshBasicMaterial({ color: QUANTUM }));
  scene.add(marker);

  // Click (not drag) to pick a floor.
  const ray = new THREE.Raycaster();
  let down = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const rect = renderer.domElement.getBoundingClientRect();
    const v = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(v, camera);
    const hit = ray.intersectObjects(pickables, false)[0];
    if (hit) opts.onPick(hit.object.userData.floor);
  });

  function resize() {
    const w = container.clientWidth || 400;
    const h = Math.min(640, Math.round(w * 1.2));
    renderer.setSize(w, h, false);
    renderer.domElement.style.width = `${w}px`;
    renderer.domElement.style.height = `${h}px`;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  if (window.ResizeObserver) new ResizeObserver(resize).observe(container);

  (function loop() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  })();

  return {
    update({ unlocked, current, read, opened }) {
      storeys.forEach((st, i) => {
        const open = i < unlocked;
        st.roomMat.color.setHex(!open ? GRID : i === current ? ACCENT : PAPER2);
        st.roomMat.opacity = open ? 0.6 : 0.85;
        st.plaques.forEach((p) => p.mat.color.setHex(read.has(p.id) ? QUANTUM : CARD));
        st.doorMat.color.setHex(opened.has(i) ? QUANTUM : CLASSICAL);
      });
      roofMat.color.setHex(unlocked > floors.length ? (current === floors.length ? ACCENT : CARD) : GRID);
      const y = current >= floors.length ? floors.length * STEP + 0.2 : current * STEP + 0.22;
      marker.position.set(0, y, current >= floors.length ? 0 : D / 2 + 0.55);
    },
  };
}
