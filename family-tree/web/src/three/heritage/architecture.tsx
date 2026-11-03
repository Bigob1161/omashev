import { useMemo } from 'react'
import * as THREE from 'three'
import {
  COLORS, PORTAL_ARCH, type MadrasahVariant, brickTexture, domeTexture, drumTexture, facadeTexture,
  minaretTexture, nicheBackTexture, nicheTexture, portalTexture,
} from './textures'

/*
  Архитектура Регистана и Самарканда эпохи Тимуридов из простых тел.
  Единица сцены ≈ 5 м. Пропорции условные, но узнаваемые:
  портал-пештак со стрельчатой нишей, угловые минареты, рёбристые бирюзовые купола на барабанах.
*/

const invisible = new THREE.MeshBasicMaterial({ visible: false })

function glaze(map: THREE.Texture, extra: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({ map, roughness: 0.55, metalness: 0.02, ...extra })
}

/** Контур стрельчатой арки в мировых координатах (низ проёма — y = 0). */
function archShape(x0: number, w: number, h: number, spring = 0.62) {
  const s = new THREE.Shape()
  s.moveTo(x0, 0)
  s.lineTo(x0, h * spring)
  s.bezierCurveTo(x0, h * spring + w * 0.32, x0 + w * 0.32, h * 0.95, x0 + w / 2, h)
  s.bezierCurveTo(x0 + w * 0.68, h * 0.95, x0 + w, h * spring + w * 0.32, x0 + w, h * spring)
  s.lineTo(x0 + w, 0)
  s.closePath()
  return s
}

/* ---------------- Портал (пештак) ---------------- */

export function Portal({ width, height, depth, variant, compact }: { width: number; height: number; depth: number; variant: MadrasahVariant; compact: boolean }) {
  const { box, boxMats, niche, nicheMats, front } = useMemo(() => {
    const brick = glaze(brickTexture([2, 3]))
    const box = new THREE.BoxGeometry(width, height, depth)
    box.translate(0, height / 2, depth / 2)
    // лицевая грань коробки скрыта: её место занимает плоскость с прорезанной аркой
    const boxMats = [brick, brick, brick, brick, invisible, brick]
    const aw = PORTAL_ARCH.w * width
    const ah = PORTAL_ARCH.h * height
    const shape = archShape(-aw / 2, aw, ah)
    const niche = new THREE.ExtrudeGeometry(shape, { depth: depth * 0.94, bevelEnabled: false, curveSegments: compact ? 10 : 24 })
    niche.translate(0, 0, depth * 0.04)
    // нормализуем развёртку задней стены ниши под одну текстуру с дверью
    const caps = niche.groups[0]
    const uv = niche.attributes.uv as THREE.BufferAttribute
    const pos = niche.attributes.position as THREE.BufferAttribute
    for (let i = caps.start; i < caps.start + caps.count; i++) uv.setXY(i, (pos.getX(i) + aw / 2) / aw, pos.getY(i) / ah)
    uv.needsUpdate = true
    // «вывернутая» экструзия: изнутри видны задняя стена и стенки ниши, лицевая крышка отсекается
    const nicheMats = [
      new THREE.MeshStandardMaterial({ map: nicheBackTexture(), side: THREE.BackSide, roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: nicheTexture(), side: THREE.BackSide, roughness: 0.6 }),
    ]
    const front = new THREE.MeshStandardMaterial({ map: portalTexture(variant, width / height), alphaTest: 0.5, roughness: 0.45 })
    return { box, boxMats, niche, nicheMats, front }
  }, [width, height, depth, variant, compact])

  return (
    <group>
      <mesh geometry={box} material={boxMats} castShadow receiveShadow />
      <mesh geometry={niche} material={nicheMats} receiveShadow />
      <mesh position={[0, height / 2, depth + 0.004]} material={front} receiveShadow>
        <planeGeometry args={[width, height]} />
      </mesh>
    </group>
  )
}

/* ---------------- Купол на барабане ---------------- */

/** Рёбристый купол: геометрия вращения + радиальные рёбра (у Гур-Эмира их 64). */
export function Dome({ radius, height, drum, ribs = 32, ribDepth = 0.05, melon = false, compact }: {
  radius: number; height: number; drum: number; ribs?: number; ribDepth?: number; melon?: boolean; compact: boolean
}) {
  const { dome, drumGeo, domeMat, drumMat } = useMemo(() => {
    const pts: THREE.Vector2[] = []
    const n = 40
    for (let i = 0; i <= n; i++) {
      const t = i / n
      // «дынный» профиль чуть шире барабана внизу, острый кончик сверху
      const bulge = melon ? 1.12 : 1.04
      const r = radius * (t < 0.35 ? THREE.MathUtils.lerp(1, bulge, Math.sin((t / 0.35) * Math.PI / 2)) : bulge * Math.cos(((t - 0.35) / 0.65) * Math.PI / 2) ** 0.9)
      pts.push(new THREE.Vector2(Math.max(0.001, r), t * height))
    }
    const dome = new THREE.LatheGeometry(pts, compact ? 64 : 128)
    const p = dome.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i)
      const a = Math.atan2(z, x)
      const k = 1 + ribDepth * Math.abs(Math.cos((a * ribs) / 2)) * Math.sin(Math.min(1, y / height) * Math.PI * 0.95)
      p.setXYZ(i, x * k, y, z * k)
    }
    dome.computeVertexNormals()
    dome.translate(0, drum, 0)
    const drumGeo = new THREE.CylinderGeometry(radius * 0.98, radius * 1.02, drum, compact ? 32 : 64, 1, true)
    drumGeo.translate(0, drum / 2, 0)
    const domeMat = glaze(domeTexture(ribs), { roughness: 0.28, metalness: 0.05 })
    const drumMat = glaze(drumTexture(), { side: THREE.DoubleSide })
    return { dome, drumGeo, domeMat, drumMat }
  }, [radius, height, drum, ribs, ribDepth, melon, compact])
  return (
    <group>
      <mesh geometry={drumGeo} material={drumMat} castShadow receiveShadow />
      <mesh geometry={dome} material={domeMat} castShadow />
      <mesh position={[0, drum + height + 0.18, 0]}>
        <cylinderGeometry args={[0.02, 0.05, 0.4, 8]} />
        <meshStandardMaterial color={COLORS.ochre} metalness={0.8} roughness={0.3} />
      </mesh>
    </group>
  )
}

/* ---------------- Минарет ---------------- */

export function Minaret({ height, radius, compact }: { height: number; radius: number; compact: boolean }) {
  const { shaft, mat, cap } = useMemo(() => {
    const shaft = new THREE.CylinderGeometry(radius * 0.78, radius, height, compact ? 16 : 32)
    shaft.translate(0, height / 2, 0)
    const mat = glaze(minaretTexture())
    const cap = glaze(drumTexture())
    return { shaft, mat, cap }
  }, [height, radius, compact])
  return (
    <group>
      <mesh geometry={shaft} material={mat} castShadow receiveShadow />
      {/* фонарь-галерея наверху */}
      <mesh position={[0, height + 0.18, 0]} material={cap} castShadow>
        <cylinderGeometry args={[radius * 1.05, radius * 0.85, 0.36, compact ? 16 : 32]} />
      </mesh>
      <mesh position={[0, height + 0.42, 0]}>
        <cylinderGeometry args={[radius * 0.95, radius * 1.05, 0.12, compact ? 16 : 32]} />
        <meshStandardMaterial color={COLORS.brickDark} roughness={0.8} />
      </mesh>
    </group>
  )
}

/* ---------------- Медресе ---------------- */

interface MadrasahSpec { width: number; height: number; depth: number; portal: [number, number, number]; minaret: [number, number]; domes: { x: number; z: number; r: number; h: number; drum: number; ribs: number }[] }

export const MADRASAH: Record<MadrasahVariant, MadrasahSpec> = {
  ulugbek: { width: 11.5, height: 3.6, depth: 8, portal: [5.2, 7, 0.8], minaret: [6.8, 0.5], domes: [{ x: -3.6, z: -6.4, r: 0.9, h: 1.2, drum: 0.7, ribs: 0 }, { x: 3.6, z: -6.4, r: 0.9, h: 1.2, drum: 0.7, ribs: 0 }] },
  sherdor: { width: 11.5, height: 3.6, depth: 8, portal: [5.4, 7.2, 0.8], minaret: [6.4, 0.5], domes: [{ x: -3.9, z: -1.9, r: 1.3, h: 2.3, drum: 1.6, ribs: 40 }, { x: 3.9, z: -1.9, r: 1.3, h: 2.3, drum: 1.6, ribs: 40 }] },
  tillakori: { width: 24, height: 3.3, depth: 9, portal: [5, 6.2, 0.7], minaret: [4.2, 0.45], domes: [{ x: -8.6, z: -4.2, r: 2.1, h: 3, drum: 2.2, ribs: 36 }] },
}

export function Madrasah({ variant, compact }: { variant: MadrasahVariant; compact: boolean }) {
  const s = MADRASAH[variant]
  const { body, mats } = useMemo(() => {
    const body = new THREE.BoxGeometry(s.width, s.height, s.depth)
    body.translate(0, s.height / 2, -s.depth / 2)
    const brick = glaze(brickTexture([4, 2]))
    const top = glaze(brickTexture([6, 4]), { color: '#bfa27a' })
    const facade = glaze(facadeTexture(variant, s.width / s.height))
    // боковые стены тоже с аркадой ниш — их видно с площади
    const side = glaze(facadeTexture(variant, s.depth / s.height))
    return { body, mats: [side, side, top, brick, facade, brick] }
  }, [s, variant])
  return (
    <group>
      <mesh geometry={body} material={mats} castShadow receiveShadow />
      <Portal width={s.portal[0]} height={s.portal[1]} depth={s.portal[2]} variant={variant} compact={compact} />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * (s.width / 2 - 0.1), 0, -0.25]}>
          <Minaret height={s.minaret[0]} radius={s.minaret[1]} compact={compact} />
        </group>
      ))}
      {s.domes.map((d, i) => (
        <group key={i} position={[d.x, s.height, d.z]}>
          <Dome radius={d.r} height={d.h} drum={d.drum} ribs={d.ribs || 12} ribDepth={d.ribs ? 0.05 : 0} compact={compact} />
        </group>
      ))}
    </group>
  )
}

/* ---------------- Самарканд эпохи Тимуридов (условная реконструкция) ---------------- */

/** Мечеть Биби-Ханым: огромный портал, большой купол и мощные минареты. */
export function BibiKhanym({ compact }: { compact: boolean }) {
  const body = useMemo(() => {
    const g = new THREE.BoxGeometry(14, 5, 10)
    g.translate(0, 2.5, -5)
    return g
  }, [])
  const mat = useMemo(() => glaze(brickTexture([5, 2])), [])
  return (
    <group>
      <mesh geometry={body} material={mat} castShadow receiveShadow />
      <Portal width={8} height={9.5} depth={1.4} variant="ulugbek" compact={compact} />
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 4.6, 0, 0.6]}>
          <Minaret height={10} radius={0.85} compact={compact} />
        </group>
      ))}
      <group position={[0, 5, -5.5]}>
        <Dome radius={3.1} height={4.2} drum={2.6} ribs={24} ribDepth={0.02} compact={compact} />
      </group>
    </group>
  )
}

/** Мавзолей Гур-Эмир: восьмигранное основание, высокий барабан и «дынный» купол с 64 рёбрами. */
export function GurEmir({ compact }: { compact: boolean }) {
  const { base, mat } = useMemo(() => {
    const base = new THREE.CylinderGeometry(2.5, 2.6, 3.2, 8)
    base.translate(0, 1.6, 0)
    return { base, mat: glaze(brickTexture([3, 1])) }
  }, [])
  return (
    <group>
      <mesh geometry={base} material={mat} castShadow receiveShadow />
      <group position={[0, 3.2, 0]}>
        <Dome radius={2} height={3.6} drum={3} ribs={64} ribDepth={0.09} melon compact={compact} />
      </group>
    </group>
  )
}

/* ---------------- Обсерватория Улугбека (условная реконструкция) ---------------- */

/** Секстант Фахри — огромная дуга в траншее по меридиану, и круглое трёхъярусное здание вокруг. */
export function Observatory({ compact }: { compact: boolean }) {
  const { arc, arcMat, ring, ringMat } = useMemo(() => {
    // дуга радиусом ~40 м (8 единиц), уходит под землю — как сохранившаяся часть инструмента
    const curve = new THREE.EllipseCurve(0, 0, 8, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI / 3, false, 0)
    const pts = curve.getPoints(80).map((p) => new THREE.Vector3(0, p.y + 7.2, p.x))
    const path = new THREE.CatmullRomCurve3(pts)
    const arc = new THREE.TubeGeometry(path, 120, 0.22, compact ? 6 : 12, false)
    const arcMat = new THREE.MeshStandardMaterial({ color: '#e8dcc2', roughness: 0.35, metalness: 0.05, emissive: '#3a2a10', emissiveIntensity: 0.25 })
    const ring = new THREE.CylinderGeometry(7, 7.2, 3.6, compact ? 32 : 64, 1, true)
    ring.translate(0, 1.8, 0)
    const ringMat = glaze(facadeTexture('ulugbek', 7), { side: THREE.DoubleSide })
    return { arc, arcMat, ring, ringMat }
  }, [compact])
  return (
    <group>
      <mesh geometry={ring} material={ringMat} receiveShadow castShadow />
      <mesh geometry={arc} material={arcMat} castShadow />
    </group>
  )
}
