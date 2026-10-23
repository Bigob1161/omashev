import { useEffect, useMemo, useState } from 'react'
import { READ_ONLY } from '../lib/mode'
import { fileUrl } from '../api/client'
import { fmt, useLocale, useT } from '../i18n'
import { fullName } from '../lib/names'
import { useFamily } from '../store/family'
import { GirihPattern } from '../components/Ornament'
import { IconDocument, IconQuote } from '../components/Icons'
import { Journal, Timeline } from './HistoryPage'

type Filter = 'all' | 'photos' | 'documents' | 'memories'
type Tab = 'materials' | 'timeline' | 'journal'

interface Item { id: string; kind: Filter; personId: string; at: string; url?: string; text: string; pdf?: boolean }

/** Семейный архив: материалы (фото, документы, воспоминания), лента поколений и журнал правок. */
export function ArchivePage() {
  const t = useT()
  const locale = useLocale()
  const { graph, auth, select, requireAuth } = useFamily()
  const [filter, setFilter] = useState<Filter>('all')
  const [tab, setTab] = useState<Tab>('materials')
  useEffect(() => { if (auth === 'locked') requireAuth(() => {}) }, [auth, requireAuth])

  const items = useMemo<Item[]>(() => {
    const list: Item[] = [
      ...graph.allPhotos.map((p) => ({
        id: p.id, kind: (p.kind === 'document' ? 'documents' : 'photos') as Filter, personId: p.person_id, at: p.created_at,
        url: fileUrl(p), text: p.caption, pdf: p.file.endsWith('.pdf'),
      })),
      ...graph.allMemories.map((m) => ({ id: m.id, kind: 'memories' as Filter, personId: m.person_id, at: m.created_at, text: m.text })),
    ]
    return list.filter((i) => graph.people.has(i.personId)).sort((a, b) => b.at.localeCompare(a.at))
  }, [graph])
  const shown = filter === 'all' ? items : items.filter((i) => i.kind === filter)
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' })
  const filters: Filter[] = ['all', 'photos', 'documents', 'memories']

  return (
    <main id="main" className="page theme-app">
      <div className="page__bg" aria-hidden="true"><GirihPattern opacity={0.22} scale={110} /></div>
      <header className="page__head">
        <h1 className="display">{t.nav.archive}</h1>
        <p className="lead">{t.archive.intro}</p>
      </header>
      <div className="archive-tabs" role="tablist" aria-label={t.nav.archive}>
        {(READ_ONLY ? ['materials', 'timeline'] as Tab[] : ['materials', 'timeline', 'journal'] as Tab[]).map((k) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'is-active' : ''} onClick={() => setTab(k)}>
            {k === 'materials' ? t.archive.tabMaterials : k === 'timeline' ? t.archive.tabTimeline : t.archive.tabJournal}
          </button>
        ))}
        {auth === 'open' && !READ_ONLY && (
          <a className="link-btn archive-export" href="/api/export" download="nasl-family.json" title={t.archive.exportHint}>{t.archive.export}</a>
        )}
      </div>
      {tab === 'timeline' && <section className="page__section"><Timeline /></section>}
      {tab === 'journal' && <section className="page__section"><Journal /></section>}
      {tab === 'materials' && <>
      <div className="segmented archive-filter" role="group" aria-label={t.archive.title}>
        {filters.map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} className={filter === f ? 'is-active' : ''} onClick={() => setFilter(f)}>
            {t.archive[f]}
          </button>
        ))}
      </div>
      {shown.length ? (
        <ul className="archive-grid">
          {shown.map((i) => {
            const person = graph.people.get(i.personId)!
            return (
              <li key={i.id} className={`archive-item archive-item--${i.kind}`}>
                <button type="button" onClick={() => select(i.personId)}>
                  {i.kind === 'memories' ? (
                    <span className="archive-item__memory"><IconQuote /><span>{i.text}</span></span>
                  ) : i.pdf ? (
                    <span className="archive-item__doc"><IconDocument /><span>PDF</span></span>
                  ) : (
                    <img src={i.url} alt={i.text} loading="lazy" width="320" height="320" />
                  )}
                  <span className="archive-item__meta">
                    {i.kind !== 'memories' && i.text && <span className="archive-item__caption">{i.text}</span>}
                    <span>{fmt(t.archive.of, { name: fullName(person, t) })}</span>
                    <span className="muted">{date.format(new Date(i.at))}</span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      ) : <p className="page__empty muted">{t.archive.empty}</p>}
      </>}
    </main>
  )
}
