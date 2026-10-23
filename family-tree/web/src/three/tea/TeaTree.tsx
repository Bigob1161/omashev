import { type MutableRefObject, useMemo, useRef, useState } from 'react'
import { type ThreeEvent, useFrame, useThree } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import type { Dict } from '../../i18n/ru'
import { displayName, initials, lifeYears } from '../../lib/names'
import { type TeaState, smooth } from './state'
import { type TreeModel, type TreeNode, taperedTube } from './treeModel'
import { MEDALLION_ASPECT, medallionTexture, softDot, woodTextures } from './textures'

const MED_W = 0.66
const UP = new THREE.Vector3(0, 1, 0)

/** Масштаб читаемой схемы, чтобы она поместилась в кадр. */
export function flatScale(model: TreeModel, aspect: number) {
  const maxW = aspect > 1 ? 13 : 7
  return Math.min(1, maxW / Math.max(1, model.flatWidth))
}

interface Props {
  model: TreeModel
  state: MutableRefObject<TeaState>
  dict: Dict
  compact: boolean
  reducedMotion: boolean
  interactive: MutableRefObject<boolean>
  onSelect?: (id: string) => void
  selectedId?: string | null
}

const clamp01 = (x: number) => THREE.MathUtils.clamp(x, 0, 1)
const branchGrowth = (grow: number, t0: number, t1: number, lead = 1) => clamp01(((grow - t0) / (t1 - t0)) * lead)

export function TeaTree(props: Props) {
  const { model, state, compact, reducedMotion } = props
  const { size } = useThree()
  const positions = useMemo(() => model.nodes.map(() => new THREE.Vector3()), [model])
  const appear = useMemo(() => new Float32Array(model.nodes.length), [model])
  const flatFit = useRef(1)

  // Дирижёр: позиции людей (дерево → схема) и степень появления медальонов.
  useFrame(() => {
    const s = state.current
    const k = flatScale(model, size.width / size.height)
    flatFit.current = k
    model.nodes.forEach((n, i) => {
      appear[i] = smooth(n.appearAt - 0.015, n.appearAt + 0.05, s.grow)
      positions[i].copy(n.flat).multiplyScalar(k).add(model.flatCenter)
      positions[i].lerpVectors(n.art, positions[i], s.morph)
    })
  }, -2)

  return (
    <>
      <Wood model={model} state={state} compact={compact} />
      <Threads model={model} state={state} compact={compact} reducedMotion={reducedMotion} />
      <Links model={model} state={state} positions={positions} appear={appear} flatFit={flatFit} />
      <Pulses model={model} state={state} reducedMotion={reducedMotion} />
      {model.nodes.map((n, i) => <Medallion key={n.id} node={n} index={i} positions={positions} appear={appear} {...props} />)}
    </>
  )
}

/* ---------------- Ствол и ветви ---------------- */

function Wood({ model, state, compact }: { model: TreeModel; state: MutableRefObject<TeaState>; compact: boolean }) {
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const { geos, radial } = useMemo(() => {
    const radial = compact ? 6 : 10
    const geos = model.branches.map((b, i) => {
      const seg = i === 0 ? (compact ? 20 : 40) : b.twig ? 8 : (compact ? 14 : 26)
      return { geo: taperedTube(b.curve, b.r0, b.r1, seg, radial), seg }
    })
    return { geos, radial }
  }, [model, compact])
  const mat = useMemo(() => {
    const { map, veins } = woodTextures()
    return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 2, roughness: 0.78, metalness: 0.05, emissive: '#e7b45a', emissiveMap: veins, emissiveIntensity: 1, color: '#ffffff' })
  }, [])
  const young = useMemo(() => new THREE.Color('#ffd27a'), [])
  const old = useMemo(() => new THREE.Color('#ffffff'), [])

  useFrame(() => {
    const s = state.current
    // молодые ветви — почти золотые нити, со временем — тёмное дерево с золотыми прожилками
    mat.color.lerpColors(young, old, s.mature)
    mat.emissiveIntensity = THREE.MathUtils.lerp(2.2, 0.55, s.mature)
    mat.opacity = 1 - s.morph
    const fading = s.morph > 0.001
    if (mat.transparent !== fading) { mat.transparent = fading; mat.needsUpdate = true }
    model.branches.forEach((b, i) => {
      const m = meshes.current[i]
      if (!m) return
      // древесина чуть отстаёт от световой нити
      const g = branchGrowth(s.grow, b.t0 + (i === 0 ? 0.04 : 0.03), b.t1 + 0.03)
      const { geo, seg } = geos[i]
      geo.setDrawRange(0, Math.floor(g * seg) * radial * 6)
      m.visible = g > 0.001 && s.morph < 0.99
    })
  })

  return <>{geos.map((g, i) => <mesh key={i} ref={(el) => { meshes.current[i] = el }} geometry={g.geo} material={mat} castShadow />)}</>
}

/* ---------------- Световые нити из чая ---------------- */

function Threads({ model, state, compact, reducedMotion }: { model: TreeModel; state: MutableRefObject<TeaState>; compact: boolean; reducedMotion: boolean }) {
  const SEG = 40
  const R = 6
  const meshes = useRef<(THREE.Mesh | null)[]>([])
  const curves = useMemo(() => [...model.threads, ...model.branches.filter((b) => !b.twig).slice(1).map((b) => b.curve)], [model])
  const geos = useMemo(() => curves.map((c) => new THREE.TubeGeometry(c, SEG, 0.011, R, false)), [curves])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#f0a64a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [])
  const amber = useMemo(() => new THREE.Color('#e5862a'), [])
  const gold = useMemo(() => new THREE.Color('#ffd98a'), [])
  const branchWin = useMemo(() => model.branches.filter((b) => !b.twig).slice(1), [model])

  // Частицы, поднимающиеся с поверхности чая вдоль нитей.
  const count = compact ? 36 : 90
  const pgeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
    return g
  }, [count])
  const pmat = useMemo(() => new THREE.PointsMaterial({ map: softDot(), color: '#ffcf7a', size: 0.07, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [])
  const p = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ clock }) => {
    const s = state.current
    mat.color.lerpColors(amber, gold, s.threads)
    const nThreads = model.threads.length
    const trunk = model.branches[0]
    const trunkWood = branchGrowth(s.grow, trunk.t0 + 0.04, trunk.t1 + 0.03)
    curves.forEach((_, i) => {
      const m = meshes.current[i]
      if (!m) return
      const g = i < nThreads ? s.threads : branchGrowth(s.grow, branchWin[i - nThreads].t0, branchWin[i - nThreads].t1, 1.5)
      geos[i].setDrawRange(0, Math.floor(g * SEG) * R * 6)
      m.visible = g > 0.001 && s.morph < 0.98
    })
    // нити ярче всего, пока растут; когда сформировалось дерево — остаются тонким свечением
    mat.opacity = (0.95 - 0.6 * s.mature) * (1 - trunkWood * 0.3) * (1 - s.morph)

    const arr = pgeo.attributes.position.array as Float32Array
    const time = reducedMotion ? 0 : clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const c = model.threads[i % nThreads]
      const t = ((i * 0.618 + time * 0.22) % 1) * s.threads
      c.getPoint(Math.max(0.001, t), p)
      arr[i * 3] = p.x + Math.sin(i * 12.9) * 0.05
      arr[i * 3 + 1] = p.y
      arr[i * 3 + 2] = p.z + Math.cos(i * 7.3) * 0.05
    }
    pgeo.attributes.position.needsUpdate = true
    pmat.opacity = s.glow * (1 - s.mature * 0.85) * (1 - s.morph)
  })

  return (
    <>
      {geos.map((g, i) => <mesh key={i} ref={(el) => { meshes.current[i] = el }} geometry={g} material={mat} frustumCulled={false} />)}
      <points geometry={pgeo} material={pmat} frustumCulled={false} />
    </>
  )
}

/* ---------------- Импульсы света вдоль ветвей к людям ---------------- */

function Pulses({ model, state, reducedMotion }: { model: TreeModel; state: MutableRefObject<TeaState>; reducedMotion: boolean }) {
  const branches = useMemo(() => model.branches.filter((b) => b.to != null), [model])
  const n = Math.max(1, branches.length * 2)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
    return g
  }, [n])
  const mat = useMemo(() => new THREE.PointsMaterial({ map: softDot(), color: '#7fe3df', size: 0.11, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), [])
  const p = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }) => {
    const s = state.current
    const arr = geo.attributes.position.array as Float32Array
    const time = reducedMotion ? 0.3 : clock.elapsedTime
    branches.forEach((b, i) => {
      const done = branchGrowth(s.grow, b.t0, b.t1)
      for (let j = 0; j < 2; j++) {
        const k = i * 2 + j
        b.curve.getPoint(((j * 0.5 + i * 0.13 + time * 0.18) % 1) * done, p)
        arr[k * 3] = p.x; arr[k * 3 + 1] = done > 0.95 ? p.y : -999; arr[k * 3 + 2] = p.z
      }
    })
    geo.attributes.position.needsUpdate = true
    mat.opacity = smooth(0.66, 0.78, s.p) * (1 - s.morph) * 0.9
  })
  return <points geometry={geo} material={mat} frustumCulled={false} />
}

/* ---------------- Дуги супругов и линии схемы ---------------- */

const A = new THREE.Vector3(), B = new THREE.Vector3(), D = new THREE.Vector3()
const P0 = new THREE.Vector3(), P1 = new THREE.Vector3(), P2 = new THREE.Vector3(), P3 = new THREE.Vector3()
const dummy = new THREE.Object3D()
const SEGS = 10

function cubic(t: number, out: THREE.Vector3) {
  const u = 1 - t
  return out.set(0, 0, 0).addScaledVector(P0, u * u * u).addScaledVector(P1, 3 * u * u * t).addScaledVector(P2, 3 * u * t * t).addScaledVector(P3, t * t * t)
}

function writeSegments(mesh: THREE.InstancedMesh, start: number, grow: number, radius: number) {
  for (let i = 0; i < SEGS; i++) {
    cubic((i / SEGS) * grow, A)
    cubic(((i + 1) / SEGS) * grow, B)
    D.subVectors(B, A)
    const len = D.length()
    if (len < 1e-5) dummy.scale.setScalar(0)
    else {
      dummy.position.addVectors(A, B).multiplyScalar(0.5)
      dummy.quaternion.setFromUnitVectors(UP, D.divideScalar(len))
      dummy.scale.set(radius, len * 1.05, radius)
    }
    dummy.updateMatrix()
    mesh.setMatrixAt(start + i, dummy.matrix)
  }
}

function Links({ model, state, positions, appear, flatFit }: { model: TreeModel; state: MutableRefObject<TeaState>; positions: THREE.Vector3[]; appear: Float32Array; flatFit: MutableRefObject<number> }) {
  const spouse = useRef<THREE.InstancedMesh>(null!)
  const kin = useRef<THREE.InstancedMesh>(null!)
  const geo = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 6, 1, true), [])
  const spouseMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#36c6c0', transparent: true, toneMapped: false }), [])
  const kinMat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#d6b46a', transparent: true, toneMapped: false }), [])
  // Связи «родители → ребёнок» для схемы: по одной линии от пары родителей.
  const kinLinks = useMemo(() => {
    const byChild = new Map<number, number[]>()
    for (const [p, c] of model.parentLinks) byChild.set(c, [...(byChild.get(c) ?? []), p])
    return [...byChild.entries()]
  }, [model])

  useFrame(() => {
    const s = state.current
    const half = 0.5 * MED_W * MEDALLION_ASPECT * THREE.MathUtils.lerp(1, 1.25, s.morph) * Math.max(0.6, flatFit.current)
    model.spouseLinks.forEach(([a, b], k) => {
      P0.copy(positions[a]); P3.copy(positions[b])
      const lift = 0.3 * (1 - s.morph)
      P1.lerpVectors(P0, P3, 0.3).y += lift
      P2.lerpVectors(P0, P3, 0.7).y += lift
      P0.z -= 0.02 * s.morph; P3.z -= 0.02 * s.morph; P1.z -= 0.02 * s.morph; P2.z -= 0.02 * s.morph
      const g = Math.min(appear[a], appear[b]) * smooth(0.64, 0.74, s.p + s.morph)
      writeSegments(spouse.current, k * SEGS, g, 0.012)
    })
    spouse.current.count = model.spouseLinks.length * SEGS
    spouse.current.instanceMatrix.needsUpdate = true

    kinLinks.forEach(([child, parents], k) => {
      P0.set(0, 0, 0)
      for (const p of parents) P0.add(positions[p])
      P0.divideScalar(parents.length)
      P0.y -= parents.length > 1 ? 0 : half * 0.75
      P3.copy(positions[child]); P3.y += half * 0.9
      const mid = (P0.y + P3.y) / 2
      P1.set(P0.x, mid, -0.03); P2.set(P3.x, mid, -0.03)
      P0.z = P3.z = -0.03
      writeSegments(kin.current, k * SEGS, s.morph > 0.02 ? appear[child] : 0, 0.009)
    })
    kin.current.count = kinLinks.length * SEGS
    kin.current.instanceMatrix.needsUpdate = true
    kinMat.opacity = s.morph
    spouseMat.opacity = 0.9
  })

  return (
    <>
      <instancedMesh ref={spouse} args={[geo, spouseMat, Math.max(1, model.spouseLinks.length * SEGS)]} frustumCulled={false} />
      <instancedMesh ref={kin} args={[geo, kinMat, Math.max(1, kinLinks.length * SEGS)]} frustumCulled={false} />
    </>
  )
}

/* ---------------- Медальоны ---------------- */

function Medallion({ node, index, positions, appear, state, dict, interactive, onSelect, selectedId }: Props & { node: TreeNode; index: number; positions: THREE.Vector3[]; appear: Float32Array }) {
  const ref = useRef<THREE.Group>(null!)
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  const [hovered, setHovered] = useState(false)
  const down = useRef<{ x: number; y: number } | null>(null)
  const texture = useMemo(
    () => medallionTexture(node.id, { name: displayName(node.person, dict), years: lifeYears(node.person, dict), initials: initials(node.person) }, node.photo),
    [node, dict],
  )
  const selected = selectedId === node.id

  useFrame((_, delta) => {
    const g = ref.current
    if (!g) return
    const s = state.current
    const want = appear[index] * THREE.MathUtils.lerp(1, 1.25, s.morph) * (hovered || selected ? 1.12 : 1)
    const sc = THREE.MathUtils.damp(g.scale.x, want, 9, delta)
    g.scale.setScalar(sc)
    g.visible = sc > 0.01
    g.position.copy(positions[index])
  })

  const clickable = !!onSelect
  return (
    <group ref={ref} scale={0}>
      <Billboard>
        <mesh
          renderOrder={20}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => { down.current = { x: e.clientX, y: e.clientY } }}
          onPointerOver={(e) => {
            if (!clickable || !interactive.current) return
            e.stopPropagation()
            setHovered(true)
            document.body.style.cursor = 'pointer'
          }}
          onPointerOut={() => { setHovered(false); document.body.style.cursor = '' }}
          onClick={(e) => {
            if (!clickable || !interactive.current) return
            const d = down.current
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return
            e.stopPropagation()
            onSelect!(node.id)
          }}
        >
          <planeGeometry args={[MED_W, MED_W * MEDALLION_ASPECT]} />
          <meshBasicMaterial ref={mat} map={texture} transparent alphaTest={0.05} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
        {selected && (
          <mesh position={[0, MED_W * MEDALLION_ASPECT * 0.15, -0.01]} renderOrder={19}>
            <circleGeometry args={[MED_W * 0.6, 48]} />
            <meshBasicMaterial map={softDot()} color="#36c6c0" transparent opacity={0.7} depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        )}
      </Billboard>
    </group>
  )
}
