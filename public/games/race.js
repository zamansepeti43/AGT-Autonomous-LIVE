import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';

// ───────────────────────── config ─────────────────────────
const Q = new URLSearchParams(location.search);
const CFG = {
  laps: Math.max(1, +Q.get('laps') || 3),
  autopilot: true,
  timescale: +Q.get('timescale') || 1,
  autostart: true,
  grid: Q.has('grid') ? Math.min(19, Math.max(0, +Q.get('grid'))) : 9,
  mute: Q.has('mute'),
  capture: Q.has('capture'),
};

let seed = 20260925;
const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
const fmt = t => { if (!isFinite(t) || t <= 0) return '-:--.---'; const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}`; };

// ───────────────────────── vehicle model constants ─────────────────────────
const HALF = 7;            // half track width (m)
const WB = 3.6;            // wheelbase
const GRIP0 = 16;          // mechanical lateral grip (m/s²)
const DF = 0.0045;         // downforce lateral grip coefficient (a = GRIP0 + DF·v²)
const POWER = 1300;        // power / mass (W/kg)
const CD = 0.00178;        // drag / mass
const VTOP = 96;
const WHEEL_R = 0.36;
const latMax = v => GRIP0 + DF * v * v;
const brakeDecel = v => 24 + 0.004 * v * v;
const engineAcc = (v, thr, drs) => thr * Math.min(12.5, POWER / Math.max(v, 1)) - (drs ? 0.85 : 1) * CD * v * v - 0.25;

// fonts must be ready before canvas textures are painted
try { await Promise.race([document.fonts.load('italic 900 60px "Titillium Web"'), new Promise(r => setTimeout(r, 2500))]); } catch {}

// ───────────────────────── track ─────────────────────────
const CTRL = [[0, 0], [300, 0], [520, 0], [600, -40], [620, -140], [560, -220], [440, -240], [380, -320], [420, -420], [560, -460], [700, -420], [780, -320], [860, -300], [920, -380], [880, -520], [700, -620], [400, -640], [150, -600], [-60, -520], [-160, -400], [-140, -260], [-260, -180], [-320, -90], [-260, -12], [-150, 0]];
const curve = new THREE.CatmullRomCurve3(CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z)), true, 'centripetal');
const L = curve.getLength();
const N = Math.round(L / 2);
const DS = L / N;
const W = i => ((i % N) + N) % N;
const sp = curve.getSpacedPoints(N);
const F = () => new Float64Array(N);
const PX = F(), PZ = F(), TX = F(), TZ = F(), A = F(), K = F();
for (let i = 0; i < N; i++) { PX[i] = sp[i].x; PZ[i] = sp[i].z; }
for (let i = 0; i < N; i++) {
  const dx = PX[W(i + 1)] - PX[W(i - 1)], dz = PZ[W(i + 1)] - PZ[W(i - 1)], l = Math.hypot(dx, dz);
  TX[i] = dx / l; TZ[i] = dz / l; A[i] = Math.atan2(TX[i], TZ[i]);
}
for (let i = 0; i < N; i++) K[i] = wrapA(A[W(i + 1)] - A[W(i - 1)]) / (2 * DS);
function smooth(src, r) { const out = F(); for (let i = 0; i < N; i++) { let s = 0; for (let k = -r; k <= r; k++) s += src[W(i + k)]; out[i] = s / (2 * r + 1); } return out; }
const KS = smooth(K, 8);
// +n = right side of travel direction, n = (-TZ, TX). K>0 = left turn → inside is -n.
const BLr = F(), BRr = F();
for (let i = 0; i < N; i++) {
  const r = 1 / Math.max(Math.abs(KS[i]), 1e-6);
  BLr[i] = KS[i] < 0 ? Math.min(20, Math.max(10, 0.75 * r)) : 20;  // inside of right turn is +n
  BRr[i] = KS[i] > 0 ? Math.min(20, Math.max(10, 0.75 * r)) : 20;
}
const BL = smooth(BLr, 10), BR = smooth(BRr, 10);   // barrier distance from centreline (+n side, -n side)
const RL0 = F(); for (let i = 0; i < N; i++) RL0[i] = -4.3 * clamp(KS[i] * 140, -1, 1);
const RL = smooth(RL0, 22);                           // AI racing line lateral offset
// speed profile: corner limit then backward braking pass
const VP = F();
for (let i = 0; i < N; i++) { const k = Math.abs(KS[i]); VP[i] = k <= DF ? VTOP : Math.min(VTOP, Math.sqrt(GRIP0 / (k - DF))); }
for (let pass = 0; pass < 3; pass++) for (let i = N - 1; i >= 0; i--) { const nx = VP[W(i + 1)]; VP[i] = Math.min(VP[i], Math.sqrt(nx * nx + 2 * brakeDecel(nx) * 0.85 * DS)); }
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (let i = 0; i < N; i++) { minX = Math.min(minX, PX[i]); maxX = Math.max(maxX, PX[i]); minZ = Math.min(minZ, PZ[i]); maxZ = Math.max(maxZ, PZ[i]); }
const at = (i, lat, y) => [PX[i] - TZ[i] * lat, y, PZ[i] + TX[i] * lat];
const sIdx = s => W(Math.round((((s % L) + L) % L) / DS));
function trackPos(s, lat, out) {
  s = ((s % L) + L) % L; const f = s / DS; const i = Math.floor(f) % N, j = (i + 1) % N, t = f - Math.floor(f);
  let tx = TX[i] + (TX[j] - TX[i]) * t, tz = TZ[i] + (TZ[j] - TZ[i]) * t; const l = Math.hypot(tx, tz); tx /= l; tz /= l;
  out.x = PX[i] + (PX[j] - PX[i]) * t - tz * lat; out.z = PZ[i] + (PZ[j] - PZ[i]) * t + tx * lat; out.h = Math.atan2(tx, tz); out.i = i; return out;
}

// ───────────────────────── renderer / scene ─────────────────────────
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 0.8;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const ANISO = renderer.capabilities.getMaxAnisotropy();
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.4, 12000);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(50), THREE.MathUtils.degToRad(205));
function makeSky() { const s = new Sky(); s.scale.setScalar(5000); const u = s.material.uniforms; u.turbidity.value = 3.2; u.rayleigh.value = 1.25; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8; u.sunPosition.value.copy(sunDir); return s; }
scene.add(makeSky());
{ const pm = new THREE.PMREMGenerator(renderer); const es = new THREE.Scene(); es.add(makeSky()); scene.environment = pm.fromScene(es, 0.02, 1, 10000).texture; scene.environmentIntensity = 0.5; }
scene.fog = new THREE.Fog(0xbfd0e0, 700, 4200);
scene.add(new THREE.HemisphereLight(0xdfeaff, 0x4f6d3c, 0.45));
const sun = new THREE.DirectionalLight(0xfff0dc, 2.7);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 10, far: 700 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);

// ───────────────────────── textures ─────────────────────────
function tex(w, h, draw, o = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = ANISO;
  if (o.nearest) t.magFilter = THREE.NearestFilter; return t;
}
function speckle(g, w, h, n, cols, size = 2) { for (let i = 0; i < n; i++) { g.fillStyle = cols[(rnd() * cols.length) | 0]; g.globalAlpha = 0.2 + rnd() * 0.5; g.fillRect(rnd() * w, rnd() * h, size * rnd() + 0.6, size * rnd() + 0.6); } g.globalAlpha = 1; }
const asphaltTex = tex(512, 512, (g, w, h) => {
  g.fillStyle = '#55575c'; g.fillRect(0, 0, w, h);
  speckle(g, w, h, 70000, ['#3e4044', '#62656b', '#2f3134', '#707379'], 2.2);
  const gr = g.createLinearGradient(0, 0, w, 0);
  gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.3, 'rgba(16,16,18,.16)'); gr.addColorStop(0.7, 'rgba(16,16,18,.16)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const grassTex = tex(256, 256, (g, w, h) => { g.fillStyle = '#4b8b3a'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.055)'; g.fillRect(0, 0, w / 2, h); speckle(g, w, h, 22000, ['#3d7a2f', '#5a9a45', '#355f28', '#6aa850'], 2); });
grassTex.repeat.set(400, 400);
const kerbTex = tex(64, 64, g => { g.fillStyle = '#d4202c'; g.fillRect(0, 0, 64, 32); g.fillStyle = '#f2f2f2'; g.fillRect(0, 32, 64, 32); });
const SPONSORS = [['VOLTEX', '#1c3faa', '#fff', 'ENERGY'], ['ORBITA', '#ececec', '#0a2a6a', 'AIRWAYS'], ['KAIROS', '#111', '#ffd400', 'SWISS TIMING'], ['HALCYON', '#d0102a', '#fff', 'BANK'], ['ZENTH', '#0d7a5a', '#fff', 'TELECOM'], ['PRISMA', '#ffd400', '#111', 'TYRES'], ['NORDA', '#5a2bd0', '#fff', 'CLOUD'], ['LUMEN', '#ff7a1a', '#111', 'OIL']];
const boardTex = tex(2048, 128, (g, w, h) => SPONSORS.forEach(([n, bg, fg, sub], k) => {
  const x = k * 256; g.fillStyle = bg; g.fillRect(x, 0, 256, h); g.fillStyle = fg; g.textAlign = 'center';
  g.font = 'italic 900 60px "Titillium Web", Arial Black, sans-serif'; g.fillText(n, x + 128, 74);
  g.font = '700 18px "Titillium Web", Arial, sans-serif'; g.fillText(sub, x + 128, 104); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(x + 253, 0, 3, h);
}));
const fenceTex = tex(64, 64, (g, w, h) => { g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(205,210,215,1)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(w, h); g.moveTo(w, 0); g.lineTo(0, h); g.stroke(); });
const crowdTex = tex(256, 256, (g, w, h) => {
  g.fillStyle = '#2a2e38'; g.fillRect(0, 0, w, h);
  const cols = ['#e53935', '#fdd835', '#1e88e5', '#fafafa', '#43a047', '#fb8c00', '#8e24aa', '#f06292', '#00acc1', '#6d4c41', '#212121', '#ff7a1a'];
  for (let y = 0; y < h; y += 8) for (let x = 0; x < w; x += 5) if (rnd() < 0.9) { const jy = rnd() * 2; g.fillStyle = cols[(rnd() * cols.length) | 0]; g.fillRect(x + 1, y + 3 + jy, 3, 4); g.fillStyle = '#e2b996'; g.fillRect(x + 1.5, y + 1 + jy, 2, 2); }
}, { nearest: true });
const facadeTex = tex(512, 256, (g, w, h) => {
  g.fillStyle = '#1d2027'; g.fillRect(0, 0, w, h);
  const gr = g.createLinearGradient(0, 20, 0, 110); gr.addColorStop(0, '#7d9cbd'); gr.addColorStop(1, '#2b3c52'); g.fillStyle = gr; g.fillRect(0, 24, w, 86);
  g.fillStyle = '#1d2027'; for (let x = 0; x < w; x += 64) g.fillRect(x, 24, 4, 86);
  for (let x = 8; x < w; x += 128) { g.fillStyle = '#0c0d10'; g.fillRect(x, 140, 112, 116); g.fillStyle = '#d8d8d8'; g.fillRect(x, 134, 112, 4); }
});
const textTex = (text, bg = '#0b0b0f', fg = '#fff', w = 1024, h = 128, size = 84) => tex(w, h, g => { g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.font = `italic 900 ${size}px "Titillium Web", Arial Black, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 4); });
const signTex = textTex('AURORA GRAND PRIX');
const checkerTex = tex(64, 16, g => { for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#f4f4f4'; g.fillRect(x * 4, y * 4, 4, 4); } }, { nearest: true });

// ───────────────────────── track geometry ─────────────────────────
function strip(i0, count, fn, vLen, uA = 0, uB = 1, swap = false) {
  const pos = [], uv = [], ind = [];
  for (let k = 0; k <= count; k++) {
    const i = W(i0 + k), s = (i0 + k) * DS, [a, b] = fn(i), v = s / vLen;
    pos.push(...a, ...b); if (swap) uv.push(v, uA, v, uB); else uv.push(uA, v, uB, v);
  }
  for (let k = 0; k < count; k++) { const a = 2 * k; ind.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(ind); g.computeVertexNormals(); return g;
}
const DS2 = THREE.DoubleSide;
const addMesh = (geo, mat, cast = false, recv = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = recv; scene.add(m); return m; };
const std = o => new THREE.MeshStandardMaterial({ side: DS2, ...o });

addMesh(new THREE.PlaneGeometry(8000, 8000).rotateX(-Math.PI / 2).translate((minX + maxX) / 2, -0.02, (minZ + maxZ) / 2), std({ map: grassTex, roughness: 1, side: THREE.FrontSide }));
addMesh(strip(0, N, i => [at(i, HALF, 0.02), at(i, -HALF, 0.02)], 14), std({ map: asphaltTex, roughness: 0.88, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
const lineMat = std({ color: 0xf2f2f2, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
addMesh(strip(0, N, i => [at(i, HALF - 0.1, 0.03), at(i, HALF - 0.5, 0.03)], 10), lineMat);
addMesh(strip(0, N, i => [at(i, -HALF + 0.5, 0.03), at(i, -HALF + 0.1, 0.03)], 10), lineMat);
// kerbs on corners
{
  const kerbMat = std({ map: kerbTex, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  const on = i => Math.abs(KS[i]) > 1 / 230;
  let start = 0; while (on(start)) start++;
  for (let k = 0; k < N;) {
    const i = W(start + k); if (!on(i)) { k++; continue; }
    let len = 0; while (len < N && on(W(i + len))) len++;
    const i0 = i - 6, cnt = len + 12;
    addMesh(strip(i0, cnt, j => [at(j, HALF + 1.5, 0.04), at(j, HALF, 0.04)], 3), kerbMat);
    addMesh(strip(i0, cnt, j => [at(j, -HALF, 0.04), at(j, -HALF - 1.5, 0.04)], 3), kerbMat);
    k += len + 1;
  }
}
// start line + grid slots
const GRID_GAP = 8, GRID0 = 10;
{
  const ck = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF, 1.2).rotateX(-Math.PI / 2), std({ map: checkerTex, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6 }));
  const p = trackPos(0, 0, {}); ck.position.set(p.x, 0.045, p.z); ck.rotation.y = p.h; ck.receiveShadow = true; scene.add(ck);
  const slotG = new THREE.PlaneGeometry(3.2, 0.3).rotateX(-Math.PI / 2);
  for (let g = 0; g < 20; g++) {
    const q = trackPos(L - (GRID0 + g * GRID_GAP) + 3.1, g % 2 ? 2.8 : -2.8, {});
    const m = new THREE.Mesh(slotG, lineMat); m.position.set(q.x, 0.045, q.z); m.rotation.y = q.h; m.receiveShadow = true; scene.add(m);
  }
}
// barriers: sponsor boards + catch fence + posts
const boardMat = std({ map: boardTex, roughness: 0.55 });
addMesh(strip(0, N, i => [at(i, BL[i], 1.15), at(i, BL[i], 0)], -48, 1, 0, true), boardMat, false);
addMesh(strip(0, N, i => [at(i, -BR[i], 1.15), at(i, -BR[i], 0)], 48, 1, 0, true), boardMat, false);
const fenceMat = std({ map: fenceTex, alphaTest: 0.4, alphaToCoverage: true, metalness: 0.5, roughness: 0.5 });
addMesh(strip(0, N, i => [at(i, BL[i] + 0.15, 4.6), at(i, BL[i] + 0.15, 1.15)], 1.3, 3.45 / 1.3, 0, true), fenceMat, false, false);
addMesh(strip(0, N, i => [at(i, -BR[i] - 0.15, 4.6), at(i, -BR[i] - 0.15, 1.15)], 1.3, 3.45 / 1.3, 0, true), fenceMat, false, false);
{
  const postG = new THREE.BoxGeometry(0.14, 4.8, 0.14).translate(0, 2.4, 0);
  const n = Math.floor(N / 8) * 2, im = new THREE.InstancedMesh(postG, std({ color: 0x8a8f96, metalness: 0.7, roughness: 0.4 }), n);
  const m4 = new THREE.Matrix4(); let c = 0;
  for (let i = 0; i < N && c < n; i += 8) { const a = at(i, BL[i] + 0.3, 0), b = at(i, -BR[i] - 0.3, 0); im.setMatrixAt(c++, m4.makeTranslation(...a)); im.setMatrixAt(c++, m4.makeTranslation(...b)); }
  im.count = c; scene.add(im);
}
// main straight: grandstand (+n side) and pit building (-n side)
{
  const i0 = sIdx(L - 150), cnt = Math.round(620 / DS);
  const crowdMat = std({ map: crowdTex, roughness: 0.9 });
  addMesh(strip(i0, cnt, i => [at(i, BL[i] + 24, 15), at(i, BL[i] + 3.5, 1.8)], 25, 2.4, 0, true), crowdMat, true);
  addMesh(strip(i0, cnt, i => [at(i, BL[i] + 3.5, 1.8), at(i, BL[i] + 3.5, 0)], 10), std({ color: 0x9a9da3, roughness: 0.9 }));
  addMesh(strip(i0, cnt, i => [at(i, BL[i] + 24, 21), at(i, BL[i] + 24, 0)], 10), std({ color: 0x2b2f38, roughness: 0.9 }), true);
  addMesh(strip(i0, cnt, i => [at(i, BL[i] + 25, 21), at(i, BL[i] + 1, 19.5)], 10), std({ color: 0x23262d, roughness: 0.6, metalness: 0.4 }), true);
  const pitF = std({ map: facadeTex, roughness: 0.4, metalness: 0.2 });
  const p0 = sIdx(L - 60), pc = Math.round(420 / DS);
  addMesh(strip(p0, pc, i => [at(i, -BR[i] - 8, 11), at(i, -BR[i] - 8, 0)], 22, 1, 0, true), pitF, true);
  addMesh(strip(p0, pc, i => [at(i, -BR[i] - 7, 11.3), at(i, -BR[i] - 32, 11.3)], 10), std({ color: 0x30343d, roughness: 0.8 }), true);
  addMesh(strip(p0, pc, i => [at(i, -BR[i] - 32, 11.3), at(i, -BR[i] - 32, 0)], 10), std({ color: 0x30343d, roughness: 0.8 }));
  const s0 = sIdx(40), scn = Math.round(130 / DS);
  addMesh(strip(s0, scn, i => [at(i, -BR[i] - 12, 17.5), at(i, -BR[i] - 12, 11.3)], 50, 1, 0, true), std({ map: signTex, roughness: 0.5, emissive: 0x222222 }), true);
  // pit lane asphalt
  addMesh(strip(p0, pc, i => [at(i, -BR[i] - 1, 0.015), at(i, -BR[i] - 8, 0.015)], 14), std({ map: asphaltTex, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }));
}
// secondary grandstand at the hairpin
{
  const i0 = sIdx(0) ; let best = 0, bi = 0; for (let i = 0; i < N; i++) if (Math.abs(KS[i]) > best && Math.abs(i * DS - L / 2) < L / 3) { best = Math.abs(KS[i]); bi = i; }
  const side = KS[bi] > 0 ? 1 : -1;  // outside of the turn
  const c0 = W(bi - 40), cnt = 80, crowdMat = std({ map: crowdTex, roughness: 0.9 });
  const off = i => (side > 0 ? BL[i] : BR[i]);
  addMesh(strip(c0, cnt, i => [at(i, side * (off(i) + 18), 11), at(i, side * (off(i) + 3), 1.5)], 25, 1.8, 0, true), crowdMat, true);
  addMesh(strip(c0, cnt, i => [at(i, side * (off(i) + 19), 15), at(i, side * (off(i) + 1.5), 14)], 10), std({ color: 0x23262d, roughness: 0.6 }), true);
  addMesh(strip(c0, cnt, i => [at(i, side * (off(i) + 18), 15), at(i, side * (off(i) + 18), 0)], 10), std({ color: 0x2b2f38 }), true);
}
// start gantry with lights
const gantryLights = [];
{
  const g = new THREE.Group(); const p = trackPos(14, 0, {}); g.position.set(p.x, 0, p.z); g.rotation.y = p.h;
  const steel = std({ color: 0x2a2d33, metalness: 0.6, roughness: 0.4 });
  const w = 2 * HALF + 5;
  for (const x of [-w / 2, w / 2]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, 9, 0.8), steel); m.position.set(x, 4.5, 0); m.castShadow = true; g.add(m); }
  const beamMats = [steel, steel, steel, steel, std({ map: signTex }), std({ map: signTex })];
  const beam = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 2, 0.7), beamMats); beam.position.y = 8.2; beam.castShadow = true; g.add(beam);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(5.2, 1.7, 0.5), std({ color: 0x080808, roughness: 0.6 })); panel.position.set(0, 6.3, -0.1); g.add(panel);
  const discG = new THREE.CircleGeometry(0.28, 20).rotateY(Math.PI);
  for (let c = 0; c < 5; c++) { const col = []; for (let r = 0; r < 2; r++) { const m = new THREE.Mesh(discG, new THREE.MeshBasicMaterial({ color: 0x300505 })); m.position.set(-2 + c, 6.7 - r * 0.75, -0.36); g.add(m); col.push(m); } gantryLights.push(col); }
  scene.add(g);
}
// scenery: mountains + trees
{
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  const c1 = new THREE.Color(0x4c7a44), c2 = new THREE.Color(0x8d968c), tc = new THREE.Color();
  for (let k = 0; k < 12; k++) {
    const ang = k / 12 * Math.PI * 2 + rnd() * 0.4, dist = 1700 + rnd() * 900, r = 380 + rnd() * 420;
    let g = new THREE.IcosahedronGeometry(r, 5); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = mergeVertices(g);
    const p = g.attributes.position, col = [];
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = 1 + 0.2 * Math.sin(x * 0.011 + k) * Math.cos(z * 0.012 - k) + 0.08 * Math.sin(x * 0.03 + y * 0.025);
      x *= n; y *= n; z *= n; p.setXYZ(i, x, y, z);
      const hh = clamp(y / r * 1.2, 0, 1); tc.copy(c1).lerp(c2, hh * hh); col.push(tc.r, tc.g, tc.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat); m.scale.y = 0.35 + rnd() * 0.4; m.position.set(cx + Math.cos(ang) * dist, -r * 0.12, cz + Math.sin(ang) * dist); scene.add(m);
  }
  // spatial hash for tree clearance
  const cell = 60, hash = new Map();
  for (let i = 0; i < N; i += 2) { const key = Math.floor(PX[i] / cell) + ',' + Math.floor(PZ[i] / cell); if (!hash.has(key)) hash.set(key, []); hash.get(key).push(i); }
  const near = (x, z, r) => { const cx = Math.floor(x / cell), cz = Math.floor(z / cell); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = hash.get((cx + a) + ',' + (cz + b)); if (l) for (const i of l) if ((PX[i] - x) ** 2 + (PZ[i] - z) ** 2 < r * r) return true; } return false; };
  const COUNT = 1800;
  const cone = new THREE.ConeGeometry(1, 1, 7).translate(0, 0.5, 0), trunk = new THREE.CylinderGeometry(0.14, 0.2, 1, 5).translate(0, 0.5, 0);
  const im = new THREE.InstancedMesh(cone, new THREE.MeshStandardMaterial({ roughness: 1 }), COUNT), it = new THREE.InstancedMesh(trunk, new THREE.MeshStandardMaterial({ color: 0x4a3526, roughness: 1 }), COUNT);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), col = new THREE.Color();
  let n = 0;
  for (let t = 0; t < COUNT * 20 && n < COUNT; t++) {
    const x = minX - 550 + rnd() * (maxX - minX + 1100), z = minZ - 550 + rnd() * (maxZ - minZ + 1100);
    if (near(x, z, 58)) continue;
    const h = 9 + rnd() * 11, w = 2.6 + rnd() * 2.2;
    im.setMatrixAt(n, m4.compose(ps.set(x, 2, z), q, sc.set(w, h, w))); it.setMatrixAt(n, m4.compose(ps.set(x, 0, z), q, sc.set(1, 2.4, 1)));
    im.setColorAt(n, col.setHSL(0.27 + rnd() * 0.06, 0.42 + rnd() * 0.2, 0.15 + rnd() * 0.08)); n++;
  }
  im.count = it.count = n; im.castShadow = true; im.receiveShadow = true; scene.add(im, it);
}

// ───────────────────────── car model ─────────────────────────
function loft(sec, seg = 20, pw = 2.8) {
  const pos = [], ind = [];
  for (const [z, hw, yb, yt] of sec) { const yc = (yb + yt) / 2, hh = (yt - yb) / 2; for (let j = 0; j < seg; j++) { const t = j / seg * Math.PI * 2, c = Math.cos(t), s = Math.sin(t); pos.push(hw * Math.sign(c) * Math.abs(c) ** (2 / pw), yc + hh * Math.sign(s) * Math.abs(s) ** (2 / pw), z); } }
  for (let r = 0; r < sec.length - 1; r++) for (let j = 0; j < seg; j++) { const a = r * seg + j, b = r * seg + (j + 1) % seg; ind.push(a, b, a + seg, b, b + seg, a + seg); }
  for (const [r, flip] of [[0, true], [sec.length - 1, false]]) { const ci = pos.length / 3, [z, , yb, yt] = sec[r]; pos.push(0, (yb + yt) / 2, z); for (let j = 0; j < seg; j++) { const a = r * seg + j, b = r * seg + (j + 1) % seg; flip ? ind.push(ci, b, a) : ind.push(ci, a, b); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(ind); g.computeVertexNormals(); return g;
}
const box = (w, h, d, x, y, z, rx = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); return g.translate(x, y, z); };
function rod(a, b, r = 0.022) { const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b), l = va.distanceTo(vb); const g = new THREE.CylinderGeometry(r, r, l, 6).translate(0, l / 2, 0); g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.sub(va).normalize())); return g.translate(va.x, va.y, va.z); }
const prep = g => { g = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(g.attributes)) if (k !== 'position') g.deleteAttribute(k); g.computeVertexNormals(); return g; };
const merge = list => mergeGeometries(list.map(prep));
const FW = [1.75, 0.82], RW = [-1.6, 0.8];
const CG = {
  paint: merge([
    loft([[2.95, 0.05, 0.22, 0.3], [2.6, 0.12, 0.18, 0.38], [1.8, 0.22, 0.14, 0.5], [1.0, 0.35, 0.12, 0.62], [0.4, 0.42, 0.12, 0.66], [-0.1, 0.42, 0.12, 0.72], [-0.4, 0.3, 0.12, 0.98], [-0.9, 0.3, 0.12, 0.88], [-1.6, 0.24, 0.12, 0.66], [-2.2, 0.14, 0.14, 0.48], [-2.45, 0.04, 0.2, 0.36]]),
    loft([[0.55, 0.45, 0.12, 0.3], [0.35, 0.84, 0.12, 0.52], [-0.3, 0.84, 0.12, 0.55], [-1.2, 0.56, 0.12, 0.45], [-1.9, 0.25, 0.14, 0.35]]),
    box(0.02, 0.3, 1.1, 0, 0.9, -1.15),
    box(0.035, 0.52, 0.62, 0.52, 0.8, -2.2), box(0.035, 0.52, 0.62, -0.52, 0.8, -2.2),
  ]),
  accent: merge([
    box(0.03, 0.24, 0.6, 0.96, 0.18, 2.6), box(0.03, 0.24, 0.6, -0.96, 0.18, 2.6),
    box(1.72, 0.025, 0.24, 0, 0.2, 2.5, -0.35),
    new THREE.SphereGeometry(0.15, 16, 12).translate(0, 0.78, 0.18),
    loft([[0.32, 0.24, 0.3, 0.52], [0.0, 0.84, 0.46, 0.54], [-0.6, 0.8, 0.48, 0.55], [-1.2, 0.5, 0.42, 0.47]], 16),
  ]),
  carbon: merge([
    box(1.5, 0.04, 3.9, 0, 0.08, 0.1), box(1.1, 0.22, 0.35, 0, 0.18, -2.2),
    box(1.92, 0.03, 0.44, 0, 0.1, 2.64),
    box(1.04, 0.035, 0.34, 0, 0.9, -2.26), box(0.92, 0.03, 0.2, 0, 0.46, -2.32), box(0.05, 0.48, 0.12, 0, 0.66, -2.15),
    box(0.48, 0.03, 0.78, 0, 0.665, 0.3),
    new THREE.TorusGeometry(0.36, 0.03, 8, 22, Math.PI).rotateX(Math.PI / 2).translate(0, 0.92, 0.16),
    rod([0.36, 0.92, 0.16], [0.36, 0.66, 0.05], 0.03), rod([-0.36, 0.92, 0.16], [-0.36, 0.66, 0.05], 0.03), rod([0, 0.92, 0.52], [0, 0.6, 0.98], 0.03),
    box(0.16, 0.07, 0.04, 0.58, 0.74, 0.55), box(0.16, 0.07, 0.04, -0.58, 0.74, 0.55), rod([0.3, 0.6, 0.55], [0.54, 0.73, 0.55], 0.012), rod([-0.3, 0.6, 0.55], [-0.54, 0.73, 0.55], 0.012),
    ...[FW, RW].flatMap(([z, x]) => [1, -1].flatMap(sg => [rod([sg * 0.25, 0.46, z + 0.18], [sg * (x - 0.12), 0.44, z]), rod([sg * 0.25, 0.46, z - 0.18], [sg * (x - 0.12), 0.44, z]), rod([sg * 0.22, 0.22, z + 0.15], [sg * (x - 0.12), 0.26, z]), rod([sg * 0.22, 0.22, z - 0.15], [sg * (x - 0.12), 0.26, z])])),
  ]),
  flap: prep(box(1.04, 0.03, 0.24, 0, 0, -0.12)),
  light: new THREE.BoxGeometry(0.12, 0.08, 0.03).translate(0, 0.3, -2.47),
};
function wheelGeo(w) {
  const tire = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, w, 32, 1).rotateZ(Math.PI / 2);
  const rim = [new THREE.CylinderGeometry(0.25, 0.25, w + 0.012, 24).rotateZ(Math.PI / 2)];
  for (const sg of [1, -1]) for (let k = 0; k < 5; k++) rim.push(new THREE.BoxGeometry(0.02, 0.44, 0.045).rotateX(k * Math.PI / 5).translate(sg * (w / 2 + 0.012), 0, 0));
  const stripe = [1, -1].map(sg => new THREE.TorusGeometry(WHEEL_R * 0.83, 0.016, 6, 32).rotateY(Math.PI / 2).translate(sg * (w / 2 + 0.004), 0, 0));
  return mergeGeometries([prep(tire), mergeGeometries(rim.map(prep)), mergeGeometries(stripe.map(prep))], true);
}
const WG = { f: wheelGeo(0.36), r: wheelGeo(0.42) };
const WMATS = [new THREE.MeshStandardMaterial({ color: 0x161618, roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: 0x2c2c30, metalness: 0.85, roughness: 0.35 }), new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.6 })];
const CARBON = new THREE.MeshStandardMaterial({ color: 0x141518, roughness: 0.42, metalness: 0.35, side: DS2 });
const TAIL = new THREE.MeshStandardMaterial({ color: 0x400000, emissive: 0xff1010, emissiveIntensity: 1.5 });
const blobTex = tex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 4, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const BLOB = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -8 });
const blobG = new THREE.PlaneGeometry(2.6, 6.2).rotateX(-Math.PI / 2);

const TEAMS = [['Volt Racing', 0xff7a1a, 0x1e8fff], ['Scarlet Corsa', 0xd8102a, 0xffd400], ['Azure Alpine', 0x2d6bff, 0xff5fb0], ['Verde Motorsport', 0x0c7a5a, 0xcff000], ['Argent GP', 0xb8c0c8, 0x00c2b0], ['Nocturne', 0x13204a, 0xe8003d], ['Polaris', 0xf2f2f2, 0xd8102a], ['Solaris', 0xffcc00, 0x151515], ['Violetta', 0x6a2bd8, 0xffffff], ['Onyx Racing', 0x1a1a1a, 0xc9a13b]];
const paint = c => new THREE.MeshPhysicalMaterial({ color: c, metalness: 0.05, roughness: 0.45, clearcoat: 0.8, clearcoatRoughness: 0.12, envMapIntensity: 0.6, side: DS2 });
const TMATS = TEAMS.map(([, a, b]) => ({ paint: paint(a), accent: paint(b) }));
function makeCarMesh(team) {
  const g = new THREE.Group(), m = TMATS[team];
  const add = (geo, mat, parent = g) => { const x = new THREE.Mesh(geo, mat); x.castShadow = true; x.receiveShadow = true; parent.add(x); return x; };
  add(CG.paint, m.paint); add(CG.accent, m.accent); add(CG.carbon, CARBON); add(CG.light, TAIL);
  const flap = add(CG.flap, m.accent); flap.position.set(0, 1.02, -2.1);
  const wheels = [], steer = [];
  for (const [[z, x], geo, front] of [[FW, WG.f, true], [RW, WG.r, false]]) for (const sg of [1, -1]) {
    const piv = new THREE.Group(); piv.position.set(sg * x, WHEEL_R, z); g.add(piv);
    const w = new THREE.Mesh(geo, WMATS); w.castShadow = true; piv.add(w); wheels.push(w); if (front) steer.push(piv);
  }
  const blob = new THREE.Mesh(blobG, BLOB); blob.position.y = 0.03; blob.renderOrder = 1; g.add(blob);
  scene.add(g);
  return { group: g, wheels, steer, flap };
}

// ───────────────────────── cars / race state ─────────────────────────
const CODES = ['MOR', 'VDM', 'LEM', 'BEL', 'CAR', 'FER', 'HAS', 'WHI', 'GAU', 'YOU', 'DUA', 'RUI', 'OST', 'MED', 'TAN', 'OCA', 'KAM', 'BOR', 'PEA', 'HOL'];
const tmp = {};
const cars = [];
for (let g = 0; g < 20; g++) {
  const isP = g === CFG.grid;
  const team = isP ? 0 : (g + (g >= CFG.grid ? 0 : 1)) % 10 === 0 && !isP ? 1 : Math.floor(((g < CFG.grid ? g + 1 : g) + 1) / 2) % 10;
  cars.push({ grid: g, code: isP ? 'YOU' : CODES[g] === 'YOU' ? 'ZHO' : CODES[g], team: isP ? 0 : team, isPlayer: isP, ai: !isP || CFG.autopilot, mesh: null });
}
// ensure each team has max two cars (player in Volt Racing)
{ const count = new Array(10).fill(0); count[0] = 1; for (const c of cars) if (!c.isPlayer) { let t = c.team; while (count[t] >= 2) t = (t + 1) % 10; c.team = t; count[t]++; } }
for (const c of cars) c.mesh = makeCarMesh(c.team);
const player = cars[CFG.grid];

const agtSocket = window.io ? window.io() : null;
function agtStartRace(){
  if (typeof startRace === 'function' && phase === 'menu') startRace();
}
function agtGift(e){
  agtStartRace();
  const diamonds=Math.max(1,Number(e?.diamondCount||1)*Number(e?.repeatCount||1));
  const boost=Math.min(24,4+Math.sqrt(diamonds)*1.7);
  player.v=Math.min(VTOP,player.v+boost);
  player.ers=Math.min(1,(player.ers??0)+Math.min(.55,diamonds/160));
  player.thr=1;
  player.drsAvail=true;
  player.drsOpen=true;
  if(typeof flash==='function') flash('GIFT BOOST +' + Math.round(boost*3.6) + ' KM/H',900);
}
function agtChat(e){
  const text=String(e?.comment||'').trim();
  if(!text)return;
  if(/^[1-5]$/.test(text)){
    agtStartRace();
    const idx=(Number(text)-1)*4;
    const target=cars[Math.min(cars.length-1,idx)];
    if(target){target.v=Math.min(VTOP,target.v+7);target.ers=Math.min(1,(target.ers??0)+.2);}
    if(typeof flash==='function') flash('VIEWER ATTACK → P'+text,700);
  }
}
if(agtSocket){
  agtSocket.on('live:event',e=>{if(e?.type==='gift')agtGift(e)});
  agtSocket.on('live:chat',agtChat);
}


let phase = 'menu', phaseT = 0, raceTime = 0, lightsOutAt = 0, playerFinishT = 0, order = cars.slice(), finishOrder = [];
const SECT = 25; let SECTN = 0;

function resetCars() {
  finishOrder = []; order = cars.slice();
  SECTN = Math.ceil((CFG.laps + 1) * L / SECT) + 4;
  for (const c of cars) {
    const D = -(GRID0 + c.grid * GRID_GAP), lat = c.grid % 2 ? 2.8 : -2.8;
    trackPos(L + D, lat, tmp);
    Object.assign(c, { s: ((L + D) % L + L) % L, sPrev: ((L + D) % L + L) % L, D, lat, latV: 0, x: tmp.x, z: tmp.z, h: tmp.h, idx: tmp.i, v: 0, thr: 0, brk: 0, steer: 0, yaw: 0,
      lapsMax: -1, lapStart: 0, last: 0, best: 0, finished: false, finishT: 0, sect: new Float64Array(SECTN).fill(-1), sectIdx: -1,
      drsAvail: false, drsOpen: false, ers: 1, off: false, wallCd: 0, passT: 0, passLat: 0, bias: (rnd() - 0.5) * 1.4,
      skill: 0.94 + 0.04 * (1 - c.grid / 19) + rnd() * 0.025, react: 0.12 + rnd() * 0.35, wheelA: 0, flapA: 0, sVis: 0 });
    if (c.isPlayer) c.ai = CFG.autopilot;
  }
}
resetCars();

function project(c, full = false) {
  let best = Infinity, bi = c.idx; const r = full ? (N >> 1) : 45;
  for (let k = -r; k <= r; k++) { const i = W(c.idx + k), dx = c.x - PX[i], dz = c.z - PZ[i], d = dx * dx + dz * dz; if (d < best) { best = d; bi = i; } }
  c.idx = bi; const dx = c.x - PX[bi], dz = c.z - PZ[bi];
  c.lat = -dx * TZ[bi] + dz * TX[bi];
  c.s = ((bi * DS + dx * TX[bi] + dz * TZ[bi]) % L + L) % L;
}

// ───────────────────────── input ─────────────────────────
const keys = { up: 0, down: 0, left: 0, right: 0, drs: 0 };
const KMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'drs', ShiftLeft: 'drs', ShiftRight: 'drs' };
let camMode = 0, paused = false, muted = CFG.mute;
addEventListener('keydown', e => {
  const k = KMAP[e.code]; if (k) { keys[k] = 1; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'KeyC') camMode = (camMode + 1) % 3;
  if (e.code === 'KeyR' && !player.ai) resetPlayer();
  if (e.code === 'KeyM') muted = !muted;
  if (e.code === 'KeyP' && phase !== 'menu') paused = !paused;
  if (e.code === 'Enter' && phase === 'menu') startRace();
  initAudio();
});
addEventListener('keyup', e => { const k = KMAP[e.code]; if (k) keys[k] = 0; });
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });
function resetPlayer() { project(player, true); trackPos(player.s, clamp(player.lat, -4, 4), tmp); Object.assign(player, { x: tmp.x, z: tmp.z, h: tmp.h, v: 0, steer: 0 }); flash('RESET', 800); }

// ───────────────────────── simulation ─────────────────────────
function laneFree(c, lat) { for (const o of cars) { if (o === c) continue; const dD = o.D - c.D; if (dD > -7 && dD < 10 && Math.abs(o.lat - lat) < 2.3) return false; } return true; }
function updateAI(c, dt) {
  if (raceTime < c.react) { c.v = 0; return; }
  const i = W(Math.floor(c.s / DS));
  let target = VP[W(i + 3)] * c.skill, desired = RL[i] * 0.85 + c.bias;
  if (c.passT > 0) { c.passT -= dt; desired = c.passLat; }
  for (const o of cars) {
    if (o === c) continue; const dD = o.D - c.D;
    if (dD <= 0 || dD > 30 || Math.abs(o.lat - c.lat) > 2.3) continue;
    if (c.passT <= 0 && c.v > o.v - 1.5) {
      const opts = [o.lat + 3.1, o.lat - 3.1].filter(x => Math.abs(x) < HALF - 1.2).sort((a, b) => Math.abs(a - c.lat) - Math.abs(b - c.lat));
      for (const t of opts) if (laneFree(c, t)) { c.passLat = t; c.passT = 2.2; desired = t; break; }
    }
    if (dD < 12) target = Math.min(target, o.v - (12 - dD) * 0.7);
  }
  target = Math.max(0, target);
  if (c.v < target) c.v = Math.min(target, c.v + Math.max(0, engineAcc(c.v, 1, c.drsOpen)) * dt);
  else c.v = Math.max(target, c.v - brakeDecel(c.v) * dt);
  const maxLatV = Math.min(3.2, 0.5 + c.v * 0.06);
  const dl = clamp(desired - c.lat, -maxLatV * dt, maxLatV * dt);
  c.lat = clamp(c.lat + dl, -HALF + 1.05, HALF - 1.05); c.latV = dl / dt;
  c.s = (c.s + c.v * dt) % L;
  trackPos(c.s, c.lat, tmp); c.x = tmp.x; c.z = tmp.z; c.idx = tmp.i;
  c.h = tmp.h - Math.atan2(c.latV, Math.max(c.v, 2));
  c.thr = c.v < target - 0.5 ? 1 : 0; c.brk = c.v > target + 0.5 ? 1 : 0;
  c.drsOpen = c.drsAvail;
}
let shake = 0;
function updatePlayer(c, dt) {
  c.thr += clamp(keys.up - c.thr, -dt * 8, dt * 6);
  c.brk += clamp(keys.down - c.brk, -dt * 10, dt * 10);
  const stIn = keys.left - keys.right;
  const rate = stIn === 0 ? 5 : (c.steer * stIn < 0 ? 7 : 2.6);
  c.steer += clamp(stIn - c.steer, -rate * dt, rate * dt);
  if (phase !== 'race' && phase !== 'finished') return;
  const off = Math.abs(c.lat) > HALF + 1.5; c.off = off;
  const grip = off ? 0.6 : 1, av = Math.abs(c.v);
  const sa = c.steer * 0.34 / (1 + av / 20);
  const yawD = c.v * Math.tan(sa) / WB, yawM = latMax(av) * grip / Math.max(av, 1);
  c.yaw = clamp(yawD, -yawM, yawM);
  if (Math.abs(yawD) > yawM && av > 5) c.v -= Math.sign(c.v) * Math.min(1, (Math.abs(yawD) - yawM) / yawM) * 7 * dt;
  c.h += c.yaw * dt; c.sVis = sa;
  if (!c.drsAvail || c.brk > 0.1) c.drsOpen = false; else if (keys.drs) c.drsOpen = true;
  if (c.v <= 0.5 && c.brk > 0.5 && c.thr < 0.1) c.v = Math.max(-7, c.v - 5 * dt);
  else if (c.v < 0) c.v = Math.min(0, c.v + (c.thr * 10 + 4) * dt);
  else {
    let a = engineAcc(c.v, c.thr, c.drsOpen) - c.brk * brakeDecel(c.v);
    if (c.thr > 0.9 && c.v > 25 && c.ers > 0) { a += 1.1; c.ers = Math.max(0, c.ers - 0.035 * dt); }
    c.ers = Math.min(1, c.ers + c.brk * 0.06 * dt);
    if (off) a -= 3 + 0.004 * c.v * c.v;
    c.v = Math.max(0, c.v + a * dt);
  }
  c.x += Math.sin(c.h) * c.v * dt; c.z += Math.cos(c.h) * c.v * dt;
  project(c);
  const lim = (c.lat > 0 ? BL[c.idx] : BR[c.idx]) - 1.15;
  if (Math.abs(c.lat) > lim) {
    const sg = Math.sign(c.lat), push = Math.abs(c.lat) - lim;
    c.x += TZ[c.idx] * sg * push; c.z -= TX[c.idx] * sg * push; c.lat = sg * lim;
    const th = A[c.idx], tgt = Math.cos(wrapA(c.h - th)) >= 0 ? th : th + Math.PI; c.h += wrapA(tgt - c.h) * 0.25;
    if (c.wallCd <= 0) { c.v *= 0.7; c.wallCd = 0.3; shake = 0.6; }
  }
  c.wallCd -= dt;
  if (Math.abs(c.lat) > HALF && Math.abs(c.lat) < HALF + 1.5 && c.v > 10) shake = Math.max(shake, 0.12);
}
function collidePlayer(p) {
  for (const o of cars) {
    if (o === p) continue; const dx = p.x - o.x, dz = p.z - o.z; if (dx * dx + dz * dz > 40) continue;
    const fx = Math.sin(o.h), fz = Math.cos(o.h), along = dx * fx + dz * fz, side = -dx * fz + dz * fx;
    const pa = 5.3 - Math.abs(along), ps = 2.0 - Math.abs(side); if (pa <= 0 || ps <= 0) continue;
    if (ps < pa) { const sg = Math.sign(side) || 1; p.x -= fz * sg * ps * 0.6; p.z += fx * sg * ps * 0.6; o.lat -= sg * ps * 0.4; p.v *= 0.995; shake = Math.max(shake, 0.2); }
    else {
      const sg = Math.sign(along) || 1; p.x += fx * sg * pa; p.z += fz * sg * pa; const vv = (p.v + o.v) / 2;
      if (sg < 0 && p.v > o.v) { p.v = vv * 0.9; o.v = Math.min(VTOP, o.v + (vv - o.v) * 0.5); }
      else if (sg > 0 && o.v > p.v) { o.v = vv * 0.9; p.v = Math.max(p.v, vv * 0.85); }
      shake = Math.max(shake, 0.4);
    }
    project(p);
  }
}
function separateAI() {
  for (const a of cars) { if (!a.ai) continue; for (const b of cars) { if (a === b) continue; const dD = b.D - a.D; if (dD > 0 && dD < 5.4 && Math.abs(b.lat - a.lat) < 2.0) { a.v = Math.min(a.v, b.v); a.s = ((a.s - (5.4 - dD)) % L + L) % L; } } }
}
function progress(c) {
  let ds = c.s - c.sPrev; if (ds < -L / 2) ds += L; if (ds > L / 2) ds -= L; c.sPrev = c.s; c.D += ds;
  const lapsNow = Math.floor(c.D / L);
  if (lapsNow > c.lapsMax) {
    c.lapsMax = lapsNow;
    if (lapsNow >= 1) {
      const lt = raceTime - c.lapStart; c.last = lt; if (!c.best || lt < c.best) c.best = lt; c.lapStart = raceTime;
      if (c.isPlayer && !c.finished) { if (lapsNow === CFG.laps - 1) flash('FINAL LAP', 1600); else if (lapsNow < CFG.laps) flash(`LAP ${lapsNow + 1}`, 1300); }
      if (lapsNow >= CFG.laps && !c.finished) { c.finished = true; c.finishT = raceTime; finishOrder.push(c); if (c.isPlayer) onPlayerFinish(); }
    }
  }
  if (c.D >= 0) { const j = Math.min(SECTN - 1, Math.floor(c.D / SECT)); while (c.sectIdx < j) c.sect[++c.sectIdx] = raceTime; }
}
function computeOrder() {
  order = cars.slice().sort((a, b) => (a.finished && b.finished) ? a.finishT - b.finishT : a.finished ? -1 : b.finished ? 1 : b.D - a.D);
}
function gapTo(c, ahead) {
  if (!ahead) return 0; const j = c.sectIdx; if (j < 0 || ahead.sect[j] < 0) return 0; return c.sect[j] - ahead.sect[j];
}
function updateDRS(c, k) {
  const s = c.s, inZone = s > 80 && s < 470;
  if (!inZone) { c.drsAvail = false; c.drsOpen = false; c.drsChecked = false; return; }
  if (!c.drsChecked) { c.drsChecked = true; c.drsAvail = c.lapsMax >= 1 && !c.finished && k > 0 && gapTo(c, order[k - 1]) < 1.0 && gapTo(c, order[k - 1]) > 0; if (c.isPlayer && c.drsAvail) flash('DRS ENABLED', 900); }
}
const STEP = 1 / 120;
function step(dt) {
  phaseT += dt;
  if (phase === 'lights') {
    if (phaseT >= lightsOutAt) { phase = 'race'; raceTime = 0; flash('GO!', 900); for (const c of cars) c.lapStart = 0; }
    else { for (const c of cars) if (c.isPlayer && !c.ai) updatePlayer(c, dt); return; }
  }
  if (phase !== 'race' && phase !== 'finished') return;
  raceTime += dt;
  for (const c of cars) c.ai ? updateAI(c, dt) : updatePlayer(c, dt);
  if (!player.ai) collidePlayer(player);
  separateAI();
  for (const c of cars) progress(c);
  computeOrder();
  order.forEach((c, k) => updateDRS(c, k));
  if (phase === 'finished' && (finishOrder.length === 20 || raceTime - playerFinishT > 45)) { if (!resultsFinal) { resultsFinal = true; showResults(); } }
}
let resultsFinal = false;
function onPlayerFinish() {
  playerFinishT = raceTime; phase = 'finished';
  const p = order.indexOf(player) + 1;
  flash(p === 1 ? 'WINNER!' : `FINISHED P${finishOrder.indexOf(player) + 1}`, 3000);
  player.ai = true; player.drsAvail = false; player.drsOpen = false;
  setTimeout(showResults, 2500);
}

// ───────────────────────── audio ─────────────────────────
let audio = null;
function initAudio() {
  if (audio || CFG.mute) return;
  try {
    const ac = new AudioContext(), o1 = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o1.type = 'sawtooth'; o2.type = 'square'; f.type = 'lowpass'; f.frequency.value = 1500; f.Q.value = 1.5; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(ac.destination); o1.start(); o2.start(); audio = { ac, o1, o2, g };
  } catch { }
}

// ───────────────────────── HUD ─────────────────────────
const $ = id => document.getElementById(id);
const rowsEl = $('rows'), rows = [];
for (let k = 0; k < 20; k++) { const r = document.createElement('div'); r.className = 'row'; r.innerHTML = `<span>${k + 1}</span><i class="bar"></i><span class="cd"></span><i class="ty"></i><span class="gp"></span>`; rowsEl.appendChild(r); rows.push(r); }
$('lights').innerHTML = [0, 1, 2, 3, 4].map(() => '<div class="col"><i></i><i></i></div>').join('');
const hudLights = [...$('lights').querySelectorAll('.col')].map(c => [...c.children]);
$('rpm').innerHTML = '<i></i>'.repeat(15); const rpmLeds = [...$('rpm').children];
const hex = n => '#' + n.toString(16).padStart(6, '0');
let msgTimer = 0;
function flash(t, ms) { const m = $('msg'); m.textContent = t; m.classList.add('show'); clearTimeout(msgTimer); msgTimer = setTimeout(() => m.classList.remove('show'), ms); }
const map = $('map'), mctx = map.getContext('2d');
const msc = Math.min((map.width - 24) / (maxX - minX), (map.height - 24) / (maxZ - minZ));
const mx = x => 12 + (x - minX) * msc + ((map.width - 24) - (maxX - minX) * msc) / 2, mz = z => 12 + (z - minZ) * msc + ((map.height - 24) - (maxZ - minZ) * msc) / 2;
const mapPath = new Path2D(); for (let i = 0; i <= N; i += 3) { const j = W(i); i ? mapPath.lineTo(mx(PX[j]), mz(PZ[j])) : mapPath.moveTo(mx(PX[j]), mz(PZ[j])); } mapPath.closePath();
const GEARS = [0, 22, 32, 42, 51, 60, 69, 79, 200];
let boardT = 0;
function updateHUD(dt) {
  const p = player, kmh = Math.abs(p.v) * 3.6;
  let gear = 1; while (gear < 8 && p.v >= GEARS[gear]) gear++;
  const lo = GEARS[gear - 1], hi = Math.min(GEARS[gear], 97), rpm = p.v < 0.3 ? 4000 + p.thr * 6000 : 5500 + 6500 * clamp((p.v - lo) / (hi - lo), 0, 1);
  $('gear').textContent = p.v < -0.3 ? 'R' : (p.v < 0.3 && phase !== 'race') ? 'N' : gear;
  $('spd').textContent = Math.round(kmh);
  const lit = Math.round(clamp((rpm - 4000) / 8000, 0, 1) * 15);
  rpmLeds.forEach((l, k) => l.style.background = k < lit ? (k < 5 ? '#1fd05a' : k < 10 ? '#ff2323' : '#6a5cff') : '#2c2f38');
  $('ersbar').firstChild.style.width = (p.ers * 100).toFixed(0) + '%';
  $('drs').className = p.drsOpen ? 'open' : p.drsAvail ? 'av' : '';
  const temps = [88, 88, 91, 91].map((b, k) => Math.round(b + kmh * 0.03 + p.brk * (k < 2 ? 6 : 2)));
  $('tyres').innerHTML = temps.map(t => `<i>${t}°</i>`).join('');
  const lapNow = clamp(Math.floor(p.D / L) + 1, 1, CFG.laps);
  $('lapc').textContent = `${lapNow}/${CFG.laps}`;
  $('laptime').textContent = phase === 'race' || phase === 'finished' ? fmt(p.finished ? p.last : raceTime - p.lapStart).replace('-:--.---', '0:00.000') : '0:00.000';
  $('last').textContent = fmt(p.last); $('best').textContent = fmt(p.best);
  $('pos').textContent = 'P' + (order.indexOf(p) + 1);
  // lights
  const on = phase === 'lights' ? Math.min(5, Math.floor(phaseT)) : 0;
  $('lights').classList.toggle('show', phase === 'lights' || (phase === 'race' && raceTime < 1.2));
  hudLights.forEach((col, k) => col.forEach(l => l.classList.toggle('on', k < on)));
  gantryLights.forEach((col, k) => col.forEach(l => l.material.color.setHex(k < on ? 0xff2020 : 0x300505)));
  boardT -= dt;
  if (boardT <= 0) {
    boardT = 0.25;
    order.forEach((c, k) => {
      const r = rows[k]; r.classList.toggle('me', c.isPlayer); r.children[1].style.background = hex(TEAMS[c.team][1]); r.children[2].textContent = c.code;
      let gtxt = '';
      if (k === 0) gtxt = c.finished ? 'WINNER' : 'LEADER';
      else if (order[k - 1].D - c.D > L && !c.finished) gtxt = '+' + Math.floor((order[0].D - c.D) / L) + ' LAP';
      else { const g = gapTo(c, order[k - 1]); gtxt = '+' + (g > 0 ? g : 0).toFixed(3); }
      r.children[4].textContent = gtxt;
    });
    // minimap
    mctx.clearRect(0, 0, map.width, map.height);
    mctx.lineJoin = 'round'; mctx.strokeStyle = '#0a0b0f'; mctx.lineWidth = 7; mctx.stroke(mapPath); mctx.strokeStyle = '#e8ebf0'; mctx.lineWidth = 3; mctx.stroke(mapPath);
    for (const c of [...cars].sort(a => a.isPlayer ? 1 : -1)) {
      mctx.beginPath(); mctx.arc(mx(c.x), mz(c.z), c.isPlayer ? 5 : 3.2, 0, 7); mctx.fillStyle = c.isPlayer ? '#e10600' : hex(TEAMS[c.team][1]); mctx.fill();
      if (c.isPlayer) { mctx.lineWidth = 2; mctx.strokeStyle = '#fff'; mctx.stroke(); }
    }
  }
  if (audio) {
    const t = audio.ac.currentTime; audio.o1.frequency.setTargetAtTime(rpm / 60 * 1.5, t, 0.03); audio.o2.frequency.setTargetAtTime(rpm / 60 * 0.75, t, 0.03);
    audio.g.gain.setTargetAtTime(muted || paused ? 0 : 0.025 + p.thr * 0.035, t, 0.05);
  }
}
function showResults() {
  const rows = order.map((c, k) => {
    const lead = order[0]; let t;
    if (c.finished) t = k === 0 ? fmt(c.finishT) : '+' + (c.finishT - lead.finishT).toFixed(3) + 's';
    else { const laps = Math.max(1, Math.round((lead.D - c.D) / L)); t = lead.D - c.D > L * 0.5 ? `+${laps} LAP${laps > 1 ? 'S' : ''}` : 'RUNNING'; }
    return `<tr class="${c.isPlayer ? 'me' : ''}"><td>${k + 1}</td><td><i style="display:inline-block;width:3px;height:12px;background:${hex(TEAMS[c.team][1])}"></i> ${c.code}</td><td>${TEAMS[c.team][0]}</td><td>${fmt(c.best)}</td><td style="text-align:right">${t}</td></tr>`;
  }).join('');
  $('restable').innerHTML = `<tr style="color:#aab;font-size:11px"><td>POS</td><td>DRIVER</td><td>TEAM</td><td>BEST LAP</td><td style="text-align:right">TIME</td></tr>` + rows;
  const p = order.indexOf(player) + 1; $('restitle').textContent = p === 1 ? 'VICTORY!' : `YOU FINISHED P${p}`;
  $('ressub').textContent = `${CFG.laps} LAP${CFG.laps > 1 ? 'S' : ''} · AURORA GRAND PRIX · BEST ${fmt(player.best)}`;
  $('results').hidden = false;
  if (!resultsFinal) setTimeout(() => { if (!$('results').hidden) showResults(); }, 1000);
}
$('again').onclick = () => location.reload();
// menu
{
  const sel = $('lapsel'); for (const n of [1, 3, 5, 10]) { const b = document.createElement('button'); b.textContent = `${n} LAP${n > 1 ? 'S' : ''}`; b.className = n === CFG.laps ? 'sel' : ''; b.onclick = () => { CFG.laps = n; [...sel.children].forEach(x => x.className = x === b ? 'sel' : ''); }; sel.appendChild(b); }
  $('go').onclick = () => { initAudio(); startRace(); };
}
function startRace() {
  if (phase !== 'menu') return;
  resetCars(); $('menu').hidden = true; phase = 'lights'; phaseT = 0; lightsOutAt = 5 + 0.3 + rnd() * 1.2;
}

// ───────────────────────── camera / visuals / loop ─────────────────────────
let camH = player.h;
const camPos = new THREE.Vector3(), look = new THREE.Vector3();
function updateVisuals(dt) {
  for (const c of cars) {
    const g = c.mesh.group; g.position.set(c.x, 0, c.z); g.rotation.y = c.h;
    c.wheelA += c.v * dt / WHEEL_R; for (const w of c.mesh.wheels) w.rotation.x = c.wheelA;
    const st = c.ai ? clamp(Math.atan(WB * KS[c.idx]) * 1.4, -0.35, 0.35) : c.sVis * 1.6;
    for (const s of c.mesh.steer) s.rotation.y = st;
    c.flapA += ((c.drsOpen ? -0.75 : 0) - c.flapA) * Math.min(1, dt * 10); c.mesh.flap.rotation.x = c.flapA;
  }
}
let tvS = null, tvLat = 0, heroA = 0;
function updateCamera(dt) {
  const p = player;
  if (camMode === 3) {
    const ahead = tvS === null ? -1 : ((tvS - p.s) % L + L) % L;
    if (tvS === null || (ahead > 150 && ahead < L - 45)) { tvS = (p.s + 110) % L; const i = sIdx(tvS), side = rnd() < 0.5 ? 1 : -1; tvLat = side * ((side > 0 ? BL[i] : BR[i]) - 2); }
    trackPos(tvS, tvLat, tmp); camPos.set(tmp.x, 4.2, tmp.z); look.set(p.x, 0.8, p.z);
    const dist = camPos.distanceTo(look); camera.fov = clamp(2 * Math.atan(9 / dist) * 180 / Math.PI, 7, 60);
    camera.position.copy(camPos); camera.lookAt(look); camera.updateProjectionMatrix();
    sun.position.set(p.x + sunDir.x * 300, sunDir.y * 300, p.z + sunDir.z * 300); sun.target.position.set(p.x, 0, p.z); camH = p.h; return;
  }
  if (camMode === 4) {
    heroA += dt * 0.35; const a = p.h + Math.PI * 0.75 + heroA;
    camPos.set(p.x + Math.sin(a) * 6.5, 1.3, p.z + Math.cos(a) * 6.5); look.set(p.x + Math.sin(p.h) * 0.5, 0.55, p.z + Math.cos(p.h) * 0.5); camera.fov = 45;
    camera.position.copy(camPos); camera.lookAt(look); camera.updateProjectionMatrix();
    sun.position.set(p.x + sunDir.x * 300, sunDir.y * 300, p.z + sunDir.z * 300); sun.target.position.set(p.x, 0, p.z); camH = p.h; return;
  }
  camH += wrapA(p.h - camH) * Math.min(1, dt * (camMode === 2 ? 20 : 6));
  const fx = Math.sin(camH), fz = Math.cos(camH);
  if (camMode === 2) { camPos.set(p.x + Math.sin(p.h) * 0.36, 0.98, p.z + Math.cos(p.h) * 0.36); look.set(p.x + fx * 30, 0.7, p.z + fz * 30); camera.fov = 75; }
  else { const d = camMode === 0 ? 7.2 : 11, h = camMode === 0 ? 2.3 : 3.6; camPos.set(p.x - fx * d, h, p.z - fz * d); look.set(p.x + fx * 7, 0.9, p.z + fz * 7); camera.fov = 58 + clamp(Math.abs(p.v) * 0.13, 0, 12); }
  shake = Math.max(0, shake - dt * 2);
  if (shake > 0) camPos.add(new THREE.Vector3((rnd() - 0.5) * shake * 0.3, (rnd() - 0.5) * shake * 0.25, 0));
  camera.position.copy(camPos); camera.lookAt(look); camera.updateProjectionMatrix();
  sun.position.set(p.x + sunDir.x * 300, sunDir.y * 300, p.z + sunDir.z * 300); sun.target.position.set(p.x, 0, p.z);
}
let last = performance.now(), acc = 0, fps = 60, frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000); last = now; frames++;
  fps += ((1 / Math.max(dt, 1e-3)) - fps) * 0.05;
  if (!paused) { acc += dt * CFG.timescale; let n = 0; while (acc >= STEP && n < 60) { step(STEP); acc -= STEP; n++; } if (n >= 60) acc = 0; }
  updateVisuals(dt); updateCamera(dt); updateHUD(dt);
  renderer.render(scene, camera);
}
if (CFG.capture) document.body.classList.add('capture'); else requestAnimationFrame(frame);

// debug / test hook
window.__f1 = {
  state: () => ({
    phase, raceTime: +raceTime.toFixed(2), laps: CFG.laps, fps: Math.round(fps), frames, L: Math.round(L), N,
    minVP: +Math.min(...VP).toFixed(1), minBarrier: +Math.min(...BL, ...BR).toFixed(1),
    player: { v: +player.v.toFixed(2), kmh: Math.round(player.v * 3.6), D: +player.D.toFixed(1), lat: +player.lat.toFixed(2), h: +player.h.toFixed(3), pos: order.indexOf(player) + 1, lap: Math.floor(player.D / L) + 1, last: +player.last.toFixed(3), best: +player.best.toFixed(3), finished: player.finished, ai: player.ai, off: player.off, drsAvail: player.drsAvail, drsOpen: player.drsOpen },
    order: order.map(c => ({ code: c.code, D: +c.D.toFixed(1), v: +c.v.toFixed(1), lat: +c.lat.toFixed(2), fin: c.finished, best: +c.best.toFixed(3) })),
    finished: finishOrder.length, drsOpenCount: cars.filter(c => c.drsOpen).length,
    renderCalls: renderer.info.render.calls, triangles: renderer.info.render.triangles,
  }),
  start: () => startRace(),
  setCam: m => { camMode = m; tvS = null; },
  tick: (n = 1, fdt = 1 / 30) => { for (let k = 0; k < n; k++) { acc += fdt * CFG.timescale; while (acc >= STEP) { step(STEP); acc -= STEP; } frames++; updateVisuals(fdt); updateCamera(fdt); updateHUD(fdt); } renderer.render(scene, camera); return raceTime; },
};
if (CFG.autostart) startRace();
