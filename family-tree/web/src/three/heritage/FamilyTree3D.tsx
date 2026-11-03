import { type MutableRefObject, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, type ThreeEvent, useFrame } from '@react-three/fiber'
import { Billboard, Html, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { fmt, roman, useT } from '../../i18n'
import type { Dict } from '../../i18n/ru'
import { type FamilyGraph, ancestorsOf, descendantsOf } from '../../lib/graph'
import { initials, lifeYears } from '../../lib/names'
import { useIsCompact, useReducedMotion } from '../../lib/device'
import { type FamilyTreeModel, FRAME_W, type TreeNode, buildFamilyTree, taperedTube } from './familyTree'
import { FRAME_ASPECT, barkTextures, frameTexture, rootOrnamentTexture, softDot } from './textures'

/** Ветвь выбранного человека: он сам, все предки и все потомки. */
function lineageOf(g: FamilyGraph, id: string | null): Set<string> | null {
  if (!id || !g.people.has(id)) return null
  return new Set([id, ...ancestorsOf(g, id), ...descendantsOf(g, id)])
}

/* ---------------- Дерево: ствол, корни, ветви ---------------- */

function Wood({ model, lineage, compact }: { model: FamilyTreeModel; lineage: Set<string> | null; compact: boolean }) {
  const geos = useMemo(() => {
    const radial = compact ? 7 : 12
    return model.branches.map((b) => {
      const seg = b.kind === 'trunk' ? (compact ? 24 : 48) : b.kind === 'twig' ? 8 : (compact ? 14 : 28)
      return taperedTube(b.curve, b.r0, b.r1, seg, b.kind === 'twig' ? 5 : radial)
    })
  }, [model, compact])
  const { bark, lit, dim } = useMemo(() => {
    const { map, veins } = barkTextures()
    const params = { map, bumpMap: map, bumpScale: 3, roughness: 0.85, metalness: 0.02, emissive: new THREE.Color('#d9a24c'), emissiveMap: veins }
    return {
      bark: new THREE.MeshStandardMaterial({ ...params, emissiveIntensity: 0.45 }),
      lit: new THREE.MeshStandardMaterial({ ...params, color: '#ffe3a8', emissiveIntensity: 2.2 }),
      dim: new THREE.MeshStandardMaterial({ ...params, color: '#8a7a6a', emissiveIntensity: 0.12 }),
    }
  }, [])
  const ids = model.nodes.map((n) => n.id)
  const pick = (i: number) => {
    const b = model.branches[i]
    if (!lineage || b.kind === 'root' || b.kind === 'trunk') return bark
    if (b.to == null) return dim
    const on = lineage.has(ids[b.to]) && (b.from.length === 0 || b.from.some((f) => lineage.has(ids[f])))
    return on ? lit : dim
  }
  return <>{geos.map((geo, i) => <mesh key={i} geometry={geo} material={pick(i)} castShadow={!compact} receiveShadow />)}</>
}

/** Земля: тёмная почва, а под корнями — светящийся узбекский орнамент. */
function Ground({ model }: { model: FamilyTreeModel }) {
  const orn = useMemo(() => new THREE.MeshBasicMaterial({ map: rootOrnamentTexture(), transparent: true, depthWrite: false, toneMapped: false, opacity: 0.85 }), [])
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.13, -1]} receiveShadow>
        <circleGeometry args={[40, 64]} />
        <meshStandardMaterial color="#1a120b" roughness={1} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[model.crown.x, -0.1, -0.9]} material={orn}>
        <planeGeometry args={[11, 11]} />
      </mesh>
    </group>
  )
}

/* ---------------- Дуги супругов ---------------- */

function SpouseLinks({ model, lineage }: { model: FamilyTreeModel; lineage: Set<string> | null }) {
  const geos = useMemo(() => model.spouseLinks.map(([a, b]) => {
    const A = model.nodes[a].pos, B = model.nodes[b].pos
    const y = Math.min(A.y, B.y) - FRAME_W * 0.55
    const p0 = new THREE.Vector3(A.x, y, A.z + 0.05), p3 = new THREE.Vector3(B.x, y, B.z + 0.05)
    const c = new THREE.QuadraticBezierCurve3(p0, p0.clone().lerp(p3, 0.5).add(new THREE.Vector3(0, -0.28, 0.1)), p3)
    return new THREE.TubeGeometry(c, 24, 0.018, 6, false)
  }), [model])
  const mat = useMemo(() => new THREE.MeshBasicMaterial({ color: '#36c6c0', toneMapped: false, transparent: true }), [])
  mat.opacity = lineage ? 0.45 : 0.9
  return <>{geos.map((g, i) => <mesh key={i} geometry={g} material={mat} renderOrder={18} />)}</>
}

/* ---------------- Портреты в рамках ---------------- */

function Frame({ node, dict, selected, dimmed, onHover, onSelect }: {
  node: TreeNode; dict: Dict; selected: boolean; dimmed: boolean
  onHover: (id: string | null) => void; onSelect: (id: string) => void
}) {
  const ref = useRef<THREE.Group>(null!)
  const mat = useRef<THREE.MeshBasicMaterial>(null!)
  const [hovered, setHovered] = useState(false)
  const down = useRef<{ x: number; y: number } | null>(null)
  const texture = useMemo(() => frameTexture(node.id, {
    first: node.person.first_name || dict.common.noName,
    last: node.person.last_name,
    years: lifeYears(node.person, dict),
    generation: fmt(dict.person.generationOf, { n: roman(node.gen + 1) }),
    initials: initials(node.person),
  }, node.photo), [node, dict])
  useFrame((_, delta) => {
    const want = hovered || selected ? 1.12 : 1
    ref.current.scale.setScalar(THREE.MathUtils.damp(ref.current.scale.x, want, 10, delta))
    const c = dimmed ? 0.42 : 1
    mat.current.color.setScalar(THREE.MathUtils.damp(mat.current.color.r, c, 8, delta))
  })
  return (
    <group ref={ref} position={node.pos}>
      <Billboard>
        <mesh
          renderOrder={20}
          onPointerDown={(e: ThreeEvent<PointerEvent>) => { down.current = { x: e.clientX, y: e.clientY } }}
          onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(node.id); document.body.style.cursor = 'pointer' }}
          onPointerOut={() => { setHovered(false); onHover(null); document.body.style.cursor = '' }}
          onClick={(e) => {
            const d = down.current
            if (d && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6) return
            e.stopPropagation()
            onSelect(node.id)
          }}
        >
          <planeGeometry args={[FRAME_W, FRAME_W * FRAME_ASPECT]} />
          <meshBasicMaterial ref={mat} map={texture} transparent alphaTest={0.05} depthTest={false} depthWrite={false} toneMapped={false} />
        </mesh>
        {selected && (
          <mesh position={[0, 0.1, -0.02]} renderOrder={19}>
            <planeGeometry args={[FRAME_W * 1.9, FRAME_W * FRAME_ASPECT * 1.5]} />
            <meshBasicMaterial map={softDot()} color="#f0c46a" transparent opacity={0.55} depthTest={false} depthWrite={false} blending={THREE.AdditiveBlending} />
          </mesh>
        )}
      </Billboard>
    </group>
  )
}

/** Подсказка при наведении: полное имя, годы, место рождения. */
function HoverInfo({ node, dict }: { node: TreeNode | null; dict: Dict }) {
  if (!node) return null
  const p = node.person
  const name = [p.last_name, p.first_name, p.middle_name].filter(Boolean).join(' ') || dict.common.noName
  return (
    <Html position={[node.pos.x, node.pos.y + FRAME_W * FRAME_ASPECT * 0.62, node.pos.z]} center zIndexRange={[30, 0]} style={{ pointerEvents: 'none' }}>
      <div className="tree3d-tip">
        <strong>{name}</strong>
        {lifeYears(p, dict) && <span>{lifeYears(p, dict)}</span>}
        {p.birth_place && <span>{p.birth_place}</span>}
        <em>{fmt(dict.person.generationOf, { n: roman(node.gen + 1) })}</em>
      </div>
    </Html>
  )
}

/* ---------------- Сцена ---------------- */

function Lights({ compact }: { compact: boolean }) {
  return (
    <>
      <hemisphereLight args={['#ffe6c4', '#2a1a0e', 0.55]} />
      <spotLight position={[4, 16, 10]} angle={0.6} penumbra={0.9} intensity={180} color="#ffd9a0" castShadow={!compact} shadow-mapSize={[1024, 1024]} shadow-bias={-0.0005} />
      <directionalLight position={[-6, 6, -6]} intensity={1.1} color="#36c6c0" />
    </>
  )
}

function Dust({ model, reducedMotion }: { model: FamilyTreeModel; reducedMotion: boolean }) {
  const pts = useRef<THREE.Points>(null!)
  const geo = useMemo(() => {
    const size = model.bounds.getSize(new THREE.Vector3())
    const n = 220
    const pos = new Float32Array(n * 3)
    let s = 3
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < n; i++) pos.set([(r() - 0.5) * size.x * 1.2, r() * size.y * 1.1, (r() - 0.5) * 6 - 1], i * 3)
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [model])
  const mat = useMemo(() => new THREE.PointsMaterial({ map: softDot(), color: '#f3cf86', size: 0.06, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }), [])
  useFrame((_, d) => { if (!reducedMotion) pts.current.rotation.y += d * 0.01 })
  return <points ref={pts} geometry={geo} material={mat} />
}

function Tree({ graph, selectedId, onSelect, compact, reducedMotion }: { graph: FamilyGraph; selectedId: string | null; onSelect: (id: string) => void; compact: boolean; reducedMotion: boolean }) {
  const dict = useT()
  const model = useMemo(() => buildFamilyTree(graph), [graph])
  const lineage = useMemo(() => lineageOf(graph, selectedId), [graph, selectedId])
  const [hover, setHover] = useState<string | null>(null)
  const hoverNode = hover ? model.nodes.find((n) => n.id === hover) ?? null : null
  return (
    <>
      <Lights compact={compact} />
      <Ground model={model} />
      <Wood model={model} lineage={lineage} compact={compact} />
      <SpouseLinks model={model} lineage={lineage} />
      {model.nodes.map((n) => (
        <Frame key={n.id} node={n} dict={dict} selected={selectedId === n.id} dimmed={!!lineage && !lineage.has(n.id)} onHover={setHover} onSelect={onSelect} />
      ))}
      <HoverInfo node={hoverNode} dict={dict} />
      <Dust model={model} reducedMotion={reducedMotion} />
    </>
  )
}

/** Камера, вписанная в дерево, и сброс вида по запросу страницы. */
function useFit(graph: FamilyGraph) {
  return useMemo(() => {
    const model = buildFamilyTree(graph)
    const c = model.bounds.getCenter(new THREE.Vector3())
    const s = model.bounds.getSize(new THREE.Vector3())
    return { center: c, size: s }
  }, [graph])
}

export default function FamilyTree3D({ graph, selectedId, onSelect, controlsRef }: {
  graph: FamilyGraph; selectedId: string | null; onSelect: (id: string) => void; controlsRef?: MutableRefObject<{ reset: () => void } | null>
}) {
  const compact = useIsCompact()
  const reducedMotion = useReducedMotion()
  const { center, size } = useFit(graph)
  const orbit = useRef<any>(null)
  const start = useMemo<[number, number, number]>(() => {
    const aspect = typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight - 140) : 1.6
    const fov = THREE.MathUtils.degToRad(38)
    const dist = Math.max(size.y / 2 / Math.tan(fov / 2), size.x / 2 / Math.tan(fov / 2) / aspect) * 1.05 + 2
    return [center.x + dist * 0.12, center.y + 0.6, dist]
  }, [center, size])
  useEffect(() => {
    if (!controlsRef) return
    controlsRef.current = {
      reset: () => {
        const c = orbit.current
        if (!c) return
        c.object.position.set(...start)
        c.target.copy(center)
        c.update()
      },
    }
  })
  return (
    <Canvas
      className="tree3d-canvas"
      shadows={!compact}
      dpr={compact ? [1, 1.5] : [1, 2]}
      gl={{ antialias: true }}
      camera={{ fov: 38, near: 0.1, far: 400, position: start }}
      onCreated={({ gl, scene }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        scene.background = new THREE.Color('#120c08')
        // туман от расстояния до дерева: дальний фон тонет в темноте, само дерево — нет
        const d = Math.hypot(...start)
        scene.fog = new THREE.Fog('#120c08', d * 1.1, d * 2.6)
      }}
      onPointerMissed={() => { document.body.style.cursor = '' }}
    >
      <Suspense fallback={null}>
        <Tree graph={graph} selectedId={selectedId} onSelect={onSelect} compact={compact} reducedMotion={reducedMotion} />
      </Suspense>
      <OrbitControls
        ref={orbit}
        target={center}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.5}
        minDistance={3}
        maxDistance={Math.max(60, start[2] * 1.6)}
        minPolarAngle={0.5}
        maxPolarAngle={1.62}
        minAzimuthAngle={-1.1}
        maxAzimuthAngle={1.1}
        enablePan
        screenSpacePanning
      />
    </Canvas>
  )
}

