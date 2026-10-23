import { type MutableRefObject, Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { FamilyGraph } from '../../lib/graph'
import { useT } from '../../i18n'
import { useIsCompact, useReducedMotion } from '../../lib/device'
import { type TeaState, emptyState, smooth, teaState } from './state'
import { TeaSet } from './TeaSet'
import { TeaTree, flatScale } from './TeaTree'
import { type TreeModel, buildTreeModel } from './treeModel'
import { softDot } from './textures'

/** Свет: тёплый ключевой, бирюзовый контровой и отражения из локальных «световых панелей» (без загрузки HDR). */
function Lighting({ state, compact }: { state: MutableRefObject<TeaState>; compact: boolean }) {
  const bowlLight = useRef<THREE.PointLight>(null!)
  useFrame(() => { bowlLight.current.intensity = 0.2 + state.current.glow * 5 * (1 - state.current.morph) })
  return (
    <>
      <ambientLight intensity={0.22} color="#8fa3d1" />
      <spotLight position={[-3, 5, 4]} angle={0.5} penumbra={0.8} intensity={60} color="#ffe2b6" />
      <directionalLight position={[4, 3, -4]} intensity={1.2} color="#36c6c0" />
      <directionalLight position={[2, 6, 6]} intensity={0.6} color="#fff1dc" />
      <pointLight ref={bowlLight} position={[0, 0.5, 0.2]} distance={3} color="#ffb85c" />
      <Environment resolution={compact ? 64 : 128} frames={1}>
        <Lightformer form="rect" intensity={6} color="#fff0d6" position={[-3, 4, 3]} scale={[4, 2.5, 1]} />
        <Lightformer form="rect" intensity={3} color="#36c6c0" position={[4, 1, -2]} scale={[3, 4, 1]} />
        <Lightformer form="ring" intensity={2.5} color="#d6b46a" position={[0, 6, 0]} scale={4} />
        <Lightformer form="rect" intensity={1} color="#1a2850" position={[0, -3, 3]} scale={[8, 1, 1]} />
      </Environment>
    </>
  )
}

/** Мягкий объёмный ореол за посудой и пыль в воздухе. */
function Atmosphere({ count, reducedMotion, state }: { count: number; reducedMotion: boolean; state: MutableRefObject<TeaState> }) {
  const dust = useRef<THREE.Points>(null!)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    let seed = 9
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < count; i++) pos.set([(r() - 0.5) * 14, r() * 9 - 1, (r() - 0.5) * 8 - 2], i * 3)
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [count])
  const mat = useMemo(() => new THREE.PointsMaterial({ map: softDot(), color: '#e8cb86', size: 0.045, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }), [])
  const halo = useMemo(() => new THREE.SpriteMaterial({ map: softDot(), color: '#f3c27a', transparent: true, opacity: 0.14, depthWrite: false, blending: THREE.AdditiveBlending }), [])
  useFrame((_, delta) => {
    if (!reducedMotion) dust.current.rotation.y += delta * 0.01
    halo.opacity = 0.14 * (1 - state.current.morph)
  })
  return (
    <>
      <points ref={dust} geometry={geo} material={mat} />
      <sprite material={halo} position={[-0.6, 0.7, -1.4]} scale={[5, 4, 1]} />
    </>
  )
}

/* ---------------- Камера, ведомая прокруткой ---------------- */

interface Key { p: number; pos: THREE.Vector3; at: THREE.Vector3 }
const tmpOffset = new THREE.Vector3()

function StoryCamera({ model, state, heroShift, reducedMotion }: { model: TreeModel; state: MutableRefObject<TeaState>; heroShift: number; reducedMotion: boolean }) {
  const { camera, size } = useThree()
  const look = useRef(new THREE.Vector3())
  const pointer = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const on = (e: PointerEvent) => { pointer.current = { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 } }
    window.addEventListener('pointermove', on, { passive: true })
    return () => window.removeEventListener('pointermove', on)
  }, [])

  const keys = useMemo<Key[]>(() => {
    const aspect = size.width / size.height
    const fov = THREE.MathUtils.degToRad((camera as THREE.PerspectiveCamera).fov)
    const far = aspect < 0.8 ? 1.45 : 1
    const cy = (model.top + 0.3) / 2
    const fullDist = ((model.top + 1.4) / 2 / Math.tan(fov / 2)) * (aspect < 1 ? 1.5 : 1.1)
    const k = flatScale(model, aspect)
    const wide = aspect > 1.2
    const w = model.flatWidth * k + (wide ? 6.5 : 1.4), h = model.flatHeight * k + 1.6
    const dist = Math.max(h / 2 / Math.tan(fov / 2), w / 2 / Math.tan(fov / 2) / aspect)
    const side = wide ? Math.min(3.2, dist * Math.tan(fov / 2) * aspect * 0.3) : 0
    const fc = model.flatCenter.y
    // на широком экране дерево растёт правее карточки главы
    const ts = wide ? 1.4 : 0
    // и посуда в главах I–III тоже правее карточки текста
    const cs = wide ? 0.85 : 0
    const raw: [number, number[], number[]][] = [
      [0, [0.25, 1.3, 4.7 * far], [-0.45, 0.4, 0]],
      [0.14, [0.35 - cs, 1.2, 4.3 * far], [-0.5 - cs, 0.45, 0]],
      [0.24, [0.7 - cs, 1.2, 4.4 * far], [-0.45 - cs, 0.55, 0]],
      [0.33, [0.75 - cs, 1.05, 4.0 * far], [-0.3 - cs, 0.48, 0]],
      [0.44, [0.4 - cs * 0.8, 1.2, 3.3 * far], [-0.05 - cs * 0.8, 0.32, 0]],
      [0.53, [0.3 - ts * 0.6, 1.9, 5 * far], [-ts * 0.6, 1.1, 0]],
      [0.64, [-2.1 - ts, 2.7, 8.2 * far], [-ts, 2.0, 0]],
      [0.75, [2.3 - ts, cy + 0.9, 10.2 * far], [-ts, cy, 0]],
      [0.85, [0.4 - ts, cy + 0.4, fullDist], [-ts, cy, 0]],
      [0.96, [-side, fc, dist], [-side, fc, 0]],
      [1, [-side, fc, dist * 0.97], [-side, fc, 0]],
    ]
    return raw.map(([p, pos, at]) => ({ p, pos: new THREE.Vector3(...pos), at: new THREE.Vector3(...at) }))
  }, [model, size.width, size.height, camera])

  const portrait = size.width / size.height < 0.8
  useFrame((_, delta) => {
    const p = state.current.p
    let i = 0
    while (i < keys.length - 2 && p > keys[i + 1].p) i++
    const a = keys[i], b = keys[i + 1]
    const t = smooth(a.p, b.p, p)
    camera.position.lerpVectors(a.pos, b.pos, t)
    look.current.lerpVectors(a.at, b.at, t)
    // На первом экране посуда стоит правее заголовка; на телефоне — выше текста.
    const hero = 1 - smooth(0.05, 0.2, p)
    const sx = heroShift * hero
    camera.position.x -= sx
    look.current.x -= sx
    if (portrait) {
      // узкий экран: отодвинуть камеру, поставить посуду по центру и выше текста
      look.current.x -= 0.25 * hero
      camera.position.x -= 0.25 * hero
      tmpOffset.subVectors(camera.position, look.current).multiplyScalar(1 + 0.45 * hero)
      camera.position.copy(look.current).add(tmpOffset)
      look.current.y -= 1.45 * hero
      camera.position.y -= 0.9 * hero
    }
    if (!reducedMotion) {
      // лёгкий отклик на курсор, без резких движений
      const px = THREE.MathUtils.damp(camera.userData.px ?? 0, pointer.current.x, 3, delta)
      const py = THREE.MathUtils.damp(camera.userData.py ?? 0, pointer.current.y, 3, delta)
      camera.userData.px = px
      camera.userData.py = py
      const amp = 0.18 * (1 - state.current.morph)
      camera.position.x += px * amp
      camera.position.y -= py * amp * 0.6
    }
    camera.lookAt(look.current)
  }, -1)
  return null
}

/** Ведёт состояние сцены за прогрессом прокрутки (с мягким сглаживанием). */
function useDrivenState(progress: MutableRefObject<number>, reducedMotion: boolean) {
  const state = useRef<TeaState>(teaState(progress.current, emptyState()))
  const smoothed = useRef(progress.current)
  useFrame((_, delta) => {
    smoothed.current = reducedMotion ? progress.current : THREE.MathUtils.damp(smoothed.current, progress.current, 4.5, delta)
    teaState(smoothed.current, state.current)
  }, -3)
  return state
}

/** Сцена с небольшим поворотом перетаскиванием (ограничен, чтобы не мешать прокрутке). */
function Turntable({ children, drag, reducedMotion, idle }: { children: React.ReactNode; drag?: MutableRefObject<number>; reducedMotion: boolean; idle?: number }) {
  const g = useRef<THREE.Group>(null!)
  useFrame(({ clock }, delta) => {
    const sway = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.25) * (idle ?? 0.06)
    const want = THREE.MathUtils.clamp(drag?.current ?? 0, -0.7, 0.7) + sway
    g.current.rotation.y = THREE.MathUtils.damp(g.current.rotation.y, want, 4, delta)
  })
  return <group ref={g}>{children}</group>
}

function SceneContents({ graph, progress, compact, reducedMotion, interactive, onSelect, selectedId, story, heroShift, drag, idle }: {
  graph: FamilyGraph; progress: MutableRefObject<number>; compact: boolean; reducedMotion: boolean
  interactive: MutableRefObject<boolean>; onSelect?: (id: string) => void; selectedId?: string | null
  story: boolean; heroShift?: number; drag?: MutableRefObject<number>; idle?: number
}) {
  const dict = useT()
  const model = useMemo(() => buildTreeModel(graph), [graph])
  const state = useDrivenState(progress, reducedMotion)
  return (
    <>
      <Lighting state={state} compact={compact} />
      {story && <StoryCamera model={model} state={state} heroShift={heroShift ?? 0} reducedMotion={reducedMotion} />}
      <Atmosphere count={compact ? 120 : 320} reducedMotion={reducedMotion} state={state} />
      <Turntable drag={drag} reducedMotion={reducedMotion} idle={idle}>
        <TeaSet state={state} compact={compact} reducedMotion={reducedMotion} />
        <TeaTree model={model} state={state} dict={dict} compact={compact} reducedMotion={reducedMotion} interactive={interactive} onSelect={onSelect} selectedId={selectedId} />
      </Turntable>
      {!compact && <ContactShadows position={[0, -0.005, 0]} opacity={0.55} scale={6} blur={2.4} far={2} resolution={512} color="#02040a" />}
    </>
  )
}

const glSetup = ({ gl }: { gl: THREE.WebGLRenderer }) => {
  gl.toneMapping = THREE.ACESFilmicToneMapping
  gl.toneMappingExposure = 1.05
}

/** Главная: прокрутка ведёт всю историю — от чайника до схемы. */
export function StoryScene({ graph, progress, interactive, onSelect, active }: {
  graph: FamilyGraph; progress: MutableRefObject<number>; interactive: MutableRefObject<boolean>; onSelect: (id: string) => void; active: boolean
}) {
  const compact = useIsCompact()
  const reducedMotion = useReducedMotion()
  const drag = useRef(0)
  const dragging = useRef<number | null>(null)
  const wide = typeof window !== 'undefined' && window.innerWidth > 980
  return (
    <Canvas
      className="story-canvas"
      frameloop={active ? 'always' : 'never'}
      dpr={compact ? [1, 1.5] : [1, 2]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      camera={{ fov: 36, near: 0.05, far: 80, position: [0, 1.3, 4.7] }}
      onCreated={glSetup}
      onPointerDown={(e) => { dragging.current = e.clientX }}
      onPointerMove={(e) => {
        if (dragging.current == null) return
        drag.current = THREE.MathUtils.clamp(drag.current + (e.clientX - dragging.current) * 0.005, -0.7, 0.7)
        dragging.current = e.clientX
      }}
      onPointerUp={() => { dragging.current = null }}
      onPointerLeave={() => { dragging.current = null }}
      aria-hidden="true"
    >
      <Suspense fallback={null}>
        <SceneContents graph={graph} progress={progress} compact={compact} reducedMotion={reducedMotion} interactive={interactive} onSelect={onSelect} story heroShift={wide ? 1.25 : 0} drag={drag} />
      </Suspense>
    </Canvas>
  )
}

/** Художественный режим страницы древа: готовое дерево, свободный (но ограниченный) обзор. */
export function ArtScene({ graph, onSelect, selectedId, controlsRef }: {
  graph: FamilyGraph; onSelect: (id: string) => void; selectedId: string | null; controlsRef?: MutableRefObject<{ reset: () => void } | null>
}) {
  const compact = useIsCompact()
  const reducedMotion = useReducedMotion()
  const progress = useRef(0.82)
  const interactive = useRef(true)
  const model = useMemo(() => buildTreeModel(graph), [graph])
  const cy = (model.top + 0.3) / 2
  const target = useMemo(() => new THREE.Vector3(0, cy, 0), [cy])
  const start: [number, number, number] = [0, cy + 0.5, Math.max(6.5, (model.top + 1.5) * 1.55)]
  const orbit = useRef<any>(null)
  useEffect(() => {
    if (!controlsRef) return
    controlsRef.current = {
      reset: () => {
        const c = orbit.current
        if (!c) return
        c.object.position.set(...start)
        c.target.copy(target)
        c.update()
      },
    }
  })
  return (
    <Canvas dpr={compact ? [1, 1.5] : [1, 2]} gl={{ antialias: true, alpha: true }} camera={{ fov: 38, near: 0.05, far: 80, position: start }} onCreated={glSetup}>
      <Suspense fallback={null}>
        <SceneContents graph={graph} progress={progress} compact={compact} reducedMotion={reducedMotion} interactive={interactive} onSelect={onSelect} selectedId={selectedId} story={false} idle={0} />
      </Suspense>
      <OrbitControls
        ref={orbit}
        target={target}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        minDistance={2.5}
        maxDistance={24}
        minPolarAngle={0.35}
        maxPolarAngle={1.62}
        enablePan
        screenSpacePanning
      />
    </Canvas>
  )
}

/** Финал главной: тот же мотив — чайник, пиала и выросшее дерево — без взаимодействия. */
export function FinaleScene({ graph, active }: { graph: FamilyGraph; active: boolean }) {
  const compact = useIsCompact()
  const reducedMotion = useReducedMotion()
  const progress = useRef(0.82)
  const interactive = useRef(false)
  const model = useMemo(() => buildTreeModel(graph), [graph])
  const cy = (model.top + 0.3) / 2
  return (
    <Canvas
      frameloop={active ? 'always' : 'never'}
      dpr={[1, compact ? 1.5 : 2]}
      gl={{ antialias: true, alpha: true }}
      camera={{ fov: 36, near: 0.05, far: 80, position: [0, cy + 0.4, (model.top + 2) * 2.1] }}
      onCreated={({ gl, camera }) => { glSetup({ gl }); camera.lookAt(0, cy, 0) }}
      aria-hidden="true"
    >
      <Suspense fallback={null}>
        <SceneContents graph={graph} progress={progress} compact={compact} reducedMotion={reducedMotion} interactive={interactive} story={false} idle={0.25} />
      </Suspense>
    </Canvas>
  )
}
