import * as THREE from 'three'
import type { Person } from '../../api/types'
import { fileUrl } from '../../api/client'
import { type FamilyGraph, parentsOf, portraitOf, spousesOf } from '../../lib/graph'
import { computeLayout } from '../../lib/layout'
import { rng } from './textures'

/*
  Модель «живого» дерева. Структура берётся только из родственных связей:
  ствол поднимается из пиалы, к каждому основателю ведёт ветвь от вершины ствола,
  к каждому ребёнку — ветвь от его родителей. Свойственники (супруги без родителей в древе)
  стоят рядом с мужем или женой и соединены с ними бирюзовой дугой.
  Для каждого человека есть две позиции: на дереве (art) и на читаемой схеме (flat).
*/

export interface TreeNode {
  id: string
  gen: number
  art: THREE.Vector3
  flat: THREE.Vector3
  person: Person
  photo?: string
  /** Окно роста ветви, ведущей к человеку (в долях общего роста дерева). */
  appearAt: number
}

export interface Branch {
  curve: THREE.Curve<THREE.Vector3>
  r0: number
  r1: number
  /** Окно роста [t0, t1] в долях общего роста дерева. */
  t0: number
  t1: number
  /** К кому ведёт ветвь (у декоративных веточек — нет). */
  to?: number
  twig?: boolean
}

export interface TreeModel {
  nodes: TreeNode[]
  branches: Branch[]
  /** Нити, поднимающиеся из чая в начале (световые). */
  threads: THREE.Curve<THREE.Vector3>[]
  parentLinks: [number, number][]
  spouseLinks: [number, number][]
  gens: number
  top: number
  flatWidth: number
  flatHeight: number
  flatCenter: THREE.Vector3
}

export const BOWL_SURFACE = new THREE.Vector3(0, 0.24, 0)

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return Math.abs(h) || 1
}

/** Точка крепления ветви — под портретом медальона, чтобы дерево не перекрывало лицо и подпись. */
export const MEDALLION_SOCKET = 0.46
const socket = (p: THREE.Vector3) => p.clone().setY(p.y - MEDALLION_SOCKET)

function tidyCurve(a: THREE.Vector3, b: THREE.Vector3, seed: string, lift = 0.55) {
  const r = rng(hash(seed))
  const d = b.clone().sub(a)
  const up = Math.max(0.35, d.y)
  // ветвь сначала тянется вверх, потом уходит вбок — как у настоящего дерева
  const c1 = a.clone().add(new THREE.Vector3(d.x * 0.15 + (r() - 0.5) * 0.25, up * lift, d.z * 0.15 + (r() - 0.5) * 0.25))
  const c2 = b.clone().add(new THREE.Vector3(-d.x * 0.35 + (r() - 0.5) * 0.2, -up * 0.35, -d.z * 0.3 + (r() - 0.5) * 0.2))
  return new THREE.CubicBezierCurve3(a.clone(), c1, c2, b.clone())
}

export function buildTreeModel(g: FamilyGraph): TreeModel {
  const L = computeLayout(g, { cardW: 1, cardH: 1, gapX: 0.4, gapY: 1, pad: 0 })
  const gens = Math.max(1, L.rows)
  const width = Math.max(1, L.width)
  const yStep = Math.min(1.45, 5 / Math.max(1, gens - 1))
  const y0 = 2.55
  // сколько людей в каждом поколении — от этого зависит радиус дуги кроны
  const perGen = new Map<number, number>()
  for (const r of L.row.values()) perGen.set(r, (perGen.get(r) ?? 0) + 1)

  const nodes: TreeNode[] = []
  const index = new Map<string, number>()
  const genStep = Math.min(0.2, 0.68 / gens)
  for (const [id, p] of g.people) {
    const pos = L.pos.get(id)!
    const gen = L.row.get(id) ?? 0
    const xn = ((pos.x + 0.5) / width) * 2 - 1
    const r = rng(hash(id))
    // Крона-веер: поколение лежит на дуге вокруг ствола (лицом к зрителю), а не на прямой.
    // Радиус дуги растёт с числом людей, чтобы медальоны не наползали друг на друга.
    const count = perGen.get(gen) ?? 1
    const arc = Math.min(2.6, 0.9 + gen * 0.55)
    const radius = Math.max(0.9 + gen * 0.9, (count * 0.78) / arc)
    const theta = xn * (arc / 2)
    const x = Math.sin(theta) * radius
    const z = Math.cos(theta) * radius * 0.55 - radius * 0.4 + (r() - 0.5) * 0.25
    const photo = portraitOf(g, id)
    index.set(id, nodes.length)
    nodes.push({
      id,
      gen,
      art: new THREE.Vector3(x, y0 + gen * yStep + (1 - Math.cos(theta)) * 0.5 + (r() - 0.5) * 0.15, z),
      flat: new THREE.Vector3((pos.x + 0.5 - width / 2) * 1.35, ((gens - 1) / 2 - gen) * 1.7, 0),
      person: p,
      photo: photo ? fileUrl(photo) : undefined,
      appearAt: 0.22 + gen * genStep + genStep * 0.9,
    })
  }

  const top = new THREE.Vector3(0.05, y0 - 0.75, -0.05)
  const branches: Branch[] = []
  // Ствол: из пиалы вверх с мягким изгибом.
  branches.push({
    curve: new THREE.CatmullRomCurve3([BOWL_SURFACE.clone(), new THREE.Vector3(0.1, 0.8, 0.05), new THREE.Vector3(-0.08, 1.35, -0.04), top.clone()]),
    r0: 0.2, r1: 0.12, t0: 0, t1: 0.22,
  })

  const parentLinks: [number, number][] = []
  const spouseLinks: [number, number][] = []
  const isInLaw = (id: string) => !parentsOf(g, id).length && spousesOf(g, id).some((s) => parentsOf(g, s).length)

  for (const n of nodes) {
    const i = index.get(n.id)!
    const parents = parentsOf(g, n.id).map((p) => index.get(p)).filter((x): x is number => x != null)
    const w0 = 0.2 + n.gen * genStep
    const w1 = w0 + genStep * 1.05
    if (parents.length) {
      parents.forEach((p) => parentLinks.push([p, i]))
      // ветвь выходит из середины пары родителей (или из единственного родителя)
      const start = parents.reduce((acc, p) => acc.add(socket(nodes[p].art)), new THREE.Vector3()).divideScalar(parents.length)
      const depth = n.gen + 1
      branches.push({ curve: tidyCurve(start, socket(n.art), n.id), r0: 0.1 / (1 + 0.4 * depth), r1: 0.05 / (1 + 0.4 * depth), t0: w0, t1: w1, to: i })
    } else if (!isInLaw(n.id)) {
      branches.push({ curve: tidyCurve(top, socket(n.art), n.id, 0.4), r0: 0.13, r1: 0.065, t0: w0, t1: w1, to: i })
    }
  }
  for (const r of g.relations) {
    if (r.type !== 'spouse') continue
    const a = index.get(r.a), b = index.get(r.b)
    if (a != null && b != null) spouseLinks.push([a, b])
  }

  // Декоративные веточки — для живого силуэта; людей на них нет.
  const base = branches.slice()
  base.forEach((br, k) => {
    const r = rng(1000 + k * 7)
    const count = k === 0 ? 3 : 1
    for (let j = 0; j < count; j++) {
      const t = k === 0 ? 0.55 + j * 0.15 : 0.45 + r() * 0.25
      const from = br.curve.getPoint(t)
      const dir = new THREE.Vector3((r() - 0.5) * 2, 0.6 + r() * 0.6, (r() - 0.5) * 1.2).normalize()
      const len = (k === 0 ? 0.8 : 0.45) + r() * 0.35
      const to = from.clone().addScaledVector(dir, len)
      const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3((r() - 0.5) * 0.2, 0.1, (r() - 0.5) * 0.2))
      const span = br.t1 - br.t0
      branches.push({
        curve: new THREE.QuadraticBezierCurve3(from, mid, to),
        r0: Math.min(br.r0, br.r1) * 0.55, r1: 0.008,
        t0: br.t0 + span * t, t1: Math.min(1, br.t1 + span * 0.4), twig: true,
      })
    }
  })

  // Световые нити: из поверхности чая по спирали к вершине ствола.
  const threads: THREE.Curve<THREE.Vector3>[] = []
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2
    const pts: THREE.Vector3[] = []
    for (let k = 0; k <= 8; k++) {
      const t = k / 8
      const rad = 0.24 * (1 - t) + 0.05
      const a = a0 + t * 2.4
      pts.push(new THREE.Vector3(Math.cos(a) * rad, THREE.MathUtils.lerp(BOWL_SURFACE.y, top.y, t), Math.sin(a) * rad))
    }
    threads.push(new THREE.CatmullRomCurve3(pts))
  }

  const maxY = nodes.reduce((m, n) => Math.max(m, n.art.y), top.y)
  const flatWidth = width * 1.35
  const flatHeight = (gens - 1) * 1.7 + 1.6
  return { nodes, branches, threads, parentLinks, spouseLinks, gens, top: maxY, flatWidth, flatHeight, flatCenter: new THREE.Vector3(0, (y0 + maxY) / 2, 0) }
}

/** Конический (сужающийся) «тубус» вдоль кривой — ствол и ветви. */
export function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segments: number, radial: number) {
  const geo = new THREE.TubeGeometry(curve, segments, 1, radial, false)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const center = curve.getPointAt(t)
    const r = THREE.MathUtils.lerp(r0, r1, t)
    for (let j = 0; j <= radial; j++) {
      const idx = i * (radial + 1) + j
      v.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(r).add(center)
      pos.setXYZ(idx, v.x, v.y, v.z)
    }
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}
