import { type MutableRefObject, type ReactNode, Suspense, useEffect, useMemo, useRef } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useIsCompact, useReducedMotion } from '../../lib/device'
import { type Env, PLACES, emptyEnv, frameEnv, gradeFilter } from './epochs'
import { BibiKhanym, GurEmir, MADRASAH, Madrasah, Observatory } from './architecture'
import { canopyTexture, caravanTexture, cloudTexture, pavingTexture, rng, softDot } from './textures'

/* ---------------- Состояние, ведомое прокруткой ---------------- */

function useEnv(progress: MutableRefObject<number>, reducedMotion: boolean) {
  const env = useRef<Env>(emptyEnv())
  const smoothed = useRef(progress.current)
  useFrame((_, delta) => {
    smoothed.current = reducedMotion ? progress.current : THREE.MathUtils.damp(smoothed.current, progress.current, 3.2, delta)
    frameEnv(smoothed.current, env.current)
  }, -3)
  return env
}

/* ---------------- Небо, звёзды, облака, пыль ---------------- */

const skyVertex = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`
const skyFragment = /* glsl */ `
uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunColor; uniform float sunGlow;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -0.2, 1.0);
  vec3 c = mix(horizon, top, pow(max(h, 0.0), 0.55));
  float s = max(dot(normalize(vDir), normalize(sunDir)), 0.0);
  c += sunColor * (pow(s, 600.0) * 2.5 + pow(s, 12.0) * 0.35) * sunGlow;
  gl_FragColor = vec4(c, 1.0);
  #include <colorspace_fragment>
}`

function Sky({ env }: { env: MutableRefObject<Env> }) {
  const mesh = useRef<THREE.Mesh>(null!)
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: skyVertex, fragmentShader: skyFragment, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() }, sunGlow: { value: 1 } },
  }), [])
  const { camera } = useThree()
  useFrame(() => {
    const e = env.current
    mat.uniforms.top.value.setRGB(...e.skyTop, THREE.SRGBColorSpace)
    mat.uniforms.horizon.value.setRGB(...e.skyHorizon, THREE.SRGBColorSpace)
    mat.uniforms.sunDir.value.set(...e.sun)
    mat.uniforms.sunColor.value.setRGB(...e.sunColor, THREE.SRGBColorSpace)
    mat.uniforms.sunGlow.value = 1 - e.stars * 0.7
    mesh.current.position.copy(camera.position)
  })
  return (
    <mesh ref={mesh} material={mat} renderOrder={-10} frustumCulled={false}>
      <sphereGeometry args={[480, 32, 16]} />
    </mesh>
  )
}

function Stars({ env, count }: { env: MutableRefObject<Env>; count: number }) {
  const pts = useRef<THREE.Points>(null!)
  const { geo, mat } = useMemo(() => {
    const r = rng(77)
    const pos = new Float32Array(count * 3)
    const size = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      const u = r() * Math.PI * 2, v = Math.acos(1 - r() * 0.95)
      pos.set([Math.sin(v) * Math.cos(u) * 400, Math.cos(v) * 400, Math.sin(v) * Math.sin(u) * 400], i * 3)
      size[i] = r()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({ map: softDot(), color: '#e8eeff', size: 2.6, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending })
    return { geo, mat }
  }, [count])
  const { camera } = useThree()
  useFrame(() => {
    mat.opacity = env.current.stars
    pts.current.visible = mat.opacity > 0.01
    pts.current.position.copy(camera.position)
  })
  return <points ref={pts} geometry={geo} material={mat} frustumCulled={false} />
}

function Clouds({ env, count, reducedMotion }: { env: MutableRefObject<Env>; count: number; reducedMotion: boolean }) {
  const group = useRef<THREE.Group>(null!)
  const items = useMemo(() => {
    const r = rng(5)
    return Array.from({ length: count }, () => {
      const mat = new THREE.SpriteMaterial({ map: cloudTexture(), transparent: true, depthWrite: false, opacity: 0, color: '#ffffff', fog: false })
      return { mat, x: (r() - 0.5) * 520, y: 55 + r() * 45, z: -60 - r() * 240, s: 70 + r() * 90, speed: 0.6 + r() * 1.2 }
    })
  }, [count])
  useFrame((_, delta) => {
    const e = env.current
    group.current.children.forEach((c, i) => {
      const it = items[i]
      if (!reducedMotion) it.x += it.speed * delta
      if (it.x > 280) it.x = -280
      c.position.set(it.x, it.y, it.z)
      it.mat.opacity = e.clouds * 0.5
      it.mat.color.setRGB(...e.skyHorizon, THREE.SRGBColorSpace).lerp(new THREE.Color('#ffffff'), 0.55)
    })
  })
  return (
    <group ref={group}>
      {items.map((it, i) => <sprite key={i} material={it.mat} scale={[it.s, it.s * 0.45, 1]} />)}
    </group>
  )
}

/** Пылинки в лучах солнца вокруг текущей точки взгляда. */
function Dust({ env, count, reducedMotion }: { env: MutableRefObject<Env>; count: number; reducedMotion: boolean }) {
  const pts = useRef<THREE.Points>(null!)
  const { geo, mat } = useMemo(() => {
    const r = rng(13)
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) pos.set([(r() - 0.5) * 40, r() * 14, (r() - 0.5) * 40], i * 3)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const mat = new THREE.PointsMaterial({ map: softDot(), color: '#ffe2a8', size: 0.14, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending })
    return { geo, mat }
  }, [count])
  useFrame(({ clock }) => {
    const e = env.current
    pts.current.position.set(e.at[0], 0, e.at[2])
    if (!reducedMotion) pts.current.rotation.y = clock.elapsedTime * 0.012
    mat.opacity = 0.5 * (1 - e.gray * 0.6) * (0.4 + e.sunIntensity / 6)
    mat.color.setRGB(...e.sunColor, THREE.SRGBColorSpace)
  })
  return <points ref={pts} geometry={geo} material={mat} />
}

/* ---------------- Свет и туман ---------------- */

function Lighting({ env, compact }: { env: MutableRefObject<Env>; compact: boolean }) {
  const sun = useRef<THREE.DirectionalLight>(null!)
  const hemi = useRef<THREE.HemisphereLight>(null!)
  const { scene } = useThree()
  const fog = useMemo(() => new THREE.Fog('#ffffff', 30, 150), [])
  useEffect(() => {
    scene.fog = fog
    scene.add(sun.current.target)
    return () => { scene.fog = null }
  }, [scene, fog])
  useFrame(() => {
    const e = env.current
    fog.color.setRGB(...e.fog, THREE.SRGBColorSpace)
    fog.near = e.fogNear
    fog.far = e.fogFar
    const l = sun.current
    l.target.position.set(e.at[0], 0, e.at[2])
    l.position.set(e.at[0] + e.sun[0] * 60, e.sun[1] * 60, e.at[2] + e.sun[2] * 60)
    l.intensity = e.sunIntensity
    l.color.setRGB(...e.sunColor, THREE.SRGBColorSpace)
    hemi.current.intensity = e.ambient
    hemi.current.color.setRGB(...e.skyTop, THREE.SRGBColorSpace).lerp(new THREE.Color('#ffffff'), 0.45)
  })
  return (
    <>
      <hemisphereLight ref={hemi} args={['#cfe0ff', '#b99a6c', 0.8]} />
      <directionalLight
        ref={sun}
        castShadow={!compact}
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
        shadow-camera-left={-34}
        shadow-camera-right={34}
        shadow-camera-top={34}
        shadow-camera-bottom={-34}
        shadow-camera-near={1}
        shadow-camera-far={160}
      />
    </>
  )
}

/* ---------------- Камера: ключи эпох, лёгкий дрейф и отклик на курсор ---------------- */

function JourneyCamera({ env, reducedMotion }: { env: MutableRefObject<Env>; reducedMotion: boolean }) {
  const { camera, size } = useThree()
  const pointer = useRef({ x: 0, y: 0 })
  const damped = useRef({ x: 0, y: 0 })
  const look = useMemo(() => new THREE.Vector3(), [])
  const back = useMemo(() => new THREE.Vector3(), [])
  useEffect(() => {
    const on = (e: PointerEvent) => { pointer.current = { x: (e.clientX / innerWidth) * 2 - 1, y: (e.clientY / innerHeight) * 2 - 1 } }
    window.addEventListener('pointermove', on, { passive: true })
    return () => window.removeEventListener('pointermove', on)
  }, [])
  const aspect = size.width / size.height
  useFrame(({ clock }, delta) => {
    const e = env.current
    camera.position.set(...e.cam)
    look.set(...e.at)
    // узкий экран: отодвинуть камеру, чтобы ансамбль поместился по ширине
    if (aspect < 1.1) {
      back.subVectors(camera.position, look).multiplyScalar(Math.min(0.9, (1.1 - aspect) * 1.25))
      camera.position.add(back)
    }
    // на широком экране первый кадр сдвигаем, чтобы заголовок не лёг на порталы
    const hero = Math.max(0, 1 - e.pos * 1.6)
    if (aspect > 1.3) { camera.position.x -= 3.5 * hero; look.x -= 3.5 * hero }
    if (!reducedMotion) {
      damped.current.x = THREE.MathUtils.damp(damped.current.x, pointer.current.x, 2.2, delta)
      damped.current.y = THREE.MathUtils.damp(damped.current.y, pointer.current.y, 2.2, delta)
      const tt = clock.elapsedTime
      camera.position.x += Math.sin(tt * 0.11) * 0.6 + damped.current.x * 1.1
      camera.position.y += Math.sin(tt * 0.17) * 0.18 - damped.current.y * 0.45
      look.x += damped.current.x * 0.3
    }
    camera.lookAt(look)
  }, -1)
  return null
}

/** Цветокоррекция эпохи — CSS-фильтр на самом холсте (сепия, ч/б), без лишнего прохода рендера. */
function Grade({ env }: { env: MutableRefObject<Env> }) {
  const { gl } = useThree()
  const last = useRef('')
  useFrame(() => {
    const f = gradeFilter(env.current)
    if (f !== last.current) {
      gl.domElement.style.filter = f
      last.current = f
    }
  })
  return null
}

/* ---------------- Места ---------------- */

function Ground({ compact }: { compact: boolean }) {
  const sand = useMemo(() => new THREE.MeshStandardMaterial({ color: '#c6aa7e', roughness: 1 }), [])
  const paving = useMemo(() => new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.92 }), [])
  return (
    <>
      <mesh rotation-x={-Math.PI / 2} material={sand} receiveShadow position={[0, -0.02, -30]}>
        <planeGeometry args={[900, 900, 1, 1]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} material={paving} receiveShadow={!compact}>
        <planeGeometry args={[46, 50]} />
      </mesh>
    </>
  )
}

/** Регистан: Улугбек — запад, Шердор — восток, Тилля-Кари — север; камера смотрит с юга. */
function Registan({ compact }: { compact: boolean }) {
  const off = 8.4
  return (
    <group position={PLACES.registan}>
      <group position={[-off, 0, 0]} rotation-y={Math.PI / 2}><Madrasah variant="ulugbek" compact={compact} /></group>
      <group position={[off, 0, 0]} rotation-y={-Math.PI / 2}><Madrasah variant="sherdor" compact={compact} /></group>
      <group position={[0, 0, -MADRASAH.ulugbek.width / 2 - 4]}><Madrasah variant="tillakori" compact={compact} /></group>
    </group>
  )
}

/** Низкая глинобитная застройка вокруг монументов — инстансами, чтобы было дёшево. */
function Houses({ count, seed, radius, avoid }: { count: number; seed: number; radius: number; avoid: number }) {
  const mesh = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    const r = rng(seed)
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3()
    const c = new THREE.Color()
    for (let i = 0; i < count; i++) {
      let x = 0, z = 0
      do { x = (r() - 0.5) * radius * 2; z = (r() - 0.5) * radius * 2 } while (Math.hypot(x, z) < avoid)
      const w = 1.6 + r() * 2.4, h = 0.9 + r() * 1.4, d = 1.6 + r() * 2.4
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (r() - 0.5) * 0.3)
      m.compose(p.set(x, h / 2, z), q, s.set(w, h, d))
      mesh.current.setMatrixAt(i, m)
      mesh.current.setColorAt(i, c.setHSL(0.09 + r() * 0.02, 0.32, 0.6 + r() * 0.12))
    }
    mesh.current.instanceMatrix.needsUpdate = true
    if (mesh.current.instanceColor) mesh.current.instanceColor.needsUpdate = true
  }, [count, seed, radius, avoid])
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, count]} castShadow receiveShadow>
      <boxGeometry />
      <meshStandardMaterial roughness={1} />
    </instancedMesh>
  )
}

/** Торговые ряды с полосатыми навесами и караваны на дороге (условная реконструкция). */
function Bazaar({ reducedMotion, compact }: { reducedMotion: boolean; compact: boolean }) {
  const caravans = useRef<THREE.Group>(null!)
  const stalls = useMemo(() => {
    const r = rng(41)
    // два ряда лавок вдоль улицы, ведущей к мечети; середина свободна для взгляда
    const n = compact ? 6 : 10
    return Array.from({ length: n * 2 }, (_, i) => {
      const side = i < n ? -1 : 1
      return {
        x: side * (8.5 + r() * 0.6), z: -2 + (i % n) * 4.2, rot: side * -Math.PI / 2 + (r() - 0.5) * 0.12,
        mat: new THREE.MeshStandardMaterial({ map: canopyTexture(i), side: THREE.DoubleSide, roughness: 0.9 }),
      }
    })
  }, [compact])
  const camel = useMemo(() => new THREE.SpriteMaterial({ map: caravanTexture(), transparent: true, alphaTest: 0.3 }), [])
  useFrame(({ clock }) => {
    if (reducedMotion) return
    caravans.current.children.forEach((c, i) => {
      c.position.x = ((clock.elapsedTime * 0.9 + i * 7.5) % 70) - 35
    })
  })
  return (
    <group>
      {stalls.map((s, i) => (
        <group key={i} position={[s.x, 0, s.z]} rotation-y={s.rot}>
          <mesh position={[0, 2.1, 0]} rotation-x={-Math.PI / 2 + 0.25} material={s.mat} castShadow>
            <planeGeometry args={[3.8, 2.6]} />
          </mesh>
          {[-1.75, 1.75].map((dx) => (
            <mesh key={dx} position={[dx, 1, 1.3]}>
              <cylinderGeometry args={[0.06, 0.06, 2, 6]} />
              <meshStandardMaterial color="#5b3a1e" />
            </mesh>
          ))}
          <mesh position={[0, 0.4, -0.6]} castShadow>
            <boxGeometry args={[3.4, 0.8, 1.1]} />
            <meshStandardMaterial color="#9a7444" roughness={1} />
          </mesh>
        </group>
      ))}
      <group ref={caravans} position={[0, 1.1, 26]}>
        {[0, 1, 2, 3, 4].map((i) => <sprite key={i} material={camel} scale={[4.4, 2.2, 1]} position={[i * 7.5 - 35, 0, 0]} />)}
      </group>
    </group>
  )
}

function TimuridCity({ compact, reducedMotion }: { compact: boolean; reducedMotion: boolean }) {
  return (
    <group position={PLACES.timurid}>
      <group position={[2, 0, -10]}><BibiKhanym compact={compact} /></group>
      <group position={[-20, 0, -4]}><GurEmir compact={compact} /></group>
      <Bazaar compact={compact} reducedMotion={reducedMotion} />
      <Houses count={compact ? 70 : 160} seed={3} radius={60} avoid={22} />
    </group>
  )
}

/** Армиллярная сфера — медленно вращающиеся кольца рядом с обсерваторией. */
function Armillary({ reducedMotion }: { reducedMotion: boolean }) {
  const g = useRef<THREE.Group>(null!)
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d4a64a', metalness: 0.85, roughness: 0.3, emissive: '#4a3208', emissiveIntensity: 0.4 }), [])
  useFrame((_, d) => { if (!reducedMotion) g.current.rotation.y += d * 0.12 })
  return (
    <group position={[11, 3.6, 7]}>
      <group ref={g}>
        <mesh material={mat}><torusGeometry args={[1.6, 0.05, 8, 64]} /></mesh>
        <mesh material={mat} rotation-x={Math.PI / 2}><torusGeometry args={[1.6, 0.05, 8, 64]} /></mesh>
        <mesh material={mat} rotation-z={0.41}><torusGeometry args={[1.35, 0.04, 8, 64]} /></mesh>
      </group>
      <mesh position={[0, -1.8, 0]} material={mat}><cylinderGeometry args={[0.08, 0.35, 1.6, 12]} /></mesh>
    </group>
  )
}

function ObservatoryHill({ compact, reducedMotion }: { compact: boolean; reducedMotion: boolean }) {
  return (
    <group position={PLACES.observatory}>
      <mesh position={[0, 1, 0]} receiveShadow>
        <cylinderGeometry args={[16, 30, 2, 48]} />
        <meshStandardMaterial color="#b49a70" roughness={1} />
      </mesh>
      <group position={[0, 2, 0]}>
        <Observatory compact={compact} />
        <Armillary reducedMotion={reducedMotion} />
      </group>
    </group>
  )
}

/** Место рисуется, только пока камера смотрит рядом с ним: дальние ансамбли не мелькают в чужих кадрах. */
function Near({ env, place, radius = 90, children }: { env: MutableRefObject<Env>; place: keyof typeof PLACES; radius?: number; children: ReactNode }) {
  const g = useRef<THREE.Group>(null!)
  useFrame(() => {
    const [x, , z] = PLACES[place]
    g.current.visible = Math.hypot(env.current.at[0] - x, env.current.at[2] - z) < radius
  })
  return <group ref={g}>{children}</group>
}

/* ---------------- Холст ---------------- */

function World({ progress, compact, reducedMotion }: { progress: MutableRefObject<number>; compact: boolean; reducedMotion: boolean }) {
  const env = useEnv(progress, reducedMotion)
  return (
    <>
      <JourneyCamera env={env} reducedMotion={reducedMotion} />
      <Grade env={env} />
      <Lighting env={env} compact={compact} />
      <Sky env={env} />
      <Stars env={env} count={compact ? 600 : 1500} />
      <Clouds env={env} count={compact ? 8 : 16} reducedMotion={reducedMotion} />
      <Dust env={env} count={compact ? 150 : 420} reducedMotion={reducedMotion} />
      <Ground compact={compact} />
      <Near env={env} place="registan"><Registan compact={compact} /></Near>
      <Near env={env} place="timurid"><TimuridCity compact={compact} reducedMotion={reducedMotion} /></Near>
      <Near env={env} place="observatory"><ObservatoryHill compact={compact} reducedMotion={reducedMotion} /></Near>
    </>
  )
}

export default function JourneyScene({ progress, active, onReady }: { progress: MutableRefObject<number>; active: boolean; onReady?: () => void }) {
  const compact = useIsCompact()
  const reducedMotion = useReducedMotion()
  return (
    <Canvas
      className="journey-canvas"
      frameloop={active ? 'always' : 'never'}
      shadows={!compact}
      dpr={compact ? [1, 1.5] : [1, 1.75]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 42, near: 0.5, far: 1200, position: [0, 3.4, 30] }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping
        gl.toneMappingExposure = 1
        onReady?.()
      }}
      aria-hidden="true"
    >
      <Suspense fallback={null}>
        <World progress={progress} compact={compact} reducedMotion={reducedMotion} />
      </Suspense>
    </Canvas>
  )
}
