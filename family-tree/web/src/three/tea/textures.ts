import * as THREE from 'three'

/*
  Процедурные текстуры сцены. Всё рисуется на canvas при загрузке — без внешних файлов.
  У LatheGeometry координата u идёт по кругу, v — снизу вверх по профилю,
  поэтому верх холста — горловина/край, низ — донышко.
*/

const TURQ = '#36c6c0'
const GOLD = '#d6b46a'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner = 0.62, points = 8) {
  ctx.beginPath()
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI / points) * i - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * inner
    const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a)
    if (i) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  }
  ctx.closePath()
}

/** Детерминированный генератор случайных чисел — узор одинаковый при каждой загрузке. */
export function rng(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

/*
  Роспись «Пахта» — классический узбекский фарфор: глубокий кобальт и белые коробочки хлопка.
  Коробочка — белое «облачко» с зубчатым верхом, внутри синий трилистник-стрелка;
  между коробочками — белые завитки-побеги.
*/
export const COBALT = '#15216a'
export const PORCELAIN = '#f7f6f2'

/** Коробочка хлопка: белое «облако» из трёх крупных долек (средняя выше) и синяя «пика» внутри. */
function boll(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, white: string, blue: string) {
  ctx.fillStyle = white
  ctx.beginPath()
  ctx.moveTo(x, y + s * 1.0)
  ctx.bezierCurveTo(x - s * 0.3, y + s * 0.85, x - s * 0.75, y + s * 0.6, x - s * 0.82, y + s * 0.2)
  // левая, средняя (выше) и правая дольки + маленькие между ними
  ctx.bezierCurveTo(x - s * 1.0, y - s * 0.15, x - s * 0.7, y - s * 0.55, x - s * 0.45, y - s * 0.38)
  ctx.bezierCurveTo(x - s * 0.5, y - s * 0.8, x - s * 0.12, y - s * 1.0, x, y - s * 0.78)
  ctx.bezierCurveTo(x + s * 0.12, y - s * 1.0, x + s * 0.5, y - s * 0.8, x + s * 0.45, y - s * 0.38)
  ctx.bezierCurveTo(x + s * 0.7, y - s * 0.55, x + s * 1.0, y - s * 0.15, x + s * 0.82, y + s * 0.2)
  ctx.bezierCurveTo(x + s * 0.75, y + s * 0.6, x + s * 0.3, y + s * 0.85, x, y + s * 1.0)
  ctx.closePath()
  ctx.fill()
  // синяя «пика»: острый лепесток вверх и две круглые дольки у основания
  ctx.fillStyle = blue
  ctx.beginPath()
  ctx.moveTo(x, y - s * 0.42)
  ctx.bezierCurveTo(x + s * 0.2, y - s * 0.12, x + s * 0.18, y + s * 0.18, x, y + s * 0.3)
  ctx.bezierCurveTo(x - s * 0.18, y + s * 0.18, x - s * 0.2, y - s * 0.12, x, y - s * 0.42)
  ctx.fill()
  for (const dir of [-1, 1]) {
    ctx.beginPath()
    ctx.ellipse(x + dir * s * 0.24, y + s * 0.32, s * 0.15, s * 0.11, dir * 0.4, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.beginPath()
  ctx.ellipse(x, y + s * 0.58, s * 0.07, s * 0.1, 0, 0, Math.PI * 2)
  ctx.fill()
}

/** Белый завиток «бараний рог»: широкий лист, закрученный крючком внутрь. */
function scroll(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dir: 1 | -1, white: string) {
  ctx.fillStyle = white
  ctx.beginPath()
  ctx.moveTo(x, y + s * 0.55)
  ctx.bezierCurveTo(x + dir * s * 0.05, y - s * 0.1, x + dir * s * 0.5, y - s * 0.55, x + dir * s * 0.8, y - s * 0.3)
  ctx.bezierCurveTo(x + dir * s * 0.98, y - s * 0.15, x + dir * s * 0.85, y + s * 0.18, x + dir * s * 0.62, y + s * 0.12)
  ctx.bezierCurveTo(x + dir * s * 0.5, y + s * 0.08, x + dir * s * 0.52, y - s * 0.08, x + dir * s * 0.64, y - s * 0.1)
  ctx.bezierCurveTo(x + dir * s * 0.5, y - s * 0.28, x + dir * s * 0.2, y - s * 0.05, x + dir * s * 0.16, y + s * 0.55)
  ctx.closePath()
  ctx.fill()
}

/** Белый полумесяц-лист под коробочкой. */
function crescent(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, dir: 1 | -1, white: string) {
  ctx.fillStyle = white
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + dir * s * 0.55, y + s * 0.42, x + dir * s * 1.0, y + s * 0.05)
  ctx.quadraticCurveTo(x + dir * s * 0.55, y + s * 0.22, x, y)
  ctx.fill()
}

/**
 * Полоса росписи по кругу. f — вертикальная поправка: на круглом теле холст растягивается
 * по-разному вдоль и поперёк, и без поправки коробочки выглядят сплющенными.
 */
function paxtaFrieze(ctx: CanvasRenderingContext2D, W: number, y: number, s: number, n: number, white: string, blue: string, f = 1) {
  ctx.save()
  ctx.translate(0, y)
  ctx.scale(1, f)
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * (W / n)
    boll(ctx, x, 0, s, white, blue)
    crescent(ctx, x - s * 0.1, s * 1.05, s * 0.9, -1, white)
    crescent(ctx, x + s * 0.1, s * 1.05, s * 0.9, 1, white)
    const mx = (i + 1) * (W / n)
    scroll(ctx, mx - s * 0.12, -s * 0.15, s * 0.95, -1, white)
    scroll(ctx, mx + s * 0.12, -s * 0.15, s * 0.95, 1, white)
    ctx.beginPath()
    ctx.ellipse(mx, s * 0.75, s * 0.12, s * 0.2, 0, 0, Math.PI * 2)
    ctx.fillStyle = white
    ctx.fill()
  }
  ctx.restore()
}

/** Волнистый (фестончатый) край белой полосы. */
function scallopBand(ctx: CanvasRenderingContext2D, W: number, y0: number, y1: number, n: number, down: boolean, color: string) {
  ctx.fillStyle = color
  ctx.beginPath()
  const edge = down ? y1 : y0
  const base = down ? y0 : y1
  ctx.moveTo(0, base)
  ctx.lineTo(0, edge)
  for (let i = 0; i < n; i++) {
    const x0 = (i / n) * W, x1 = ((i + 1) / n) * W
    ctx.quadraticCurveTo((x0 + x1) / 2, edge + (down ? 1 : -1) * (y1 - y0) * 0.9, x1, edge)
  }
  ctx.lineTo(W, base)
  ctx.closePath()
  ctx.fill()
}

function drawCeramic(ctx: CanvasRenderingContext2D, W: number, H: number, bump: boolean, layout: 'teapot' | 'piala' | 'saucer') {
  const white = bump ? '#fff' : PORCELAIN
  const blue = bump ? '#7a7a7a' : COBALT
  ctx.fillStyle = blue
  ctx.fillRect(0, 0, W, H)
  if (layout === 'teapot') {
    // верх холста — горловина, низ — ножка
    scallopBand(ctx, W, 0, H * 0.06, 16, true, white)          // белый воротник
    paxtaFrieze(ctx, W, H * 0.42, H * 0.15, 4, white, blue, 1.5) // крупные коробочки
    ctx.fillStyle = white
    ctx.fillRect(0, H * 0.9, W, H * 0.1)                         // белая ножка
    ctx.fillStyle = blue
    ctx.fillRect(0, H * 0.93, W, H * 0.012)
  } else if (layout === 'piala') {
    // верх — дно внутри, середина — край, низ — ножка снаружи
    ctx.fillStyle = white
    ctx.fillRect(0, 0, W, H * 0.47)                              // белая внутренность
    ctx.fillStyle = blue
    ctx.fillRect(0, H * 0.44, W, H * 0.03)                       // тонкая синяя линия у края внутри
    paxtaFrieze(ctx, W, H * 0.68, H * 0.1, 5, white, blue, 1.25)
    ctx.fillStyle = white
    ctx.fillRect(0, H * 0.88, W, H * 0.12)
    ctx.fillStyle = blue
    ctx.fillRect(0, H * 0.905, W, H * 0.012)
  } else {
    // блюдце: верх холста — центр сверху, ~0.4 — край, ниже — белое дно снизу
    paxtaFrieze(ctx, W, H * 0.2, H * 0.08, 8, white, blue, 1.1) // кобальтовое поле с коробочками сверху
    scallopBand(ctx, W, H * 0.36, H * 0.42, 24, false, white)   // белая фестончатая кромка
    ctx.fillStyle = white
    ctx.fillRect(0, H * 0.42, W, H * 0.58)
  }
  if (!bump) {
    // лёгкая неоднородность глазури
    const r = rng(11)
    for (let i = 0; i < 2200; i++) {
      ctx.fillStyle = `rgba(255,255,255,${r() * 0.025})`
      ctx.fillRect(r() * W, r() * H, 2 + r() * 5, 2 + r() * 5)
    }
  }
}

function texFrom(c: HTMLCanvasElement, color: boolean) {
  const t = new THREE.CanvasTexture(c)
  if (color) t.colorSpace = THREE.SRGBColorSpace
  t.wrapS = THREE.RepeatWrapping
  t.anisotropy = 8
  return t
}

const cache = new Map<string, { map: THREE.Texture; bump: THREE.Texture }>()

/** Роспись и карта рельефа (белая роспись чуть выступает над кобальтом). */
export function ceramicTextures(layout: 'teapot' | 'piala' | 'saucer', size = 2048) {
  const key = `${layout}${size}`
  const hit = cache.get(key)
  if (hit) return hit
  const [c, ctx] = canvas(size, size / 2)
  drawCeramic(ctx, size, size / 2, false, layout)
  const [b, bctx] = canvas(size / 2, size / 4)
  bctx.scale(0.5, 0.5)
  drawCeramic(bctx, size, size / 2, true, layout)
  const out = { map: texFrom(c, true), bump: texFrom(b, false) }
  cache.set(key, out)
  return out
}

/** Крышка: кобальтовый купол, белые листья, белый фестончатый край. Низ холста — край крышки. */
export function lidTexture() {
  const W = 1024, H = 512
  const [c, ctx] = canvas(W, H)
  ctx.fillStyle = COBALT
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = PORCELAIN
  for (let i = 0; i < 4; i++) {
    const x = (i + 0.5) * (W / 4)
    ctx.beginPath()
    ctx.moveTo(x, H * 0.25)
    ctx.bezierCurveTo(x + 90, H * 0.35, x + 70, H * 0.65, x, H * 0.72)
    ctx.bezierCurveTo(x - 70, H * 0.65, x - 90, H * 0.35, x, H * 0.25)
    ctx.fill()
    ctx.fillStyle = COBALT
    ctx.beginPath(); ctx.ellipse(x, H * 0.5, 16, 40, 0, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = PORCELAIN
  }
  scallopBand(ctx, W, H * 0.86, H, 14, false, PORCELAIN)
  ctx.fillRect(0, 0, W, H * 0.06)
  return texFrom(c, true)
}

/** Тёмная древесина с волокнами + отдельная маска золотых прожилок для свечения. */
let woodCache: { map: THREE.Texture; veins: THREE.Texture } | null = null
export function woodTextures() {
  if (woodCache) return woodCache
  const W = 256, H = 1024
  const [c, ctx] = canvas(W, H)
  const g = ctx.createLinearGradient(0, 0, W, 0)
  g.addColorStop(0, '#2a1a10'); g.addColorStop(0.5, '#4a3020'); g.addColorStop(1, '#2a1a10')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
  const r = rng(5)
  for (let i = 0; i < 180; i++) {
    const x = r() * W
    ctx.strokeStyle = r() > 0.5 ? `rgba(20,10,5,${0.25 + r() * 0.3})` : `rgba(120,85,55,${0.15 + r() * 0.2})`
    ctx.lineWidth = 1 + r() * 3
    ctx.beginPath()
    ctx.moveTo(x, 0)
    for (let y = 0; y <= H; y += 64) ctx.lineTo(x + Math.sin(y * 0.01 + i) * (4 + r() * 6), y)
    ctx.stroke()
  }
  const [v, vctx] = canvas(W, H)
  vctx.fillStyle = '#000'
  vctx.fillRect(0, 0, W, H)
  vctx.strokeStyle = '#fff'
  for (let i = 0; i < 7; i++) {
    const x = r() * W
    vctx.lineWidth = 1.5 + r() * 2
    vctx.beginPath()
    vctx.moveTo(x, 0)
    for (let y = 0; y <= H; y += 32) vctx.lineTo(x + Math.sin(y * 0.012 + i * 2) * 14, y)
    vctx.stroke()
  }
  const map = texFrom(c, true), veins = texFrom(v, false)
  for (const t of [map, veins]) { t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 3) }
  woodCache = { map, veins }
  return woodCache
}

/** Полосы для текстуры струи — их сдвиг создаёт ощущение текущей жидкости. */
let streamCache: THREE.Texture | null = null
export function streamTexture() {
  if (streamCache) return streamCache
  const [c, ctx] = canvas(64, 256)
  const g = ctx.createLinearGradient(0, 0, 64, 0)
  g.addColorStop(0, '#5a2306'); g.addColorStop(0.3, '#c46a1f'); g.addColorStop(0.5, '#f0a54a'); g.addColorStop(0.7, '#c46a1f'); g.addColorStop(1, '#5a2306')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 256)
  const r = rng(3)
  for (let i = 0; i < 30; i++) {
    ctx.fillStyle = `rgba(255,220,160,${0.12 + r() * 0.2})`
    ctx.fillRect(20 + r() * 24, r() * 256, 2 + r() * 3, 10 + r() * 30)
  }
  streamCache = texFrom(c, true)
  streamCache.wrapT = THREE.RepeatWrapping
  return streamCache
}

/** Кольцевая рябь для поверхности чая (карта нормалей не нужна — хватает рельефа). */
let rippleCache: THREE.Texture | null = null
export function rippleTexture() {
  if (rippleCache) return rippleCache
  const [c, ctx] = canvas(256, 256)
  ctx.fillStyle = '#808080'
  ctx.fillRect(0, 0, 256, 256)
  for (let r = 8; r < 128; r += 9) {
    ctx.strokeStyle = `rgba(255,255,255,${0.35 - r / 512})`
    ctx.lineWidth = 3
    ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.stroke()
  }
  rippleCache = texFrom(c, false)
  return rippleCache
}

let dot: THREE.Texture | null = null
/** Мягкая точка для частиц, пара и бликов. */
export function softDot() {
  if (dot) return dot
  const [c, ctx] = canvas(64, 64)
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  dot = new THREE.CanvasTexture(c)
  return dot
}

/* ---------------- Медальон с портретом ---------------- */

export interface MedallionLabel { name: string; years: string; initials: string }
const MW = 320, MH = 430
export const MEDALLION_ASPECT = MH / MW

function drawMedallion(ctx: CanvasRenderingContext2D, label: MedallionLabel, img?: HTMLImageElement) {
  ctx.clearRect(0, 0, MW, MH)
  const cx = MW / 2, cy = 150, R = 128
  // золотое кольцо с бусинами
  ctx.fillStyle = '#0f1a33'
  ctx.beginPath(); ctx.arc(cx, cy, R + 14, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = GOLD
  ctx.lineWidth = 6
  ctx.beginPath(); ctx.arc(cx, cy, R + 8, 0, Math.PI * 2); ctx.stroke()
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI * 2 * i) / 16
    star(ctx, cx + Math.cos(a) * (R + 8), cy + Math.sin(a) * (R + 8), i % 2 ? 4 : 7, 0.5, 4)
    ctx.fillStyle = i % 2 ? TURQ : GOLD
    ctx.fill()
  }
  // бирюзовое внутреннее кольцо
  ctx.strokeStyle = TURQ
  ctx.lineWidth = 3
  ctx.beginPath(); ctx.arc(cx, cy, R - 4, 0, Math.PI * 2); ctx.stroke()
  // портрет
  ctx.save()
  ctx.beginPath(); ctx.arc(cx, cy, R - 8, 0, Math.PI * 2); ctx.clip()
  const bg = ctx.createRadialGradient(cx, cy - 30, 10, cx, cy, R)
  bg.addColorStop(0, '#24386a'); bg.addColorStop(1, '#111a2d')
  ctx.fillStyle = bg
  ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
  if (img && img.naturalWidth) {
    const s = Math.max((R * 2) / img.naturalWidth, (R * 2) / img.naturalHeight)
    const w = img.naturalWidth * s, h = img.naturalHeight * s
    ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h)
    ctx.fillStyle = 'rgba(120,85,30,0.1)'
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2)
  } else {
    ctx.strokeStyle = 'rgba(214,180,106,0.3)'
    ctx.lineWidth = 1.5
    star(ctx, cx, cy, 92, 0.72); ctx.stroke()
    ctx.fillStyle = '#e8cb86'
    ctx.font = '500 72px "Cormorant Garamond", Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label.initials, cx, cy + 4)
  }
  ctx.restore()
  // подпись
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#f5f1e8'
  ctx.font = '600 38px "Cormorant Garamond", Georgia, serif'
  let name = label.name
  while (ctx.measureText(name).width > MW - 12 && name.length > 3) name = name.slice(0, -2)
  ctx.fillText(name === label.name ? name : name.trimEnd() + '…', cx, 352)
  if (label.years) {
    ctx.fillStyle = 'rgba(214,180,106,0.95)'
    ctx.font = '600 22px Manrope, system-ui, sans-serif'
    ctx.fillText(label.years, cx, 388)
  }
}

const medCache = new Map<string, THREE.CanvasTexture>()
export function medallionTexture(id: string, label: MedallionLabel, photo?: string) {
  const key = `${id}|${label.name}|${label.years}|${photo ?? ''}`
  const hit = medCache.get(key)
  if (hit) return hit
  const [c, ctx] = canvas(MW, MH)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  let img: HTMLImageElement | undefined
  drawMedallion(ctx, label)
  document.fonts?.ready.then(() => { drawMedallion(ctx, label, img); tex.needsUpdate = true })
  if (photo) {
    img = new Image()
    img.onload = () => { drawMedallion(ctx, label, img); tex.needsUpdate = true }
    img.src = photo
  }
  medCache.set(key, tex)
  return tex
}
