/* Lola Bog' Residence — qurilayotgan binoning tayyor holatini 3D ko'rsatish.
   Hamma geometriya va teksturalar kod bilan yaratiladi: tashqi model va rasm kerak emas.
   Loyiha ma'lumotlari PROJECT va unitlar generatori ichida — o'z obyektingizga moslang. */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/* =====================================================================
   1. LOYIHA MA'LUMOTLARI
   ===================================================================== */
const PROJECT = {
  name: "Lola Bog'",
  address: "Mirzo Ulug'bek tumani, Toshkent",
  addressShort: ["Mirzo Ulug'bek tumani", 'Toshkent'],
  progressNow: 0.46,            // qurilishning hozirgi holati (0..1)
  nowLabel: 'Noyabr 2026',
  handover: '2027, IV chorak',
  usdRate: 12850,               // 1 $ = so'm
  phone: '+998 71 200 00 00',
  leadEndpoint: '',             // CRM yoki Telegram-bot webhook manzili. Bo'sh bo'lsa so'rov brauzerda saqlanadi.
  roofArea: 860,
  sunrise: 6.5,                 // quyosh chiqishi (soat, o'rtacha)
  sunset: 18.5,                 // quyosh botishi
  startHour: 21.5,              // sahifa ochilgandagi vaqt
};

const ROOF_PLACES = [
  { id: 'pergola', name: 'Pergola terrasa', area: 140, pos: [-13.5, 3.6, 4.8], view: [-2, 14, 22],
    text: "Shahar panoramasi, kechki gulchambar chiroqlar, olov atrofida o'tirish joylari." },
  { id: 'pool', name: 'Basseyn', area: 210, pos: [10.5, 1.0, -5], view: [24, 13, -20],
    text: "11 × 4 m, isitiladigan suv. Atrofida quyosh vannasi uchun yog'och maydon." },
  { id: 'garden', name: "Mevali bog' va so'ri", area: 160, pos: [13.5, 1.6, 4.8], view: [26, 12, 20],
    text: "Olma va o'rik daraxtlari, sabzavot yashiklari, choy ichish uchun so'ri." },
  { id: 'lawn', name: 'Maysazor', area: 95, pos: [-13, 0.8, -4.6], view: [-24, 12, -22],
    text: "Bolalar o'ynashi va ertalabki mashg'ulotlar uchun yumshoq maysa." },
];
const STREET_PLACES = [
  { id: 'lobby', name: 'Turar-joy lobbisi', area: 120, pos: [0, 2.6, 9.4], cam: [7, 2.0, 21],
    text: "Konsyerj, pochta qutilari va ikkita lift. Kirish faqat yashovchilar uchun kalit-karta bilan." },
  { id: 'cafe', name: 'Kafe', area: 260, pos: [-13.5, 2.6, 9.4], cam: [-5, 2.0, 22],
    text: "Ko'chaga qaragan yozgi terrasa. Ijaraga beriladi, ichida 60 o'rin." },
  { id: 'shop', name: "Do'kon", area: 310, pos: [13.5, 2.6, 9.4], cam: [22, 2.0, 21],
    text: "Kundalik mahsulotlar do'koni uchun mo'ljallangan, alohida kirish va yuk tushirish joyi bor." },
];

/* =====================================================================
   2. YORDAMCHILAR
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = t => 1 - Math.pow(1 - t, 3);
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const nf = n => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');
const dec = (n, d = 1) => n.toFixed(d).replace('.', ',');

/* =====================================================================
   3. BINO GEOMETRIYASI VA XONADONLAR
   ===================================================================== */
const W = 48, D = 18, HW = W / 2, HD = D / 2;
const WALL = 0.3, CORR = 1.5;
const G_H = 4.5, F_H = 3.2, RES = 8;          // 1-qavat tijorat + 8 ta turar-joy qavati
const LEVELS = RES + 1;
const base = i => (i === 0 ? 0 : G_H + (i - 1) * F_H);
const ROOF_Y = base(LEVELS);
const DEPTH = HD - WALL - CORR;               // 7.2 m: koridordan fasadgacha
const BAND = 2.6;                             // hammom/oshxona chizig'i chuqurligi
const WIDTHS = [12, 9, 6, 9, 12];
const X0S = WIDTHS.map((w, i) => -HW + WIDTHS.slice(0, i).reduce((a, b) => a + b, 0));

const STATUS = {
  available: 'Sotuvda',
  reserved: 'Band qilingan',
  sold: 'Sotilgan',
};

const UNITS = [];
const UNITS_BY_FLOOR = {};
for (let f = 1; f <= RES; f++) {
  const r = rng(f * 7919 + 13);
  const order = [['park', 0], ['park', 1], ['park', 2], ['park', 3], ['park', 4], ['street', 4], ['street', 3], ['street', 1], ['street', 0]];
  const list = [];
  order.forEach(([side, idx], k) => {
    const w = WIDTHS[idx], x0 = X0S[idx];
    const rooms = w >= 12 ? 3 : w >= 9 ? 2 : 1;
    const corner = idx === 0 || idx === 4;
    const area = Math.round(((w - 0.2) * DEPTH + (rooms > 1 ? 2.6 : 1.8)) * 10) / 10;
    const ppm = Math.round((840 + f * 16 + (side === 'park' ? 40 : 0) + (corner ? 25 : 0)) / 5) * 5;
    const price = Math.round((area * ppm) / 100) * 100;
    const s = r();
    const soldP = 0.12 + f * 0.035;
    const status = s < soldP ? 'sold' : s < soldP + 0.13 ? 'reserved' : 'available';
    const view = corner ? 'burchakli' : side === 'park' ? "bog' manzarali" : 'shahar manzarali';
    const u = {
      id: `${f + 1}${String(k + 1).padStart(2, '0')}`,
      f, floorNo: f + 1, side, idx, w, x0, rooms, corner, area, ppm, price, status,
      facing: side === 'park' ? "Bog' tomon" : "Ko'cha tomon",
      sides: (side === 'park' ? 'Shimol' : 'Janub') + (corner ? (idx === 0 ? " va g'arb" : ' va sharq') : ''),
      sun: (side === 'street' ? "Kun bo'yi" : 'Kam, yozda salqin') + (corner ? (idx === 0 ? ', kechki quyosh' : ', ertalabki quyosh') : ''),
      title: `${rooms} xonali, ${view}`,
      mirror: x0 + w / 2 > 0,
      sgn: side === 'park' ? -1 : 1,
    };
    list.push(u);
    UNITS.push(u);
  });
  UNITS_BY_FLOOR[f] = list;
}

function unitLayout(w) {
  const rooms = [];
  rooms.push({ type: 'bath', name: 'Hammom', u0: 0, u1: 2.4, v0: 0, v1: BAND });
  if (w <= 6) {
    rooms.push({ type: 'kitchen', name: 'Oshxona', u0: 2.4, u1: w, v0: 0, v1: BAND });
    rooms.push({ type: 'studio', name: 'Mehmonxona', u0: 0, u1: w, v0: BAND, v1: DEPTH });
  } else {
    rooms.push({ type: 'hall', name: 'Dahliz', u0: 2.4, u1: 4.2, v0: 0, v1: BAND });
    rooms.push({ type: 'kitchen', name: 'Oshxona', u0: 4.2, u1: w, v0: 0, v1: BAND });
    if (w <= 9) {
      rooms.push({ type: 'bed', name: 'Yotoqxona', u0: 0, u1: 4, v0: BAND, v1: DEPTH });
      rooms.push({ type: 'living', name: 'Mehmonxona', u0: 4, u1: w, v0: BAND, v1: DEPTH });
    } else {
      rooms.push({ type: 'bed', name: 'Yotoqxona', u0: 0, u1: 3.8, v0: BAND, v1: DEPTH });
      rooms.push({ type: 'kids', name: 'Bolalar xonasi', u0: 3.8, u1: 7.4, v0: BAND, v1: DEPTH });
      rooms.push({ type: 'living', name: 'Mehmonxona', u0: 7.4, u1: w, v0: BAND, v1: DEPTH });
    }
  }
  rooms.forEach(rm => { rm.area = (rm.u1 - rm.u0) * (rm.v1 - rm.v0); });
  return rooms;
}
const livingRoom = u => unitLayout(u.w).find(r => r.type === 'living' || r.type === 'studio');
const toWorldX = (u, lu) => (u.mirror ? u.x0 + u.w - lu : u.x0 + lu);
const toWorldZ = (u, lv) => u.sgn * (CORR + lv);
const unitCenter = u => new THREE.Vector3(u.x0 + u.w / 2, 0, u.sgn * (CORR + DEPTH / 2));

/* =====================================================================
   4. RENDERER, SAHNA, KAMERA
   ===================================================================== */
const canvas = $('#scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  const msg = "Brauzeringiz yoki qurilmangiz WebGL'ni qo'llab-quvvatlamaydi (yoki u o'chirilgan). Chrome yoki Safari'da oching.";
  if (window.__lolaFail) window.__lolaFail(msg); else $('#loaderText').textContent = msg;
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;
const MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x0c1428, 0.0062);
const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 1400);
camera.position.set(120, 60, 150);

/* Post-processing: HDR + MSAA faqat qurilma qo'llasa. Aks holda oddiy render target. */
const GL = renderer.getContext();
const HDR_OK = renderer.capabilities.isWebGL2 && !!(GL.getExtension('EXT_color_buffer_float') || GL.getExtension('EXT_color_buffer_half_float'));
const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, {
  type: HDR_OK ? THREE.HalfFloatType : THREE.UnsignedByteType,
  samples: HDR_OK ? 4 : 0,
}));
let useComposer = true;      // qora ekran aniqlansa false bo'ladi (to'g'ridan-to'g'ri render)
let blackChecks = 0;
const px = new Uint8Array(4);
/** Bir necha nuqtada ekran butunlay qora emasligini tekshirish. Osmon hech qachon sof qora emas. */
function frameIsBlack() {
  const w = GL.drawingBufferWidth, h = GL.drawingBufferHeight;
  for (const [fx, fy] of [[0.5, 0.85], [0.2, 0.6], [0.8, 0.4], [0.5, 0.5]]) {
    GL.readPixels((w * fx) | 0, (h * fy) | 0, 1, 1, GL.RGBA, GL.UNSIGNED_BYTE, px);
    if (px[0] + px[1] + px[2] > 0) return false;
  }
  return true;
}
composer.setPixelRatio(renderer.getPixelRatio());
composer.setSize(innerWidth, innerHeight);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.55, 0.85);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.target.set(0, 12, 0);
controls.autoRotateSpeed = 0.35;

/* Kesish tekisligi: "Xonadonlar" rejimida yuqori qavatlar shu tekislikdan yuqorisi ko'rinmaydi. */
const cutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 1000);

/* =====================================================================
   5. TEKSTURALAR (canvas bilan)
   ===================================================================== */
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, { srgb = true, repeat } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = MAX_ANISO;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
function noise(g, w, h, amt, seed = 1) {
  const r = rng(seed);
  const img = g.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r() - 0.5) * amt;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

const PX = 32; // piksel / metr fasad teksturalarida
function windowColor(r) {
  const k = r();
  if (k < 0.62) return [255, 186 + (r() * 30) | 0, 112 + (r() * 40) | 0];
  if (k < 0.88) return [255, 222, 176];
  return [160, 186, 255];
}
function facadeTex(lenM, seed) {
  const w = Math.round(lenM * PX), h = Math.round(F_H * PX);
  const [c, g] = makeCanvas(w, h);
  const [ce, ge] = makeCanvas(w, h);
  const r = rng(seed);
  g.fillStyle = '#d6cdbf'; g.fillRect(0, 0, w, h);
  noise(g, w, h, 10, seed);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, w, h);
  const bays = Math.round(lenM / 3), bay = w / bays;
  for (let k = 0; k < bays; k++) {
    const x = k * bay;
    g.fillStyle = '#c4baab'; g.fillRect(x, 0, PX * 0.35, h);
    const wx = x + PX * 0.6, ww = bay - PX * 1.2, wy = PX * 0.42, wh = h - PX * 0.95;
    g.fillStyle = '#2a2c31'; g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
    const glass = g.createLinearGradient(wx, wy, wx + ww * 0.6, wy + wh);
    glass.addColorStop(0, '#6d86a3'); glass.addColorStop(0.45, '#3b4a60'); glass.addColorStop(1, '#222b39');
    g.fillStyle = glass; g.fillRect(wx, wy, ww, wh);
    if (r() < 0.6) {
      const col = windowColor(r);
      const grd = ge.createLinearGradient(0, wy, 0, wy + wh);
      grd.addColorStop(0, `rgb(${col.map(v => (v * 0.62) | 0)})`);
      grd.addColorStop(1, `rgb(${col})`);
      ge.fillStyle = grd; ge.fillRect(wx, wy, ww, wh);
    }
    if (r() < 0.5) {
      const cw = ww * (0.14 + r() * 0.22);
      g.fillStyle = 'rgba(226,216,198,0.75)'; ge.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(wx, wy, cw, wh); ge.fillRect(wx, wy, cw, wh);
      g.fillRect(wx + ww - cw, wy, cw, wh); ge.fillRect(wx + ww - cw, wy, cw, wh);
    }
    g.fillStyle = '#2a2c31'; ge.fillStyle = '#000';
    g.fillRect(wx + ww / 2 - 1.5, wy, 3, wh); ge.fillRect(wx + ww / 2 - 1.5, wy, 3, wh);
    g.fillRect(wx, wy + wh * 0.2, ww, 2); ge.fillRect(wx, wy + wh * 0.2, ww, 2);
  }
  g.fillStyle = '#b3aa9c'; g.fillRect(0, h - PX * 0.22, w, PX * 0.22);
  return { map: tex(c), emissiveMap: tex(ce) };
}
function facadeInnerTex(lenM) {
  const PX = 64;
  const w = Math.round(lenM * PX), h = Math.round(F_H * PX);
  const bays = Math.round(lenM / 3), bay = w / bays;
  const draw = (g, day, mask) => {
    const r = rng(lenM * 31);
    g.fillStyle = mask ? '#000' : '#eceae6'; g.fillRect(0, 0, w, h);
    for (let k = 0; k < bays; k++) {
      const x = k * bay, wx = x + PX * 0.6, ww = bay - PX * 1.2, wy = PX * 0.42, wh = h - PX * 0.95;
      if (mask) { g.fillStyle = '#fff'; g.fillRect(wx, wy, ww, wh); continue; }
      g.fillStyle = '#d9d6d0'; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      const grd = g.createLinearGradient(0, wy, 0, wy + wh);
      if (day) { grd.addColorStop(0, '#9cc3ea'); grd.addColorStop(1, '#e6eef6'); }
      else { grd.addColorStop(0, '#0b1224'); grd.addColorStop(1, '#1d2a4a'); }
      g.fillStyle = grd; g.fillRect(wx, wy, ww, wh);
      for (let i = 0; i < 9; i++) {
        const bw = ww * (0.06 + r() * 0.14), bh = wh * (0.12 + r() * 0.3);
        const bx = wx + r() * (ww - bw);
        g.fillStyle = day ? 'rgba(150,166,186,0.85)' : 'rgba(18,24,40,0.9)';
        g.fillRect(bx, wy + wh - bh, bw, bh);
        if (!day) for (let j = 0; j < 4; j++) { g.fillStyle = r() < 0.7 ? 'rgba(255,200,120,0.9)' : 'rgba(180,200,255,0.8)'; g.fillRect(bx + r() * bw, wy + wh - r() * bh, 2.5, 2.5); }
      }
      g.fillStyle = '#f4f2ee'; g.fillRect(wx + ww / 2 - 2, wy, 4, wh); g.fillRect(wx, wy + wh * 0.2, ww, 3);
    }
  };
  const out = {};
  for (const [key, day, mask] of [['night', false, false], ['day', true, false], ['mask', false, true]]) {
    const [c, g] = makeCanvas(w, h);
    draw(g, day, mask);
    out[key] = tex(c, { srgb: !mask });
  }
  return out;
}
function storefrontTex(lenM, signs, seed) {
  const w = Math.round(lenM * PX), h = Math.round(G_H * PX);
  const [c, g] = makeCanvas(w, h);
  const [ce, ge] = makeCanvas(w, h);
  const r = rng(seed);
  g.fillStyle = '#25262b'; g.fillRect(0, 0, w, h);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, w, h);
  const glassTop = PX * 1.15, glassBot = h - PX * 0.32;
  const grd = g.createLinearGradient(0, glassTop, 0, glassBot);
  grd.addColorStop(0, '#f3c98c'); grd.addColorStop(0.55, '#ffe0b0'); grd.addColorStop(1, '#c8925a');
  g.fillStyle = grd; g.fillRect(0, glassTop, w, glassBot - glassTop);
  const egrd = ge.createLinearGradient(0, glassTop, 0, glassBot);
  egrd.addColorStop(0, '#8a6232'); egrd.addColorStop(0.55, '#b88a52'); egrd.addColorStop(1, '#6a4824');
  ge.fillStyle = egrd; ge.fillRect(0, glassTop, w, glassBot - glassTop);
  // ichkaridagi siluetlar: javonlar, stollar
  for (let x = 0; x < w; x += 6 + r() * 30) {
    const hh = PX * (0.6 + r() * 1.4);
    g.fillStyle = `rgba(60,35,20,${0.25 + r() * 0.35})`;
    g.fillRect(x, glassBot - hh, 4 + r() * 18, hh);
    ge.fillStyle = 'rgba(0,0,0,0.5)'; ge.fillRect(x, glassBot - hh, 4 + r() * 18, hh);
  }
  g.fillStyle = '#1d1e22'; ge.fillStyle = '#000';
  for (let x = 0; x <= w; x += PX * 1.5) { g.fillRect(x - 2, glassTop, 4, glassBot - glassTop); ge.fillRect(x - 2, glassTop, 4, glassBot - glassTop); }
  g.fillRect(0, glassTop + PX * 0.55, w, 3); ge.fillRect(0, glassTop + PX * 0.55, w, 3);
  g.fillStyle = '#3a342c'; g.fillRect(0, 0, w, glassTop - 4);
  g.fillStyle = '#4a4239'; g.fillRect(0, glassTop - 8, w, 4);
  for (const s of signs) {
    const cx = (s.x + lenM / 2) * PX;
    g.font = `600 ${PX * 0.5}px Manrope, sans-serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#ffe9c4'; g.fillText(s.text, cx, glassTop * 0.48);
    ge.font = g.font; ge.textAlign = 'center'; ge.textBaseline = 'middle';
    ge.fillStyle = '#ffdca8'; ge.fillText(s.text, cx, glassTop * 0.48);
  }
  g.fillStyle = '#4b4d53'; g.fillRect(0, glassBot, w, h - glassBot);
  return { map: tex(c), emissiveMap: tex(ce) };
}
function cityTex(seed) {
  const n = 16, cell = 32, w = n * cell;
  const [c, g] = makeCanvas(w, w);
  const [ce, ge] = makeCanvas(w, w);
  const r = rng(seed);
  const tones = ['#8d8a84', '#7b828d', '#9a8f80'];
  g.fillStyle = tones[seed % 3]; g.fillRect(0, 0, w, w);
  noise(g, w, w, 14, seed);
  ge.fillStyle = '#000'; ge.fillRect(0, 0, w, w);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const px = x * cell + 6, py = y * cell + 7, ww = cell - 12, hh = cell - 13;
    g.fillStyle = r() < 0.5 ? '#33404f' : '#283240'; g.fillRect(px, py, ww, hh);
    if (r() < 0.3) {
      const col = windowColor(r);
      const s = 0.55 + r() * 0.45;
      ge.fillStyle = `rgb(${col.map(v => (v * s) | 0)})`; ge.fillRect(px, py, ww, hh);
    }
  }
  return { map: tex(c), emissiveMap: tex(ce) };
}
function parquetTex(tone) {
  const [c, g] = makeCanvas(512, 512);
  const r = rng(tone[0]);
  const rows = 12, rh = 512 / rows;
  for (let y = 0; y < rows; y++) {
    let x = -r() * 200;
    while (x < 512) {
      const len = 120 + r() * 140;
      const k = 0.86 + r() * 0.22;
      g.fillStyle = `rgb(${(tone[0] * k) | 0},${(tone[1] * k) | 0},${(tone[2] * k) | 0})`;
      g.fillRect(x, y * rh, len, rh);
      g.fillStyle = 'rgba(40,25,10,0.35)'; g.fillRect(x, y * rh, 1.5, rh);
      x += len;
    }
    g.fillStyle = 'rgba(40,25,10,0.3)'; g.fillRect(0, y * rh, 512, 1.5);
  }
  noise(g, 512, 512, 12, tone[1]);
  return tex(c, { repeat: [1, 1] });
}
function tileTex() {
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = '#c9ced3'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(90,100,110,0.45)'; g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
  noise(g, 256, 256, 8, 4);
  return tex(c, { repeat: [1, 1] });
}
function deckTex() {
  const [c, g] = makeCanvas(256, 256);
  const r = rng(77);
  for (let y = 0; y < 256; y += 16) {
    const k = 0.85 + r() * 0.25;
    g.fillStyle = `rgb(${(150 * k) | 0},${(104 * k) | 0},${(68 * k) | 0})`;
    g.fillRect(0, y, 256, 15);
    g.fillStyle = 'rgba(30,18,8,0.6)'; g.fillRect(0, y + 15, 256, 1);
  }
  noise(g, 256, 256, 10, 5);
  return tex(c, { repeat: [1, 1] });
}
function grassTex() {
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = '#3e5a2e'; g.fillRect(0, 0, 256, 256);
  const r = rng(9);
  for (let i = 0; i < 3500; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(90,130,60,0.5)' : 'rgba(30,50,20,0.5)';
    g.fillRect(r() * 256, r() * 256, 2, 2);
  }
  return tex(c, { repeat: [1, 1] });
}
function groundTex() {
  const [c, g] = makeCanvas(256, 256);
  g.fillStyle = '#2a2d33'; g.fillRect(0, 0, 256, 256);
  noise(g, 256, 256, 18, 11);
  return tex(c, { repeat: [1, 1] });
}
function roadTex() {
  const [c, g] = makeCanvas(512, 128);
  g.fillStyle = '#23262c'; g.fillRect(0, 0, 512, 128);
  noise(g, 512, 128, 14, 12);
  g.fillStyle = '#d9d2bf';
  for (let x = 0; x < 512; x += 64) g.fillRect(x, 62, 34, 4);
  g.fillStyle = 'rgba(217,210,191,0.8)'; g.fillRect(0, 6, 512, 2); g.fillRect(0, 120, 512, 2);
  return tex(c, { repeat: [1, 1] });
}
function latticeTex() {
  const [c, g] = makeCanvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.strokeStyle = '#f2b632'; g.lineWidth = 9;
  g.strokeRect(4, 4, 120, 120);
  g.beginPath(); g.moveTo(4, 4); g.lineTo(124, 124); g.stroke();
  const t = tex(c, { repeat: [1, 1] });
  return t;
}
function signTex(text, sub) {
  const [c, g] = makeCanvas(1024, 256);
  g.fillStyle = '#18233a'; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = '#e9bd78'; g.fillRect(0, 236, 1024, 20);
  g.fillStyle = '#f3efe6'; g.font = '600 92px Unbounded, Manrope, sans-serif'; g.textBaseline = 'middle';
  g.fillText(text, 48, 100);
  g.fillStyle = '#9ba3b8'; g.font = '600 40px Manrope, sans-serif';
  g.fillText(sub, 52, 186);
  return tex(c);
}
function planeUV(sx, sz, mpt = 2) {
  const geo = new THREE.PlaneGeometry(sx, sz);
  geo.rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * sx) / mpt, (uv.getY(i) * sz) / mpt);
  return geo;
}

/* =====================================================================
   6. MATERIALLAR
   ===================================================================== */
const BMATS = [];
function bm(params, cls = THREE.MeshStandardMaterial) {
  const m = new cls(params);
  m.clippingPlanes = [cutPlane];
  m.clipShadows = true;
  BMATS.push(m);
  return m;
}
const BOX = new THREE.BoxGeometry(1, 1, 1);
const CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
const SPH = new THREE.SphereGeometry(0.5, 18, 12);
const CROWN = new THREE.IcosahedronGeometry(1, 1);

const T = {};
const M = {};
function initMaterials() {
  T.facadeL = [1, 2, 3, 4, 5].map(i => facadeTex(W, 100 + i));
  T.facadeS = [1, 2, 3, 4, 5].map(i => facadeTex(D, 200 + i));
  T.innerL = facadeInnerTex(W);
  T.innerS = facadeInnerTex(D);
  T.storeFront = storefrontTex(W, [{ x: -13.5, text: "KAFE · NON VA QAHVA" }, { x: 0, text: 'LOBBI' }, { x: 13.5, text: "DO'KON" }], 301);
  T.storeBack = storefrontTex(W, [{ x: 0, text: "LOLA BOG'" }], 302);
  T.storeSide = storefrontTex(D, [], 303);
  T.city = [1, 2, 3].map(i => cityTex(400 + i));
  T.oak = parquetTex([176, 128, 84]);
  T.oakLight = parquetTex([196, 160, 118]);
  T.walnut = parquetTex([128, 88, 58]);
  T.tile = tileTex();
  T.deck = deckTex();
  T.grass = grassTex();
  T.ground = groundTex();
  T.road = roadTex();
  T.lattice = latticeTex();

  const fac = t => bm({ map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.5, roughness: 0.82 });
  M.facadeL = T.facadeL.map(t => fac(t));
  M.facadeS = T.facadeS.map(t => fac(t));
  M.innerL = bm({ map: T.innerL.night, emissiveMap: T.innerL.mask, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.9 });
  M.innerS = bm({ map: T.innerS.night, emissiveMap: T.innerS.mask, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.9 });
  M.stone = bm({ color: 0xd0c7b9, roughness: 0.85 });
  M.band = bm({ color: 0xe2dbcf, roughness: 0.7 });
  M.storeFront = bm({ map: T.storeFront.map, emissiveMap: T.storeFront.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.6, roughness: 0.4 });
  M.storeBack = bm({ map: T.storeBack.map, emissiveMap: T.storeBack.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.4 });
  M.storeSide = bm({ map: T.storeSide.map, emissiveMap: T.storeSide.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1.2, roughness: 0.4 });
  M.concrete = bm({ color: 0x8d8f93, roughness: 0.95 });
  M.concreteDark = bm({ color: 0x5d6067, roughness: 0.95 });
  M.glass = bm({ color: 0x9fc2e0, transparent: true, opacity: 0.28, roughness: 0.05, metalness: 0.1, depthWrite: false });
  M.metal = bm({ color: 0x40444c, roughness: 0.45, metalness: 0.6 });
  M.bronze = bm({ color: 0x3b3128, roughness: 0.5, metalness: 0.5 });
  M.stripLight = bm({ color: 0xffe2b5, emissive: 0xffd59a, emissiveIntensity: 4 });

  // interyer
  M.wall = bm({ color: 0xf3f1ec, roughness: 0.9, side: THREE.DoubleSide });
  M.partyWall = bm({ color: 0xe8e4dc, roughness: 0.9 });
  M.oak = bm({ map: T.oak, roughness: 0.65, emissive: 0x3a2412, emissiveIntensity: 0.0 });
  M.oakLight = bm({ map: T.oakLight, roughness: 0.65, emissive: 0x3a2412, emissiveIntensity: 0.0 });
  M.walnut = bm({ map: T.walnut, roughness: 0.6, emissive: 0x3a2412, emissiveIntensity: 0.0 });
  M.tile = bm({ map: T.tile, roughness: 0.35 });
  M.corridor = bm({ color: 0x8c8a86, roughness: 0.6 });
  M.ceiling = bm({ color: 0xf6f4ef, roughness: 1, side: THREE.DoubleSide });
  M.white = bm({ color: 0xf5f5f2, roughness: 0.3 });
  M.linen = bm({ color: 0xf1ece3, roughness: 0.95 });
  M.blanket = [0x8fa58a, 0xc98f6b, 0x6f86a8, 0xd2b48c].map(c => bm({ color: c, roughness: 0.95 }));
  M.sofa = [0x9aa894, 0xb9a48a, 0x7b8796, 0xa86f55].map(c => bm({ color: c, roughness: 0.95 }));
  M.cushion = bm({ color: 0xe9d9b8, roughness: 0.95 });
  M.woodMid = bm({ color: 0x9a6b44, roughness: 0.6 });
  M.woodDark = bm({ color: 0x5a3d28, roughness: 0.6 });
  M.woodLight = bm({ color: 0xd8c3a2, roughness: 0.7 });
  M.cabinet = bm({ color: 0x3f4a44, roughness: 0.6 });
  M.stoneTop = bm({ color: 0xe8e6e1, roughness: 0.25 });
  M.black = bm({ color: 0x15161a, roughness: 0.4 });
  M.rug = [0xcbb89a, 0x8d6f5f, 0x9aa7b5, 0xb24e3c].map(c => bm({ color: c, roughness: 1 }));
  M.plant = bm({ color: 0x3f6b3a, roughness: 0.9, flatShading: true });
  M.pot = bm({ color: 0xc9b9a2, roughness: 0.8 });
  M.glow = bm({ color: 0xfff1d6, emissive: 0xffd8a0, emissiveIntensity: 6 });
  M.water = bm({ color: 0x5cc3e0, emissive: 0x1e88b6, emissiveIntensity: 0.6, roughness: 0.05 });
  M.toy = [0xe0a43a, 0x5b8fd1, 0xd9544a].map(c => bm({ color: c, roughness: 0.6 }));
  M.overlay = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false });

  // tom
  M.deck = bm({ map: T.deck, roughness: 0.8 });
  M.grass = bm({ map: T.grass, roughness: 1 });
  M.pool = bm({ color: 0x46b7d8, emissive: 0x1a90c0, emissiveIntensity: 1.1, roughness: 0.05, metalness: 0.1 });
  M.leaf = bm({ color: 0x35552c, roughness: 0.9, flatShading: true });
  M.leafLight = bm({ color: 0x4f7a37, roughness: 0.9, flatShading: true });
  M.fruit = bm({ color: 0xd8662c, emissive: 0x431505, emissiveIntensity: 0.4 });
  M.trunk = bm({ color: 0x4a3626, roughness: 1 });
  M.fire = bm({ color: 0xff8c3a, emissive: 0xff6a1a, emissiveIntensity: 5 });
  M.korpacha = bm({ color: 0xa3282b, roughness: 0.9 });
  M.bulb = bm({ color: 0xffe0a8, emissive: 0xffcf86, emissiveIntensity: 7 });
  M.skylight = bm({ color: 0xffe9c8, emissive: 0xffdfae, emissiveIntensity: 2.5 });

  // qurilish
  M.crane = bm({ map: T.lattice, transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xffffff, roughness: 0.6 });
  M.craneSolid = bm({ color: 0xf2b632, roughness: 0.6 });
  M.fence = bm({ color: 0x23324a, roughness: 0.8 });
  M.dirt = new THREE.MeshStandardMaterial({ color: 0x4a3c2e, roughness: 1 });

  // atrof (kesilmaydi)
  M.ground = new THREE.MeshStandardMaterial({ map: T.ground, roughness: 1 });
  T.ground.repeat.set(160, 160);
  M.road = new THREE.MeshStandardMaterial({ map: T.road, roughness: 0.9 });
  M.sidewalk = new THREE.MeshStandardMaterial({ color: 0x55575d, roughness: 0.95 });
  M.paving = new THREE.MeshStandardMaterial({ color: 0x6b6862, roughness: 0.95 });
  M.parkGrass = new THREE.MeshStandardMaterial({ map: T.grass, roughness: 1 });
  M.tree = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true });
  M.cityRoof = new THREE.MeshStandardMaterial({ color: 0x6a6e75, roughness: 1 });
  M.treeTrunk = new THREE.MeshStandardMaterial({ color: 0x3b2c20, roughness: 1 });
  M.pole = new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.6, metalness: 0.5 });
  M.lampHead = new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd28c, emissiveIntensity: 5 });
  M.headlight = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4dc, emissiveIntensity: 12 });
  M.taillight = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1a1a, emissiveIntensity: 6 });
  M.carGlass = new THREE.MeshStandardMaterial({ color: 0x0d1118, roughness: 0.15, metalness: 0.4 });
  M.tyre = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  M.carBody = [0x1c1f26, 0xd7d9dc, 0x8a1d22, 0x2b4767, 0x9da3ab, 0x3a3f33].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.35, metalness: 0.55 }));
  M.bench = new THREE.MeshStandardMaterial({ color: 0x6a4a30, roughness: 0.8 });
  M.play = [0xd9544a, 0xe0a43a, 0x5b8fd1].map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 }));
  M.umbrella = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.8 });
  M.city = T.city.map(t => ({ t }));
}

function mesh(geo, mat, { cast = true, receive = true } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
function boxAt(parent, mat, x, y, z, sx, sy, sz, opts) {
  const m = mesh(BOX, mat, opts);
  m.scale.set(sx, sy, sz);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/* =====================================================================
   7. BINO: qavatlar, fasad, karkas, tom
   ===================================================================== */
const building = new THREE.Group();
scene.add(building);
const floors = [];      // 0..RES
let roof;               // { group, skeleton, shell, garden, pick, hl }
const pickables = [];

const GEO = {};
function initGeometries() {
  GEO.wallL = new THREE.BoxGeometry(W, F_H, WALL);
  GEO.wallS = new THREE.BoxGeometry(WALL, F_H, D - 2 * WALL);
  GEO.gwallL = new THREE.BoxGeometry(W, G_H, WALL);
  GEO.gwallS = new THREE.BoxGeometry(WALL, G_H, D - 2 * WALL);
  GEO.slab = new THREE.BoxGeometry(W, 0.3, D);
  GEO.band = new THREE.BoxGeometry(W + 0.5, 0.3, D + 0.5);
  GEO.pick = new THREE.BoxGeometry(W + 1.4, 1, D + 1.4);
  GEO.hl = new THREE.BoxGeometry(W + 0.7, 1, D + 0.7);
  GEO.hlEdges = new THREE.EdgesGeometry(GEO.hl);
}

function makeHighlight(h) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const b = new THREE.Mesh(GEO.hl, mat);
  const lmat = new THREE.LineBasicMaterial({ color: 0xffe2b0, transparent: true, opacity: 0 });
  const l = new THREE.LineSegments(GEO.hlEdges, lmat);
  b.scale.y = l.scale.y = h;
  b.position.y = l.position.y = h / 2;
  g.add(b, l);
  g.userData = { mat, lmat, k: 0 };
  g.renderOrder = 5;
  return g;
}

function buildSkeleton(h, withColumns = true) {
  const g = new THREE.Group();
  boxAt(g, M.concrete, 0, 0, 0, W, 0.3, D);
  if (withColumns) {
    const xs = [-HW + 0.3, -18, -12, -6, 0, 6, 12, 18, HW - 0.3];
    const zs = [-HD + 0.3, -CORR, CORR, HD - 0.3];
    const inst = new THREE.InstancedMesh(BOX, M.concrete, xs.length * zs.length);
    const mtx = new THREE.Matrix4();
    let k = 0;
    for (const x of xs) for (const z of zs) {
      mtx.compose(new THREE.Vector3(x, h / 2, z), new THREE.Quaternion(), new THREE.Vector3(0.45, h, 0.45));
      inst.setMatrixAt(k++, mtx);
    }
    inst.castShadow = true; inst.receiveShadow = true;
    g.add(inst);
  }
  return g;
}

function buildResShell(f, r) {
  const g = new THREE.Group();
  const vL1 = (r() * 5) | 0, vL2 = (r() * 5) | 0, vS1 = (r() * 5) | 0, vS2 = (r() * 5) | 0;
  const end = M.stone, top = M.stone;
  // Ko'cha tomoni (+z)
  const street = mesh(GEO.wallL, [end, end, top, top, M.facadeL[vL1], M.innerL]);
  street.position.set(0, F_H / 2, HD - WALL / 2);
  // Bog' tomoni (-z)
  const park = mesh(GEO.wallL, [end, end, top, top, M.innerL, M.facadeL[vL2]]);
  park.position.set(0, F_H / 2, -HD + WALL / 2);
  const east = mesh(GEO.wallS, [M.facadeS[vS1], M.innerS, top, top, end, end]);
  east.position.set(HW - WALL / 2, F_H / 2, 0);
  const west = mesh(GEO.wallS, [M.innerS, M.facadeS[vS2], top, top, end, end]);
  west.position.set(-HW + WALL / 2, F_H / 2, 0);
  g.add(street, park, east, west);
  const band = mesh(GEO.band, M.band);
  band.position.y = 0.05;
  g.add(band);
  // balkonlar: har bir xonadonning mehmonxonasi oldida
  for (const u of UNITS_BY_FLOOR[f]) {
    const lr = livingRoom(u);
    const cx = toWorldX(u, (lr.u0 + lr.u1) / 2);
    const bw = Math.min(lr.u1 - lr.u0 - 0.8, 4.2);
    const zc = u.sgn * (HD + 0.7);
    boxAt(g, M.band, cx, 0.1, zc, bw, 0.2, 1.4);
    boxAt(g, M.glass, cx, 0.72, u.sgn * (HD + 1.38), bw, 1.05, 0.04, { cast: false });
    boxAt(g, M.metal, cx, 1.26, u.sgn * (HD + 1.38), bw, 0.05, 0.07);
    boxAt(g, M.glass, cx - bw / 2, 0.72, zc, 0.04, 1.05, 1.4, { cast: false });
    boxAt(g, M.glass, cx + bw / 2, 0.72, zc, 0.04, 1.05, 1.4, { cast: false });
  }
  return g;
}

function buildGroundShell() {
  const g = new THREE.Group();
  const end = M.stone;
  const front = mesh(GEO.gwallL, [end, end, end, end, M.storeFront, M.stone]);
  front.position.set(0, G_H / 2, HD - WALL / 2);
  const back = mesh(GEO.gwallL, [end, end, end, end, M.stone, M.storeBack]);
  back.position.set(0, G_H / 2, -HD + WALL / 2);
  const east = mesh(GEO.gwallS, [M.storeSide, M.stone, end, end, end, end]);
  east.position.set(HW - WALL / 2, G_H / 2, 0);
  const west = mesh(GEO.gwallS, [M.stone, M.storeSide, end, end, end, end]);
  west.position.set(-HW + WALL / 2, G_H / 2, 0);
  g.add(front, back, east, west);
  // soyabon va yorug'lik chizig'i
  boxAt(g, M.bronze, 0, 3.75, HD + 1.3, W + 0.4, 0.22, 2.6);
  boxAt(g, M.stripLight, 0, 3.62, HD + 2.45, W + 0.2, 0.04, 0.12, { cast: false });
  // ichkarisi qorong'i bo'lmasligi uchun pol
  boxAt(g, M.concreteDark, 0, 0.02, 0, W - 0.6, 0.04, D - 0.6, { cast: false });
  return g;
}

function buildBuilding() {
  for (let i = 0; i <= RES; i++) {
    const r = rng(i * 131 + 7);
    const h = i === 0 ? G_H : F_H;
    const group = new THREE.Group();
    group.position.y = base(i);
    const skeleton = buildSkeleton(h);
    const shell = i === 0 ? buildGroundShell() : buildResShell(i, r);
    const pick = new THREE.Mesh(GEO.pick, new THREE.MeshBasicMaterial({ visible: false }));
    pick.scale.y = h; pick.position.y = h / 2;
    pick.userData.level = i;
    const hl = makeHighlight(h);
    group.add(skeleton, shell, pick, hl);
    building.add(group);
    pickables.push(pick);
    floors.push({ i, h, group, skeleton, shell, pick, hl, interior: null });
  }
  // tom
  const group = new THREE.Group();
  group.position.y = ROOF_Y;
  const skeleton = new THREE.Group();
  boxAt(skeleton, M.concrete, 0, 0, 0, W, 0.4, D);
  const shell = new THREE.Group();
  boxAt(shell, M.band, 0, 0.05, 0, W + 0.5, 0.35, D + 0.5);
  boxAt(shell, M.stone, 0, 0.75, HD - 0.15, W, 1.1, 0.3);
  boxAt(shell, M.stone, 0, 0.75, -HD + 0.15, W, 1.1, 0.3);
  boxAt(shell, M.stone, HW - 0.15, 0.75, 0, 0.3, 1.1, D);
  boxAt(shell, M.stone, -HW + 0.15, 0.75, 0, 0.3, 1.1, D);
  const garden = buildRoofGarden();
  shell.add(garden);
  const pick = new THREE.Mesh(GEO.pick, new THREE.MeshBasicMaterial({ visible: false }));
  pick.scale.y = 4; pick.position.y = 2;
  pick.userData.level = 'roof';
  const hl = makeHighlight(1.4);
  group.add(skeleton, shell, pick, hl);
  building.add(group);
  pickables.push(pick);
  roof = { group, skeleton, shell, garden, pick, hl };
}

/* ---------- tom bog'i ---------- */
function roofTree(g, x, z, s = 1, fruit = false) {
  boxAt(g, M.pot, x, 0.45, z, 1.1 * s, 0.7, 1.1 * s);
  const t = mesh(CYL, M.trunk); t.scale.set(0.16 * s, 1.6 * s, 0.16 * s); t.position.set(x, 1.4 * s, z); g.add(t);
  const c = mesh(CROWN, fruit ? M.leafLight : M.leaf); c.scale.setScalar(1.05 * s); c.position.set(x, 2.5 * s, z); g.add(c);
  if (fruit) {
    const r = rng((x * 100 + z) | 0);
    for (let k = 0; k < 7; k++) {
      const a = r() * Math.PI * 2, e = r() * 0.9;
      const f = mesh(SPH, M.fruit, { cast: false }); f.scale.setScalar(0.16);
      f.position.set(x + Math.cos(a) * 0.95 * s, 2.5 * s + (e - 0.3) * s, z + Math.sin(a) * 0.95 * s);
      g.add(f);
    }
  }
}
function buildRoofGarden() {
  const g = new THREE.Group();
  const y0 = 0.22;
  // lift va zinapoya xonasi
  boxAt(g, M.stone, 0, y0 + 1.7, 5.1, 6, 3.4, 7.2);
  boxAt(g, M.skylight, 0, y0 + 3.42, 5.1, 3.2, 0.06, 3.6, { cast: false });
  boxAt(g, M.glass, 0, y0 + 1.25, 1.48, 2.4, 2.4, 0.06, { cast: false });
  // pergola terrasa (-x, ko'cha tomoni)
  const deck = mesh(planeUV(17, 7.2, 2), M.deck); deck.position.set(-13.5, y0 + 0.02, 4.8); g.add(deck);
  for (let x = -21.5; x <= -5.5; x += 4) for (const z of [1.6, 8.0]) boxAt(g, M.woodDark, x, y0 + 1.45, z, 0.18, 2.9, 0.18);
  for (const z of [1.6, 8.0]) boxAt(g, M.woodDark, -13.5, y0 + 2.95, z, 16.4, 0.2, 0.2);
  for (let x = -21.5; x <= -5.5; x += 0.8) boxAt(g, M.woodMid, x, y0 + 3.1, 4.8, 0.08, 0.14, 6.8);
  for (const [x, z] of [[-18.5, 3.4], [-13.5, 6.4], [-9, 3.2]]) {
    boxAt(g, M.sofa[1], x, y0 + 0.22, z, 2.4, 0.44, 0.9);
    boxAt(g, M.sofa[1], x, y0 + 0.55, z - 0.35, 2.4, 0.4, 0.2);
    boxAt(g, M.woodMid, x, y0 + 0.2, z + 1.0, 1.2, 0.4, 0.6);
  }
  const fire = mesh(CYL, M.concreteDark); fire.scale.set(1.1, 0.45, 1.1); fire.position.set(-13.5, y0 + 0.23, 3.7); g.add(fire);
  const flame = mesh(CYL, M.fire, { cast: false }); flame.scale.set(0.7, 0.08, 0.7); flame.position.set(-13.5, y0 + 0.5, 3.7); g.add(flame);
  g.userData.flame = flame;
  // gulchambar chiroqlar
  const bulbs = [];
  for (const z of [2.8, 4.8, 6.8]) {
    for (let x = -21.4; x <= -5.6; x += 0.55) {
      const t = (x + 21.4) / 15.8;
      const sag = Math.sin(t * Math.PI) * 0.35;
      bulbs.push([x, y0 + 2.75 - sag, z]);
    }
  }
  const bi = new THREE.InstancedMesh(SPH, M.bulb, bulbs.length);
  const mtx = new THREE.Matrix4();
  bulbs.forEach((p, k) => { mtx.compose(new THREE.Vector3(...p), new THREE.Quaternion(), new THREE.Vector3(0.11, 0.11, 0.11)); bi.setMatrixAt(k, mtx); });
  g.add(bi);
  // maysazor (-x, bog' tomoni)
  const lawn = mesh(planeUV(15, 6.2, 3), M.grass); lawn.position.set(-13, y0 + 0.03, -4.6); g.add(lawn);
  boxAt(g, M.stone, -13, y0 + 0.12, -1.4, 15.4, 0.24, 0.2);
  for (const x of [-19.5, -6.5]) roofTree(g, x, -7.3, 0.9);
  for (let x = -20; x <= -6; x += 2) boxAt(g, M.leaf, x, y0 + 0.4, -8.35, 1.6, 0.8, 0.6);
  // basseyn (+x, bog' tomoni)
  const pdeck = mesh(planeUV(18, 7.2, 2), M.deck); pdeck.position.set(11.5, y0 + 0.02, -4.8); g.add(pdeck);
  boxAt(g, M.stoneTop, 10.5, y0 + 0.12, -5, 12, 0.24, 5);
  const water = mesh(new THREE.PlaneGeometry(11, 4).rotateX(-Math.PI / 2), M.pool, { cast: false });
  water.position.set(10.5, y0 + 0.25, -5); g.add(water);
  g.userData.water = water;
  for (const x of [5.5, 7.5, 9.5, 11.5, 13.5, 15.5]) {
    boxAt(g, M.white, x, y0 + 0.2, -1.7, 0.7, 0.3, 1.9);
    boxAt(g, M.white, x, y0 + 0.45, -1.0, 0.7, 0.35, 0.35);
  }
  roofTree(g, 19.5, -6.5, 1.0); roofTree(g, 21.8, -2.6, 0.8);
  // mevali bog' va so'ri (+x, ko'cha tomoni)
  for (const [x, z] of [[6.5, 7.2], [10, 7.2], [20.5, 7.2], [20.5, 3.0]]) roofTree(g, x, z, 0.95, true);
  for (const x of [6.5, 10.5]) {
    boxAt(g, M.woodDark, x, y0 + 0.35, 3.2, 2.6, 0.7, 1.2);
    for (let k = 0; k < 5; k++) { const s = mesh(SPH, M.leafLight); s.scale.set(0.5, 0.35, 0.5); s.position.set(x - 1 + k * 0.5, y0 + 0.78, 3.2); g.add(s); }
  }
  // so'ri: yog'och supa, xontaxta va ko'rpachalar
  const sx = 15.2, sz = 4.6;
  boxAt(g, M.woodMid, sx, y0 + 0.3, sz, 2.6, 0.12, 3.0);
  for (const [dx, dz] of [[-1.2, -1.4], [1.2, -1.4], [-1.2, 1.4], [1.2, 1.4]]) boxAt(g, M.woodDark, sx + dx, y0 + 0.15, sz + dz, 0.14, 0.3, 0.14);
  boxAt(g, M.woodDark, sx, y0 + 0.62, sz - 1.45, 2.6, 0.5, 0.08);
  boxAt(g, M.woodDark, sx - 1.27, y0 + 0.62, sz, 0.08, 0.5, 3.0);
  boxAt(g, M.woodDark, sx + 1.27, y0 + 0.62, sz, 0.08, 0.5, 3.0);
  boxAt(g, M.korpacha, sx, y0 + 0.4, sz - 1.0, 2.3, 0.08, 0.6);
  boxAt(g, M.korpacha, sx - 0.85, y0 + 0.4, sz + 0.3, 0.6, 0.08, 2.0);
  boxAt(g, M.korpacha, sx + 0.85, y0 + 0.4, sz + 0.3, 0.6, 0.08, 2.0);
  boxAt(g, M.woodDark, sx, y0 + 0.5, sz + 0.1, 1.0, 0.16, 0.9);
  const lamp = mesh(SPH, M.glow, { cast: false }); lamp.scale.setScalar(0.22); lamp.position.set(sx, y0 + 0.7, sz + 0.1); g.add(lamp);
  // chekka gul yashiklari
  for (let x = -22; x <= 22; x += 2.2) {
    if (Math.abs(x) < 3.4) continue;
    boxAt(g, M.leaf, x, y0 + 0.35, 8.45, 1.8, 0.5, 0.5);
  }
  return g;
}

/* ---------- interyer ---------- */
function put(g, u, b, mat, lu, lv, y0, su, sh, sv, opts = {}) {
  const m = mesh(opts.geo || BOX, mat, { cast: opts.cast !== false, receive: true });
  m.scale.set(su, sh, sv);
  m.position.set(toWorldX(u, lu), b + y0 + sh / 2, toWorldZ(u, lv));
  g.add(m);
  return m;
}
function floorPlane(g, u, b, mat, r, mpt = 2) {
  const su = r.u1 - r.u0, sv = r.v1 - r.v0;
  const m = mesh(planeUV(su, sv, mpt), mat, { cast: false });
  m.position.set(toWorldX(u, (r.u0 + r.u1) / 2), b + 0.17, toWorldZ(u, (r.v0 + r.v1) / 2));
  g.add(m);
}
function wallU(g, u, b, lv, a0, a1, th = 0.12, mat = M.wall) {
  if (a1 - a0 < 0.05) return;
  const x0 = toWorldX(u, a0), x1 = toWorldX(u, a1);
  const m = mesh(BOX, mat);
  m.scale.set(Math.abs(x1 - x0), 2.75, th);
  m.position.set((x0 + x1) / 2, b + 0.15 + 1.375, toWorldZ(u, lv));
  g.add(m);
}
function wallV(g, u, b, lu, a0, a1, th = 0.12, mat = M.wall) {
  if (a1 - a0 < 0.05) return;
  const z0 = toWorldZ(u, a0), z1 = toWorldZ(u, a1);
  const m = mesh(BOX, mat);
  m.scale.set(th, 2.75, Math.abs(z1 - z0));
  m.position.set(toWorldX(u, lu), b + 0.15 + 1.375, (z0 + z1) / 2);
  g.add(m);
}
function plant(g, u, b, lu, lv, s = 1) {
  put(g, u, b, M.pot, lu, lv, 0.15, 0.4 * s, 0.45 * s, 0.4 * s, { geo: CYL });
  const p = put(g, u, b, M.plant, lu, lv, 0.15 + 0.45 * s, 0.75 * s, 0.9 * s, 0.75 * s, { geo: CROWN });
  p.scale.multiplyScalar(0.6);
}
function bed(g, u, b, r, headU, dir, cv, width, blanket) {
  const L = 2.05, cu = headU + (dir * L) / 2, y = 0.15;
  put(g, u, b, M.woodDark, cu, cv, y, L, 0.3, width + 0.1);
  put(g, u, b, M.linen, cu + dir * 0.04, cv, y + 0.3, L - 0.12, 0.2, width - 0.04);
  put(g, u, b, blanket, cu + dir * 0.34, cv, y + 0.5, L - 0.72, 0.05, width + 0.02);
  if (width > 1.2) {
    put(g, u, b, M.linen, headU + dir * 0.32, cv - width * 0.24, y + 0.5, 0.36, 0.13, width * 0.42);
    put(g, u, b, M.linen, headU + dir * 0.32, cv + width * 0.24, y + 0.5, 0.36, 0.13, width * 0.42);
  } else put(g, u, b, M.linen, headU + dir * 0.32, cv, y + 0.5, 0.36, 0.13, width * 0.7);
  put(g, u, b, M.woodDark, headU + dir * 0.06, cv, y, 0.1, 1.05, width + 0.2);
  for (const s of [-1, 1]) {
    put(g, u, b, M.woodMid, headU + dir * 0.27, cv + s * (width / 2 + 0.38), y, 0.44, 0.5, 0.44);
    put(g, u, b, M.glow, headU + dir * 0.27, cv + s * (width / 2 + 0.38), y + 0.5, 0.22, 0.22, 0.22, { geo: SPH, cast: false });
  }
}
function sofa(g, u, b, backU, dir, cv, len, mat) {
  const d = 0.95, y = 0.15;
  put(g, u, b, mat, backU + (dir * d) / 2, cv, y, d, 0.42, len);
  put(g, u, b, mat, backU + dir * 0.13, cv, y + 0.42, 0.26, 0.42, len);
  put(g, u, b, mat, backU + (dir * d) / 2, cv - len / 2 + 0.11, y + 0.42, d, 0.2, 0.22);
  put(g, u, b, mat, backU + (dir * d) / 2, cv + len / 2 - 0.11, y + 0.42, d, 0.2, 0.22);
  put(g, u, b, M.cushion, backU + dir * 0.34, cv - len * 0.22, y + 0.44, 0.16, 0.36, 0.42);
  put(g, u, b, M.cushion, backU + dir * 0.34, cv + len * 0.22, y + 0.44, 0.16, 0.36, 0.42);
}
function furnish(g, u, b, r, k) {
  const su = r.u1 - r.u0, cv = (r.v0 + r.v1) / 2, cu = (r.u0 + r.u1) / 2;
  const pick = arr => arr[(k + u.f + u.idx) % arr.length];
  switch (r.type) {
    case 'bath':
      floorPlane(g, u, b, M.tile, r, 1);
      put(g, u, b, M.white, r.u0 + 0.95, r.v1 - 0.45, 0.15, 1.7, 0.55, 0.75);
      put(g, u, b, M.water, r.u0 + 0.95, r.v1 - 0.45, 0.6, 1.5, 0.04, 0.55, { cast: false });
      put(g, u, b, M.white, r.u1 - 0.4, r.v0 + 0.45, 0.15, 0.4, 0.42, 0.62);
      put(g, u, b, M.stoneTop, r.u0 + 0.6, r.v0 + 0.3, 0.15, 0.9, 0.85, 0.5);
      break;
    case 'hall':
      floorPlane(g, u, b, M.oakLight, r);
      put(g, u, b, pick(M.rug), cu, cv + 0.2, 0.17, 1.0, 0.01, 1.6, { cast: false });
      plant(g, u, b, r.u1 - 0.35, r.v0 + 0.4, 0.8);
      break;
    case 'kitchen': {
      floorPlane(g, u, b, M.oakLight, r);
      const start = u.w <= 6 ? 3.6 : r.u0 + 0.1;
      const end = r.u1 - 0.85;
      const len = end - start, mid = (start + end) / 2;
      put(g, u, b, M.cabinet, mid, r.v0 + 0.36, 0.15, len, 0.88, 0.62);
      put(g, u, b, M.stoneTop, mid, r.v0 + 0.36, 1.03, len + 0.02, 0.04, 0.66);
      put(g, u, b, M.black, mid + len * 0.22, r.v0 + 0.38, 1.07, 0.6, 0.012, 0.5, { cast: false });
      put(g, u, b, M.metal, mid - len * 0.22, r.v0 + 0.38, 1.07, 0.55, 0.012, 0.4, { cast: false });
      put(g, u, b, M.white, r.u1 - 0.42, r.v0 + 0.38, 0.15, 0.72, 2.0, 0.66);
      if (su >= 3.4) {
        const tu = cu + 0.2, tv = r.v0 + 1.7;
        put(g, u, b, M.woodLight, tu, tv, 0.15, 1.2, 0.75, 0.8);
        for (const s of [-1, 1]) put(g, u, b, M.woodDark, tu + s * 0.85, tv, 0.15, 0.42, 0.45, 0.42);
        put(g, u, b, M.glow, tu, tv, 1.55, 0.3, 0.3, 0.3, { geo: SPH, cast: false });
      }
      break;
    }
    case 'bed':
      floorPlane(g, u, b, M.walnut, r);
      put(g, u, b, pick(M.rug), r.u0 + 1.6, cv + 0.2, 0.17, 2.6, 0.01, 2.6, { cast: false });
      bed(g, u, b, r, r.u0 + 0.05, 1, cv + 0.25, 1.6, pick(M.blanket));
      put(g, u, b, M.woodLight, r.u1 - 0.36, r.v1 - 1.25, 0.15, 0.62, 2.2, 1.9);
      plant(g, u, b, r.u0 + 0.4, r.v1 - 0.4, 0.9);
      break;
    case 'kids':
      floorPlane(g, u, b, M.oak, r);
      put(g, u, b, M.rug[2], cu, cv, 0.17, 2.0, 0.01, 1.6, { cast: false });
      bed(g, u, b, r, r.u0 + 0.05, 1, r.v0 + 1.0, 1.0, M.blanket[3]);
      put(g, u, b, M.woodLight, r.u1 - 0.75, r.v1 - 0.38, 0.15, 1.3, 0.75, 0.62);
      put(g, u, b, M.woodDark, r.u1 - 0.75, r.v1 - 0.95, 0.15, 0.45, 0.45, 0.45);
      put(g, u, b, M.glow, r.u1 - 0.3, r.v1 - 0.4, 0.92, 0.2, 0.2, 0.2, { geo: SPH, cast: false });
      for (let t = 0; t < 3; t++) put(g, u, b, M.toy[t], cu - 0.4 + t * 0.4, cv + 0.6 - t * 0.2, 0.18, 0.28, 0.28, 0.28);
      break;
    case 'living': {
      floorPlane(g, u, b, M.oak, r);
      const sl = Math.min(2.6, r.v1 - r.v0 - 1.4);
      put(g, u, b, pick(M.rug), cu + 0.1, cv, 0.17, su - 1.6, 0.01, sl + 0.4, { cast: false });
      sofa(g, u, b, r.u0 + 0.15, 1, cv, sl, pick(M.sofa));
      put(g, u, b, M.woodDark, r.u1 - 0.25, cv, 0.15, 0.42, 0.5, 1.9);
      put(g, u, b, M.black, r.u1 - 0.22, cv, 0.65, 0.06, 0.75, 1.4);
      put(g, u, b, M.woodMid, (r.u0 + 1.1 + r.u1 - 0.5) / 2, cv, 0.15, 0.9, 0.38, 0.9, { geo: CYL });
      put(g, u, b, pick(M.sofa.slice().reverse()), cu + 0.6, r.v1 - 0.6, 0.15, 0.8, 0.45, 0.8);
      plant(g, u, b, r.u1 - 0.4, r.v1 - 0.4, 1.1);
      put(g, u, b, M.metal, r.u0 + 0.4, r.v1 - 0.45, 0.15, 0.05, 1.5, 0.05, { geo: CYL });
      put(g, u, b, M.glow, r.u0 + 0.4, r.v1 - 0.45, 1.65, 0.34, 0.34, 0.34, { geo: SPH, cast: false });
      break;
    }
    case 'studio': {
      floorPlane(g, u, b, M.oak, r);
      bed(g, u, b, r, r.u0 + 0.05, 1, r.v0 + 1.15, 1.4, pick(M.blanket));
      put(g, u, b, pick(M.rug), r.u1 - 1.8, r.v1 - 1.5, 0.17, 2.4, 0.01, 2.2, { cast: false });
      sofa(g, u, b, r.u1 - 0.15, -1, r.v1 - 1.5, 2.0, pick(M.sofa));
      put(g, u, b, M.woodMid, r.u1 - 2.1, r.v1 - 1.5, 0.15, 0.7, 0.38, 0.7, { geo: CYL });
      put(g, u, b, M.woodDark, r.u0 + 1.0, r.v1 - 0.28, 0.15, 1.6, 0.5, 0.42);
      put(g, u, b, M.black, r.u0 + 1.0, r.v1 - 0.25, 0.65, 1.2, 0.7, 0.06);
      plant(g, u, b, r.u0 + 2.4, r.v1 - 0.4, 1);
      break;
    }
  }
}
function buildInterior(f) {
  const g = new THREE.Group();
  const b = base(f);
  const unitObjs = {};
  // koridor va zinapoya bloki
  const corr = mesh(planeUV(W - 0.6, CORR * 2, 2), M.corridor, { cast: false });
  corr.position.set(0, b + 0.17, 0); g.add(corr);
  const coreFloor = mesh(planeUV(6, DEPTH, 2), M.corridor, { cast: false });
  coreFloor.position.set(0, b + 0.17, CORR + DEPTH / 2); g.add(coreFloor);
  boxAt(g, M.metal, -1.7, b + 1.5, CORR + DEPTH - 1.2, 2.0, 2.7, 2.0);
  boxAt(g, M.metal, -1.7, b + 1.5, CORR + DEPTH - 3.5, 2.0, 2.7, 2.0);
  for (let s = 0; s < 12; s++) boxAt(g, M.stone, 1.5, b + 0.15 + s * 0.11, CORR + 1.0 + s * 0.45, 2.3, 0.22, 0.45);
  for (const x of [-3, 3]) boxAt(g, M.partyWall, x, b + 1.525, CORR + DEPTH / 2, 0.2, 2.75, DEPTH);
  boxAt(g, M.partyWall, 1.6, b + 1.525, CORR, 2.8, 2.75, 0.12);
  // xonadonlar orasidagi devorlar
  for (const x of [-12, -3, 3, 12]) {
    boxAt(g, M.partyWall, x, b + 1.525, -(CORR + DEPTH / 2), 0.2, 2.75, DEPTH);
    if (Math.abs(x) > 4) boxAt(g, M.partyWall, x, b + 1.525, CORR + DEPTH / 2, 0.2, 2.75, DEPTH);
  }
  for (const u of UNITS_BY_FLOOR[f]) {
    const rooms = unitLayout(u.w);
    // koridor devori (eshik bilan)
    wallU(g, u, b, 0, 0, 2.5, 0.16);
    wallU(g, u, b, 0, 3.4, u.w, 0.16);
    // hammom devorlari
    wallV(g, u, b, 2.4, 0, 1.5);
    wallV(g, u, b, 2.4, 2.4, BAND);
    // BAND chizig'idagi devor: hammom + yotoqxonalar (eshik joylari bilan)
    wallU(g, u, b, BAND, 0, 2.4);
    rooms.filter(r => r.type === 'bed' || r.type === 'kids').forEach(r => {
      const d0 = r.u0 < 2.4 ? 2.6 : r.u0 + 0.15;
      wallU(g, u, b, BAND, r.u0, d0);
      wallU(g, u, b, BAND, d0 + 0.9, r.u1);
    });
    // xonalar orasidagi devorlar
    const band = rooms.filter(r => r.v0 >= BAND - 0.01);
    band.slice(0, -1).forEach(r => wallV(g, u, b, r.u1, BAND, DEPTH));
    rooms.forEach((r, k) => furnish(g, u, b, r, k));
    // shift (faqat ichkarida yurganda)
    const c = unitCenter(u);
    const ceil = mesh(new THREE.PlaneGeometry(u.w - 0.2, DEPTH).rotateX(Math.PI / 2), M.ceiling, { cast: false, receive: false });
    ceil.position.set(c.x, b + 2.92, c.z);
    ceil.visible = false;
    g.add(ceil);
    // holat qatlami va tanlash maydoni
    const om = M.overlay.clone();
    const ov = new THREE.Mesh(new THREE.PlaneGeometry(u.w - 0.25, DEPTH - 0.1).rotateX(-Math.PI / 2), om);
    ov.position.set(c.x, b + 2.95, c.z);
    ov.renderOrder = 4;
    ov.userData.unit = u;
    g.add(ov);
    unitObjs[u.id] = { overlay: ov, ceil };
  }
  g.visible = false;
  building.add(g);
  return { group: g, units: unitObjs };
}
function ensureInterior(f) {
  if (!floors[f].interior) floors[f].interior = buildInterior(f);
  return floors[f].interior;
}

/* =====================================================================
   8. ATROF: yo'llar, daraxtlar, chiroqlar, mashinalar, shahar
   ===================================================================== */
const env = new THREE.Group();
scene.add(env);
const cars = [];
const LAMP_LIGHTS = [], CITY_MATS = [];
const MOON_DIR = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
let SKY = null, starsMat = null;
let landscape, construction, crane, parkTreesMesh, parkTreeData = [];

function buildSky() {
  const geo = new THREE.SphereGeometry(700, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x050914) }, mid: { value: new THREE.Color(0x14203f) }, hor: { value: new THREE.Color(0x3a3a5e) }, glow: { value: new THREE.Color(0x6a4a52) },
      sunDir: { value: new THREE.Vector3(0, -1, 0) }, sunCol: { value: new THREE.Color(0xffffff) }, sunAmt: { value: 0 },
      moonDir: { value: MOON_DIR.clone() }, moonAmt: { value: 1 }, glowDir: { value: new THREE.Vector2(-0.6, -1) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 glow; uniform vec3 sunDir; uniform vec3 sunCol; uniform float sunAmt;
      uniform vec3 moonDir; uniform float moonAmt; uniform vec2 glowDir; varying vec3 vP;
      void main(){ vec3 d = normalize(vP); float h = d.y; vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.7, h));
      float g = pow(max(0.0, 1.0 - abs(h) * 5.0), 2.0) * smoothstep(-0.3, 1.0, dot(normalize(d.xz), normalize(glowDir)));
      c += glow * g * 0.7;
      float sd = max(dot(d, sunDir), 0.0);
      c += sunCol * (smoothstep(0.9993, 0.9996, sd) * 6.0 + pow(sd, 90.0) * 0.8 + pow(sd, 8.0) * 0.12) * sunAmt;
      float md = max(dot(d, moonDir), 0.0);
      c += vec3(0.92, 0.94, 1.0) * (smoothstep(0.99955, 0.9997, md) * 2.2 + pow(md, 300.0) * 0.25) * moonAmt;
      if (h < 0.0) c = hor * 0.6; gl_FragColor = vec4(c, 1.0); }`,
  });
  SKY = mat.uniforms;
  scene.add(new THREE.Mesh(geo, mat));
  const r = rng(5), pts = [];
  for (let i = 0; i < 1400; i++) {
    const th = r() * Math.PI * 2, ph = Math.acos(lerp(0.12, 1, r()));
    pts.push(new THREE.Vector3().setFromSphericalCoords(650, ph, th));
  }
  const sg = new THREE.BufferGeometry().setFromPoints(pts);
  starsMat = new THREE.PointsMaterial({ color: 0xdfe6ff, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false });
  scene.add(new THREE.Points(sg, starsMat));
}

function addTreeInstances(list, parent) {
  const trunks = new THREE.InstancedMesh(CYL, M.treeTrunk, list.length);
  const crowns = new THREE.InstancedMesh(CROWN, M.tree, list.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
  list.forEach((t, k) => {
    mtx.compose(new THREE.Vector3(t.x, 1.4 * t.s, t.z), q, new THREE.Vector3(0.28 * t.s, 2.8 * t.s, 0.28 * t.s));
    trunks.setMatrixAt(k, mtx);
    mtx.compose(new THREE.Vector3(t.x, 3.9 * t.s, t.z), q.setFromEuler(new THREE.Euler(0, t.rot, 0)), new THREE.Vector3(2.1 * t.s, 2.4 * t.s, 2.1 * t.s));
    crowns.setMatrixAt(k, mtx);
    col.setHSL(0.27 + t.h * 0.06, 0.35, 0.18 + t.h * 0.08);
    crowns.setColorAt(k, col);
    q.identity();
  });
  trunks.castShadow = crowns.castShadow = true;
  crowns.receiveShadow = true;
  parent.add(trunks, crowns);
  return { trunks, crowns };
}
function setTreeGrowth(s) {
  if (!parkTreesMesh) return;
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
  const k0 = Math.max(0.001, s);
  parkTreeData.forEach((t, k) => {
    const ss = t.s * k0;
    mtx.compose(new THREE.Vector3(t.x, 1.4 * ss, t.z), q.identity(), new THREE.Vector3(0.28 * ss, 2.8 * ss, 0.28 * ss));
    parkTreesMesh.trunks.setMatrixAt(k, mtx);
    mtx.compose(new THREE.Vector3(t.x, 3.9 * ss, t.z), q.setFromEuler(new THREE.Euler(0, t.rot, 0)), new THREE.Vector3(2.1 * ss, 2.4 * ss, 2.1 * ss));
    parkTreesMesh.crowns.setMatrixAt(k, mtx);
  });
  parkTreesMesh.trunks.instanceMatrix.needsUpdate = true;
  parkTreesMesh.crowns.instanceMatrix.needsUpdate = true;
}

function buildCar(color, dir) {
  const g = new THREE.Group();
  const body = mesh(BOX, color); body.scale.set(4.4, 0.75, 1.85); body.position.y = 0.62; g.add(body);
  const cab = mesh(BOX, M.carGlass); cab.scale.set(2.4, 0.62, 1.66); cab.position.set(-0.25, 1.28, 0); g.add(cab);
  const roofm = mesh(BOX, color); roofm.scale.set(2.1, 0.06, 1.6); roofm.position.set(-0.3, 1.6, 0); g.add(roofm);
  for (const [x, z] of [[1.4, 0.88], [1.4, -0.88], [-1.4, 0.88], [-1.4, -0.88]]) {
    const w = mesh(CYL, M.tyre); w.rotation.x = Math.PI / 2; w.scale.set(0.68, 0.26, 0.68); w.position.set(x, 0.34, z); g.add(w);
  }
  for (const z of [0.62, -0.62]) {
    boxAt(g, M.headlight, 2.21, 0.72, z, 0.04, 0.16, 0.42, { cast: false });
    boxAt(g, M.taillight, -2.21, 0.75, z, 0.04, 0.14, 0.4, { cast: false });
  }
  g.rotation.y = dir > 0 ? 0 : Math.PI;
  return g;
}

function buildEnvironment() {
  // yer
  const ground = mesh(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2), M.ground, { cast: false });
  ground.position.y = -0.02;
  env.add(ground);
  // asosiy ko'cha (x bo'ylab) va kesishgan ko'chalar (z bo'ylab)
  const road = mesh(new THREE.PlaneGeometry(400, 10).rotateX(-Math.PI / 2), M.road, { cast: false });
  M.road.map.repeat.set(400 / 16, 1);
  road.position.set(0, 0.0, 17); env.add(road);
  const roadMatZ = M.road.clone(); roadMatZ.map = T.road.clone(); roadMatZ.map.needsUpdate = true; roadMatZ.map.wrapS = roadMatZ.map.wrapT = THREE.RepeatWrapping; roadMatZ.map.repeat.set(400 / 16, 1);
  for (const x of [-41, 41]) {
    const rz = mesh(new THREE.PlaneGeometry(400, 10).rotateX(-Math.PI / 2).rotateY(Math.PI / 2), roadMatZ, { cast: false });
    rz.position.set(x, -0.005, 0); env.add(rz);
  }
  // trotuarlar
  for (const [x0, x1] of [[-200, -46], [-36, 36], [46, 200]]) {
    boxAt(env, M.sidewalk, (x0 + x1) / 2, 0.08, 10.6, x1 - x0, 0.16, 3.2, { cast: false });
    boxAt(env, M.sidewalk, (x0 + x1) / 2, 0.08, 23.5, x1 - x0, 0.16, 3.0, { cast: false });
  }
  // bino maydoni va park
  boxAt(env, M.paving, 0, 0.06, -2, 72, 0.12, 22, { cast: false });
  const park = mesh(planeUV(72, 30, 4), M.parkGrass, { cast: false });
  park.position.set(0, 0.04, -28); env.add(park);
  for (const z of [-20, -32]) boxAt(env, M.paving, 0, 0.07, z, 70, 0.06, 2.2, { cast: false });
  for (const x of [-18, 18]) boxAt(env, M.paving, x, 0.07, -28, 2.2, 0.06, 28, { cast: false });

  landscape = new THREE.Group();
  env.add(landscape);
  // bolalar maydonchasi, o'rindiqlar
  for (const [k, x, z, sx, sy, sz] of [[0, -8, -26, 3, 1.6, 0.4], [1, -4.5, -26.5, 1.2, 2.4, 1.2], [2, -6, -29, 4, 0.5, 2]]) boxAt(landscape, M.play[k], x, sy / 2, z, sx, sy, sz);
  for (let x = -30; x <= 30; x += 8) { boxAt(landscape, M.bench, x, 0.45, -21.6, 1.8, 0.1, 0.5); boxAt(landscape, M.bench, x, 0.22, -21.6, 1.6, 0.44, 0.3); }
  // kafe terrasasi
  for (let x = -21; x <= -6; x += 3.5) {
    const t = mesh(CYL, M.white); t.scale.set(0.8, 0.75, 0.8); t.position.set(x, 0.53, 11.1); landscape.add(t);
    const p = mesh(CYL, M.pole); p.scale.set(0.06, 2.4, 0.06); p.position.set(x, 1.35, 11.1); landscape.add(p);
    const um = mesh(new THREE.ConeGeometry(1.3, 0.5, 8), M.umbrella); um.position.set(x, 2.6, 11.1); landscape.add(um);
  }

  // daraxtlar
  const r = rng(21), street = [];
  for (let x = -120; x <= 120; x += 11) {
    if (Math.abs(Math.abs(x) - 41) < 7) continue;
    street.push({ x: x + 2, z: 9.7 + (x < -36 || x > 36 ? 0.4 : 0), s: 0.85 + r() * 0.3, rot: r() * 6, h: r() });
    street.push({ x: x - 3, z: 24.2, s: 0.85 + r() * 0.3, rot: r() * 6, h: r() });
  }
  addTreeInstances(street.filter(t => !(Math.abs(t.x) < 26 && t.z < 12)), env);
  const parkT = [];
  for (let i = 0; i < 46; i++) {
    const x = -34 + r() * 68, z = -40 + r() * 26;
    if (Math.abs(z + 20) < 2 || Math.abs(z + 32) < 2 || Math.abs(Math.abs(x) - 18) < 2) continue;
    if (x > -11 && x < -1 && z > -31 && z < -24) continue;
    parkT.push({ x, z, s: 0.8 + r() * 0.5, rot: r() * 6, h: r() });
  }
  parkTreeData = parkT;
  parkTreesMesh = addTreeInstances(parkT, landscape);

  // ko'cha chiroqlari
  const lamps = [];
  for (let x = -110; x <= 110; x += 14) {
    if (Math.abs(Math.abs(x) - 41) < 6) continue;
    lamps.push([x, 12.0, 1]); lamps.push([x + 7, 22.2, -1]);
  }
  for (let x = -30; x <= 30; x += 10) { lamps.push([x, -20.9, 0]); lamps.push([x + 5, -33.1, 0]); }
  const poles = new THREE.InstancedMesh(CYL, M.pole, lamps.length);
  const heads = new THREE.InstancedMesh(BOX, M.lampHead, lamps.length);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion();
  lamps.forEach(([x, z, d], k) => {
    const h = d === 0 ? 3.2 : 7;
    mtx.compose(new THREE.Vector3(x, h / 2, z), q, new THREE.Vector3(0.14, h, 0.14));
    poles.setMatrixAt(k, mtx);
    mtx.compose(new THREE.Vector3(x, h, z + d * 0.9), q, new THREE.Vector3(d === 0 ? 0.35 : 0.5, 0.14, d === 0 ? 0.35 : 1.1));
    heads.setMatrixAt(k, mtx);
  });
  poles.castShadow = true;
  env.add(poles, heads);
  // binoning oldidagi issiq yorug'lik
  for (const x of [-18, -4, 10, 24]) {
    const pl = new THREE.PointLight(0xffc98a, 60, 26, 1.8);
    pl.position.set(x, 6.4, 13.2);
    pl.userData.base = 60;
    env.add(pl);
    LAMP_LIGHTS.push(pl);
  }
  const parkLight = new THREE.PointLight(0xffd6a0, 40, 30, 1.8);
  parkLight.position.set(0, 4, -24);
  parkLight.userData.base = 40;
  env.add(parkLight);
  LAMP_LIGHTS.push(parkLight);

  // atrofdagi uylar
  const cr = rng(99);
  const blocks = [];
  for (let gx = -190; gx <= 190; gx += 17) for (let gz = -190; gz <= 190; gz += 17) {
    const x = gx + (cr() - 0.5) * 4, z = gz + (cr() - 0.5) * 4;
    if (z > 4 && z < 30) continue;                       // asosiy ko'cha
    if (Math.abs(Math.abs(x) - 41) < 13) continue;       // yon ko'chalar
    if (Math.abs(x) < 40 && z > -50 && z < 30) continue; // bino va park
    const dist = Math.hypot(x, z);
    if (dist < 78 || cr() < 0.4) continue;
    const sx = 9 + cr() * 7, sz = 9 + cr() * 7;
    const sy = 7 + cr() * (dist > 130 ? 38 : dist > 100 ? 20 : 10);
    blocks.push({ x, z, sx, sy, sz });
  }
  for (const bl of blocks) {
    const t = T.city[(cr() * 3) | 0];
    const map = t.map.clone(), em = t.emissiveMap.clone();
    for (const tt of [map, em]) { tt.wrapS = tt.wrapT = THREE.RepeatWrapping; tt.repeat.set(bl.sx / 48, bl.sy / 51); tt.needsUpdate = true; }
    const m = new THREE.MeshStandardMaterial({ map, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.9 });
    CITY_MATS.push(m);
    const b = mesh(BOX, [m, m, M.cityRoof, M.cityRoof, m, m], { cast: false, receive: true });
    b.scale.set(bl.sx, bl.sy, bl.sz);
    b.position.set(bl.x, bl.sy / 2, bl.z);
    env.add(b);
  }

  // mashinalar
  const cr2 = rng(3);
  for (let i = 0; i < 14; i++) {
    const dir = i % 2 ? 1 : -1;
    const car = buildCar(M.carBody[(cr2() * M.carBody.length) | 0], dir);
    car.position.set(-150 + cr2() * 300, 0, dir > 0 ? 19.5 : 14.5);
    car.userData = { dir, speed: 7 + cr2() * 6 };
    env.add(car);
    cars.push(car);
  }

  // qurilish maydoni: to'siq va kran
  construction = new THREE.Group();
  env.add(construction);
  const dirt = mesh(new THREE.PlaneGeometry(64, 26).rotateX(-Math.PI / 2), M.dirt, { cast: false });
  dirt.position.set(0, 0.13, -1);
  construction.add(dirt);
  const fz0 = -14, fz1 = 10.6, fx = 32;
  boxAt(construction, M.fence, 0, 1.2, fz1, fx * 2, 2.4, 0.12);
  boxAt(construction, M.fence, 0, 1.2, fz0, fx * 2, 2.4, 0.12);
  boxAt(construction, M.fence, fx, 1.2, (fz0 + fz1) / 2, 0.12, 2.4, fz1 - fz0);
  boxAt(construction, M.fence, -fx, 1.2, (fz0 + fz1) / 2, 0.12, 2.4, fz1 - fz0);
  const sign = mesh(new THREE.PlaneGeometry(14, 3.5), new THREE.MeshStandardMaterial({ map: signTex("LOLA BOG'", `Topshirish: ${PROJECT.handover}`), emissive: 0xffffff, emissiveIntensity: 0.25, emissiveMap: null }));
  sign.material.emissiveMap = sign.material.map;
  sign.position.set(-8, 2.2, fz1 + 0.08);
  construction.add(sign);

  crane = new THREE.Group();
  const mast = new THREE.Group();
  for (const [dx, dz, ry] of [[0, 0.8, 0], [0, -0.8, Math.PI], [0.8, 0, Math.PI / 2], [-0.8, 0, -Math.PI / 2]]) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1), M.crane);
    p.position.set(dx, 0.5, dz); p.rotation.y = ry;
    mast.add(p);
  }
  crane.add(mast);
  const top = new THREE.Group();
  boxAt(top, M.craneSolid, 0, 0, 0, 2.2, 2.0, 2.2);
  boxAt(top, M.craneSolid, 18, 1.4, 0, 38, 0.9, 1.0);
  boxAt(top, M.craneSolid, -7, 1.4, 0, 12, 0.9, 1.2);
  boxAt(top, M.concreteDark, -11.5, 0.6, 0, 3, 1.6, 2);
  boxAt(top, M.craneSolid, 0, 4.0, 0, 0.5, 5, 0.5);
  boxAt(top, M.metal, 22, -6, 0, 0.05, 14, 0.05, { cast: false });
  boxAt(top, M.taillight, 0, 6.6, 0, 0.3, 0.3, 0.3, { cast: false });
  crane.add(top);
  crane.userData = { mast, top };
  crane.position.set(-29, 0, -6);
  crane.rotation.y = -0.35;
  construction.add(crane);
}

/* =====================================================================
   9. YORUG'LIK
   ===================================================================== */
const hemi = new THREE.HemisphereLight(0x50608c, 0x14121c, 0.7);
scene.add(hemi);
const keyLight = new THREE.DirectionalLight(0x9db2ff, 0.8);
keyLight.position.set(-45, 80, 40);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -38, right: 38, top: 38, bottom: -38, near: 10, far: 220 });
keyLight.shadow.bias = -0.0004;
keyLight.shadow.normalBias = 0.03;
scene.add(keyLight, keyLight.target);
const walkLight = new THREE.PointLight(0xffd7a8, 0, 14, 1.6);
scene.add(walkLight);

const LIGHT = {
  night: { hemiSky: 0x50608c, hemiGround: 0x14121c, hemi: 0.75, key: 0x9db2ff, keyI: 0.8, exp: 1.0, floorGlow: 0.0, bloom: 0.55 },
  plan: { hemiSky: 0xdcd4c8, hemiGround: 0x2a2433, hemi: 1.55, key: 0xffe1bb, keyI: 2.6, exp: 1.0, floorGlow: 0.12, bloom: 0.35 },
  walk: { hemiSky: 0xe7ddd0, hemiGround: 0x3a3030, hemi: 0.75, key: 0xffe1bb, keyI: 0.0, exp: 0.92, floorGlow: 0.03, bloom: 0.22 },
};
const lightNow = { hemi: 0.75, keyI: 0.8, exp: 1.0, floorGlow: 0, bloom: 0.55, hemiSky: new THREE.Color(0x50608c), hemiGround: new THREE.Color(0x14121c), key: new THREE.Color(0x9db2ff) };

/* ---------- kun vaqti: tun, tong, kunduz, shom ----------
   Har bir kalit nuqta: osmon ranglari, tuman, yorug'lik, derazalar (win), ko'cha chiroqlari (lamps), yulduzlar. */
const TOD_KEYS = [
  { h: 0, top: 0x050914, mid: 0x14203f, hor: 0x3a3a5e, glow: 0x5a4060, fog: 0x0c1428, fogD: 0.0062, hs: 0x50608c, hg: 0x14121c, hemi: 0.75, key: 0x9db2ff, keyI: 0.8, exp: 1.0, win: 1, lamps: 1, stars: 1, bloom: 0.55, day: 0 },
  { h: 5.2, top: 0x08112a, mid: 0x1c2850, hor: 0x4a4468, glow: 0x7a5068, fog: 0x1a2038, fogD: 0.0058, hs: 0x5a6890, hg: 0x18141e, hemi: 0.75, key: 0x9db2ff, keyI: 0.6, exp: 1.0, win: 0.85, lamps: 1, stars: 0.6, bloom: 0.5, day: 0.05 },
  { h: 6.6, top: 0x2a4170, mid: 0x6a80b0, hor: 0xf2a878, glow: 0xffa060, fog: 0x9a8aa0, fogD: 0.0042, hs: 0xa8b4d4, hg: 0x4a3a34, hemi: 1.0, key: 0xffb27a, keyI: 2.4, exp: 0.95, win: 0.35, lamps: 0.25, stars: 0, bloom: 0.32, day: 0.55 },
  { h: 8.5, top: 0x3a74c4, mid: 0x80b0e2, hor: 0xd4e4f2, glow: 0xfff0d8, fog: 0xb4c8de, fogD: 0.0030, hs: 0xc4d8f2, hg: 0x6a5c4c, hemi: 1.35, key: 0xfff0da, keyI: 3.0, exp: 0.85, win: 0.05, lamps: 0, stars: 0, bloom: 0.12, day: 1 },
  { h: 13, top: 0x3168c0, mid: 0x74aae6, hor: 0xd8e9f6, glow: 0xffffff, fog: 0xb8cde4, fogD: 0.0028, hs: 0xc8dcf6, hg: 0x6e6050, hemi: 1.45, key: 0xfffaf0, keyI: 3.3, exp: 0.82, win: 0, lamps: 0, stars: 0, bloom: 0.1, day: 1 },
  { h: 16.5, top: 0x3a6cb8, mid: 0x86aad8, hor: 0xe4dcd0, glow: 0xffe2b0, fog: 0xc0c4cc, fogD: 0.0030, hs: 0xc8d2e8, hg: 0x6e5a48, hemi: 1.3, key: 0xffe2b8, keyI: 2.9, exp: 0.85, win: 0.08, lamps: 0, stars: 0, bloom: 0.14, day: 0.95 },
  { h: 18.1, top: 0x2c3a72, mid: 0x7470a4, hor: 0xff9c5c, glow: 0xff7a3c, fog: 0x9c7a7c, fogD: 0.0042, hs: 0xb4a2c4, hg: 0x4a3030, hemi: 0.95, key: 0xff9050, keyI: 2.1, exp: 0.95, win: 0.55, lamps: 0.5, stars: 0, bloom: 0.38, day: 0.5 },
  { h: 19.3, top: 0x0f1a3c, mid: 0x283568, hor: 0x7a5878, glow: 0xa05a58, fog: 0x262a48, fogD: 0.0055, hs: 0x5a6896, hg: 0x1a1622, hemi: 0.8, key: 0x8a9ce0, keyI: 0.7, exp: 1.0, win: 1, lamps: 1, stars: 0.5, bloom: 0.55, day: 0.1 },
];
TOD_KEYS.push({ ...TOD_KEYS[0], h: 24 });
const TOD_COLORS = ['top', 'mid', 'hor', 'glow', 'fog', 'hs', 'hg', 'key'];
const TOD_NUMS = ['fogD', 'hemi', 'keyI', 'exp', 'win', 'lamps', 'stars', 'bloom', 'day'];
TOD_KEYS.forEach(k => TOD_COLORS.forEach(c => { k[c] = new THREE.Color(k[c]); }));
const TOD = Object.fromEntries(TOD_COLORS.map(c => [c, new THREE.Color()]));
function todProfile(h) {
  h = ((h % 24) + 24) % 24;
  let i = 0;
  while (i < TOD_KEYS.length - 2 && TOD_KEYS[i + 1].h <= h) i++;
  const a = TOD_KEYS[i], b = TOD_KEYS[i + 1];
  const t = clamp((h - a.h) / (b.h - a.h), 0, 1);
  const k = t * t * (3 - 2 * t);
  TOD_COLORS.forEach(c => TOD[c].copy(a[c]).lerp(b[c], k));
  TOD_NUMS.forEach(n => { TOD[n] = lerp(a[n], b[n], k); });
  return TOD;
}
const SUN_DIR = new THREE.Vector3();
/** Quyosh: sharq (+x) dan janub (+z) orqali g'arb (-x) ga. Qaytaradi: balandlik (radian). */
function sunAt(h, out = SUN_DIR) {
  const k = (h - PROJECT.sunrise) / (PROJECT.sunset - PROJECT.sunrise);
  const phi = Math.PI * k;
  const el = Math.sin(Math.PI * clamp(k, -0.12, 1.12)) * THREE.MathUtils.degToRad(58);
  out.set(Math.cos(el) * Math.cos(phi), Math.sin(el), Math.cos(el) * Math.sin(phi) * 0.85 + 0.25).normalize();
  return el;
}
function dayPhase(h) {
  h = ((h % 24) + 24) % 24;
  if (h < 5) return 'Tun';
  if (h < 7.5) return 'Tong';
  if (h < 11) return 'Ertalab';
  if (h < 15.5) return 'Kunduz';
  if (h < 17.8) return 'Tushdan keyin';
  if (h < 19.6) return 'Shom';
  return 'Tun';
}
const PLAN_C = { sky: new THREE.Color(LIGHT.plan.hemiSky), ground: new THREE.Color(LIGHT.plan.hemiGround), key: new THREE.Color(LIGHT.plan.key) };
const WALK_C = { sky: new THREE.Color(LIGHT.walk.hemiSky), ground: new THREE.Color(LIGHT.walk.hemiGround), dayGround: new THREE.Color(0xc9bda9) };
const TL = { hemiSky: new THREE.Color(), hemiGround: new THREE.Color(), key: new THREE.Color() };
/** Rejim + kun vaqtidan maqsadli yorug'lik. */
function targetLight(P) {
  const d = P.day;
  TL.hemi = P.hemi; TL.keyI = P.keyI; TL.exp = P.exp; TL.bloom = P.bloom; TL.floorGlow = 0;
  TL.hemiSky.copy(P.hs); TL.hemiGround.copy(P.hg); TL.key.copy(P.key);
  if (S.mode === 'homes') {
    TL.hemi = lerp(LIGHT.plan.hemi, Math.max(P.hemi, 1.25), d);
    TL.hemiSky.copy(PLAN_C.sky).lerp(P.hs, d * 0.4);
    TL.hemiGround.copy(PLAN_C.ground).lerp(P.hg, d);
    TL.keyI = lerp(LIGHT.plan.keyI, Math.max(P.keyI, 2.8), d);
    TL.key.copy(PLAN_C.key).lerp(P.key, d);
    TL.exp = lerp(LIGHT.plan.exp, 0.9, d);
    TL.bloom = lerp(LIGHT.plan.bloom, 0.1, d);
    TL.floorGlow = LIGHT.plan.floorGlow * (1 - d);
  } else if (S.mode === 'walk') {
    TL.hemi = lerp(LIGHT.walk.hemi, 1.6, d);
    TL.hemiSky.copy(WALK_C.sky).lerp(P.hs, d * 0.6);
    TL.hemiGround.copy(WALK_C.ground).lerp(WALK_C.dayGround, d);
    TL.keyI = P.keyI * 0.3 * d;
    TL.exp = lerp(LIGHT.walk.exp, 0.98, d);
    TL.bloom = lerp(LIGHT.walk.bloom, 0.08, d);
    TL.floorGlow = LIGHT.walk.floorGlow * (1 - d);
  }
  return TL;
}

/* =====================================================================
   10. HOLAT (state)
   ===================================================================== */
const S = {
  mode: 'overview', floor: 5, unit: null, hover: null, hoverLevel: null,
  rooms: 0, onlyAvail: false, currency: 'usd',
  progress: PROJECT.progressNow, progAnim: null,
  cut: 1000, cutTo: 1000,
  shiftX: 0, shiftY: 0, shiftXTo: 0, shiftYTo: 0,
  fly: null, interacted: false, placeIdx: -1,
  walkRoom: null, walkUnit: null,
  down: null,
  hour: PROJECT.startHour, hourAnim: null,
};

const money = usd => {
  if (S.currency === 'usd') return `$${nf(usd)}`;
  const s = usd * PROJECT.usdRate;
  if (s >= 1e9) return `${dec(s / 1e9, 2)} mlrd so'm`;
  if (s >= 1e6) return `${dec(s / 1e6, s >= 1e8 ? 0 : 1)} mln so'm`;
  return `${nf(s)} so'm`;
};
const passes = u => (S.rooms === 0 || u.rooms === S.rooms) && (!S.onlyAvail || u.status === 'available');

/* =====================================================================
   11. QURILISH JARAYONI
   ===================================================================== */
function applyProgress(p) {
  const N = LEVELS + 1;
  const frame = clamp(p / 0.6, 0, 1) * N;
  const clad = clamp((p - 0.25) / 0.65, 0, 1) * N;
  const all = [...floors, roof];
  all.forEach((fl, i) => {
    const fs = easeOut(clamp(frame - i, 0, 1));
    fl.skeleton.visible = fs > 0.001;
    fl.skeleton.scale.y = Math.max(0.001, fs);
    const fc = easeOut(clamp(clad - i, 0, 1));
    fl.shell.visible = fc > 0.001;
    fl.shell.scale.y = Math.max(0.001, fc);
    fl.built = fc > 0.5;
  });
  const land = clamp((p - 0.86) / 0.14, 0, 1);
  landscape.visible = land > 0.001;
  setTreeGrowth(easeOut(land));
  roof.garden.scale.setScalar(Math.max(0.001, easeOut(land)));
  roof.garden.visible = land > 0.001;
  construction.visible = p < 0.985;
  const topY = Math.min(frame, N) / N * (ROOF_Y + 0.4);
  const mastH = Math.max(16, topY + 12);
  crane.userData.mast.scale.y = mastH;
  M.crane.map.repeat.set(1, mastH / 1.6);
  crane.userData.top.position.y = mastH + 1;
  crane.rotation.y = -0.35 + Math.sin(p * 9) * 0.5;
  // UI
  const pct = Math.round(p * 100);
  $('#buildPct').textContent = `${pct}%`;
  $('#buildStage').textContent = p < 0.08 ? 'Poydevor' : p < 0.55 ? 'Karkas' : p < 0.85 ? 'Fasad' : p < 0.98 ? 'Pardozlash' : 'Tayyor';
  const range = $('#buildRange');
  if (document.activeElement !== range) range.value = pct;
  range.style.setProperty('--fill', `${pct}%`);
}
function animateProgress(to, dur = 2.5, from = S.progress) {
  if (REDUCED) dur = 0.01;
  S.progAnim = { from, to, t: 0, dur };
}

/* =====================================================================
   12. KAMERA KO'RINISHLARI
   ===================================================================== */
function fitDist(R) {
  const vt = Math.tan(THREE.MathUtils.degToRad(20));
  return R / Math.min(vt, vt * camera.aspect);
}
const isNarrow = () => innerWidth <= 820;
function viewOverview() {
  const t = new THREE.Vector3(0, 13, 0);
  const r = clamp(fitDist(30) * 0.98, 70, 170);
  return { pos: t.clone().add(new THREE.Vector3().setFromSphericalCoords(r, 1.22, 0.78)), target: t };
}
function viewHomes(f) {
  const t = new THREE.Vector3(0, base(f) + 1, 0);
  const r = clamp(fitDist(26) * 0.9, 50, 150);
  return { pos: t.clone().add(new THREE.Vector3().setFromSphericalCoords(r, 0.62, 0.62)), target: t };
}
function viewRoof() {
  const t = new THREE.Vector3(0, ROOF_Y + 1, 0);
  const r = clamp(fitDist(24) * 0.9, 42, 130);
  return { pos: t.clone().add(new THREE.Vector3().setFromSphericalCoords(r, 0.78, 0.55)), target: t };
}
function viewStreet() {
  return { pos: new THREE.Vector3(isNarrow() ? 30 : 27, 1.9, isNarrow() ? 30 : 25), target: new THREE.Vector3(-3, 6.5, 8) };
}
const LIMITS = {
  overview: { min: 30, max: 190, minPol: 0.2, maxPol: 1.45, pan: false },
  homes: { min: 14, max: 160, minPol: 0.0, maxPol: 1.15, pan: true },
  roof: { min: 10, max: 120, minPol: 0.1, maxPol: 1.35, pan: true },
  street: { min: 4, max: 60, minPol: 1.0, maxPol: 1.56, pan: false },
  walk: { min: 0.05, max: 0.05, minPol: 1.0, maxPol: 2.1, pan: false },
};
function applyLimits(mode) {
  const L = LIMITS[mode];
  controls.minDistance = L.min; controls.maxDistance = L.max;
  controls.minPolarAngle = L.minPol; controls.maxPolarAngle = L.maxPol;
  controls.enablePan = L.pan;
  controls.screenSpacePanning = false;
  controls.enableZoom = mode !== 'walk';
  controls.rotateSpeed = mode === 'walk' ? -0.35 : 0.6;
  controls.autoRotate = mode === 'overview' && !S.interacted && !REDUCED;
}
function flyTo(pos, target, dur = 1.8, onDone) {
  if (REDUCED) dur = 0.01;
  controls.minDistance = 0; controls.maxDistance = Infinity;
  controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI;
  S.fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos.clone(), t1: target.clone(), d: dur, t: 0, onDone, arc: Math.min(18, camera.position.distanceTo(pos) * 0.12) };
  controls.enabled = false;
}
function updateFly(dt) {
  const f = S.fly;
  if (!f) return;
  f.t = Math.min(1, f.t + dt / f.d);
  const k = ease(f.t);
  camera.position.lerpVectors(f.p0, f.p1, k);
  camera.position.y += Math.sin(Math.PI * k) * f.arc;
  controls.target.lerpVectors(f.t0, f.t1, k);
  camera.lookAt(controls.target);
  if (f.t >= 1) {
    S.fly = null;
    controls.enabled = true;
    applyLimits(S.mode);
    controls.update();
    f.onDone && f.onDone();
  }
}
function updateShiftTargets() {
  const w = innerWidth, h = innerHeight, narrow = isNarrow();
  let x = 0, y = 0;
  if (S.mode === 'overview') { if (narrow) y = h * 0.2; else x = w * 0.13; }
  else if (S.mode === 'homes') {
    if (document.body.classList.contains('panel-open')) { if (narrow) y = h * 0.27; else x = Math.min(440, w * 0.35) / 2 + 10; }
    else if (narrow) y = h * 0.1;
  }
  else if (S.mode === 'roof' || S.mode === 'street') { if (narrow) y = h * 0.1; }
  S.shiftXTo = x; S.shiftYTo = y;
}
function applyShift() {
  const w = innerWidth, h = innerHeight;
  if (Math.abs(S.shiftX) < 0.5 && Math.abs(S.shiftY) < 0.5) camera.clearViewOffset();
  else camera.setViewOffset(w, h, -S.shiftX, S.shiftY, w, h);
}

/* =====================================================================
   13. REJIMLAR
   ===================================================================== */
const MODE_HASH = { overview: 'bino', homes: 'xonadonlar', roof: 'tom', street: 'kocha' };
const HASH_MODE = Object.fromEntries(Object.entries(MODE_HASH).map(([k, v]) => [v, k]));
let suppressHash = false;

function setMode(mode, opts = {}) {
  if (S.mode === 'walk' && mode !== 'walk') leaveWalkScene();
  S.mode = mode;
  document.body.dataset.mode = mode;
  document.querySelectorAll('.modes button').forEach(b => b.classList.toggle('is-active', b.dataset.go === mode));
  closeUnit(false);
  hideTooltip(); hidePreview();
  clearPins();
  setHoverLevel(null);
  if (mode === 'overview') {
    S.cutTo = 1000;
    showInterior(null);
    const v = viewOverview();
    flyTo(v.pos, v.target, 2.0);
  } else if (mode === 'homes') {
    if (S.progress < 1) animateProgress(1, 1.4);
    selectFloor(opts.floor ?? S.floor, { fly: true });
  } else if (mode === 'roof') {
    if (S.progress < 1) animateProgress(1, 1.4);
    S.cutTo = 1000;
    showInterior(null);
    const v = viewRoof();
    flyTo(v.pos, v.target, 2.0);
    showPlaces(ROOF_PLACES, 'roof');
  } else if (mode === 'street') {
    if (S.progress < 1) animateProgress(1, 1.4);
    S.cutTo = 1000;
    showInterior(null);
    const v = viewStreet();
    flyTo(v.pos, v.target, 2.2);
    showPlaces(STREET_PLACES, 'street');
  }
  updateShiftTargets();
  if (!opts.fromHash && MODE_HASH[mode]) {
    suppressHash = true;
    try { history.replaceState(null, '', `#${MODE_HASH[mode]}`); } catch (e) { location.hash = MODE_HASH[mode]; }
    setTimeout(() => { suppressHash = false; }, 0);
  }
}
addEventListener('hashchange', () => {
  if (suppressHash) return;
  const m = HASH_MODE[location.hash.slice(1)];
  if (m && m !== S.mode) setMode(m, { fromHash: true });
});

function showInterior(f) {
  floors.forEach((fl, i) => { if (fl.interior) fl.interior.group.visible = i === f; });
}
function selectFloor(f, { fly = true } = {}) {
  const prev = S.floor;
  S.floor = f;
  ensureInterior(f);
  showInterior(f);
  S.cutTo = base(f) + F_H - 0.2;
  S.hover = null;
  if (S.unit && S.unit.f !== f) closeUnit(false);
  buildUnitPins(f);
  paintUnits();
  renderLevels();
  renderHomesSummary();
  $('#homesFloorLabel').textContent = `${f + 1}-qavat · ${UNITS_BY_FLOOR[f].filter(u => u.status === 'available').length} ta sotuvda`;
  if (fly) {
    const v = viewHomes(f);
    flyTo(v.pos, v.target, 1.9);
  } else if (prev !== f) {
    const dy = base(f) - base(prev);
    flyTo(camera.position.clone().add(new THREE.Vector3(0, dy, 0)), controls.target.clone().add(new THREE.Vector3(0, dy, 0)), 0.9);
  }
}

/* ---------- pinlar ---------- */
const pinLayer = $('#pins');
let pins = [];
function clearPins() { pinLayer.textContent = ''; pins = []; }
function buildUnitPins(f) {
  clearPins();
  for (const u of UNITS_BY_FLOOR[f]) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `pin st-${u.status}`;
    el.innerHTML = `${u.id}<i></i>`;
    el.setAttribute('aria-label', `Xonadon ${u.id}: ${u.title}, ${STATUS[u.status].toLowerCase()}`);
    el.addEventListener('pointerenter', () => setHover(u));
    el.addEventListener('pointerleave', () => setHover(null));
    el.addEventListener('focus', () => setHover(u));
    el.addEventListener('blur', () => setHover(null));
    el.addEventListener('click', () => openUnit(u));
    pinLayer.append(el);
    const c = unitCenter(u);
    pins.push({ el, pos: new THREE.Vector3(c.x, base(f) + 3.4, c.z), unit: u });
  }
}
function updatePins() {
  if (!pins.length) return;
  const w = innerWidth, h = innerHeight, v = new THREE.Vector3();
  for (const p of pins) {
    v.copy(p.pos).project(camera);
    const off = v.z > 1 || v.x < -1.2 || v.x > 1.2 || v.y < -1.2 || v.y > 1.2;
    p.el.classList.toggle('is-off', off || !!S.fly && S.fly.d > 0.5 && S.fly.t < 0.7);
    if (off) continue;
    p.sx = (v.x * 0.5 + 0.5) * w; p.sy = (-v.y * 0.5 + 0.5) * h;
    p.el.style.transform = `translate3d(${p.sx.toFixed(1)}px, ${p.sy.toFixed(1)}px, 0)`;
  }
}
function refreshPinClasses() {
  for (const p of pins) {
    if (!p.unit) continue;
    p.el.classList.toggle('is-dim', !passes(p.unit));
    p.el.classList.toggle('is-hot', S.hover === p.unit);
    p.el.classList.toggle('is-selected', S.unit === p.unit);
  }
}

/* ---------- xonadon holati rangi ---------- */
function paintUnits() {
  const fl = floors[S.floor];
  if (!fl || !fl.interior) return;
  for (const u of UNITS_BY_FLOOR[S.floor]) {
    const m = fl.interior.units[u.id].overlay.material;
    let c = 0x000000, a = 0;
    if (!passes(u)) { c = 0x04060c; a = 0.66; }
    else if (u.status === 'sold') { c = 0x070a12; a = 0.5; }
    else if (u.status === 'reserved') { c = 0xf0a640; a = 0.14; }
    if (S.hover === u) { c = 0xfff0d6; a = 0.2; }
    if (S.unit === u) { c = 0xe9bd78; a = 0.28; }
    m.color.set(c);
    m.opacity = a;
    fl.interior.units[u.id].overlay.visible = S.mode !== 'walk';
  }
  refreshPinClasses();
}
function setHover(u) {
  if (S.hover === u) return;
  S.hover = u;
  paintUnits();
  renderHomesSummary();
  if (u && !isNarrow()) showPreview(u); else hidePreview();
}

/* ---------- reja (SVG) ---------- */
const ROOM_FILL = { bath: '#26324a', hall: '#2c2a2a', kitchen: '#3a3226', bed: '#2f2a3a', kids: '#28333a', living: '#3d3122', studio: '#3d3122' };
function planSVG(u, { labels = true, compact = false } = {}) {
  const rooms = unitLayout(u.w);
  const s = 30, pad = 14, balc = 1.4;
  const Wpx = u.w * s, Hpx = (DEPTH + balc) * s;
  const lr = livingRoom(u);
  // Fasad tepada; ko'chadan qaraganda chap-o'ng to'g'ri chiqishi uchun mirror hisobga olinadi
  const X = lu => (u.mirror ? u.w - lu : lu) * s;
  const Y = lv => (DEPTH - lv + balc) * s;
  let out = `<svg viewBox="${-pad} ${-pad} ${Wpx + pad * 2} ${Hpx + pad * 2}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Xonadon ${u.id} rejasi">`;
  const bx0 = Math.min(X(lr.u0 + 0.4), X(lr.u1 - 0.4)), bx1 = Math.max(X(lr.u0 + 0.4), X(lr.u1 - 0.4));
  out += `<rect x="${bx0}" y="0" width="${bx1 - bx0}" height="${balc * s - 4}" fill="none" stroke="#6c7489" stroke-dasharray="4 4" rx="3"/>`;
  if (labels && !compact) out += `<text x="${(bx0 + bx1) / 2}" y="${balc * s / 2 + 2}" fill="#9ba3b8" font-size="10" text-anchor="middle" font-family="Manrope, sans-serif">Balkon</text>`;
  for (const r of rooms) {
    const x0 = Math.min(X(r.u0), X(r.u1)), x1 = Math.max(X(r.u0), X(r.u1));
    const y0 = Y(r.v1), y1 = Y(r.v0);
    out += `<rect x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}" fill="${ROOM_FILL[r.type]}" stroke="#e9e4da" stroke-width="2.5"/>`;
    if (labels) {
      const fs = compact ? 9 : 11;
      const nm = compact && r.type === 'kids' ? 'Bolalar' : r.name;
      if ((x1 - x0) > 40) {
        out += `<text x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2 - (compact ? 0 : 3)}" fill="#eef0f6" font-size="${fs}" font-weight="600" text-anchor="middle" font-family="Manrope, sans-serif">${nm}</text>`;
        if (!compact) out += `<text x="${(x0 + x1) / 2}" y="${(y0 + y1) / 2 + 12}" fill="#9ba3b8" font-size="10" text-anchor="middle" font-family="Manrope, sans-serif">${dec(r.area)} m²</text>`;
      }
    }
  }
  // kirish eshigi
  const dx0 = Math.min(X(2.5), X(3.4)), dx1 = Math.max(X(2.5), X(3.4));
  out += `<rect x="${dx0}" y="${Y(0) - 2}" width="${dx1 - dx0}" height="5" fill="#e9bd78"/>`;
  out += `<rect x="0" y="${balc * s}" width="${Wpx}" height="${DEPTH * s}" fill="none" stroke="#e9e4da" stroke-width="4"/>`;
  out += '</svg>';
  return out;
}

/* ---------- preview ---------- */
const previewEl = $('#preview');
function showPreview(u) {
  previewEl.innerHTML = `<div class="plan">${planSVG(u, { compact: true })}</div>
    <div class="pv-body"><div class="pv-title">Xonadon ${u.id} · ${u.rooms} xonali</div>
    <div class="pv-meta">${dec(u.area)} m² · ${STATUS[u.status]}${u.status !== 'sold' ? ` · ${money(u.price)}` : ''}</div>
    <div class="pv-hint">Ochish uchun bosing</div></div>`;
  previewEl.classList.add('is-on');
  previewEl.dataset.unit = u.id;
}
function hidePreview() { previewEl.classList.remove('is-on'); previewEl.dataset.unit = ''; }
function positionPreview() {
  if (!previewEl.classList.contains('is-on')) return;
  const p = pins.find(p => p.unit && p.unit.id === previewEl.dataset.unit);
  if (!p || p.sx == null) return;
  const w = 250, h = previewEl.offsetHeight || 230;
  let x = p.sx + 30, y = p.sy - h / 2;
  if (x + w > innerWidth - 16) x = p.sx - w - 30;
  y = clamp(y, 80, innerHeight - h - 16);
  previewEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
}

/* ---------- qavatlar paneli ---------- */
function renderLevels() {
  const el = $('#levels');
  let html = '<span class="lv-label">Qavat</span>';
  for (let f = RES; f >= 1; f--) {
    const avail = UNITS_BY_FLOOR[f].filter(u => u.status === 'available').length;
    html += `<button type="button" data-floor="${f}" class="${f === S.floor ? 'is-active' : ''} ${avail ? '' : 'none'}" aria-label="${f + 1}-qavat, ${avail} ta xonadon sotuvda" title="${avail} ta sotuvda">${f + 1}<small></small></button>`;
  }
  el.innerHTML = html;
}
$('#levels').addEventListener('click', e => {
  const b = e.target.closest('button[data-floor]');
  if (!b) return;
  const f = +b.dataset.floor;
  if (f !== S.floor) selectFloor(f, { fly: false });
});

/* ---------- xonadonlar xulosasi ---------- */
function renderHomesSummary() {
  const el = $('#homesSummary');
  const u = S.hover || S.unit;
  if (u) {
    el.innerHTML = `<div class="hs-num">${u.id}</div>
      <div class="hs-body"><div class="hs-title">${u.title[0].toUpperCase() + u.title.slice(1)}</div>
      <div class="hs-meta">${dec(u.area)} m² · ${u.floorNo}-qavat · ${u.facing} · <span class="u-status st-${u.status}">${STATUS[u.status]}</span></div>
      <div class="hs-meta">${u.status === 'sold' ? 'Sotilgan' : money(u.price)}</div></div>
      <div class="hs-actions"><button type="button" class="btn btn-light" data-act="open" data-id="${u.id}">Batafsil</button><button type="button" class="btn btn-ghost" data-act="walk" data-id="${u.id}">Ichkariga</button></div>`;
  } else {
    const list = UNITS_BY_FLOOR[S.floor];
    const ok = list.filter(passes);
    const avail = list.filter(x => x.status === 'available');
    const minP = avail.length ? Math.min(...avail.map(x => x.price)) : 0;
    el.innerHTML = `<div class="hs-num">${ok.length}</div>
      <div class="hs-body"><div class="hs-title">${S.floor + 1}-qavatda mos xonadon</div>
      <div class="hs-meta">${avail.length ? `${avail.length} tasi sotuvda, narxi ${money(minP)} dan` : "Bu qavatdagi barcha xonadonlar sotilgan"}. Raqam ustiga bosing.</div></div>`;
  }
}
$('#homesSummary').addEventListener('click', e => {
  const b = e.target.closest('button[data-act]');
  if (!b) return;
  const u = UNITS.find(x => x.id === b.dataset.id);
  if (b.dataset.act === 'open') openUnit(u); else enterWalk(u);
});
$('#roomChips').addEventListener('click', e => {
  const b = e.target.closest('button[data-rooms]');
  if (!b) return;
  S.rooms = +b.dataset.rooms;
  $('#roomChips').querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
  paintUnits(); renderHomesSummary();
});
$('#onlyAvail').addEventListener('change', e => { S.onlyAvail = e.target.checked; paintUnits(); renderHomesSummary(); });

/* ---------- xonadon kartasi ---------- */
const unitPanel = $('#unitPanel');
const calc = { dp: 30, months: 24 };
function openUnit(u) {
  if (S.mode !== 'homes') setMode('homes', { floor: u.f });
  if (u.f !== S.floor) selectFloor(u.f, { fly: false });
  S.unit = u;
  hidePreview();
  renderUnitPanel();
  document.body.classList.add('panel-open');
  unitPanel.setAttribute('aria-hidden', 'false');
  paintUnits();
  renderHomesSummary();
  updateShiftTargets();
  const c = unitCenter(u);
  const t = new THREE.Vector3(c.x, base(u.f) + 1, c.z);
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (dir.y < 0.55) { dir.y = 0.75; dir.normalize(); }
  flyTo(t.clone().add(dir.multiplyScalar(isNarrow() ? 42 : 34)), t, 1.3);
  setTimeout(() => $('#unitClose').focus({ preventScroll: true }), 50);
}
function closeUnit(fly = true) {
  if (!S.unit && !document.body.classList.contains('panel-open')) return;
  S.unit = null;
  document.body.classList.remove('panel-open');
  unitPanel.setAttribute('aria-hidden', 'true');
  updateShiftTargets();
  if (S.mode === 'homes') {
    paintUnits(); renderHomesSummary();
    if (fly) { const v = viewHomes(S.floor); flyTo(v.pos, v.target, 1.3); }
  }
}
function renderUnitPanel() {
  const u = S.unit;
  if (!u) return;
  const rooms = unitLayout(u.w);
  const monthly = (u.price * (1 - calc.dp / 100)) / calc.months;
  $('#unitBody').innerHTML = `
    <div class="u-plan">${planSVG(u)}</div>
    <div class="u-sec">
      <p class="eyebrow">Xonadon ${u.id} · ${u.floorNo}-qavat</p>
      <h2 class="u-title">${u.title[0].toUpperCase() + u.title.slice(1)}</h2>
      <span class="u-status st-${u.status}"><i class="dot st-${u.status}"></i>${STATUS[u.status]}</span>
      <dl class="specs">
        <div><dt>Maydon</dt><dd>${dec(u.area)} m²</dd></div>
        <div><dt>Xonalar</dt><dd>${u.rooms}</dd></div>
        <div><dt>Qavat</dt><dd>${u.floorNo} / 9</dd></div>
        <div><dt>Derazalar</dt><dd>${u.sides}</dd></div>
        <div><dt>Manzara</dt><dd>${u.side === 'park' ? 'Bog\'' : 'Shahar'}</dd></div>
        <div><dt>Quyosh nuri</dt><dd>${u.sun}</dd></div>
        <div><dt>Shift balandligi</dt><dd>2,9 m</dd></div>
        <div><dt>Topshirish</dt><dd>${PROJECT.handover}</dd></div>
      </dl>
    </div>
    <div class="u-sec">
      <div class="price-row"><span class="price">${u.status === 'sold' ? 'Sotilgan' : money(u.price)}</span><span class="price-sub">1 m² · ${money(u.ppm)}</span></div>
      ${u.status === 'sold' ? '<p class="price-sub">Bu xonadon sotilgan. Shu qavatdagi boshqa xonadonlarni ko\'ring yoki menejerdan o\'xshash variant so\'rang.</p>' : `
      <div class="calc" id="calcBox">
        <div class="calc-row"><span>Boshlang'ich to'lov</span><b id="calcDpVal">${calc.dp}% · ${money(u.price * calc.dp / 100)}</b></div>
        <input type="range" id="calcDp" min="20" max="70" step="5" value="${calc.dp}" aria-label="Boshlang'ich to'lov foizi">
        <div class="calc-row"><span>Muddat</span>
          <div class="chips" id="calcMonths">${[12, 24, 36].map(m => `<button type="button" data-m="${m}" class="${m === calc.months ? 'is-active' : ''}">${m} oy</button>`).join('')}</div></div>
        <div class="calc-total"><span class="price-sub">Oylik to'lov, foizsiz</span><b id="calcMonthly">${money(monthly)}</b></div>
      </div>`}
      <div class="u-actions">
        <button type="button" class="btn btn-ghost" id="uWalk">Ichkariga kirish</button>
        <button type="button" class="btn btn-light" id="uCall">Qo'ng'iroq</button>
      </div>
    </div>
    <div class="u-sec">
      <p class="eyebrow">Xonalar</p>
      <ul class="room-list">${rooms.map(r => `<li><span>${r.name}</span><span>${dec(r.area)} m²</span></li>`).join('')}<li><span>Balkon</span><span>${dec(Math.min(livingRoom(u).u1 - livingRoom(u).u0 - 0.8, 4.2) * 1.4)} m²</span></li></ul>
    </div>`;
  $('#uWalk').onclick = () => enterWalk(u);
  $('#uCall').onclick = () => openLead(u);
  const dp = $('#calcDp');
  if (dp) {
    dp.oninput = () => { calc.dp = +dp.value; updateCalc(); };
    $('#calcMonths').onclick = e => {
      const b = e.target.closest('button[data-m]');
      if (!b) return;
      calc.months = +b.dataset.m;
      $('#calcMonths').querySelectorAll('button').forEach(x => x.classList.toggle('is-active', x === b));
      updateCalc();
    };
  }
}
function updateCalc() {
  const u = S.unit;
  if (!u) return;
  $('#calcDpVal').textContent = `${calc.dp}% · ${money(u.price * calc.dp / 100)}`;
  $('#calcMonthly').textContent = money((u.price * (1 - calc.dp / 100)) / calc.months);
}
$('#unitClose').addEventListener('click', () => closeUnit(true));

/* ---------- ichkarida yurish ---------- */
function roomEye(u, r) {
  const b = base(u.f);
  const cu = (r.u0 + r.u1) / 2;
  const inBand = r.v0 >= BAND - 0.01;
  const eyeV = inBand ? r.v0 + 0.6 : r.v0 + 0.9;
  const lookV = inBand ? r.v1 + 2 : DEPTH + 2;
  const lookU = inBand ? cu : (r.u0 + r.u1) / 2;
  const eye = new THREE.Vector3(toWorldX(u, cu), b + 1.62, toWorldZ(u, eyeV));
  const look = new THREE.Vector3(toWorldX(u, lookU), b + 1.35, toWorldZ(u, lookV));
  return { eye, look };
}
function enterWalk(u) {
  if (S.mode !== 'homes') setMode('homes', { floor: u.f });
  if (u.f !== S.floor) selectFloor(u.f, { fly: false });
  S.walkUnit = u;
  S.unit = u;
  document.body.classList.remove('panel-open');
  unitPanel.setAttribute('aria-hidden', 'true');
  S.mode = 'walk';
  document.body.dataset.mode = 'walk';
  clearPins(); hidePreview(); hideTooltip();
  const inter = floors[u.f].interior;
  inter.units[u.id].ceil.visible = true;
  paintUnits();
  const rooms = unitLayout(u.w);
  $('#walkEyebrow').textContent = `Xonadon ${u.id} · ${u.rooms} xonali · ${dec(u.area)} m²`;
  $('#walkRooms').innerHTML = rooms.map((r, k) => `<button type="button" data-k="${k}">${r.name}</button>`).join('');
  updateShiftTargets();
  walkToRoom(rooms.findIndex(r => r.type === 'living' || r.type === 'studio'), 2.4);
}
function walkToRoom(k, dur = 1.2) {
  const u = S.walkUnit;
  const rooms = unitLayout(u.w);
  const r = rooms[k];
  S.walkRoom = k;
  $('#walkTitle').textContent = r.name;
  $('#walkRooms').querySelectorAll('button').forEach(b => b.classList.toggle('is-active', +b.dataset.k === k));
  const { eye, look } = roomEye(u, r);
  const dir = look.clone().sub(eye).normalize();
  const lr = livingRoom(u);
  walkLight.position.set(toWorldX(u, (lr.u0 + lr.u1) / 2), base(u.f) + 2.6, toWorldZ(u, (lr.v0 + lr.v1) / 2));
  flyTo(eye, eye.clone().add(dir.multiplyScalar(0.05)), dur);
}
$('#walkRooms').addEventListener('click', e => {
  const b = e.target.closest('button[data-k]');
  if (b) walkToRoom(+b.dataset.k);
});
function leaveWalkScene() {
  const u = S.walkUnit;
  if (u && floors[u.f].interior) floors[u.f].interior.units[u.id].ceil.visible = false;
  S.walkUnit = null;
}
function exitWalk() {
  const u = S.walkUnit;
  leaveWalkScene();
  S.mode = 'homes';
  document.body.dataset.mode = 'homes';
  buildUnitPins(S.floor);
  if (u) openUnit(u); else { const v = viewHomes(S.floor); flyTo(v.pos, v.target); }
}
$('#walkExit').addEventListener('click', exitWalk);

/* ---------- tom va ko'cha joylari ---------- */
function showPlaces(list, kind) {
  clearPins();
  S.placeIdx = -1;
  $('#placeEyebrow').textContent = kind === 'roof' ? `Umumiy hudud · ${PROJECT.roofArea} m²` : '1-qavat · tijorat va lobbi';
  $('#placeTitle').textContent = kind === 'roof' ? "Tom bog'i" : "Ko'cha sathi";
  $('#placeDesc').textContent = '';
  $('#placeCards').innerHTML = list.map((p, k) => `<button type="button" class="place-card" data-k="${k}"><span class="pc-num">${k + 1}</span><span><b>${p.name}</b><span>${p.area} m²</span></span></button>`).join('');
  list.forEach((p, k) => {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'pin place';
    el.textContent = k + 1;
    el.setAttribute('aria-label', p.name);
    el.addEventListener('click', () => focusPlace(list, kind, k));
    pinLayer.append(el);
    const y = kind === 'roof' ? ROOF_Y + p.pos[1] : p.pos[1];
    pins.push({ el, pos: new THREE.Vector3(p.pos[0], y, p.pos[2]), place: k });
  });
  $('#placeCards').onclick = e => {
    const b = e.target.closest('button[data-k]');
    if (b) focusPlace(list, kind, +b.dataset.k);
  };
}
function focusPlace(list, kind, k) {
  const p = list[k];
  S.placeIdx = k;
  $('#placeDesc').textContent = p.text;
  $('#placeCards').querySelectorAll('.place-card').forEach(b => b.classList.toggle('is-active', +b.dataset.k === k));
  pins.forEach(pp => pp.el.classList.toggle('is-hot', pp.place === k));
  if (kind === 'roof') {
    const t = new THREE.Vector3(p.pos[0], ROOF_Y + 0.5, p.pos[2]);
    flyTo(t.clone().add(new THREE.Vector3(...p.view)), t, 1.5);
  } else {
    flyTo(new THREE.Vector3(...p.cam), new THREE.Vector3(p.pos[0], 3.2, 8.5), 1.5);
  }
}

/* ---------- tooltip ---------- */
const tooltipEl = $('#tooltip');
function showTooltip(html, x, y) {
  tooltipEl.innerHTML = html;
  tooltipEl.classList.add('is-on');
  const w = tooltipEl.offsetWidth;
  const tx = x + 18 + w > innerWidth - 8 ? x - w - 18 : x + 18;
  tooltipEl.style.transform = `translate3d(${tx}px, ${y - 20}px, 0)`;
}
function hideTooltip() { tooltipEl.classList.remove('is-on'); }
function setHoverLevel(level) {
  if (S.hoverLevel === level) return;
  S.hoverLevel = level;
  document.body.classList.toggle('is-hover-floor', level != null);
}
function levelTooltip(level) {
  if (level === 'roof') return `<b>Tom bog'i</b><span>${PROJECT.roofArea} m² umumiy hudud</span>`;
  if (level === 0) return "<b>1-qavat</b><span>Lobbi, kafe va do'kon</span>";
  const avail = UNITS_BY_FLOOR[level].filter(u => u.status === 'available').length;
  return `<b>${level + 1}-qavat</b><span><i class="dot st-${avail ? 'available' : 'sold'}"></i>${avail ? `${avail} ta xonadon sotuvda` : 'Hammasi sotilgan'}</span>`;
}

/* =====================================================================
   14. KIRITISH (sichqoncha / sensor)
   ===================================================================== */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let pointer = null;
canvas.addEventListener('pointermove', e => { pointer = { x: e.clientX, y: e.clientY, type: e.pointerType }; });
canvas.addEventListener('pointerleave', () => { pointer = null; hideTooltip(); setHoverLevel(null); if (S.mode === 'homes' && !isNarrow()) setHover(null); });
canvas.addEventListener('pointerdown', e => {
  S.down = { x: e.clientX, y: e.clientY, t: performance.now() };
  if (!S.interacted) { S.interacted = true; controls.autoRotate = false; }
});
canvas.addEventListener('pointerup', e => {
  const d = S.down;
  S.down = null;
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 7 || performance.now() - d.t > 600) return;
  handleClick(e.clientX, e.clientY);
});
function rayAt(x, y) {
  ndc.set((x / innerWidth) * 2 - 1, -(y / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
}
function pickLevel(x, y) {
  rayAt(x, y);
  const hits = raycaster.intersectObjects(pickables, false);
  return hits.length ? hits[0].object.userData.level : null;
}
function pickUnit(x, y) {
  const fl = floors[S.floor];
  if (!fl.interior) return null;
  rayAt(x, y);
  const objs = Object.values(fl.interior.units).map(o => o.overlay);
  const hits = raycaster.intersectObjects(objs, false);
  return hits.length ? hits[0].object.userData.unit : null;
}
function handleHover() {
  if (!pointer || S.fly || S.down) return;
  if (S.mode === 'overview') {
    const lv = pickLevel(pointer.x, pointer.y);
    setHoverLevel(lv);
    if (lv != null && pointer.type !== 'touch') showTooltip(levelTooltip(lv), pointer.x, pointer.y);
    else hideTooltip();
  } else if (S.mode === 'homes' && pointer.type === 'mouse') {
    const u = pickUnit(pointer.x, pointer.y);
    document.body.classList.toggle('is-hover-floor', !!u);
    if (u !== S.hover) setHover(u);
  }
}
function handleClick(x, y) {
  if (S.mode === 'overview') {
    const lv = pickLevel(x, y);
    hideTooltip();
    if (lv === 'roof') setMode('roof');
    else if (lv === 0) setMode('street');
    else if (lv != null) setMode('homes', { floor: lv });
  } else if (S.mode === 'homes') {
    const u = pickUnit(x, y);
    if (u) openUnit(u);
  }
}

/* =====================================================================
   15. UI: tugmalar, valyuta, so'rov
   ===================================================================== */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-go]');
  if (!b) return;
  e.preventDefault();
  const m = b.dataset.go;
  if (S.mode === 'walk') exitWalkSilently();
  if (m === S.mode && m !== 'homes') { const v = m === 'overview' ? viewOverview() : m === 'roof' ? viewRoof() : viewStreet(); flyTo(v.pos, v.target, 1.4); return; }
  setMode(m);
});
function exitWalkSilently() {
  leaveWalkScene();
  S.mode = 'homes';
}
function setCurrency(c) {
  S.currency = c;
  $('#curUsd').classList.toggle('is-active', c === 'usd');
  $('#curUzs').classList.toggle('is-active', c === 'uzs');
  renderHomesSummary();
  if (S.unit) renderUnitPanel();
  if (previewEl.dataset.unit) showPreview(UNITS.find(u => u.id === previewEl.dataset.unit));
  renderHeroStats();
}
$('#curUsd').addEventListener('click', () => setCurrency('usd'));
$('#curUzs').addEventListener('click', () => setCurrency('uzs'));

$('#compass').addEventListener('click', () => {
  if (S.mode === 'homes') { const v = S.unit ? null : viewHomes(S.floor); if (v) flyTo(v.pos, v.target, 1.2); }
  else if (S.mode === 'overview') { const v = viewOverview(); flyTo(v.pos, v.target, 1.2); }
  else if (S.mode === 'roof') { const v = viewRoof(); flyTo(v.pos, v.target, 1.2); }
  else if (S.mode === 'street') { const v = viewStreet(); flyTo(v.pos, v.target, 1.2); }
});

// qurilish paneli
const range = $('#buildRange');
range.addEventListener('input', () => { S.progAnim = null; S.progress = range.value / 100; applyProgress(S.progress); });
$('#buildPlay').addEventListener('click', () => animateProgress(1, 6, 0));
$('#buildNow').addEventListener('click', () => animateProgress(PROJECT.progressNow, 1.6));
$('#buildDone').addEventListener('click', () => animateProgress(1, 2.2));

// kun vaqti paneli
const fmtHour = h => { const m = Math.round((((h % 24) + 24) % 24) * 60) % 1440; return `${String((m / 60) | 0).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
const dlBox = $('#daylight');
let dlLast = '';
function setHour(to, { animate = true, dur } = {}) {
  const from = S.hour;
  const delta = ((to - from) % 24 + 24) % 24;
  if (!animate || REDUCED || delta < 0.01) { S.hourAnim = null; S.hour = ((to % 24) + 24) % 24; return; }
  S.hourAnim = { from, delta, t: 0, dur: dur ?? clamp(delta * 0.22, 0.8, 3.2) };
}
function renderDaylightUI() {
  const key = fmtHour(S.hour);
  if (key === dlLast) return;
  dlLast = key;
  const el = sunAt(S.hour);
  const up = el > -0.02;
  $('#dlTime').textContent = key;
  $('#dlBig').textContent = key;
  $('#dlLabel').textContent = dayPhase(S.hour);
  $('#dlPhase').textContent = dayPhase(S.hour);
  dlBox.classList.toggle('is-day', up);
  document.body.classList.toggle('is-day', todProfile(S.hour).day > 0.4);
  const range = $('#dlRange');
  if (document.activeElement !== range) range.value = Math.round(S.hour * 60);
  range.style.setProperty('--pos', `${(S.hour / 24) * 100}%`);
  // quyosh yoyi: chiqishdan botishgacha yuqori yoy, kechasi pastda
  const rise = PROJECT.sunrise, set = PROJECT.sunset;
  let x, y;
  if (S.hour >= rise && S.hour <= set) {
    const k = (S.hour - rise) / (set - rise);
    x = 120 - 96 * Math.cos(Math.PI * k); y = 62 - 46 * Math.sin(Math.PI * k);
  } else {
    const nightLen = 24 - (set - rise);
    const k = (((S.hour - set) % 24) + 24) % 24 / nightLen;
    x = 120 + 96 * Math.cos(Math.PI * k); y = 62 + 10 * Math.sin(Math.PI * k);
  }
  const dot = $('#dlSun');
  dot.setAttribute('cx', x.toFixed(1)); dot.setAttribute('cy', y.toFixed(1));
  dlBox.querySelectorAll('[data-hour]').forEach(b => b.classList.toggle('is-active', Math.abs(((S.hour - +b.dataset.hour + 36) % 24) - 12) < 0.25));
}
$('#dlToggle').addEventListener('click', () => {
  const open = !dlBox.classList.contains('is-open');
  dlBox.classList.toggle('is-open', open);
  $('#dlToggle').setAttribute('aria-expanded', String(open));
});
document.addEventListener('pointerdown', e => {
  if (dlBox.classList.contains('is-open') && !dlBox.contains(e.target)) {
    dlBox.classList.remove('is-open');
    $('#dlToggle').setAttribute('aria-expanded', 'false');
  }
});
dlBox.addEventListener('click', e => {
  const b = e.target.closest('[data-hour]');
  if (b) setHour(+b.dataset.hour);
});
$('#dlRange').addEventListener('input', e => { S.hourAnim = null; S.hour = +e.target.value / 60; });
$('#dlNow').addEventListener('click', () => { const d = new Date(); setHour(d.getHours() + d.getMinutes() / 60); });
$('#dlPlay').addEventListener('click', () => {
  if (S.hourAnim && S.hourAnim.linear) { S.hourAnim = null; return; }
  S.hourAnim = { from: S.hour, delta: 24, t: 0, dur: 18, linear: true };
});

// so'rov oynasi
const modal = $('#leadModal');
let leadUnit = null, lastFocus = null;
function openLead(u = null) {
  leadUnit = u;
  lastFocus = document.activeElement;
  $('#leadEyebrow').textContent = u ? `Xonadon ${u.id} · ${u.title}` : "Sotuv bo'limi";
  $('#leadText').textContent = u
    ? `Menejer ${u.id}-xonadon bo'yicha narx, to'lov jadvali va band qilish shartlarini tushuntiradi.`
    : "Menejer xonadonlar, narx va to'lov shartlari bo'yicha maslahat beradi.";
  $('#leadForm').hidden = false;
  $('#leadDone').hidden = true;
  $('#leadError').textContent = '';
  modal.classList.add('is-open');
  modal.setAttribute('aria-hidden', 'false');
  setTimeout(() => $('#leadName').focus(), 60);
}
function closeLead() {
  modal.classList.remove('is-open');
  modal.setAttribute('aria-hidden', 'true');
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
$('#contactBtn').addEventListener('click', () => openLead(S.unit));
$('#leadClose').addEventListener('click', closeLead);
$('#leadOk').addEventListener('click', closeLead);
modal.addEventListener('click', e => { if (e.target === modal) closeLead(); });
$('#leadPhone').addEventListener('focus', e => { if (!e.target.value) e.target.value = '+998 '; });
$('#leadForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('#leadName').value.trim();
  const phone = $('#leadPhone').value.trim();
  const digits = phone.replace(/\D/g, '');
  if (name.length < 2) { $('#leadError').textContent = 'Ismingizni yozing.'; $('#leadName').focus(); return; }
  if (digits.length < 9) { $('#leadError').textContent = "Telefon raqamini to'liq yozing, masalan +998 90 123 45 67."; $('#leadPhone').focus(); return; }
  const lead = { name, phone, time: $('#leadTime').value, unit: leadUnit ? leadUnit.id : null, project: PROJECT.name, at: new Date().toISOString() };
  const sent = await submitLead(lead);
  $('#leadForm').hidden = true;
  $('#leadDone').hidden = false;
  $('#leadDoneText').textContent = sent
    ? `${name}, menejer ${lead.time.toLowerCase()} ${phone} raqamiga qo'ng'iroq qiladi.`
    : `${name}, so'rovingiz shu qurilmada saqlandi. Sayt CRM'ga ulanganda u to'g'ridan-to'g'ri menejerga boradi. Hozircha ${PROJECT.phone} raqamiga qo'ng'iroq qilishingiz mumkin.`;
  $('#leadOk').focus();
});
/** So'rovni yuborish. PROJECT.leadEndpoint ga CRM / Telegram-bot manzilini qo'ying. */
async function submitLead(lead) {
  try {
    const all = JSON.parse(localStorage.getItem('lolabog-leads') || '[]');
    all.push(lead);
    localStorage.setItem('lolabog-leads', JSON.stringify(all));
  } catch (e) { /* saqlash imkoni yo'q */ }
  if (!PROJECT.leadEndpoint) return false;
  try {
    const r = await fetch(PROJECT.leadEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead) });
    return r.ok;
  } catch (e) { return false; }
}

addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (dlBox.classList.contains('is-open')) { dlBox.classList.remove('is-open'); $('#dlToggle').setAttribute('aria-expanded', 'false'); }
  else if (modal.classList.contains('is-open')) closeLead();
  else if (S.mode === 'walk') exitWalk();
  else if (S.unit) closeUnit(true);
  else if (S.mode !== 'overview') setMode('overview');
});

function renderHeroStats() {
  const avail = UNITS.filter(u => u.status === 'available');
  const minA = Math.min(...UNITS.map(u => u.area)), maxA = Math.max(...UNITS.map(u => u.area));
  const minP = Math.min(...avail.map(u => u.price));
  $('#heroStats').innerHTML = `
    <div><dt>${UNITS.length}</dt><dd>xonadon, ${RES} qavatda</dd></div>
    <div><dt>${Math.round(minA)}–${Math.round(maxA)}<sup>m²</sup></dt><dd>1, 2 va 3 xonali</dd></div>
    <div><dt>${PROJECT.roofArea}<sup>m²</sup></dt><dd>umumiy tom bog'i</dd></div>
    <div><dt>${money(minP).replace(" so'm", '')}</dt><dd>${S.currency === 'usd' ? 'dan boshlab' : "so'mdan boshlab"}</dd></div>`;
}

/* =====================================================================
   16. ASOSIY SIKL
   ===================================================================== */
const clock = new THREE.Clock();
const tmpC = new THREE.Color();
const LIGHT_DIR = new THREE.Vector3();
/** Kun vaqtiga qarab osmon, tuman, derazalar va chiroqlarni yangilash. */
function applyDaylight(P) {
  if (!SKY) return;
  SKY.top.value.copy(P.top); SKY.mid.value.copy(P.mid); SKY.hor.value.copy(P.hor); SKY.glow.value.copy(P.glow);
  const el = sunAt(S.hour);
  SKY.sunDir.value.copy(SUN_DIR);
  SKY.sunCol.value.copy(P.key);
  SKY.sunAmt.value = clamp((el + 0.04) / 0.08, 0, 1);
  SKY.moonAmt.value = P.stars;
  const gd = SKY.sunAmt.value > 0.01 ? SUN_DIR : MOON_DIR;
  SKY.glowDir.value.set(gd.x, gd.z);
  starsMat.opacity = 0.75 * P.stars;
  starsMat.visible = P.stars > 0.01;
  scene.fog.color.copy(P.fog);
  scene.fog.density = P.fogD;
  const win = P.win, lamps = P.lamps;
  M.facadeL.forEach(m => { m.emissiveIntensity = 1.5 * win; });
  M.facadeS.forEach(m => { m.emissiveIntensity = 1.5 * win; });
  M.storeFront.emissiveIntensity = 1.6 * (0.35 + 0.65 * win);
  M.storeBack.emissiveIntensity = M.storeSide.emissiveIntensity = 1.2 * (0.35 + 0.65 * win);
  CITY_MATS.forEach(m => { m.emissiveIntensity = 0.55 * win; });
  M.lampHead.emissiveIntensity = 5 * lamps;
  LAMP_LIGHTS.forEach(l => { l.intensity = l.userData.base * lamps; l.visible = lamps > 0.01; });
  M.bulb.emissiveIntensity = 7 * Math.max(lamps, 0.12);
  M.stripLight.emissiveIntensity = 4 * Math.max(lamps, 0.2);
  M.glow.emissiveIntensity = 6 * (0.25 + 0.75 * win);
  M.skylight.emissiveIntensity = 2.5 * (0.2 + 0.8 * win);
  M.headlight.emissiveIntensity = 12 * Math.max(lamps, 0.15);
  M.taillight.emissiveIntensity = 6 * Math.max(lamps, 0.4);
  const dayWin = P.day > 0.45;
  for (const [m, t] of [[M.innerL, T.innerL], [M.innerS, T.innerS]]) {
    const want = dayWin ? t.day : t.night;
    if (m.map !== want) m.map = want;
    m.emissiveIntensity = lerp(0.1, 0.3, P.day);
  }
}
function tick() {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  if (S.progAnim) {
    const a = S.progAnim;
    a.t = Math.min(1, a.t + dt / a.dur);
    S.progress = lerp(a.from, a.to, ease(a.t));
    applyProgress(S.progress);
    if (a.t >= 1) S.progAnim = null;
  }

  // kesish tekisligi
  const kc = 1 - Math.pow(0.0025, dt);
  if (S.cutTo < 900) {
    if (S.cut > ROOF_Y + 6) S.cut = ROOF_Y + 6;
    S.cut = lerp(S.cut, S.cutTo, kc);
  } else if (S.cut < 900) {
    S.cut = lerp(S.cut, ROOF_Y + 8, kc);
    if (S.cut > ROOF_Y + 6) S.cut = 1000;
  }
  // ichkarida kengroq ko'rish burchagi
  const fovTo = S.mode === 'walk' ? 66 : 40;
  if (Math.abs(camera.fov - fovTo) > 0.05) { camera.fov = lerp(camera.fov, fovTo, kc); camera.updateProjectionMatrix(); }
  cutPlane.constant = S.cut;
  floors.forEach(fl => { fl.group.visible = base(fl.i) < S.cut; });
  roof.group.visible = ROOF_Y < S.cut;

  // ekran siljishi
  S.shiftX = lerp(S.shiftX, S.shiftXTo, kc);
  S.shiftY = lerp(S.shiftY, S.shiftYTo, kc);
  applyShift();

  // kun vaqti
  if (S.hourAnim) {
    const a = S.hourAnim;
    a.t = Math.min(1, a.t + dt / a.dur);
    S.hour = (((a.from + a.delta * (a.linear ? a.t : ease(a.t))) % 24) + 24) % 24;
    if (a.t >= 1) S.hourAnim = null;
  }
  const P = todProfile(S.hour);
  applyDaylight(P);
  renderDaylightUI();

  // yorug'lik
  const L = targetLight(P);
  const kl = 1 - Math.pow(0.02, dt);
  lightNow.hemi = lerp(lightNow.hemi, L.hemi, kl);
  lightNow.keyI = lerp(lightNow.keyI, L.keyI, kl);
  lightNow.exp = lerp(lightNow.exp, L.exp, kl);
  lightNow.floorGlow = lerp(lightNow.floorGlow, L.floorGlow, kl);
  lightNow.bloom = lerp(lightNow.bloom, L.bloom, kl);
  lightNow.hemiSky.lerp(L.hemiSky, kl);
  lightNow.hemiGround.lerp(L.hemiGround, kl);
  lightNow.key.lerp(L.key, kl);
  hemi.intensity = lightNow.hemi; hemi.color.copy(lightNow.hemiSky); hemi.groundColor.copy(lightNow.hemiGround);
  keyLight.intensity = lightNow.keyI; keyLight.color.copy(lightNow.key);
  renderer.toneMappingExposure = lightNow.exp;
  bloom.strength = lightNow.bloom;
  for (const m of [M.oak, M.oakLight, M.walnut]) m.emissiveIntensity = lightNow.floorGlow;
  walkLight.intensity = lerp(walkLight.intensity, S.mode === 'walk' ? 26 * (0.3 + 0.7 * P.win) : 0, kl);
  // asosiy yorug'lik: kunduzi quyosh, kechasi oy; soyalar tanlangan qavat atrofida
  const el = sunAt(S.hour);
  const w = clamp((el + 0.03) / 0.09, 0, 1);
  LIGHT_DIR.copy(MOON_DIR).lerp(SUN_DIR, w);
  if (LIGHT_DIR.y < 0.12) LIGHT_DIR.y = 0.12;
  if (S.mode === 'homes' && LIGHT_DIR.y < 0.6) LIGHT_DIR.y = 0.6;
  LIGHT_DIR.normalize();
  const ly = S.mode === 'homes' || S.mode === 'walk' ? base(S.floor) : 10;
  keyLight.target.position.set(0, ly, 0);
  keyLight.position.set(LIGHT_DIR.x * 110, ly + LIGHT_DIR.y * 110, LIGHT_DIR.z * 110);

  // mashinalar
  for (const c of cars) {
    c.position.x += c.userData.dir * c.userData.speed * dt;
    if (c.position.x > 170) c.position.x = -170;
    if (c.position.x < -170) c.position.x = 170;
  }
  if (roof.garden.userData.water) M.pool.emissiveIntensity = (1.0 + Math.sin(t * 1.7) * 0.15) * (0.25 + 0.75 * P.win);
  if (roof.garden.userData.flame) roof.garden.userData.flame.scale.y = 0.08 + Math.abs(Math.sin(t * 7) * Math.sin(t * 3.1)) * 0.05;

  // hover holatida qavat yoritilishi
  [...floors, roof].forEach((fl, i) => {
    const lv = i === floors.length ? 'roof' : i;
    const on = S.mode === 'overview' && S.hoverLevel === lv;
    const ud = fl.hl.userData;
    ud.k = lerp(ud.k, on ? 1 : 0, 1 - Math.pow(0.0005, dt));
    ud.mat.opacity = ud.k * 0.16;
    ud.lmat.opacity = ud.k * 0.9;
    fl.hl.visible = ud.k > 0.01;
  });

  updateFly(dt);
  if (!S.fly) controls.update();
  handleHover();
  updatePins();
  positionPreview();

  // kompas
  const az = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
  $('#compassNeedle').setAttribute('transform', `rotate(${(az * 180) / Math.PI} 20 20)`);

  if (useComposer) {
    composer.render(dt);
    // birinchi kadrlarda post-processing qora ekran bersa, oddiy renderga o'tamiz
    if (blackChecks < 6 && window.__lolaReady) {
      blackChecks++;
      if (frameIsBlack()) {
        if (blackChecks >= 3) { useComposer = false; console.warn("Post-processing ishlamadi, oddiy renderga o'tildi"); }
      } else blackChecks = 6;
    }
  } else {
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);
}

function onResize() {
  const w = innerWidth, h = innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  updateShiftTargets();
}
addEventListener('resize', onResize);

/* =====================================================================
   17. ISHGA TUSHIRISH
   ===================================================================== */
function setLoad(p, text) {
  $('#loaderBar').style.width = `${p}%`;
  if (text) $('#loaderText').textContent = text;
}
async function frame() { return new Promise(r => requestAnimationFrame(() => r())); }
async function init() {
  setLoad(15, 'Teksturalar tayyorlanmoqda…');
  try { await document.fonts.ready; } catch (e) { /* shriftlarsiz ham ishlaydi */ }
  await frame();
  initMaterials();
  initGeometries();
  setLoad(40, 'Bino qurilmoqda…');
  await frame();
  buildSky();
  buildBuilding();
  setLoad(65, 'Atrof-muhit…');
  await frame();
  buildEnvironment();
  // birinchi tanlangan qavat interyerini oldindan tayyorlash
  ensureInterior(S.floor);
  setLoad(90, 'Deyarli tayyor…');
  await frame();

  $('#heroAddress').textContent = PROJECT.address;
  $('#heroAddrShort').innerHTML = PROJECT.addressShort.join('<br>');
  $('#buildNow').textContent = `Hozir · ${PROJECT.nowLabel}`;
  $('#buildDone').textContent = `Tayyor · ${PROJECT.handover}`;
  $('#nowMark').style.left = `${PROJECT.progressNow * 100}%`;
  $('#leadPhoneText').textContent = PROJECT.phone;
  $('#dlSunTimes').textContent = `Quyosh chiqishi ${fmtHour(PROJECT.sunrise)}, botishi ${fmtHour(PROJECT.sunset)}`;
  renderHeroStats();
  renderLevels();
  applyProgress(S.progress);

  const hashMode = HASH_MODE[location.hash.slice(1)];
  onResize();
  const v = viewOverview();
  camera.position.copy(v.pos.clone().multiplyScalar(1.35).add(new THREE.Vector3(30, 10, -10)));
  controls.target.copy(v.target);
  camera.lookAt(controls.target);
  // shaderlarni oldindan kompilyatsiya qilish
  floors[S.floor].interior.group.visible = true;
  renderer.compile(scene, camera);
  floors[S.floor].interior.group.visible = false;

  setLoad(100);
  requestAnimationFrame(tick);
  window.__lolaReady = true;
  setTimeout(() => $('#loader').classList.add('is-done'), 250);

  if (hashMode && hashMode !== 'overview') {
    S.progress = 1; applyProgress(1);
    setMode(hashMode, { fromHash: true });
  } else {
    document.body.dataset.mode = 'overview';
    updateShiftTargets();
    flyTo(v.pos, v.target, REDUCED ? 0.01 : 4.2);
    // "hozirgi holat"dan "tayyor bino"gacha
    setTimeout(() => animateProgress(1, 4.2), REDUCED ? 0 : 1100);
  }
}
init().catch(err => {
  console.error(err);
  $('#loaderText').textContent = `3D sahnani yuklab bo'lmadi: ${err && err.message ? err.message : err}. Sahifani yangilang.`;
});

window.LOLA = { PROJECT, UNITS, S, setMode, openUnit, enterWalk, selectFloor, camera, controls, floors, THREE, scene, cutPlane, directRender: () => { useComposer = false; }, info: () => ({ hdr: HDR_OK, composer: useComposer }) };
