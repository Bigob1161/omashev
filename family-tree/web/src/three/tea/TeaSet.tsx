import { type MutableRefObject, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { TeaState } from './state'
import { ceramicTextures, lidTexture, rippleTexture, softDot, streamTexture } from './textures'
import { taperedTube } from './treeModel'

/*
  Чайник (чойнак) и пиала из геометрии вращения с росписью «пахта»,
  струя чая, поверхность с рябью, пар и брызги. Всё ведётся состоянием прокрутки.
  Пиала стоит в начале координат — из неё потом вырастает ствол.
*/

const V2 = (x: number, y: number) => new THREE.Vector2(x, y)

/** Плавный профиль через опорные точки. */
function profile(points: THREE.Vector2[], n: number) {
  return new THREE.SplineCurve(points).getPoints(n)
}

// Корпус чайника «Пахта»: грушевидное тело на белой ножке, сужение к горловине.
const BODY = [V2(0, 0), V2(0.2, 0), V2(0.215, 0.012), V2(0.205, 0.045), V2(0.25, 0.07), V2(0.38, 0.15), V2(0.465, 0.26), V2(0.49, 0.35), V2(0.47, 0.44), V2(0.41, 0.52), V2(0.335, 0.575), V2(0.29, 0.6), V2(0.278, 0.625), V2(0.285, 0.64)]
// Крышка: кобальтовый купол.
// Порядок точек — от края к верху: так поверхность смотрит наружу (иначе крышка «просвечивает»).
const LID = [V2(0.292, 0.648), V2(0.276, 0.672), V2(0.255, 0.71), V2(0.205, 0.77), V2(0.135, 0.815), V2(0.06, 0.838), V2(0.0, 0.843)]
// Пиала: глубокая, округлая; снаружи от ножки к краю, затем внутри от края ко дну — край на середине развёртки.
const PIALA_OUT = [V2(0, 0), V2(0.11, 0), V2(0.125, 0.012), V2(0.118, 0.034), V2(0.15, 0.04), V2(0.235, 0.085), V2(0.295, 0.15), V2(0.328, 0.215), V2(0.34, 0.272)]
const PIALA_IN = [V2(0.33, 0.276), V2(0.318, 0.22), V2(0.282, 0.145), V2(0.205, 0.088), V2(0.11, 0.066), V2(0.0, 0.062)]
// Блюдце под чайником.
const SAUCER = [V2(0, 0.0), V2(0.3, 0.0), V2(0.32, 0.012), V2(0.31, 0.03), V2(0.55, 0.045), V2(0.74, 0.075), V2(0.8, 0.1), V2(0.79, 0.108), V2(0.7, 0.085), V2(0.5, 0.058), V2(0.0, 0.05)]
const INNER = profile(PIALA_IN, 30)

/** Радиус внутренней стенки пиалы на высоте y (для диска чая). */
function innerRadius(y: number) {
  for (let i = 0; i < INNER.length - 1; i++) {
    const a = INNER[i], b = INNER[i + 1]
    if ((y <= a.y && y >= b.y) || (y >= a.y && y <= b.y)) {
      const t = (y - a.y) / (b.y - a.y || 1)
      return THREE.MathUtils.lerp(a.x, b.x, t)
    }
  }
  return 0.1
}
const LIQUID_MIN = 0.075, LIQUID_MAX = 0.25

// Длинный белый носик S-образной формы из нижней части корпуса.
const SPOUT = new THREE.CatmullRomCurve3([new THREE.Vector3(0.36, 0.17, 0), new THREE.Vector3(0.58, 0.21, 0), new THREE.Vector3(0.74, 0.36, 0), new THREE.Vector3(0.84, 0.56, 0), new THREE.Vector3(0.97, 0.66, 0)])
// Белая ручка-«ушко» с завитком сверху.
const HANDLE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.4, 0.52, 0), new THREE.Vector3(-0.52, 0.6, 0), new THREE.Vector3(-0.66, 0.6, 0),
  new THREE.Vector3(-0.75, 0.5, 0), new THREE.Vector3(-0.76, 0.36, 0), new THREE.Vector3(-0.69, 0.22, 0),
  new THREE.Vector3(-0.56, 0.14, 0), new THREE.Vector3(-0.44, 0.13, 0),
])
const HANDLE_CURL = new THREE.Vector3(-0.6, 0.64, 0)
/** Белый воротник-оборка вокруг горловины: расширяется кверху, верхний край — фестоны. */
function collarGeometry(segments: number) {
  const rows = 6
  const pos: number[] = [], uv: number[] = [], idx: number[] = []
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2
    const scallop = Math.pow(Math.abs(Math.sin(a * 9)), 0.6) // 18 округлых зубцов
    for (let j = 0; j <= rows; j++) {
      const t = j / rows
      const r = 0.278 + t * (0.05 + 0.012 * scallop)
      const y = 0.6 + t * (0.05 + 0.03 * scallop)
      pos.push(Math.cos(a) * r, y, Math.sin(a) * r)
      uv.push(i / segments, t)
    }
  }
  for (let i = 0; i < segments; i++) for (let j = 0; j < rows; j++) {
    const a = i * (rows + 1) + j, b = (i + 1) * (rows + 1) + j
    idx.push(a, b, a + 1, b, b + 1, a + 1)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  return g
}
const SPOUT_TIP = SPOUT.getPoint(1)
const SPOUT_DIR = SPOUT.getTangent(1)

export const TEAPOT_REST = new THREE.Vector3(-1.42, 0.055, -0.18)
const SAUCER_POS = new THREE.Vector3(-1.42, 0, -0.18)

interface Props {
  state: MutableRefObject<TeaState>
  compact: boolean
  reducedMotion: boolean
}

export function TeaSet({ state, compact, reducedMotion }: Props) {
  const teapot = useRef<THREE.Group>(null!)
  const set = useRef<THREE.Group>(null!)
  const liquid = useRef<THREE.Mesh>(null!)

  const mats = useMemo(() => {
    const body = ceramicTextures('teapot', compact ? 1024 : 2048)
    const bowl = ceramicTextures('piala', compact ? 1024 : 2048)
    const plate = ceramicTextures('saucer', compact ? 1024 : 2048)
    const Ceramic = compact ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial
    const glaze = (extra: THREE.MeshPhysicalMaterialParameters) =>
      new Ceramic({ roughness: 0.18, metalness: 0, ...(compact ? {} : { clearcoat: 1, clearcoatRoughness: 0.06 }), envMapIntensity: 1.2, ...extra })
    return {
      body: glaze({ map: body.map, bumpMap: body.bump, bumpScale: 1.6 }),
      bowl: glaze({ map: bowl.map, bumpMap: bowl.bump, bumpScale: 1.4, side: THREE.DoubleSide }),
      saucer: glaze({ map: plate.map, bumpMap: plate.bump, bumpScale: 1.2, side: THREE.DoubleSide }),
      lid: glaze({ map: lidTexture() }),
      white: glaze({ color: '#f7f6f2', side: THREE.DoubleSide }),
      tea: new THREE.MeshPhysicalMaterial({
        color: '#6e2c0a', roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.04,
        emissive: '#d88a2a', emissiveIntensity: 0, bumpMap: rippleTexture(), bumpScale: 0.4,
      }),
    }
  }, [compact])

  const geo = useMemo(() => {
    const seg = compact ? 48 : 96
    const body = new THREE.LatheGeometry(profile(BODY, 70), seg)
    const lid = new THREE.LatheGeometry(profile(LID, 18), seg)
    const piala = new THREE.LatheGeometry([...profile(PIALA_OUT, 40), ...profile(PIALA_IN, 40)], seg)
    const saucer = new THREE.LatheGeometry(profile(SAUCER, 50), seg)
    const spout = taperedTube(SPOUT, 0.075, 0.032, 48, compact ? 12 : 20)
    const handle = taperedTube(HANDLE, 0.036, 0.034, 60, compact ? 10 : 16)
    const collar = collarGeometry(compact ? 144 : 288)
    const disc = new THREE.CircleGeometry(1, 64).rotateX(-Math.PI / 2)
    return { body, lid, piala, saucer, spout, handle, collar, disc }
  }, [compact])

  // Струя: 18 коротких цилиндров вдоль кривой от носика до пиалы.
  const STREAM_SEG = 18
  const stream = useRef<THREE.InstancedMesh>(null!)
  const streamMat = useMemo(() => {
    const map = streamTexture().clone()
    map.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map, emissive: '#8a4210', emissiveIntensity: 0.45, roughness: 0.1, metalness: 0, transparent: true, opacity: 0.94 })
  }, [])
  const cyl = useMemo(() => new THREE.CylinderGeometry(1, 1, 1, 10, 1, true), [])
  const curve = useMemo(() => new THREE.QuadraticBezierCurve3(new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()), [])
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), d: new THREE.Vector3(), o: new THREE.Object3D(), up: new THREE.Vector3(0, 1, 0) }), [])

  // Пар и брызги.
  const steam = useMemo(() => Array.from({ length: compact ? 6 : 12 }, (_, i) => ({ seed: i * 0.37, bowl: i % 3 === 2 })), [compact])
  const steamRefs = useRef<(THREE.Sprite | null)[]>([])
  const steamMats = useMemo(() => steam.map(() => new THREE.SpriteMaterial({ map: softDot(), color: '#f5f1e8', transparent: true, opacity: 0, depthWrite: false })), [steam])
  const splashGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3))
    return g
  }, [])
  const splashMat = useMemo(() => new THREE.PointsMaterial({ map: softDot(), color: '#f2b25c', size: 0.035, transparent: true, depthWrite: false, opacity: 0 }), [])

  useFrame(({ clock }, delta) => {
    const s = state.current
    const time = reducedMotion ? 0 : clock.elapsedTime

    // Поза чайника: приподнять, придвинуть к пиале, наклонить носиком вниз.
    const tp = teapot.current
    tp.position.set(TEAPOT_REST.x + 0.16 * s.lift, TEAPOT_REST.y + 0.46 * s.lift, TEAPOT_REST.z + 0.1 * s.lift)
    tp.rotation.set(0, 0.12, -0.64 * s.tilt + (reducedMotion ? 0 : Math.sin(time * 0.6) * 0.012 * (1 - s.lift)))
    tp.updateMatrixWorld()

    // Сцена посуды отступает, когда древо выросло, и исчезает при переходе к схеме.
    const fade = 1 - s.morph
    set.current.visible = fade > 0.01
    set.current.scale.setScalar(1 - 0.15 * s.mature)
    const fading = fade < 0.999
    for (const m of Object.values(mats)) {
      m.opacity = fade
      if (m.transparent !== fading) { m.transparent = fading; m.needsUpdate = true }
    }

    // Чай в пиале.
    const level = THREE.MathUtils.lerp(LIQUID_MIN, LIQUID_MAX, s.fill)
    const r = innerRadius(level) * 0.995
    liquid.current.visible = s.fill > 0.01 && fade > 0.01
    liquid.current.position.y = level
    liquid.current.scale.set(r, 1, r)
    const pouring = s.streamHead > 0.02 && s.streamTail < 0.98
    const rip = rippleTexture()
    rip.rotation = time * 0.05
    rip.center.set(0.5, 0.5)
    const pulse = 1 + 0.06 * Math.sin(time * 6)
    rip.repeat.set(pulse, pulse)
    mats.tea.bumpScale = pouring ? 0.9 : 0.25
    mats.tea.emissiveIntensity = s.glow * 1.6 * fade
    mats.tea.color.set(s.glow > 0 ? '#7a3510' : '#6e2c0a').lerp(new THREE.Color('#b8741e'), s.glow * 0.6)

    // Струя: от кончика носика по дуге в центр пиалы.
    const tip = tmp.a.copy(SPOUT_TIP).applyMatrix4(tp.matrixWorld)
    const dir = tmp.d.copy(SPOUT_DIR).transformDirection(tp.matrixWorld)
    curve.v0.copy(tip)
    curve.v1.copy(tip).addScaledVector(dir, 0.14)
    curve.v2.set(0.02, level, 0.02)
    const head = s.streamHead, tail = s.streamTail
    const visible = pouring && fade > 0.01
    stream.current.visible = visible
    if (visible) {
      for (let i = 0; i < STREAM_SEG; i++) {
        const t0 = tail + ((head - tail) * i) / STREAM_SEG
        const t1 = tail + ((head - tail) * (i + 1)) / STREAM_SEG
        curve.getPoint(t0, tmp.a)
        curve.getPoint(t1, tmp.b)
        tmp.d.subVectors(tmp.b, tmp.a)
        const len = tmp.d.length()
        const o = tmp.o
        if (len < 1e-5) o.scale.setScalar(0)
        else {
          o.position.addVectors(tmp.a, tmp.b).multiplyScalar(0.5)
          o.quaternion.setFromUnitVectors(tmp.up, tmp.d.divideScalar(len))
          const rad = THREE.MathUtils.lerp(0.02, 0.013, (t0 + t1) / 2)
          o.scale.set(rad, len * 1.05, rad)
        }
        o.updateMatrix()
        stream.current.setMatrixAt(i, o.matrix)
      }
      stream.current.instanceMatrix.needsUpdate = true
      streamMat.map!.offset.y -= delta * 2.4
    }

    // Брызги в точке падения.
    const arr = splashGeo.attributes.position.array as Float32Array
    for (let i = 0; i < 24; i++) {
      const ph = (time * 2.2 + i * 0.137) % 1
      const a = i * 2.39
      arr[i * 3] = 0.02 + Math.cos(a) * ph * 0.09
      arr[i * 3 + 1] = level + Math.sin(ph * Math.PI) * 0.06
      arr[i * 3 + 2] = 0.02 + Math.sin(a) * ph * 0.09
    }
    splashGeo.attributes.position.needsUpdate = true
    splashMat.opacity = visible && head > 0.95 ? 0.75 : 0

    // Пар: из-под крышки, пока чайник не налил чай, и над пиалой, пока чай не засветился.
    steam.forEach((st, i) => {
      const sp = steamRefs.current[i]
      if (!sp) return
      const cycle = reducedMotion ? 0.5 : (time * 0.12 + st.seed) % 1
      const from = st.bowl ? tmp.b.set(0, LIQUID_MAX, 0) : tmp.b.set(0, 0.9, 0).applyMatrix4(tp.matrixWorld)
      sp.position.set(from.x + Math.sin(cycle * 6 + i) * 0.06 * cycle, from.y + cycle * 0.75, from.z + Math.cos(cycle * 5 + i) * 0.05 * cycle)
      sp.scale.setScalar(0.12 + cycle * 0.38)
      const strength = st.bowl ? s.fill * (1 - s.glow) : 1 - s.lift
      sp.material.opacity = Math.sin(cycle * Math.PI) * 0.11 * strength * fade
    })
  })

  return (
    <group ref={set}>
      <group ref={teapot}>
        <mesh geometry={geo.body} material={mats.body} castShadow />
        <mesh geometry={geo.collar} material={mats.white} />
        <mesh geometry={geo.lid} material={mats.lid} />
        {/* фигурная белая шишечка: основание, петля и три шарика */}
        <mesh position={[0, 0.855, 0]} material={mats.white}><sphereGeometry args={[0.038, 24, 16]} /></mesh>
        <mesh position={[0, 0.93, 0]} material={mats.white}><torusGeometry args={[0.048, 0.016, 12, 32]} /></mesh>
        {[[0, 0.995], [-0.045, 0.975], [0.045, 0.975]].map(([x, y], i) => (
          <mesh key={i} position={[x, y, 0]} material={mats.white}><sphereGeometry args={[0.022, 16, 12]} /></mesh>
        ))}
        <mesh geometry={geo.spout} material={mats.white} />
        <mesh geometry={geo.handle} material={mats.white} />
        <mesh position={HANDLE_CURL} material={mats.white}><sphereGeometry args={[0.04, 20, 16]} /></mesh>
      </group>
      <mesh geometry={geo.saucer} material={mats.saucer} position={SAUCER_POS} castShadow />
      <mesh geometry={geo.piala} material={mats.bowl} castShadow />
      <mesh ref={liquid} geometry={geo.disc} material={mats.tea} />
      <instancedMesh ref={stream} args={[cyl, streamMat, 18]} frustumCulled={false} visible={false} />
      <points geometry={splashGeo} material={splashMat} frustumCulled={false} />
      {steam.map((_, i) => (
        <sprite key={i} ref={(el) => { steamRefs.current[i] = el }} material={steamMats[i]} />
      ))}
    </group>
  )
}
