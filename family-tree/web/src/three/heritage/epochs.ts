/*
  Сценарий путешествия: семь «кадров» (первый экран + шесть эпох).
  Модуль без three.js — его читает и страница (цветокоррекция, подписи), и сцена.
*/

export const FRAMES = 7

type RGB = [number, number, number]
type V3 = [number, number, number]

/** Где стоит сцена: Регистан, Самарканд Тимуридов или холм обсерватории. */
export const PLACES = {
  registan: [0, 0, 0] as V3,
  timurid: [80, 0, -60] as V3,
  observatory: [-80, 0, -70] as V3,
}
type Place = keyof typeof PLACES

export interface Frame {
  place: Place
  cam: V3
  at: V3
  skyTop: string
  skyHorizon: string
  fog: string
  fogNear: number
  fogFar: number
  sun: V3
  sunColor: string
  sunIntensity: number
  ambient: number
  stars: number
  clouds: number
  sepia: number
  gray: number
  contrast: number
  brightness: number
}

export const FRAME_LIST: Frame[] = [
  // 0 — первый экран: тёплый предвечерний свет на фасадах
  { place: 'registan', cam: [0, 2.4, 23], at: [0, 5.2, -6], skyTop: '#3f7fd6', skyHorizon: '#f4d6a6', fog: '#ecd3a8', fogNear: 35, fogFar: 150,
    sun: [-0.55, 0.42, 0.72], sunColor: '#ffd29a', sunIntensity: 3.4, ambient: 0.75, stars: 0, clouds: 0.75, sepia: 0, gray: 0, contrast: 1, brightness: 1 },
  // I — современный Регистан, ясный день, вид сверху-сбоку
  { place: 'registan', cam: [13, 10, 21], at: [-1, 3, -4], skyTop: '#4a88d4', skyHorizon: '#d6e6ef', fog: '#dce6ea', fogNear: 40, fogFar: 170,
    sun: [0.35, 0.78, 0.52], sunColor: '#fff2da', sunIntensity: 3.6, ambient: 0.85, stars: 0, clouds: 0.85, sepia: 0, gray: 0, contrast: 1.02, brightness: 1 },
  // II — Самарканд эпохи Тимуридов: пыль, золото, караваны
  { place: 'timurid', cam: [-1, 5.5, 33], at: [1, 6, -6], skyTop: '#6f97c4', skyHorizon: '#f1c487', fog: '#e7c08a', fogNear: 25, fogFar: 125,
    sun: [0.72, 0.32, 0.42], sunColor: '#ffc27e', sunIntensity: 3.2, ambient: 0.7, stars: 0, clouds: 0.45, sepia: 0.12, gray: 0, contrast: 1.04, brightness: 1 },
  // III — ночь над обсерваторией Улугбека
  { place: 'observatory', cam: [13, 6, 19], at: [0, 4.5, 0], skyTop: '#050a1d', skyHorizon: '#28325e', fog: '#151d3a', fogNear: 40, fogFar: 180,
    sun: [-0.45, 0.62, 0.35], sunColor: '#a8b8ff', sunIntensity: 1.1, ambient: 0.4, stars: 1, clouds: 0, sepia: 0, gray: 0, contrast: 1.05, brightness: 1 },
  // IV — Регистан на рубеже веков, как на старой фотографии
  { place: 'registan', cam: [-13, 2.4, 15], at: [3, 4.5, -6], skyTop: '#8eaecc', skyHorizon: '#e9dcc0', fog: '#e2d6bd', fogNear: 30, fogFar: 140,
    sun: [0.5, 0.6, 0.6], sunColor: '#fff0d0', sunIntensity: 3, ambient: 0.8, stars: 0, clouds: 0.6, sepia: 0.85, gray: 0, contrast: 1.06, brightness: 0.97 },
  // V — пасмурно, туман, чёрно-белое: спокойная документальная часть
  { place: 'registan', cam: [7, 2, 11], at: [-4, 5, -9], skyTop: '#7b838d', skyHorizon: '#b8bbbf', fog: '#a9adb2', fogNear: 8, fogFar: 75,
    sun: [0.2, 0.9, 0.3], sunColor: '#e6e6e6', sunIntensity: 0.9, ambient: 1.1, stars: 0, clouds: 0.2, sepia: 0, gray: 1, contrast: 0.92, brightness: 0.86 },
  // VI — независимость: утро, цвет возвращается, широкий вид
  { place: 'registan', cam: [0, 17, 36], at: [0, 3, -4], skyTop: '#3d84d8', skyHorizon: '#f7ddb2', fog: '#efdcb8', fogNear: 45, fogFar: 190,
    sun: [0.62, 0.5, 0.6], sunColor: '#ffe5bb', sunIntensity: 3.6, ambient: 0.85, stars: 0, clouds: 0.9, sepia: 0, gray: 0, contrast: 1.03, brightness: 1.02 },
]

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]
const HEX = FRAME_LIST.map((f) => ({ skyTop: hex(f.skyTop), skyHorizon: hex(f.skyHorizon), fog: hex(f.fog), sunColor: hex(f.sunColor) }))
const mix3 = (a: number[], b: number[], t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]

export interface Env {
  /** Положение «между кадрами»: 0…FRAMES-1. */
  pos: number
  cam: V3
  at: V3
  skyTop: V3
  skyHorizon: V3
  fog: V3
  fogNear: number
  fogFar: number
  sun: V3
  sunColor: V3
  sunIntensity: number
  ambient: number
  stars: number
  clouds: number
  sepia: number
  gray: number
  contrast: number
  brightness: number
  /** Насколько камера «в пути» между местами (0…1): гуще дымка, выше полёт. */
  travel: number
}

export function emptyEnv(): Env {
  return frameEnv(0)
}

/** Кадр задерживается на месте, а переход идёт в середине промежутка — текст успевают прочитать. */
export function frameEnv(progress: number, out?: Env): Env {
  const pos = Math.min(FRAMES - 1, Math.max(0, progress * (FRAMES - 1)))
  const i = Math.min(FRAMES - 2, Math.floor(pos))
  const t = smooth(0.28, 0.72, pos - i)
  const a = FRAME_LIST[i], b = FRAME_LIST[i + 1]
  const ha = HEX[i], hb = HEX[i + 1]
  const moving = a.place !== b.place
  const travel = moving ? Math.sin(Math.PI * t) : 0
  const camA = add(PLACES[a.place], a.cam), camB = add(PLACES[b.place], b.cam)
  const atA = add(PLACES[a.place], a.at), atB = add(PLACES[b.place], b.at)
  const cam = mix3(camA, camB, t)
  cam[1] += travel * 14
  const e = out ?? ({} as Env)
  e.pos = pos
  e.cam = cam
  e.at = mix3(atA, atB, t)
  e.skyTop = mix3(ha.skyTop, hb.skyTop, t)
  e.skyHorizon = mix3(ha.skyHorizon, hb.skyHorizon, t)
  e.fog = mix3(ha.fog, hb.fog, t)
  e.fogNear = lerp(a.fogNear, b.fogNear, t) * (1 - travel * 0.7)
  e.fogFar = lerp(a.fogFar, b.fogFar, t) * (1 - travel * 0.55)
  e.sun = mix3(a.sun, b.sun, t)
  e.sunColor = mix3(ha.sunColor, hb.sunColor, t)
  e.sunIntensity = lerp(a.sunIntensity, b.sunIntensity, t)
  e.ambient = lerp(a.ambient, b.ambient, t)
  e.stars = lerp(a.stars, b.stars, t)
  e.clouds = lerp(a.clouds, b.clouds, t)
  e.sepia = lerp(a.sepia, b.sepia, t)
  e.gray = lerp(a.gray, b.gray, t)
  e.contrast = lerp(a.contrast, b.contrast, t)
  e.brightness = lerp(a.brightness, b.brightness, t)
  e.travel = travel
  return e
}

/** Видимость подписи кадра i (0…1) при текущем положении. */
export function frameVisibility(pos: number, i: number) {
  const d = Math.abs(pos - i)
  return 1 - smooth(0.22, 0.42, d)
}

/** CSS-фильтр цветокоррекции: сепия старых снимков и чёрно-белая документалистика. */
export function gradeFilter(e: Env) {
  return `sepia(${e.sepia.toFixed(3)}) grayscale(${e.gray.toFixed(3)}) contrast(${e.contrast.toFixed(3)}) brightness(${e.brightness.toFixed(3)})`
}
