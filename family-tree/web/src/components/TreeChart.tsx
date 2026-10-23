import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { useT } from '../i18n'
import { type FamilyGraph, findRelation, immediateFamily } from '../lib/graph'
import { CHART, cardPropsFor, chartLayout } from '../lib/view'
import { fullName } from '../lib/names'
import { starPoints } from './Ornament'
import { PersonCard } from './PersonCard'

export interface TreeChartHandle {
  zoom: (factor: number) => void
  fit: () => void
  centerOn: (id: string) => void
  centerRow: (row: number) => void
}

interface Props {
  graph: FamilyGraph
  selectedId: string | null
  meId: string | null
  generation: number | null
  /** Показывать только выбранного человека и его ближайшую семью. */
  nearestOnly?: boolean
  onSelect: (id: string) => void
}

// Положение и масштаб схемы переживают переключение режима и языка.
let savedView: { x: number; y: number; k: number } | null = null

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))

export const TreeChart = forwardRef<TreeChartHandle, Props>(function TreeChart({ graph, selectedId, meId, generation, nearestOnly, onSelect }, ref) {
  const t = useT()
  const viewport = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const view = useRef(savedView ?? { x: 0, y: 0, k: 1 })
  const [compact, setCompact] = useState(view.current.k < 0.55)
  const layout = useMemo(() => chartLayout(graph), [graph])
  const family = useMemo(() => (selectedId ? immediateFamily(graph, selectedId) : null), [graph, selectedId])
  const drag = useRef({ moved: false, start: { x: 0, y: 0 }, pointers: new Map<number, { x: number; y: number }>(), dist: 0 })

  const apply = useCallback((glide = false) => {
    const el = stage.current
    if (!el) return
    const { x, y, k } = view.current
    el.classList.toggle('chart-stage--glide', glide)
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`
    savedView = { ...view.current }
    setCompact(k < 0.55)
    if (glide) setTimeout(() => el.classList.remove('chart-stage--glide'), 450)
  }, [])

  const zoomAt = useCallback((factor: number, cx: number, cy: number) => {
    const v = view.current
    const k = clamp(v.k * factor, 0.18, 2.2)
    const f = k / v.k
    v.x = cx - (cx - v.x) * f
    v.y = cy - (cy - v.y) * f
    v.k = k
    apply()
  }, [apply])

  const fit = useCallback((glide = true) => {
    const el = viewport.current
    if (!el || !layout.width) return
    const k = clamp(Math.min(el.clientWidth / layout.width, el.clientHeight / layout.height), el.clientWidth < 600 ? 0.42 : 0.2, 1)
    view.current = { k, x: (el.clientWidth - layout.width * k) / 2, y: Math.max(0, (el.clientHeight - layout.height * k) / 2) }
    apply(glide)
  }, [apply, layout])

  const centerOnPoint = useCallback((px: number, py: number, minK = 0.8) => {
    const el = viewport.current
    if (!el) return
    const v = view.current
    v.k = Math.max(v.k, minK)
    const panel = window.innerWidth > 900 && selectedId ? Math.min(480, window.innerWidth * 0.42) : 0
    v.x = (el.clientWidth - panel) / 2 - px * v.k
    v.y = el.clientHeight / 2 - py * v.k
    apply(true)
  }, [apply, selectedId])

  useImperativeHandle(ref, () => ({
    zoom: (f) => { const el = viewport.current!; zoomAt(f, el.clientWidth / 2, el.clientHeight / 2) },
    fit: () => fit(true),
    centerOn: (id) => {
      const p = layout.pos.get(id)
      if (p) centerOnPoint(p.x + CHART.cardW / 2, p.y + CHART.cardH / 2)
    },
    centerRow: (row) => {
      const ys = [...layout.row.entries()].filter(([, r]) => r === row).map(([id]) => layout.pos.get(id)!)
      if (!ys.length) return
      const minX = Math.min(...ys.map((p) => p.x)), maxX = Math.max(...ys.map((p) => p.x)) + CHART.cardW
      centerOnPoint((minX + maxX) / 2, ys[0].y + CHART.cardH / 2, 0.55)
    },
  }), [zoomAt, fit, centerOnPoint, layout])

  // Первый показ — вписать древо в экран.
  useEffect(() => {
    if (savedView) apply()
    else fit(false)
  }, [layout.width > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // Перетаскивание, щипок и колесо.
  useEffect(() => {
    const el = viewport.current
    if (!el) return
    const d = drag.current
    const down = (e: PointerEvent) => {
      if ((e.target as HTMLElement).closest('.chart-controls')) return
      if (e.pointerType === 'mouse' && e.button !== 0) return
      d.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      if (d.pointers.size === 1) { d.moved = false; d.start = { x: e.clientX, y: e.clientY } }
      d.dist = 0
    }
    const move = (e: PointerEvent) => {
      const prev = d.pointers.get(e.pointerId)
      if (!prev) return
      const cur = { x: e.clientX, y: e.clientY }
      d.pointers.set(e.pointerId, cur)
      if (d.pointers.size === 1) {
        if (!d.moved && Math.hypot(cur.x - d.start.x, cur.y - d.start.y) > 6) { d.moved = true; el.classList.add('is-dragging') }
        if (d.moved) { view.current.x += cur.x - prev.x; view.current.y += cur.y - prev.y; apply() }
      } else if (d.pointers.size === 2) {
        const [a, b] = [...d.pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        const r = el.getBoundingClientRect()
        if (d.dist) zoomAt(dist / d.dist, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top)
        d.dist = dist
        d.moved = true
      }
    }
    const up = (e: PointerEvent) => {
      d.pointers.delete(e.pointerId)
      if (d.pointers.size < 2) d.dist = 0
      if (!d.pointers.size) el.classList.remove('is-dragging')
    }
    const wheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY))
      if (e.ctrlKey) zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top)
      else if (mouseWheel) zoomAt(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.clientX - r.left, e.clientY - r.top)
      else { view.current.x -= e.deltaX; view.current.y -= e.deltaY; apply() }
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    el.addEventListener('wheel', wheel, { passive: false })
    return () => {
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      el.removeEventListener('wheel', wheel)
    }
  }, [apply, zoomAt])

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return
    const step = 60
    const el = viewport.current!
    const map: Record<string, () => void> = {
      ArrowLeft: () => { view.current.x += step; apply() },
      ArrowRight: () => { view.current.x -= step; apply() },
      ArrowUp: () => { view.current.y += step; apply() },
      ArrowDown: () => { view.current.y -= step; apply() },
      '+': () => zoomAt(1.2, el.clientWidth / 2, el.clientHeight / 2),
      '=': () => zoomAt(1.2, el.clientWidth / 2, el.clientHeight / 2),
      '-': () => zoomAt(1 / 1.2, el.clientWidth / 2, el.clientHeight / 2),
      '0': () => fit(true),
    }
    const fn = map[e.key]
    if (fn) { e.preventDefault(); fn() }
  }

  const { cardW: CW, cardH: CH, gapY: GY } = CHART
  const portraitMid = CH * 0.32

  const lines = useMemo(() => {
    const out: { d: string; key: string; kind: 'kin' | 'spouse'; ids: string[] }[] = []
    const stars: { x: number; y: number; key: string; ids: string[] }[] = []
    for (const r of graph.relations) {
      if (r.type !== 'spouse') continue
      const a = layout.pos.get(r.a), b = layout.pos.get(r.b)
      if (!a || !b || a.y !== b.y) continue
      const [l, rr] = a.x < b.x ? [a, b] : [b, a]
      const y = l.y + portraitMid
      out.push({ d: `M${l.x + CW} ${y - 2}H${rr.x}M${l.x + CW} ${y + 2}H${rr.x}`, key: r.id, kind: 'spouse', ids: [r.a, r.b] })
      stars.push({ x: (l.x + CW + rr.x) / 2, y, key: r.id, ids: [r.a, r.b] })
    }
    for (const [childId, parents] of graph.parents) {
      const c = layout.pos.get(childId)
      if (!c) continue
      const placed = parents.filter((p) => layout.pos.has(p))
      const cx = c.x + CW / 2, top = c.y
      const couple = placed.length === 2 && findRelation(graph, placed[0], placed[1], 'spouse') && layout.pos.get(placed[0])!.y === layout.pos.get(placed[1])!.y
      const origins = couple
        ? [(() => { const [a, b] = placed.map((p) => layout.pos.get(p)!); const [l, rr] = a.x < b.x ? [a, b] : [b, a]; return { x: (l.x + CW + rr.x) / 2, y: l.y + portraitMid + 6 } })()]
        : placed.map((p) => ({ x: layout.pos.get(p)!.x + CW / 2, y: layout.pos.get(p)!.y + CH }))
      for (const o of origins) {
        const bus = top - GY / 2
        const dx = cx - o.x
        const r = Math.min(12, Math.abs(dx) / 2)
        const sx = Math.sign(dx)
        const d = Math.abs(dx) < 1
          ? `M${o.x} ${o.y}V${top}`
          : `M${o.x} ${o.y}V${bus - r}Q${o.x} ${bus} ${o.x + sx * r} ${bus}H${cx - sx * r}Q${cx} ${bus} ${cx} ${bus + r}V${top}`
        out.push({ d, key: `${childId}-${o.x}`, kind: 'kin', ids: [childId, ...placed] })
      }
    }
    return { paths: out, stars }
  }, [graph, layout, CW, CH, GY, portraitMid])

  const dimmed = (ids: string[]) => {
    if (family) return !ids.every((id) => family.has(id))
    if (generation != null) return !ids.some((id) => layout.row.get(id) === generation)
    return false
  }

  return (
    <div
      ref={viewport}
      className="chart-viewport"
      tabIndex={0}
      role="application"
      aria-label={t.tree.keyboardHint}
      onKeyDown={onKeyDown}
    >
      <div ref={stage} className="chart-stage" style={{ width: layout.width, height: layout.height }}>
        <svg className="chart-lines" width={layout.width} height={layout.height} aria-hidden="true">
          {lines.paths.map((l) => <path key={l.key} d={l.d} className={`chart-line chart-line--${l.kind}${dimmed(l.ids) ? (nearestOnly ? ' is-hidden' : ' is-dim') : ''}`} />)}
          {lines.stars.map((s) => <polygon key={s.key} points={starPoints(s.x, s.y, 7, 0.62)} className={`chart-star${dimmed(s.ids) ? (nearestOnly ? ' is-hidden' : ' is-dim') : ''}`} />)}
        </svg>
        {[...graph.people.values()].map((p) => {
          const pos = layout.pos.get(p.id)!
          const row = layout.row.get(p.id)
          const state = p.id === selectedId ? 'selected'
            : family ? (family.has(p.id) ? 'family' : nearestOnly ? 'hidden' : 'dim')
            : generation != null && row !== generation ? 'dim' : 'normal'
          return (
            <PersonCard
              key={p.id}
              {...cardPropsFor(p, graph, meId, t)}
              variant="chart"
              compact={compact}
              state={state}
              ariaLabel={fullName(p, t)}
              style={{ left: pos.x, top: pos.y, width: CW, height: CH }}
              onClick={() => { if (!drag.current.moved) onSelect(p.id) }}
            />
          )
        })}
      </div>
    </div>
  )
})
