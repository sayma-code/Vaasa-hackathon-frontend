import * as THREE from 'three';
import { OrbitControls } from './lib/OrbitControls.js';
import { openDocuments, backend } from './docviewer.js?v=6';

// Scan colours and photos are shown as stored, without colour conversion.
THREE.ColorManagement.enabled = false;

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setClearColor(0x12161c);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, 1, 0.05, 500);
camera.up.set(0, 0, 1); // the scan uses Z as up
const orbit = new OrbitControls(camera, canvas);
orbit.enableDamping = true;
orbit.maxPolarAngle = Math.PI * 0.49;

const cloudGroup = new THREE.Group();
const panoGroup = new THREE.Group();
const markerGroup = new THREE.Group();
scene.add(panoGroup, cloudGroup, markerGroup);

const state = { mode: 'overview', sweep: null, yaw: 0, pitch: 0, selected: null, fly: null };
let data = null;
const pins = [];
const loader = new THREE.TextureLoader();
const v3 = (a) => new THREE.Vector3(a[0], a[1], a[2]);

// ------------------------------------------------------------------ loading

async function init() {
  data = await (await fetch('data/scene.json')).json();
  $('summary').textContent =
    `${data.tags.length} assets tagged from ${data.sweeps.length} scan positions, with no manual tagging`;
  buildMarkers();
  buildPins();
  buildList();
  resetOverview();
  render();
  await loadCloud();
  $('loading').hidden = true;
}

async function loadCloud() {
  const buf = await (await fetch('data/cloud.bin')).arrayBuffer();
  const n = data.points;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, 0, n * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(buf, n * 12, n * 3), 3, true));
  const mat = new THREE.PointsMaterial({ size: 0.035, vertexColors: true, sizeAttenuation: true });
  cloudGroup.add(new THREE.Points(geo, mat));
}

function buildMarkers() {
  const ring = new THREE.RingGeometry(0.16, 0.24, 40);
  const disc = new THREE.CircleGeometry(0.3, 24); // larger invisible target, easier to click
  for (const sw of data.sweeps) {
    const g = new THREE.Group();
    const floor = sw.position[2] - 1.42; // the scanner stands about 1.4 m above the floor
    g.position.set(sw.position[0], sw.position[1], floor + 0.03);
    const visible = new THREE.Mesh(ring, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthTest: false }));
    const target = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ visible: false, side: THREE.DoubleSide }));
    visible.renderOrder = 2;
    g.add(visible, target);
    g.userData.sweep = sw.index;
    markerGroup.add(g);
  }
}

// ------------------------------------------------------------------ tags

function shortName(tag) {
  return tag.panel ? tag.title.split(' protection')[0].replace(' relay', '') : tag.id;
}

function buildPins() {
  for (const tag of data.tags) {
    const el = document.createElement('button');
    el.className = 'pin';
    el.innerHTML = `<span class="label"></span><span class="stem"></span><span class="tip"></span>`;
    el.querySelector('.label').textContent = shortName(tag);
    el.addEventListener('click', () => select(tag));
    $('pins').appendChild(el);
    const n = tag.normal_xyz ? v3(tag.normal_xyz) : new THREE.Vector3();
    pins.push({ tag, el, pos: v3(tag.position_xyz).addScaledVector(n, 0.03) });
  }
}

function buildList() {
  data.tags.forEach((tag, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.innerHTML = `<span class="dot">${i + 1}</span><span><span class="t"></span><small></small></span>`;
    b.querySelector('.t').textContent = tag.title;
    b.querySelector('small').textContent = [tag.panel_function, tag.cabinet].filter(Boolean).join(' · ');
    b.addEventListener('click', () => select(tag));
    li.appendChild(b);
    $('asset-list').appendChild(li);
    tag.listButton = b;
  });
}

function facts(dl, rows) {
  dl.replaceChildren();
  for (const [k, v] of rows) {
    if (v === null || v === undefined || v === '') continue;
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    dl.append(dt, dd);
  }
}

function select(tag) {
  state.selected = tag;
  for (const p of pins) p.el.classList.toggle('active', p.tag === tag);
  for (const t of data.tags) t.listButton.classList.toggle('active', t === tag);

  $('p-product').textContent = tag.product;
  $('p-title').textContent = tag.title;
  $('p-crop').src = `data/${tag.crop}`;
  facts($('p-facts'), [['Panel', tag.panel], ['Function', tag.panel_function], ['Cabinet', tag.cabinet],
    ['Manufacturer', tag.manufacturer],
    ['Position', tag.position_xyz.map((v) => v.toFixed(2)).join(', ') + ' m']]);
  $('p-docs').replaceChildren(...tag.documents.map((d, k) => {
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = d.url;
    a.textContent = d.title;
    a.addEventListener('click', (e) => { e.preventDefault(); openDocuments(tag.title, tag.documents, k); });
    const id = document.createElement('span');
    id.textContent = d.doc_id || d.type;
    a.appendChild(id);
    li.appendChild(a);
    return li;
  }));
  const m = tag.maintenance;
  facts($('p-maint'), m ? [['Last inspection', m.last_inspection], ['Next inspection', m.next_inspection],
    ['Note', m.note]] : [['Status', 'Not in the asset register']]);
  const d = tag.detection;
  facts($('p-detect'), [['Seen in', `${d.sightings} photos from ${d.scan_positions} scan positions`],
    ['Confidence', `${Math.round(d.mean_confidence * 100)}%`], ['Tagging', 'Automatic']]);
  $('panel').hidden = false;

  if (state.mode === 'overview') flyOverview(tag);
  else lookAt(v3(tag.position_xyz), true);
}

$('close').addEventListener('click', () => {
  $('panel').hidden = true;
  state.selected = null;
  for (const p of pins) p.el.classList.remove('active');
  for (const t of data.tags) t.listButton.classList.remove('active');
});
$('p-inside').addEventListener('click', () => {
  const tag = state.selected;
  if (tag) enterSweep(tag.best_sweep, v3(tag.position_xyz));
});

// ------------------------------------------------------------------ overview mode

function resetOverview() {
  const cx = -4.3, cy = -3.3; // middle of the room
  orbit.target.set(cx, cy, 1.0);
  camera.position.set(cx + 9, cy + 7, 9);
  camera.fov = 55;
  camera.updateProjectionMatrix();
}

function flyOverview(tag) {
  const p = v3(tag.position_xyz);
  const n = tag.normal_xyz ? v3(tag.normal_xyz) : new THREE.Vector3(1, 0, 0);
  const side = new THREE.Vector3().crossVectors(n, camera.up).normalize();
  const to = p.clone().addScaledVector(n, 2.6).addScaledVector(side, 1.2).add(new THREE.Vector3(0, 0, 1.3));
  state.fly = { t: 0, fromPos: camera.position.clone(), toPos: to, fromTarget: orbit.target.clone(), toTarget: p };
}

function setMode(mode) {
  state.mode = mode;
  $('mode-overview').classList.toggle('active', mode === 'overview');
  $('mode-inside').classList.toggle('active', mode === 'inside');
  cloudGroup.visible = mode === 'overview';
  panoGroup.visible = mode === 'inside';
  orbit.enabled = mode === 'overview';
  $('hint').textContent = mode === 'overview'
    ? 'Drag to rotate, scroll to zoom. Click a tag, or a white ring to step inside.'
    : 'Drag to look around, scroll to zoom. Click a white ring to move.';
  if (mode === 'overview') {
    state.sweep = null;
    camera.fov = 55;
    camera.updateProjectionMatrix();
    for (const g of markerGroup.children) g.visible = true;
    if (state.selected) flyOverview(state.selected); else resetOverview();
  }
}

// ------------------------------------------------------------------ inside (walk-through) mode

function enterSweep(index, lookTarget) {
  const sw = data.sweeps.find((s) => s.index === index);
  if (!sw) return;
  if (state.mode !== 'inside') setMode('inside');
  state.fly = null;
  state.sweep = index;
  camera.position.copy(v3(sw.position));

  for (const m of panoGroup.children) { m.material.map?.dispose(); m.material.dispose(); m.geometry.dispose(); }
  panoGroup.clear();
  const D = 60; // distance of the photo planes; they form a cube around the viewer
  for (const face of sw.faces) {
    const q = new THREE.Quaternion(...face.quaternion_xyzw);
    const tex = loader.load(`data/${face.file}`);
    tex.minFilter = THREE.LinearFilter;
    tex.generateMipmaps = false;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2 * D * 1.002, 2 * D * 1.002),
      new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false }));
    mesh.quaternion.copy(q);
    mesh.position.copy(camera.position).add(new THREE.Vector3(0, 0, -D).applyQuaternion(q));
    mesh.renderOrder = -1;
    panoGroup.add(mesh);
  }
  for (const g of markerGroup.children) {
    const far = g.position.distanceTo(camera.position) > 7;
    g.visible = g.userData.sweep !== index && !far;
  }
  if (lookTarget) lookAt(lookTarget, false);
  applyLook();
}

function lookAt(target, smooth) {
  const d = target.clone().sub(camera.position).normalize();
  const yaw = Math.atan2(d.y, d.x), pitch = Math.asin(d.z);
  if (smooth) state.turn = { yaw, pitch }; else { state.yaw = yaw; state.pitch = pitch; state.turn = null; }
}

function applyLook() {
  const c = Math.cos(state.pitch);
  const dir = new THREE.Vector3(c * Math.cos(state.yaw), c * Math.sin(state.yaw), Math.sin(state.pitch));
  camera.lookAt(camera.position.clone().add(dir));
}

// ------------------------------------------------------------------ input

let down = null;
canvas.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY, moved: false };
  canvas.classList.add('dragging');
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!down) return;
  const dx = e.clientX - down.x, dy = e.clientY - down.y;
  if (Math.abs(dx) + Math.abs(dy) > 4) down.moved = true;
  if (state.mode === 'inside' && down.moved) {
    const k = THREE.MathUtils.degToRad(camera.fov) / canvas.clientHeight;
    state.yaw += e.movementX * k;
    state.pitch = THREE.MathUtils.clamp(state.pitch + e.movementY * k, -1.45, 1.45);
    state.turn = null;
  }
});
canvas.addEventListener('pointerup', (e) => {
  canvas.classList.remove('dragging');
  if (down && !down.moved) clickScene(e);
  down = null;
});
canvas.addEventListener('wheel', (e) => {
  if (state.mode !== 'inside') return;
  e.preventDefault();
  camera.fov = THREE.MathUtils.clamp(camera.fov + e.deltaY * 0.04, 20, 95);
  camera.updateProjectionMatrix();
}, { passive: false });

const raycaster = new THREE.Raycaster();
function clickScene(e) {
  const r = canvas.getBoundingClientRect();
  const p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(p, camera);
  const hit = raycaster.intersectObjects(markerGroup.children.filter((g) => g.visible), true)[0];
  if (!hit) return;
  const keep = state.mode === 'inside' ? null : state.selected && v3(state.selected.position_xyz);
  const yaw = state.yaw, pitch = state.pitch, wasInside = state.mode === 'inside';
  enterSweep(hit.object.parent.userData.sweep, keep);
  if (wasInside) { state.yaw = yaw; state.pitch = pitch; } // keep looking the same way when stepping
  else if (!keep) lookAt(new THREE.Vector3(-4.3, -3.3, 1.4), false);
}

$('mode-overview').addEventListener('click', () => setMode('overview'));
$('mode-inside').addEventListener('click', () => {
  if (state.mode === 'inside') return;
  const tag = state.selected;
  enterSweep(tag ? tag.best_sweep : 5, tag ? v3(tag.position_xyz) : new THREE.Vector3(-5.7, -3.8, 1.8));
});

// ------------------------------------------------------------------ render loop

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) {
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
}

function updatePins() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const view = new THREE.Vector3();
  for (const p of pins) {
    view.copy(p.pos).applyMatrix4(camera.matrixWorldInverse);
    const ndc = p.pos.clone().project(camera);
    const show = view.z < -0.2 && Math.abs(ndc.x) < 1.1 && Math.abs(ndc.y) < 1.1;
    p.el.style.display = show ? '' : 'none';
    if (show) {
      p.el.style.left = `${(ndc.x * 0.5 + 0.5) * w}px`;
      p.el.style.top = `${(-ndc.y * 0.5 + 0.5) * h}px`;
      p.el.style.zIndex = String(Math.round(1e5 / -view.z));
    }
  }
}

function render() {
  requestAnimationFrame(render);
  resize();
  if (state.mode === 'overview') {
    if (state.fly) {
      const f = state.fly;
      f.t = Math.min(1, f.t + 0.035);
      const k = f.t * f.t * (3 - 2 * f.t);
      camera.position.lerpVectors(f.fromPos, f.toPos, k);
      orbit.target.lerpVectors(f.fromTarget, f.toTarget, k);
      if (f.t >= 1) state.fly = null;
    }
    orbit.update();
  } else {
    if (state.turn) {
      let dy = state.turn.yaw - state.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      state.yaw += dy * 0.12;
      state.pitch += (state.turn.pitch - state.pitch) * 0.12;
      if (Math.abs(dy) < 0.002) state.turn = null;
    }
    applyLook();
  }
  camera.updateMatrixWorld();
  renderer.render(scene, camera);
  if (data) updatePins();
}

backend.then((ok) => { $('detector-link').hidden = !ok; });
setMode('overview');
init();
