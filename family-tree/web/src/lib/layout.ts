import { type FamilyGraph, childrenOf, parentsOf, spousesOf } from './graph'

export interface LayoutOptions { cardW: number; cardH: number; gapX: number; gapY: number; pad: number }

export interface TreeLayout {
  pos: Map<string, { x: number; y: number }>
  /** Номер ряда (поколения) после сжатия пустых рядов, 0 — старшее поколение. */
  row: Map<string, number>
  rows: number
  width: number
  height: number
  opts: LayoutOptions
}

/**
 * Раскладка «родители над детьми»: поколения считаются по связям родитель → ребёнок,
 * супруги ставятся в один ряд и рядом, дети стараются встать под родителями,
 * а семьи, которые «тянет» в сторону родня супруга, ставятся с краю группы братьев и сестёр.
 */
export function computeLayout(g: FamilyGraph, opts: LayoutOptions): TreeLayout {
  const { cardW: CW, cardH: CH, gapX: GX, gapY: GY, pad: PAD } = opts
  const ids = [...g.people.keys()]
  const gen = new Map(ids.map((id) => [id, 0]))
  const settle = () => {
    for (let i = 0; i <= ids.length; i++) {
      let changed = false
      for (const r of g.relations) {
        const ga = gen.get(r.a)!, gb = gen.get(r.b)!
        if (r.type === 'parent') {
          if (gb < ga + 1) { gen.set(r.b, ga + 1); changed = true }
        } else if (ga !== gb) {
          const m = Math.max(ga, gb)
          gen.set(r.a, m); gen.set(r.b, m); changed = true
        }
      }
      if (!changed) break
    }
  }
  settle()
  // Людей без указанных родителей опускаем поближе к их детям.
  for (let pass = 0; pass < 3; pass++) {
    let moved = false
    for (const id of ids) {
      if (parentsOf(g, id).length || !childrenOf(g, id).length) continue
      const target = Math.min(...childrenOf(g, id).map((c) => gen.get(c)!)) - 1
      if (target <= gen.get(id)!) continue
      if (spousesOf(g, id).some((s) => parentsOf(g, s).length && gen.get(s) !== target)) continue
      gen.set(id, target)
      for (const s of spousesOf(g, id)) if (!parentsOf(g, s).length) gen.set(s, target)
      moved = true
    }
    if (!moved) break
    settle()
  }

  const rowsByGen = new Map<number, string[]>()
  for (const id of ids) {
    const k = gen.get(id)!
    if (!rowsByGen.has(k)) rowsByGen.set(k, [])
    rowsByGen.get(k)!.push(id)
  }
  const gens = [...rowsByGen.keys()].sort((a, b) => a - b)
  const pos = new Map<string, { x: number; y: number }>()
  const rowOf = new Map<string, number>()
  const created = (id: string) => g.people.get(id)!.created_at || ''
  const anchorOf = (id: string) => {
    const xs = parentsOf(g, id).filter((p) => pos.has(p)).map((p) => pos.get(p)!.x + CW / 2)
    return xs.length ? xs.reduce((a, b) => a + b) / xs.length : null
  }

  gens.forEach((k, rowIndex) => {
    const row = rowsByGen.get(k)!
    const key = new Map(row.map((id) => {
      let a = anchorOf(id)
      if (a == null) for (const s of spousesOf(g, id)) { a = anchorOf(s); if (a != null) break }
      return [id, a] as const
    }))
    row.sort((a, b) => {
      const ka = key.get(a)!, kb = key.get(b)!
      if ((ka == null) !== (kb == null)) return ka == null ? 1 : -1
      if (ka != null && kb != null && ka !== kb) return ka - kb
      return created(a).localeCompare(created(b))
    })

    const placed = new Set<string>()
    const units: { ids: string[]; key: number | null; pull: number; order: number }[] = []
    for (const id of row) {
      if (placed.has(id)) continue
      placed.add(id)
      const unit = { ids: [id], key: key.get(id) ?? null, pull: 0, order: units.length }
      let nextRight = true
      for (const s of spousesOf(g, id)) {
        if (placed.has(s) || gen.get(s) !== k) continue
        placed.add(s)
        const own = anchorOf(s), mine = anchorOf(id)
        let left: boolean
        if (own != null && mine != null) { left = own < mine; unit.pull = left ? -1 : 1 }
        else { left = !nextRight; nextRight = !nextRight }
        if (left) unit.ids.unshift(s)
        else unit.ids.push(s)
      }
      units.push(unit)
    }
    units.sort((a, b) => {
      if ((a.key == null) !== (b.key == null)) return a.key == null ? 1 : -1
      if (a.key != null && b.key != null && a.key !== b.key) return a.key - b.key
      return a.pull - b.pull || a.order - b.order
    })

    let cursor: number | null = null
    for (const { ids: unit } of units) {
      const w = unit.length * CW + (unit.length - 1) * GX
      const anchors = unit.map(anchorOf).filter((a): a is number => a != null)
      const desired = anchors.length ? anchors.reduce((a, b) => a + b) / anchors.length - w / 2 : null
      let x: number = desired ?? cursor ?? 0
      if (cursor != null) x = Math.max(x, cursor)
      unit.forEach((id, i) => {
        pos.set(id, { x: x + i * (CW + GX), y: rowIndex * (CH + GY) })
        rowOf.set(id, rowIndex)
      })
      cursor = x + w + GX * 2
    }
  })

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of pos.values()) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y)
  }
  for (const p of pos.values()) { p.x += PAD - minX; p.y += PAD - minY }
  return {
    pos,
    row: rowOf,
    rows: gens.length,
    width: pos.size ? maxX - minX + CW + PAD * 2 : 0,
    height: pos.size ? maxY - minY + CH + PAD * 2 : 0,
    opts,
  }
}
