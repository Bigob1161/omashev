import { useEffect, useMemo, useState } from 'react'
import { api } from '../api/client'
import type { HistoryEntry, Person } from '../api/types'
import { fmt, useLocale, useT } from '../i18n'
import { yearOf } from '../lib/names'
import { cardPropsFor } from '../lib/view'
import { reload, useFamily } from '../store/family'
import { attempt, toast } from '../store/ui'
import { PersonCard } from '../components/PersonCard'

/** Лента поколений: люди по десятилетиям рождения (вкладка семейного архива). */
export function Timeline() {
  const t = useT()
  const { graph, meId, select } = useFamily()
  const decades = useMemo(() => {
    const map = new Map<string, Person[]>()
    for (const p of graph.people.values()) {
      const y = yearOf(p.birth_date)
      const key = y ? String(Math.floor(Number(y) / 10) * 10) : ''
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(p)
    }
    return [...map.entries()].sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : Number(a) - Number(b)))
  }, [graph])

  if (!graph.people.size) return <p className="muted">{t.history.empty}</p>
  return (
    <ol className="timeline">
      {decades.map(([decade, people]) => (
        <li key={decade || 'unknown'} className="timeline__decade">
          <h3 className="timeline__label">{decade ? fmt(t.history.decade, { d: decade }) : t.history.unknownYear}</h3>
          <div className="timeline__cards">
            {people.sort((a, b) => yearOf(a.birth_date).localeCompare(yearOf(b.birth_date))).map((p) => (
              <PersonCard key={p.id} {...cardPropsFor(p, graph, meId, t)} onClick={() => select(p.id)} />
            ))}
          </div>
        </li>
      ))}
    </ol>
  )
}

/** Журнал всех правок с отменой (вкладка семейного архива). */
export function Journal() {
  const t = useT()
  const locale = useLocale()
  const { graph, auth } = useFamily()
  const [journal, setJournal] = useState<HistoryEntry[] | null>(null)
  const loadJournal = () => api.history().then(setJournal).catch((e) => toast(e.message, 'error'))
  useEffect(() => { if (auth === 'open') loadJournal() }, [auth, graph])

  const revert = async (entry: HistoryEntry) => {
    if (await attempt(() => api.revert(entry.id)) === undefined) return
    await reload()
    await loadJournal()
    toast(t.toast.reverted)
  }
  const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })

  return (
    <>
      <p className="muted">{t.history.journalHint}</p>
      {journal?.length ? (
        <ol className="journal">
          {journal.map((e) => (
            <li key={e.id} className={`journal__item${e.reverted_by ? ' is-reverted' : ''}`}>
              <div className="journal__meta">
                <time dateTime={e.at}>{date.format(new Date(e.at))}</time>
                <span>{e.who || t.history.someone}</span>
              </div>
              <p className="journal__text">{e.summary}</p>
              {e.reverted_by ? <span className="tag">{t.history.undone}</span>
                : e.action !== 'revert' && <button type="button" className="link-btn" onClick={() => revert(e)}>{t.history.undo}</button>}
            </li>
          ))}
        </ol>
      ) : journal ? <p className="muted">{t.history.empty}</p> : <p className="muted">{t.common.loading}</p>}
    </>
  )
}
