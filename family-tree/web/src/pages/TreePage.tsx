import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { READ_ONLY } from '../lib/mode'
import { fmt, roman, useT } from '../i18n'
import { useFamily } from '../store/family'
import { useUi } from '../store/ui'
import { storage } from '../lib/storage'
import { hasWebGL } from '../lib/device'
import { fullName, lifeYears, matches } from '../lib/names'
import { chartLayout } from '../lib/view'
import { childrenOf, parentsOf } from '../lib/graph'
import { toast } from '../store/ui'
import { TreeChart, type TreeChartHandle } from '../components/TreeChart'
import { AddPersonDialog } from '../components/AddPersonDialog'
import { IconChevronDown, IconChevronUp, IconCube, IconFit, IconMinus, IconPlus, IconSearch, IconTree } from '../components/Icons'
import { GirihPattern } from '../components/Ornament'

const ArtScene = lazy(() => import('../three/tea/TeaScenes').then((m) => ({ default: m.ArtScene })))

type Mode = 'practical' | 'art'

export function TreePage() {
  const t = useT()
  const { graph, auth, loaded, selectedId, select, meId, requireAuth } = useFamily()
  const webgl = useMemo(() => hasWebGL(), [])
  const [mode, setMode] = useState<Mode>(() => (storage.get('treeMode') === 'art' && webgl ? 'art' : 'practical'))
  const [query, setQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [generation, setGeneration] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [nearest, setNearest] = useState(false)
  // Последний выбранный человек остаётся «в фокусе» и после закрытия карточки.
  const [focusId, setFocusId] = useState<string | null>(null)
  useEffect(() => { if (selectedId) setFocusId(selectedId) }, [selectedId])
  useEffect(() => { if (focusId && !graph.people.has(focusId)) setFocusId(null) }, [graph, focusId])
  const current = selectedId ?? focusId
  const chart = useRef<TreeChartHandle>(null)
  const art = useRef<{ reset: () => void } | null>(null)
  const layout = useMemo(() => chartLayout(graph), [graph])
  const results = useMemo(() => (query.trim() ? [...graph.people.values()].filter((p) => matches(p, query)).slice(0, 8) : []), [graph, query])

  useEffect(() => { if (auth === 'locked') requireAuth(() => {}) }, [auth, requireAuth])
  useEffect(() => { storage.set('treeMode', mode) }, [mode])
  // Кнопка «Создать древо» в шапке открывает форму нового человека.
  const createPending = useUi((s) => s.createPending)
  useEffect(() => {
    if (createPending && auth === 'open' && useUi.getState().takeCreate()) setAdding(true)
  }, [createPending, auth])
  // Переход сюда из карточки («Показать на схеме») — центрируем выбранного.
  useEffect(() => {
    if (selectedId && mode === 'practical') setTimeout(() => chart.current?.centerOn(selectedId), 60)
  }, [selectedId, mode])

  const pick = (id: string) => {
    setQuery('')
    setSearchOpen(false)
    select(id)
    if (mode === 'practical') chart.current?.centerOn(id)
  }
  const goGeneration = (g: number | null) => {
    setGeneration(g)
    if (g != null && mode === 'practical') chart.current?.centerRow(g)
    if (g == null) chart.current?.fit()
  }

  // Переход к родителям или детям выбранного человека (по очереди, если их несколько).
  const step = (dir: 'up' | 'down') => {
    if (!current) { toast(t.tree.selectFirst); return }
    const list = dir === 'up' ? parentsOf(graph, current) : childrenOf(graph, current)
    if (!list.length) { toast(t.person.nobody); return }
    pick(list[0])
  }
  const resetView = () => {
    setGeneration(null)
    setNearest(false)
    setFocusId(null)
    if (mode === 'practical') chart.current?.fit()
    else art.current?.reset()
  }

  const empty = loaded && graph.people.size === 0

  return (
    <main id="main" className="tree-page theme-app">
      <div className="tree-page__bg" aria-hidden="true"><GirihPattern opacity={0.5} scale={96} /></div>

      <div className="tree-toolbar">
        <div className="tree-toolbar__title">
          <h1>{t.tree.title}</h1>
        </div>
        <div className="segmented" role="group" aria-label={t.tree.modeLabel}>
          <button type="button" aria-pressed={mode === 'practical'} className={mode === 'practical' ? 'is-active' : ''} onClick={() => setMode('practical')}><IconTree />{t.tree.modePractical}</button>
          <button type="button" aria-pressed={mode === 'art'} className={mode === 'art' ? 'is-active' : ''} onClick={() => setMode('art')} disabled={!webgl} title={webgl ? undefined : t.tree.noWebgl}><IconCube />{t.tree.modeArt}</button>
        </div>
        <div className="tree-search">
          <IconSearch />
          <input
            className="input"
            type="search"
            aria-label={t.tree.searchLabel}
            placeholder={t.tree.search}
            autoComplete="off"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSearchOpen(true) }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results[0]) pick(results[0].id) }}
          />
          {searchOpen && query.trim() && (
            <ul className="tree-search__results">
              {results.length ? results.map((p) => (
                <li key={p.id}>
                  <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => pick(p.id)}>
                    <span>{fullName(p, t)}</span><span className="muted">{lifeYears(p, t)}</span>
                  </button>
                </li>
              )) : <li className="muted small">{t.tree.nothingFound}</li>}
            </ul>
          )}
        </div>
        {!READ_ONLY && <button className="btn btn--primary btn--small" type="button" onClick={() => requireAuth(() => setAdding(true))}><IconPlus />{t.tree.addPerson}</button>}
      </div>

      {!empty && loaded && (
        <div className="selection-bar" role="toolbar" aria-label={t.tree.modeLabel}>
          <button type="button" className="chip" onClick={() => step('up')}>↑ {t.tree.toParents}</button>
          <button type="button" className="chip" onClick={() => step('down')}>↓ {t.tree.toChildren}</button>
          {mode === 'practical' && (
            <>
              <button type="button" className="chip" onClick={() => (current ? chart.current?.centerOn(current) : toast(t.tree.selectFirst))}>{t.tree.centerSelected}</button>
              <button type="button" className={`chip${nearest ? ' is-active' : ''}`} aria-pressed={nearest} onClick={() => (current ? setNearest((v) => !v) : toast(t.tree.selectFirst))}>{t.tree.nearestFamily}</button>
            </>
          )}
          <button type="button" className="chip" onClick={resetView}>{t.tree.reset}</button>
        </div>
      )}

      {layout.rows > 1 && mode === 'practical' && (
        <nav className="generation-bar" aria-label={t.tree.generationsLabel}>
          <button type="button" className={`chip${generation == null ? ' is-active' : ''}`} aria-pressed={generation == null} onClick={() => goGeneration(null)}>{t.tree.allGenerations}</button>
          {Array.from({ length: layout.rows }, (_, i) => (
            <button key={i} type="button" className={`chip${generation === i ? ' is-active' : ''}`} aria-pressed={generation === i} onClick={() => goGeneration(i)} title={fmt(t.tree.generation, { n: roman(i + 1) })}>
              {roman(i + 1)}
            </button>
          ))}
          <span className="generation-bar__step">
            <button type="button" className="icon-btn" aria-label={t.tree.prevGeneration} disabled={generation === 0} onClick={() => goGeneration(Math.max(0, (generation ?? 1) - 1))}><IconChevronUp /></button>
            <button type="button" className="icon-btn" aria-label={t.tree.nextGeneration} disabled={generation === layout.rows - 1} onClick={() => goGeneration(Math.min(layout.rows - 1, (generation ?? -1) + 1))}><IconChevronDown /></button>
          </span>
        </nav>
      )}

      <section className="tree-stage" aria-label={mode === 'art' ? t.tree.modeArt : t.tree.modePractical}>
        {empty ? (
          <div className="tree-empty">
            <h2>{t.tree.emptyTitle}</h2>
            <p>{t.tree.emptyText}</p>
            {!READ_ONLY && <button className="btn btn--primary" type="button" onClick={() => setAdding(true)}>{t.tree.emptyCta}</button>}
          </div>
        ) : !loaded ? (
          <p className="tree-loading">{t.common.loading}</p>
        ) : mode === 'practical' ? (
          <>
            <TreeChart ref={chart} graph={graph} selectedId={selectedId ?? (nearest ? focusId : null)} meId={meId} generation={generation} nearestOnly={nearest && !!current} onSelect={select} />
            <div className="chart-controls">
              <button type="button" className="icon-btn" aria-label={t.tree.zoomIn} onClick={() => chart.current?.zoom(1.25)}><IconPlus /></button>
              <button type="button" className="icon-btn" aria-label={t.tree.zoomOut} onClick={() => chart.current?.zoom(0.8)}><IconMinus /></button>
              <button type="button" className="icon-btn" aria-label={t.tree.fit} onClick={() => chart.current?.fit()}><IconFit /></button>
            </div>
            <p className="tree-hint">{t.tree.keyboardHint}</p>
          </>
        ) : (
          <div className="art-stage">
            <Suspense fallback={<p className="tree-loading">{t.common.loading}</p>}>
              <ArtScene graph={graph} onSelect={select} selectedId={selectedId} controlsRef={art} />
            </Suspense>
            <p className="tree-hint">{t.tree.artHint}</p>
          </div>
        )}
      </section>

      {adding && (
        <AddPersonDialog
          mode="new"
          onClose={() => setAdding(false)}
          onCreated={(id) => { select(id); setTimeout(() => chart.current?.centerOn(id), 120) }}
        />
      )}
    </main>
  )
}
