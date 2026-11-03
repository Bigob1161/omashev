import * as THREE from 'three'
import type { Person } from '../../api/types'
import { fileUrl } from '../../api/client'
import { type FamilyGraph, parentsOf, portraitOf, spousesOf } from '../../lib/graph'
import { computeLayout } from '../../lib/layout'
import { rng } from './textures'

/*
  Модель родового дерева. Как в старом семейном альбоме: старшие поколения — выше, младшие — ниже.
  Ствол поднимается из корней к кроне; от кроны к каждому основателю линии ведёт ветвь,
  а от каждого родителя (или пары) ветви спускаются к детям. Супруги стоят рядом
  и соединены отдельной бирюзовой дугой — её не спутать с ветвью родства.
*/

export interface TreeNode { id: string; gen: number; pos: THREE.Vector3; person: Person; photo?: string }

export interface Branch {
  curve: THREE.Curve<THREE.Vector3>
  r0: number
  r1: number
  /** Ветвь ведёт от этих людей к человеку `to` (у ствола, корней и декоративных веточек — пусто). */
  from: number[]
  to?: number
  kind: 'trunk' | 'root' | 'limb' | 'twig'
}

export interface FamilyTreeModel {
  nodes: TreeNode[]
  branches: Branch[]
  spouseLinks: [number, number][]
  gens: number
  crown: THREE.Vector3
  bounds: THREE.Box3
}

/** Размер рамки портрета в единицах сцены. */
export const FRAME_W = 0.92

function hash(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return Math.abs(h) || 1
}

/** Ветвь, «свисающая» от родителя к ребёнку: сначала в сторону, потом вниз. */
function hanging(a: THREE.Vector3, b: THREE.Vector3, seed: string) {
  const r = rng(hash(seed))
  const d = b.clone().sub(a)
  const c1 = a.clone().add(new THREE.Vector3(d.x * 0.55 + (r() - 0.5) * 0.2, 0.12, -0.08))
  const c2 = b.clone().add(new THREE.Vector3((r() - 0.5) * 0.15, -d.y * 0.45, -0.05))
  return new THREE.CubicBezierCurve3(a.clone(), c1, c2, b.clone())
}

/** Ветвь от кроны вверх-вбок к основателю линии. */
function rising(a: THREE.Vector3, b: THREE.Vector3, seed: string) {
  const r = rng(hash(seed))
  const d = b.clone().sub(a)
  const c1 = a.clone().add(new THREE.Vector3(d.x * 0.2 + (r() - 0.5) * 0.3, Math.max(0.4, d.y * 0.55), 0.05))
  const c2 = b.clone().add(new THREE.Vector3(-d.x * 0.3, -Math.max(0.3, d.y * 0.25), -0.1))
  return new THREE.CubicBezierCurve3(a.clone(), c1, c2, b.clone())
}

export function buildFamilyTree(g: FamilyGraph): FamilyTreeModel {
  const L = computeLayout(g, { cardW: 1, cardH: 1, gapX: 0.42, gapY: 1, pad: 0 })
  const gens = Math.max(1, L.rows)
  const width = Math.max(1, L.width)
  const xs = 1.22
  const yStep = 2.05
  const lowest = 3.1
  const nodes: TreeNode[] = []
  const index = new Map<string, number>()
  for (const [id, p] of g.people) {
    const lp = L.pos.get(id)!
    const gen = L.row.get(id) ?? 0
    const x = (lp.x + 0.5 - width / 2) * xs
    const r = rng(hash(id))
    // крона слегка выгнута к зрителю — объём без потери читаемости
    const z = -0.045 * x * x + (r() - 0.5) * 0.12
    const y = lowest + (gens - 1 - gen) * yStep + (r() - 0.5) * 0.12
    const photo = portraitOf(g, id)
    index.set(id, nodes.length)
    nodes.push({ id, gen, pos: new THREE.Vector3(x, y, z), person: p, photo: photo ? fileUrl(photo) : undefined })
  }

  const fh = FRAME_W * 1.56
  const top = (n: TreeNode) => n.pos.clone().add(new THREE.Vector3(0, fh * 0.5, -0.12))
  const bottom = (n: TreeNode) => n.pos.clone().add(new THREE.Vector3(0, -fh * 0.42, -0.12))

  const branches: Branch[] = []
  const topY = nodes.reduce((m, n) => Math.max(m, n.pos.y), lowest)
  const crown = new THREE.Vector3(0, Math.max(2.4, topY - yStep * 0.55), -0.9)
  // ствол: массивный, с лёгким изгибом
  branches.push({
    kind: 'trunk', from: [], r0: 0.62, r1: 0.26,
    curve: new THREE.CatmullRomCurve3([new THREE.Vector3(0, -0.2, -0.9), new THREE.Vector3(0.12, crown.y * 0.35, -0.95), new THREE.Vector3(-0.1, crown.y * 0.7, -0.88), crown.clone()]),
  })
  // корни расходятся по земле и уходят в орнамент
  const rr = rng(11)
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rr() * 0.3
    const len = 2.6 + rr() * 1.6
    const end = new THREE.Vector3(Math.cos(a) * len, -0.12, -0.9 + Math.sin(a) * len * 0.8)
    const mid = new THREE.Vector3(Math.cos(a) * len * 0.45, 0.16, -0.9 + Math.sin(a) * len * 0.36)
    branches.push({ kind: 'root', from: [], r0: 0.3, r1: 0.03, curve: new THREE.CatmullRomCurve3([new THREE.Vector3(Math.cos(a) * 0.3, 0.55, -0.9 + Math.sin(a) * 0.25), mid, end]) })
  }

  const isInLaw = (id: string) => !parentsOf(g, id).length && spousesOf(g, id).some((s) => parentsOf(g, s).length)
  for (const n of nodes) {
    const i = index.get(n.id)!
    const parents = parentsOf(g, n.id).map((p) => index.get(p)).filter((x): x is number => x != null)
    const depth = 1 + n.gen * 0.45
    if (parents.length) {
      // из середины пары родителей (или от единственного родителя) — вниз к ребёнку
      const start = parents.reduce((acc, p) => acc.add(bottom(nodes[p])), new THREE.Vector3()).divideScalar(parents.length)
      branches.push({ kind: 'limb', from: parents, to: i, r0: 0.11 / depth, r1: 0.05 / depth, curve: hanging(start, top(n), n.id) })
    } else if (!isInLaw(n.id)) {
      // основатель линии: ветвь от кроны
      branches.push({ kind: 'limb', from: [], to: i, r0: 0.22, r1: 0.08, curve: rising(crown, bottom(n), n.id) })
    }
  }

  // декоративные веточки — живой силуэт, людей на них нет
  const base = branches.filter((b) => b.kind === 'limb' || b.kind === 'trunk')
  base.forEach((br, k) => {
    const r = rng(500 + k * 13)
    const count = br.kind === 'trunk' ? 4 : 1
    for (let j = 0; j < count; j++) {
      const t = br.kind === 'trunk' ? 0.5 + j * 0.12 : 0.35 + r() * 0.3
      const from = br.curve.getPoint(t)
      const dir = new THREE.Vector3((r() - 0.5) * 2, 0.4 + r() * 0.8, (r() - 0.5) * 0.8 - 0.3).normalize()
      const len = (br.kind === 'trunk' ? 1.3 : 0.55) + r() * 0.4
      const to = from.clone().addScaledVector(dir, len)
      const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3((r() - 0.5) * 0.25, 0.12, 0))
      branches.push({ kind: 'twig', from: [], r0: Math.min(br.r0, 0.12) * 0.5, r1: 0.008, curve: new THREE.QuadraticBezierCurve3(from, mid, to) })
    }
  })

  const spouseLinks: [number, number][] = []
  for (const r of g.relations) {
    if (r.type !== 'spouse') continue
    const a = index.get(r.a), b = index.get(r.b)
    if (a != null && b != null) spouseLinks.push([a, b])
  }

  const bounds = new THREE.Box3(new THREE.Vector3(-3.5, -0.3, -2), new THREE.Vector3(3.5, topY + fh, 1))
  for (const n of nodes) bounds.expandByPoint(n.pos.clone().add(new THREE.Vector3(FRAME_W, fh * 0.6, 0))).expandByPoint(n.pos.clone().add(new THREE.Vector3(-FRAME_W, -fh * 0.6, 0)))
  return { nodes, branches, spouseLinks, gens, crown, bounds }
}

/** Сужающийся «тубус» вдоль кривой — ствол, корни и ветви. */
export function taperedTube(curve: THREE.Curve<THREE.Vector3>, r0: number, r1: number, segments: number, radial: number) {
  const geo = new THREE.TubeGeometry(curve, segments, 1, radial, false)
  const pos = geo.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3()
  for (let i = 0; i <= segments; i++) {
    const t = i / segments
    const center = curve.getPointAt(t)
    // к основанию ствол и корни расширяются сильнее — «комель»
    const r = THREE.MathUtils.lerp(r0, r1, Math.pow(t, 0.7))
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
