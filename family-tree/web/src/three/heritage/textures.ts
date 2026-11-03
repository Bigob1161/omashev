import * as THREE from 'three'

/*
  Процедурные текстуры архитектуры Самарканда: кирпич, мозаика гирих, порталы с нишами,
  рёбристые бирюзовые купола, барабаны с надписным поясом, мощение площади, облака.
  Всё рисуется на canvas — без внешних файлов и без чужих фотографий.
*/

export const COLORS = {
  brick: '#c9a46f',
  brickDark: '#a9844f',
  mortar: '#e3cfa6',
  lapis: '#1d3c8f',
  cobalt: '#16307a',
  turquoise: '#2aa9b5',
  turquoiseLight: '#5fd0cf',
  white: '#f4efe2',
  ochre: '#d8a542',
  green: '#3f8f6b',
}

export function rng(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

function tex(c: HTMLCanvasElement, opts: { repeat?: [number, number]; color?: boolean } = {}) {
  const t = new THREE.CanvasTexture(c)
  if (opts.color !== false) t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...opts.repeat) }
  return t
}

const cache = new Map<string, THREE.Texture>()
function cached(key: string, make: () => THREE.Texture) {
  let t = cache.get(key)
  if (!t) { t = make(); cache.set(key, t) }
  return t
}

function star(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, inner = 0.6, n = 8) {
  ctx.beginPath()
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI / n) * i - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * inner
    const x = cx + rr * Math.cos(a), y = cy + rr * Math.sin(a)
    if (i) ctx.lineTo(x, y)
    else ctx.moveTo(x, y)
  }
  ctx.closePath()
}

/** Заострённая арка (как у порталов Тимуридов) в прямоугольнике x,y,w,h. */
export function archPath(ctx: CanvasRenderingContext2D | Path2D, x: number, y: number, w: number, h: number, spring = 0.62) {
  const sy = y + h * (1 - spring)
  ctx.moveTo(x, y + h)
  ctx.lineTo(x, sy)
  ctx.bezierCurveTo(x, sy - w * 0.32, x + w * 0.32, y + h * 0.05, x + w / 2, y)
  ctx.bezierCurveTo(x + w * 0.68, y + h * 0.05, x + w, sy - w * 0.32, x + w, sy)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
}

/** Кирпичная кладка с лёгкой неоднородностью. */
function brickwork(ctx: CanvasRenderingContext2D, W: number, H: number, scale = 1, seed = 1) {
  const r = rng(seed)
  ctx.fillStyle = COLORS.mortar
  ctx.fillRect(0, 0, W, H)
  const bh = 14 * scale, bw = 38 * scale
  for (let y = 0, row = 0; y < H; y += bh, row++) {
    for (let x = row % 2 ? -bw / 2 : 0; x < W; x += bw) {
      const k = 0.85 + r() * 0.25
      ctx.fillStyle = `rgb(${Math.round(201 * k)},${Math.round(164 * k)},${Math.round(111 * k)})`
      ctx.fillRect(x + 1.5, y + 1.5, bw - 3, bh - 3)
    }
  }
}

/** Мозаичная панель гирих: синие звёзды с белым контуром на бирюзово-синем поле. */
function girihPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cell: number, variant = 0) {
  ctx.save()
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip()
  ctx.fillStyle = variant === 1 ? COLORS.turquoise : COLORS.lapis
  ctx.fillRect(x, y, w, h)
  for (let cy = y; cy < y + h + cell; cy += cell) {
    for (let cx = x; cx < x + w + cell; cx += cell) {
      star(ctx, cx, cy, cell * 0.42, 0.62)
      ctx.fillStyle = variant === 1 ? COLORS.lapis : COLORS.turquoise
      ctx.fill()
      ctx.strokeStyle = COLORS.white
      ctx.lineWidth = Math.max(1.5, cell * 0.05)
      ctx.stroke()
      star(ctx, cx, cy, cell * 0.14, 0.55)
      ctx.fillStyle = COLORS.ochre
      ctx.fill()
      // крестообразные связки между звёздами
      ctx.beginPath()
      ctx.moveTo(cx + cell * 0.5, cy - cell * 0.12); ctx.lineTo(cx + cell * 0.5, cy + cell * 0.12)
      ctx.moveTo(cx - cell * 0.12, cy + cell * 0.5); ctx.lineTo(cx + cell * 0.12, cy + cell * 0.5)
      ctx.stroke()
    }
  }
  ctx.restore()
}

/** Пояс «куфической» надписи: белые угловатые знаки на синем — орнаментальная стилизация, не текст. */
function kufic(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, seed = 3) {
  const r = rng(seed)
  ctx.fillStyle = COLORS.cobalt
  ctx.fillRect(x, y, w, h)
  ctx.fillStyle = COLORS.white
  const u = h / 5
  for (let cx = x + u; cx < x + w - u * 2; cx += u * 2) {
    const tall = r() > 0.55
    ctx.fillRect(cx, y + u, u * 0.8, h - u * 2)                 // вертикаль
    ctx.fillRect(cx, y + h - u * 1.8, u * 2, u * 0.8)            // основание
    if (tall) ctx.fillRect(cx - u * 0.6, y + u, u * 0.6, u * 0.8)
  }
  ctx.strokeStyle = COLORS.ochre
  ctx.lineWidth = Math.max(1, h * 0.04)
  ctx.strokeRect(x + 2, y + 2, w - 4, h - 4)
}

/* ---------------- Фасад медресе (по сторонам от портала) ---------------- */

export type MadrasahVariant = 'ulugbek' | 'sherdor' | 'tillakori'

/** Боковые части фасада: два яруса стрельчатых ниш с мозаичными тимпанами и бирюзовый карниз. */
export function facadeTexture(variant: MadrasahVariant, aspect: number) {
  return cached(`facade-${variant}-${aspect.toFixed(2)}`, () => {
    const W = 2048, H = Math.round(W / aspect)
    const [c, ctx] = canvas(W, H)
    brickwork(ctx, W, H, 1.2, variant.length)
    const tiers = 2
    const bayW = H * 0.42
    const bays = Math.max(2, Math.round(W / bayW))
    const bw = W / bays
    const top = H * 0.1
    // карниз
    girihPanel(ctx, 0, 0, W, top, top * 0.9, variant === 'ulugbek' ? 0 : 1)
    for (let t = 0; t < tiers; t++) {
      const y0 = top + (t * (H - top)) / tiers
      const th = (H - top) / tiers
      for (let b = 0; b < bays; b++) {
        const x0 = b * bw
        // рамка-панель с мозаикой
        girihPanel(ctx, x0 + bw * 0.06, y0 + th * 0.06, bw * 0.88, th * 0.88, bw * 0.22, (b + t) % 2)
        // глубокая ниша
        const p = new Path2D()
        archPath(p, x0 + bw * 0.18, y0 + th * 0.16, bw * 0.64, th * 0.8)
        const g = ctx.createLinearGradient(0, y0, 0, y0 + th)
        g.addColorStop(0, '#0a1530'); g.addColorStop(1, '#1b2c4c')
        ctx.fillStyle = g
        ctx.fill(p)
        ctx.strokeStyle = COLORS.white
        ctx.lineWidth = 4
        ctx.stroke(p)
      }
    }
    return tex(c)
  })
}

/* ---------------- Портал (пештак) ---------------- */

/** Пропорции проёма арки в портале — общие для текстуры и для ниши-геометрии. */
export const PORTAL_ARCH = { x: 0.2, y: 0.22, w: 0.6, h: 0.78 }

export function portalTexture(variant: MadrasahVariant, aspect: number) {
  return cached(`portal-${variant}-${aspect.toFixed(2)}`, () => {
    const W = 1536, H = Math.round(W / aspect)
    const [c, ctx] = canvas(W, H)
    const A = { x: PORTAL_ARCH.x * W, y: PORTAL_ARCH.y * H, w: PORTAL_ARCH.w * W, h: PORTAL_ARCH.h * H }
    // поле портала — мозаика
    girihPanel(ctx, 0, 0, W, H, W * 0.09, variant === 'tillakori' ? 1 : 0)
    // широкая рамка с надписным поясом
    const band = W * 0.07
    kufic(ctx, band * 0.4, band * 0.4, W - band * 0.8, band, 7)
    kufic(ctx, band * 0.4, band * 1.4, band, H, 9)
    kufic(ctx, W - band * 1.4, band * 1.4, band, H, 11)
    // тимпаны (углы над аркой)
    const spandrel = (left: boolean) => {
      const sx = left ? A.x + A.w * 0.14 : A.x + A.w * 0.86
      const sy = A.y + A.h * 0.12
      if (variant === 'sherdor') {
        // солнце с лучами и тигр — знаменитый мотив Шердора
        ctx.fillStyle = COLORS.ochre
        ctx.beginPath(); ctx.arc(sx, sy - A.h * 0.02, A.w * 0.07, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = COLORS.ochre
        ctx.lineWidth = 5
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2
          ctx.beginPath()
          ctx.moveTo(sx + Math.cos(a) * A.w * 0.08, sy - A.h * 0.02 + Math.sin(a) * A.w * 0.08)
          ctx.lineTo(sx + Math.cos(a) * A.w * 0.12, sy - A.h * 0.02 + Math.sin(a) * A.w * 0.12)
          ctx.stroke()
        }
        const dir = left ? 1 : -1
        ctx.fillStyle = '#e09a2e'
        ctx.beginPath()
        const tx = sx - dir * A.w * 0.02, ty = sy + A.h * 0.1
        ctx.ellipse(tx, ty, A.w * 0.12, A.w * 0.04, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.beginPath(); ctx.arc(tx + dir * A.w * 0.12, ty - A.w * 0.02, A.w * 0.035, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#3a2608'
        for (let i = -2; i <= 2; i++) ctx.fillRect(tx + i * A.w * 0.035, ty - A.w * 0.035, A.w * 0.01, A.w * 0.07)
      } else {
        star(ctx, sx, sy, A.w * 0.1, 0.55)
        ctx.fillStyle = variant === 'ulugbek' ? COLORS.white : COLORS.ochre
        ctx.fill()
        star(ctx, sx, sy, A.w * 0.05, 0.55)
        ctx.fillStyle = COLORS.turquoise
        ctx.fill()
      }
    }
    spandrel(true)
    spandrel(false)
    // белый контур арки
    const p = new Path2D()
    archPath(p, A.x, A.y, A.w, A.h)
    ctx.strokeStyle = COLORS.white
    ctx.lineWidth = W * 0.012
    ctx.stroke(p)
    ctx.strokeStyle = COLORS.turquoiseLight
    ctx.lineWidth = W * 0.005
    ctx.stroke(p)
    // сам проём — прозрачный: в нём видна объёмная ниша
    ctx.globalCompositeOperation = 'destination-out'
    const inner = new Path2D()
    archPath(inner, A.x + W * 0.008, A.y + W * 0.008, A.w - W * 0.016, A.h)
    ctx.fill(inner)
    ctx.globalCompositeOperation = 'source-over'
    return tex(c)
  })
}

/** Стены ниши: мелкая мозаика — сверху тёмная, книзу светлее (как сталактитовый свод в тени). */
export function nicheTexture() {
  return cached('niche', () => {
    const [c, ctx] = canvas(512, 512)
    girihPanel(ctx, 0, 0, 512, 512, 64, 0)
    const g = ctx.createLinearGradient(0, 0, 0, 512)
    g.addColorStop(0, 'rgba(5,10,25,0.55)'); g.addColorStop(1, 'rgba(5,10,25,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 512, 512)
    return tex(c, { repeat: [2, 2] })
  })
}

/** Задняя стена ниши: дверной проём и решётчатое окно над ним. */
export function nicheBackTexture() {
  return cached('niche-back', () => {
    const [c, ctx] = canvas(512, 768)
    girihPanel(ctx, 0, 0, 512, 768, 56, 1)
    const door = new Path2D()
    archPath(door, 160, 430, 192, 338, 0.7)
    ctx.fillStyle = '#2a1a0e'
    ctx.fill(door)
    ctx.strokeStyle = COLORS.white
    ctx.lineWidth = 6
    ctx.stroke(door)
    // панджара — решётчатое окно
    ctx.fillStyle = '#0a1226'
    ctx.fillRect(176, 170, 160, 200)
    ctx.strokeStyle = COLORS.white
    ctx.lineWidth = 3
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(176, 170 + i * 40); ctx.lineTo(336, 210 + i * 40); ctx.stroke() }
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(336, 170 + i * 40); ctx.lineTo(176, 210 + i * 40); ctx.stroke() }
    return tex(c)
  })
}

export function brickTexture(repeat: [number, number]) {
  const key = `brick-${repeat.join('x')}`
  return cached(key, () => {
    const [c, ctx] = canvas(512, 512)
    brickwork(ctx, 512, 512, 1, 5)
    return tex(c, { repeat })
  })
}

/** Глазурь купола: бирюза с лёгкими вертикальными переливами. */
export function domeTexture(seed = 1) {
  return cached(`dome-${seed}`, () => {
    const [c, ctx] = canvas(1024, 512)
    const g = ctx.createLinearGradient(0, 0, 0, 512)
    g.addColorStop(0, '#9fe3dd'); g.addColorStop(0.5, COLORS.turquoise); g.addColorStop(1, '#1f8692')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 1024, 512)
    const r = rng(seed)
    for (let i = 0; i < 64; i++) {
      ctx.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '10,60,70'},${0.05 + r() * 0.08})`
      ctx.fillRect((i / 64) * 1024, 0, 6 + r() * 8, 512)
    }
    // ромбическая сетка жёлтой и синей глазури у основания (как у Гур-Эмира)
    for (let x = 0; x < 1024; x += 32) {
      ctx.fillStyle = (x / 32) % 2 ? COLORS.ochre : COLORS.cobalt
      ctx.beginPath(); ctx.moveTo(x, 470); ctx.lineTo(x + 16, 450); ctx.lineTo(x + 32, 470); ctx.lineTo(x + 16, 490); ctx.fill()
    }
    return tex(c)
  })
}

/** Барабан под куполом: надписной пояс и полоса мозаики. */
export function drumTexture() {
  return cached('drum', () => {
    const [c, ctx] = canvas(2048, 256)
    girihPanel(ctx, 0, 0, 2048, 256, 64, 1)
    kufic(ctx, 0, 40, 2048, 150, 21)
    return tex(c)
  })
}

/** Минарет: светлый кирпич с синей ромбической сеткой, пояса мозаики. */
export function minaretTexture() {
  return cached('minaret', () => {
    const [c, ctx] = canvas(512, 2048)
    brickwork(ctx, 512, 2048, 1, 9)
    ctx.strokeStyle = COLORS.lapis
    ctx.lineWidth = 9
    for (let k = -2048; k < 2048; k += 64) {
      ctx.beginPath(); ctx.moveTo(0, k); ctx.lineTo(512, k + 256); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(512, k); ctx.lineTo(0, k + 256); ctx.stroke()
    }
    for (const y of [120, 900, 1700]) kufic(ctx, 0, y, 512, 90, y)
    girihPanel(ctx, 0, 0, 512, 80, 60, 1)
    return tex(c)
  })
}

/** Мощение площади: крупные плиты тёплого камня. */
export function pavingTexture() {
  return cached('paving', () => {
    const [c, ctx] = canvas(1024, 1024)
    ctx.fillStyle = '#b9a88c'
    ctx.fillRect(0, 0, 1024, 1024)
    const r = rng(17)
    for (let y = 0; y < 1024; y += 128) {
      for (let x = 0; x < 1024; x += 128) {
        const k = 0.85 + r() * 0.2
        ctx.fillStyle = `rgb(${Math.round(196 * k)},${Math.round(181 * k)},${Math.round(152 * k)})`
        ctx.fillRect(x + 3, y + 3, 122, 122)
      }
    }
    return tex(c, { repeat: [12, 12] })
  })
}

/** Мягкое облако для неба. */
export function cloudTexture() {
  return cached('cloud', () => {
    const [c, ctx] = canvas(512, 256)
    const r = rng(29)
    for (let i = 0; i < 40; i++) {
      const x = 80 + r() * 352, y = 90 + r() * 80, rad = 30 + r() * 60
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
      g.addColorStop(0, 'rgba(255,255,255,0.55)')
      g.addColorStop(1, 'rgba(255,255,255,0)')
      ctx.fillStyle = g
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill()
    }
    return tex(c, { color: false })
  })
}

let dot: THREE.Texture | null = null
export function softDot() {
  if (dot) return dot
  const [c, ctx] = canvas(64, 64)
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.4, 'rgba(255,255,255,0.4)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  dot = new THREE.CanvasTexture(c)
  return dot
}

/** Силуэт каравана: верблюд и погонщик — для сцены эпохи Тимуридов (условно). */
export function caravanTexture() {
  return cached('caravan', () => {
    const [c, ctx] = canvas(512, 256)
    ctx.fillStyle = '#3a2614'
    // верблюд
    ctx.beginPath()
    ctx.ellipse(250, 120, 95, 42, 0, 0, Math.PI * 2)
    ctx.fill()
    ctx.beginPath(); ctx.ellipse(220, 82, 30, 26, 0, 0, Math.PI * 2); ctx.fill() // горб
    ctx.beginPath(); ctx.ellipse(290, 86, 26, 22, 0, 0, Math.PI * 2); ctx.fill()
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#3a2614'
    ctx.lineWidth = 16
    ctx.beginPath(); ctx.moveTo(335, 110); ctx.quadraticCurveTo(370, 70, 380, 40); ctx.stroke() // шея
    ctx.beginPath(); ctx.ellipse(392, 40, 24, 13, 0.3, 0, Math.PI * 2); ctx.fill()        // голова
    ctx.lineWidth = 12
    for (const x of [180, 205, 300, 325]) { ctx.beginPath(); ctx.moveTo(x, 150); ctx.lineTo(x + 4, 238); ctx.stroke() }
    // тюки
    ctx.fillStyle = '#7a4b22'
    ctx.fillRect(210, 52, 90, 30)
    // погонщик
    ctx.fillStyle = '#2b1c10'
    ctx.beginPath(); ctx.arc(100, 110, 14, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.moveTo(84, 128); ctx.lineTo(116, 128); ctx.lineTo(124, 238); ctx.lineTo(76, 238); ctx.closePath(); ctx.fill()
    return tex(c)
  })
}

/** Полосатая ткань навеса на торговых рядах. */
export function canopyTexture(seed: number) {
  return cached(`canopy-${seed}`, () => {
    const [c, ctx] = canvas(256, 256)
    const palette = ['#b4472b', '#e0b356', '#2f6b7a', '#efe1c0']
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = palette[(i + seed) % palette.length]
      ctx.fillRect(i * 32, 0, 32, 256)
    }
    return tex(c)
  })
}

/* ---------------- Родовое дерево ---------------- */

/** Кора старого дерева: глубокие продольные борозды + маска тонких золотых прожилок для свечения. */
let barkCache: { map: THREE.Texture; veins: THREE.Texture } | null = null
export function barkTextures() {
  if (barkCache) return barkCache
  const W = 512, H = 1024
  const [c, ctx] = canvas(W, H)
  ctx.fillStyle = '#3a2618'
  ctx.fillRect(0, 0, W, H)
  const r = rng(8)
  // пластины коры
  for (let i = 0; i < 260; i++) {
    const x = r() * W, y = r() * H, w = 10 + r() * 26, h = 60 + r() * 180
    ctx.fillStyle = `rgba(${70 + r() * 40},${45 + r() * 25},${28 + r() * 15},${0.35 + r() * 0.4})`
    ctx.beginPath(); ctx.ellipse(x, y, w / 2, h / 2, (r() - 0.5) * 0.12, 0, Math.PI * 2); ctx.fill()
  }
  // борозды
  for (let i = 0; i < 70; i++) {
    const x = r() * W
    ctx.strokeStyle = `rgba(14,8,4,${0.45 + r() * 0.4})`
    ctx.lineWidth = 2 + r() * 5
    ctx.beginPath()
    ctx.moveTo(x, 0)
    for (let y = 0; y <= H; y += 48) ctx.lineTo(x + Math.sin(y * 0.011 + i) * (6 + r() * 10), y)
    ctx.stroke()
  }
  const [v, vctx] = canvas(W, H)
  vctx.fillStyle = '#000'
  vctx.fillRect(0, 0, W, H)
  vctx.strokeStyle = '#fff'
  for (let i = 0; i < 6; i++) {
    const x = r() * W
    vctx.lineWidth = 1.2 + r() * 1.5
    vctx.beginPath()
    vctx.moveTo(x, 0)
    for (let y = 0; y <= H; y += 32) vctx.lineTo(x + Math.sin(y * 0.01 + i * 2) * 16, y)
    vctx.stroke()
  }
  const map = tex(c, { repeat: [2, 3] }), veins = tex(v, { repeat: [2, 3], color: false })
  barkCache = { map, veins }
  return barkCache
}

/** Орнамент на земле, в который уходят корни: восьмиконечные звёзды гириха в кругах. */
export function rootOrnamentTexture() {
  return cached('root-ornament', () => {
    const S = 2048
    const [c, ctx] = canvas(S, S)
    ctx.clearRect(0, 0, S, S)
    const cx = S / 2
    const ring = (r: number, w: number, color: string) => { ctx.strokeStyle = color; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cx, r, 0, Math.PI * 2); ctx.stroke() }
    ring(980, 6, 'rgba(214,180,106,0.55)')
    ring(940, 2, 'rgba(214,180,106,0.4)')
    ring(560, 4, 'rgba(54,198,192,0.45)')
    // пояс из 24 звёзд
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2
      const x = cx + Math.cos(a) * 760, y = cx + Math.sin(a) * 760
      star(ctx, x, y, 92, 0.62)
      ctx.strokeStyle = 'rgba(214,180,106,0.6)'; ctx.lineWidth = 4; ctx.stroke()
      star(ctx, x, y, 40, 0.55)
      ctx.fillStyle = i % 2 ? 'rgba(54,198,192,0.4)' : 'rgba(214,180,106,0.35)'; ctx.fill()
    }
    // лучи от центра — продолжение корней
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      ctx.strokeStyle = 'rgba(214,180,106,0.32)'; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 380, cx + Math.sin(a) * 380); ctx.lineTo(cx + Math.cos(a) * 940, cx + Math.sin(a) * 940); ctx.stroke()
    }
    star(ctx, cx, cx, 420, 0.7, 16)
    ctx.strokeStyle = 'rgba(214,180,106,0.45)'; ctx.lineWidth = 4; ctx.stroke()
    return tex(c)
  })
}

/* ---------------- Рамка портрета в стиле старого альбома ---------------- */

export interface FrameLabel { first: string; last: string; years: string; generation: string; initials: string }
const FW = 360, FH = 560
export const FRAME_ASPECT = FH / FW

function drawFrame(ctx: CanvasRenderingContext2D, label: FrameLabel, img?: HTMLImageElement) {
  ctx.clearRect(0, 0, FW, FH)
  const x = 22, y = 18, w = FW - 44, h = 380
  // тёмное дерево рамки с волокнами
  const wood = ctx.createLinearGradient(0, 0, FW, 0)
  wood.addColorStop(0, '#2b1a0e'); wood.addColorStop(0.5, '#4a2e18'); wood.addColorStop(1, '#2b1a0e')
  ctx.fillStyle = wood
  ctx.beginPath(); archPath(ctx, x, y, w, h, 0.55)
  ctx.fill()
  ctx.save()
  ctx.beginPath(); archPath(ctx, x, y, w, h, 0.55)
  ctx.clip()
  const r = rng(label.first.length * 31 + label.last.length * 7 + 3)
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(${r() > 0.5 ? '15,8,3' : '110,75,40'},${0.2 + r() * 0.25})`
    ctx.lineWidth = 1 + r() * 2
    const yy = y + r() * h
    ctx.beginPath(); ctx.moveTo(x, yy); ctx.bezierCurveTo(x + w * 0.3, yy + 6, x + w * 0.7, yy - 6, x + w, yy); ctx.stroke()
  }
  ctx.restore()
  // золотой кант
  ctx.strokeStyle = '#d6b46a'
  ctx.lineWidth = 4
  ctx.beginPath(); archPath(ctx, x + 14, y + 14, w - 28, h - 28, 0.55)
  ctx.stroke()
  // портрет
  const px = x + 24, py = y + 24, pw = w - 48, ph = h - 48
  ctx.save()
  ctx.beginPath(); archPath(ctx, px, py, pw, ph, 0.55)
  ctx.clip()
  const bg = ctx.createRadialGradient(px + pw / 2, py + ph * 0.45, 10, px + pw / 2, py + ph / 2, ph * 0.7)
  bg.addColorStop(0, '#e9dcc0'); bg.addColorStop(1, '#bba57c')
  ctx.fillStyle = bg
  ctx.fillRect(px, py, pw, ph)
  if (img && img.naturalWidth) {
    const s = Math.max(pw / img.naturalWidth, ph / img.naturalHeight)
    const iw = img.naturalWidth * s, ih = img.naturalHeight * s
    ctx.drawImage(img, px + (pw - iw) / 2, py + (ph - ih) * 0.35, iw, ih)
    // тёплая патина старого снимка
    ctx.fillStyle = 'rgba(120,80,30,0.12)'
    ctx.fillRect(px, py, pw, ph)
  } else {
    ctx.strokeStyle = 'rgba(110,80,40,0.35)'
    ctx.lineWidth = 2
    star(ctx, px + pw / 2, py + ph * 0.55, 70, 0.68)
    ctx.stroke()
    ctx.fillStyle = '#6b4c24'
    ctx.font = '500 78px "Cormorant Garamond", Georgia, serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(label.initials, px + pw / 2, py + ph * 0.56)
  }
  // виньетка
  const vg = ctx.createRadialGradient(px + pw / 2, py + ph / 2, ph * 0.3, px + pw / 2, py + ph / 2, ph * 0.75)
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(40,20,5,0.35)')
  ctx.fillStyle = vg
  ctx.fillRect(px, py, pw, ph)
  ctx.restore()
  // бирюзовая звёздочка в замке арки
  star(ctx, FW / 2, y + 8, 13, 0.5)
  ctx.fillStyle = '#36c6c0'
  ctx.fill()
  ctx.strokeStyle = '#d6b46a'; ctx.lineWidth = 2; ctx.stroke()

  // табличка с подписью
  const ty = y + h + 10, th = FH - ty - 8
  ctx.fillStyle = '#f0e5cc'
  ctx.fillRect(x + 6, ty, w - 12, th)
  ctx.strokeStyle = '#b8955a'; ctx.lineWidth = 2
  ctx.strokeRect(x + 12, ty + 6, w - 24, th - 12)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  const fit = (text: string, max: number) => {
    let s = text
    while (ctx.measureText(s).width > max && s.length > 3) s = s.slice(0, -2)
    return s === text ? s : s.trimEnd() + '…'
  }
  ctx.fillStyle = '#2a1d10'
  ctx.font = '600 38px "Cormorant Garamond", Georgia, serif'
  ctx.fillText(fit(label.first, w - 40), FW / 2, ty + 44)
  ctx.font = '500 28px "Cormorant Garamond", Georgia, serif'
  ctx.fillText(fit(label.last, w - 40), FW / 2, ty + 76)
  ctx.fillStyle = '#7a5a2c'
  ctx.font = '600 19px Manrope, system-ui, sans-serif'
  ctx.fillText(fit([label.years, label.generation].filter(Boolean).join(' · '), w - 40), FW / 2, ty + 112)
}

const frameCache = new Map<string, THREE.CanvasTexture>()
export function frameTexture(id: string, label: FrameLabel, photo?: string) {
  const key = `${id}|${label.first}|${label.last}|${label.years}|${label.generation}|${photo ?? ''}`
  const hit = frameCache.get(key)
  if (hit) return hit
  const [c, ctx] = canvas(FW, FH)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  let img: HTMLImageElement | undefined
  drawFrame(ctx, label)
  document.fonts?.ready.then(() => { drawFrame(ctx, label, img); t.needsUpdate = true })
  if (photo) {
    img = new Image()
    img.onload = () => { drawFrame(ctx, label, img); t.needsUpdate = true }
    img.src = photo
  }
  frameCache.set(key, t)
  return t
}
