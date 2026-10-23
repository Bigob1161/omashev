import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { READ_ONLY } from '../../lib/mode'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { fileUrl } from '../../api/client'
import { fmt, useLang, useT } from '../../i18n'
import { buildGraph } from '../../lib/graph'
import { demoFamily } from '../../data/demoFamily'
import { hasWebGL, useReducedMotion } from '../../lib/device'
import { chartLayout } from '../../lib/view'
import { useFamily } from '../../store/family'
import { useRouter } from '../../store/router'
import { ArchPortrait, ARCH_PATH, GirihPattern, OrnamentRule, Star, starPoints } from '../../components/Ornament'
import { PersonCard } from '../../components/PersonCard'
import { IconCamera, IconDocument, IconQuote, IconShare } from '../../components/Icons'
import { TreeIllustration } from './Illustrations'

gsap.registerPlugin(ScrollTrigger)

const FinaleScene = lazy(() => import('../../three/tea/TeaScenes').then((m) => ({ default: m.FinaleScene })))

/** Плавное появление элементов секции при прокрутке (кроме режима уменьшенного движения). */
function useReveal(root: React.RefObject<HTMLElement | null>, selector = '.reveal') {
  const reduced = useReducedMotion()
  useLayoutEffect(() => {
    if (reduced || !root.current) return
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>(selector).forEach((el, i) => {
        gsap.from(el, {
          y: 36, opacity: 0, duration: 1, ease: 'power3.out', delay: (i % 4) * 0.08,
          scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' },
        })
      })
    }, root)
    return () => ctx.revert()
  }, [reduced, root, selector])
}

/* ---------- История начинается с нас ---------- */

export function Heritage() {
  const t = useT()
  const root = useRef<HTMLElement>(null)
  const { graph, auth } = useFamily()
  useReveal(root)
  const photos = auth === 'open' ? graph.allPhotos.filter((p) => p.kind === 'photo').slice(-5).reverse() : []
  const frames = Array.from({ length: 5 }, (_, i) => photos[i])
  const stats = auth === 'open' && graph.people.size
    ? fmt(t.heritage.stats, { people: graph.people.size, photos: graph.allPhotos.length, generations: chartLayout(graph).rows })
    : null
  return (
    <section ref={root} className="section heritage">
      <div className="section__inner heritage__grid">
        <div className="heritage__text">
          <p className="eyebrow reveal">{t.heritage.eyebrow}</p>
          <h2 className="display reveal">{t.heritage.title}</h2>
          <p className="lead reveal">{t.heritage.text}</p>
          {stats && <p className="heritage__stats reveal">{stats}</p>}
        </div>
        <div className="heritage__mosaic">
          {frames.map((ph, i) => (
            <figure key={i} className={`mosaic-frame mosaic-frame--${i} reveal`}>
              <ArchPortrait src={ph ? fileUrl(ph) : undefined} alt={ph?.caption ?? ''} initials="" tone="paper" />
              {!ph && i === 0 && <figcaption>{t.heritage.emptyFrame}</figcaption>}
              {ph?.caption && <figcaption>{ph.caption}</figcaption>}
            </figure>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ---------- Поколения, объединённые временем ---------- */

export function Generations() {
  const t = useT()
  const root = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  useReveal(root)
  // Предки сходятся к одному человеку: 8 → 4 → 2 → 1. Это схема, а не чьи-то данные.
  const cols = [8, 4, 2, 1]
  const W = 1000, H = 520, x0 = 90, dx = (W - 180) / 3
  const nodes = cols.map((n, c) => Array.from({ length: n }, (_, i) => ({ x: x0 + c * dx, y: H / 2 + (i - (n - 1) / 2) * (H / 8.6) })))
  const links: string[] = []
  for (let c = 0; c < cols.length - 1; c++) {
    nodes[c].forEach((a, i) => {
      const b = nodes[c + 1][Math.floor(i / 2)]
      const mx = (a.x + b.x) / 2
      links.push(`M${a.x + 22} ${a.y}C${mx} ${a.y} ${mx} ${b.y} ${b.x - 22} ${b.y}`)
    })
  }

  useLayoutEffect(() => {
    if (!root.current) return
    const ctx = gsap.context(() => {
      const paths = gsap.utils.toArray<SVGPathElement>('.gen-link')
      paths.forEach((p) => {
        const len = p.getTotalLength()
        p.style.strokeDasharray = `${len}`
        p.style.strokeDashoffset = reduced ? '0' : `${len}`
      })
      if (reduced) return
      // Линии родства прорисовываются вслед за прокруткой и стираются при обратной.
      gsap.to(paths, {
        strokeDashoffset: 0, ease: 'none', stagger: 0.02,
        scrollTrigger: { trigger: '.gen-figure', start: 'top 80%', end: 'bottom 45%', scrub: 0.6 },
      })
      gsap.from('.gen-node', {
        scale: 0, transformOrigin: 'center', opacity: 0, ease: 'back.out(1.6)', stagger: 0.03,
        scrollTrigger: { trigger: '.gen-figure', start: 'top 80%', end: 'center 50%', scrub: 0.6 },
      })
    }, root)
    return () => ctx.revert()
  }, [reduced])

  return (
    <section ref={root} className="section generations">
      <div className="section__inner">
        <header className="section__head">
          <p className="eyebrow reveal">{t.generations.eyebrow}</p>
          <h2 className="display reveal">{t.generations.title}</h2>
          <p className="lead reveal">{t.generations.text}</p>
        </header>
        <div className="gen-figure">
          <svg viewBox={`0 0 ${W} ${H + 60}`} role="img" aria-label={t.generations.roles.join(' → ')}>
            <g fill="none" stroke="var(--gold)" strokeWidth="1.2" opacity="0.8">
              {links.map((d) => <path key={d} className="gen-link" d={d} />)}
            </g>
            {nodes.map((col, c) => col.map((n, i) => (
              <g key={`${c}-${i}`} transform={`translate(${n.x - 18} ${n.y - 23}) scale(0.36)`}>
                <g className="gen-node">
                  <path d={ARCH_PATH} fill={c === 3 ? '#1b6f7a' : '#14263e'} stroke="var(--gold)" strokeWidth="3" />
                  <polygon points={starPoints(50, 62, 18, 0.66)} fill="none" stroke="var(--gold)" strokeWidth="2.4" opacity="0.7" />
                </g>
              </g>
            )))}
            {t.generations.roles.map((r, c) => (
              <text key={r} x={x0 + c * dx} y={H + 46} textAnchor="middle" className="gen-label">{r}</text>
            ))}
          </svg>
        </div>
      </div>
    </section>
  )
}

/* ---------- Каждое имя хранит историю ---------- */

export function Names() {
  const t = useT()
  const root = useRef<HTMLElement>(null)
  useReveal(root)
  return (
    <section ref={root} className="section names">
      <div className="names__bg" aria-hidden="true"><GirihPattern opacity={0.4} scale={120} /></div>
      <div className="section__inner">
        <header className="section__head">
          <p className="eyebrow reveal">{t.names.eyebrow}</p>
          <h2 className="display reveal">{t.names.title}</h2>
          <p className="lead reveal">{t.names.text}</p>
        </header>
        <div className="names__grid">
          {t.names.examples.map((e) => (
            <div key={e.first} className="reveal">
              <PersonCard
                example
                first={e.first}
                last={e.last}
                years={e.years}
                place={e.place}
                kin={e.kin}
                story={e.story}
                initials={(e.first[0] + e.last[0]).toUpperCase()}
              />
            </div>
          ))}
          <figure className="memory-card reveal">
            <span className="pcard__badge">{t.common.example}</span>
            <IconQuote />
            <p className="memory-card__label">{t.names.memoryTitle}</p>
            <blockquote>{t.names.memory}</blockquote>
            <figcaption>{t.names.memoryAuthor}</figcaption>
          </figure>
          <figure className="doc-card reveal">
            <span className="pcard__badge">{t.common.example}</span>
            <IconDocument />
            <p className="memory-card__label">{t.names.documentTitle}</p>
            <p className="doc-card__text">{t.names.documentText}</p>
            <div className="doc-card__sheet" aria-hidden="true"><span /><span /><span /><span /></div>
          </figure>
        </div>
        <p className="names__note reveal"><Star size={10} filled /> {t.names.demoNote}</p>
      </div>
    </section>
  )
}

/* ---------- Семейный архив ---------- */

export function ArchiveSection() {
  const t = useT()
  const root = useRef<HTMLElement>(null)
  const go = useRouter((s) => s.go)
  const requireAuth = useFamily((s) => s.requireAuth)
  useReveal(root)
  const icons = [IconCamera, IconDocument, IconQuote, IconShare]
  return (
    <section ref={root} className="section archive-section">
      <div className="section__inner archive-section__grid">
        <header className="section__head">
          <p className="eyebrow reveal">{t.archiveSection.eyebrow}</p>
          <h2 className="display reveal">{t.archiveSection.title}</h2>
          <p className="lead reveal">{t.archiveSection.text}</p>
          <button type="button" className="btn btn--primary reveal" onClick={() => requireAuth(() => go('archive'))}>{t.archiveSection.cta}</button>
        </header>
        <ul className="archive-points">
          {t.archiveSection.points.map((point, i) => {
            const Icon = icons[i]
            return (
              <li key={point} className="archive-point reveal">
                <span className="feature__icon"><Icon /></span>
                <span>{point}</span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

/* ---------- Финал ---------- */

export function Finale() {
  const t = useT()
  const root = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(false)
  const { graph, auth, requireAuth } = useFamily()
  const lang = useLang((s) => s.lang)
  const go = useRouter((s) => s.go)
  const webgl = useMemo(() => hasWebGL(), [])
  const sceneGraph = useMemo(() => (auth === 'open' && graph.people.size >= 2 ? graph : buildGraph(demoFamily(lang))), [auth, graph, lang])
  useReveal(root)
  useEffect(() => {
    const el = root.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '200px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const create = () => requireAuth(() => { go('tree') })
  return (
    <section ref={root} className="section finale">
      <div className="finale__stage" aria-hidden="true">
        {webgl ? (
          inView && <Suspense fallback={null}><FinaleScene graph={sceneGraph} active={inView} /></Suspense>
        ) : <TreeIllustration className="finale__fallback" />}
      </div>
      <div className="finale__content">
        <OrnamentRule className="reveal" />
        <h2 className="display reveal">{t.finale.title}</h2>
        <button className="btn btn--primary reveal" type="button" onClick={create}>{t.finale.cta}</button>
      </div>
    </section>
  )
}

export function Footer() {
  const t = useT()
  return (
    <footer className="footer">
      <div className="footer__inner">
        <span className="footer__brand">{t.common.brand}</span>
        <p>{READ_ONLY ? t.footer.readOnly : t.footer.note}</p>
        {!READ_ONLY && <a className="link-btn" href="/classic/">{t.footer.classic}</a>}
      </div>
    </footer>
  )
}
