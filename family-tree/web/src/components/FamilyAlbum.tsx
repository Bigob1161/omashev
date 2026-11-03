import { useMemo } from 'react'
import { fmt, roman, useT } from '../i18n'
import { fileUrl } from '../api/client'
import { type FamilyGraph, portraitOf } from '../lib/graph'
import { chartLayout } from '../lib/view'
import { initials, lifeYears } from '../lib/names'

/** Семейный альбом: фотографии, разложенные по поколениям — от старших к младшим. */
export function FamilyAlbum({ graph, selectedId, onSelect }: { graph: FamilyGraph; selectedId: string | null; onSelect: (id: string) => void }) {
  const t = useT()
  const rows = useMemo(() => {
    const layout = chartLayout(graph)
    const list = Array.from({ length: layout.rows }, () => [] as string[])
    for (const [id, r] of layout.row) list[r]?.push(id)
    // внутри поколения — в том же порядке, что и на схеме
    for (const ids of list) ids.sort((a, b) => layout.pos.get(a)!.x - layout.pos.get(b)!.x)
    return list
  }, [graph])

  return (
    <div className="album-view">
      {rows.map((ids, gen) => {
        const withPhoto = ids.some((id) => portraitOf(graph, id))
        return (
          <section key={gen} className="album-view__gen" aria-labelledby={`album-gen-${gen}`}>
            <header className="album-view__head">
              <span className="album-view__num" aria-hidden="true">{roman(gen + 1)}</span>
              <h2 id={`album-gen-${gen}`}>{fmt(t.tree.generation, { n: roman(gen + 1) })}</h2>
              {!withPhoto && <p className="muted small">{t.tree.albumEmpty}</p>}
            </header>
            <ul className="album-view__row">
              {ids.map((id) => {
                const p = graph.people.get(id)!
                const photo = portraitOf(graph, id)
                return (
                  <li key={id}>
                    <button type="button" className={`album-card${selectedId === id ? ' is-selected' : ''}`} onClick={() => onSelect(id)}>
                      <span className="album-card__frame">
                        {photo ? <img src={fileUrl(photo)} alt="" loading="lazy" decoding="async" /> : <span className="album-card__initials" aria-hidden="true">{initials(p)}</span>}
                      </span>
                      <span className="album-card__plate">
                        <strong>{p.first_name || t.common.noName}</strong>
                        {p.last_name && <span>{p.last_name}</span>}
                        {lifeYears(p, t) && <small>{lifeYears(p, t)}</small>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
