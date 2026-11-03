import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useT } from '../../i18n'
import { useFamily } from '../../store/family'
import { useRouter } from '../../store/router'
import { hasWebGL, useReducedMotion } from '../../lib/device'
import { FRAMES, frameEnv, frameVisibility, gradeFilter } from '../../three/heritage/epochs'
import { IconArrowDown } from '../../components/Icons'
import { RegistanSilhouette } from './RegistanSilhouette'

gsap.registerPlugin(ScrollTrigger)

const JourneyScene = lazy(() => import('../../three/heritage/JourneyScene'))

/** Прокрутка до кадра i внутри блока путешествия. */
export function scrollToFrame(i: number, smooth = true) {
  const el = document.getElementById('journey')
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY
  const span = el.offsetHeight - window.innerHeight
  window.scrollTo({ top: top + (span * i) / (FRAMES - 1), behavior: smooth ? 'smooth' : 'auto' })
}

/** Хронологическая ось учёных: годы рождения на шкале VIII–XV веков. */
function ScholarAxis({ scholars }: { scholars: { name: string; years: string }[] }) {
  const born = [780, 973, 980, 1394]
  const from = 700, to = 1500
  const x = (y: number) => ((y - from) / (to - from)) * 100
  return (
    <div className="scholar-axis" aria-hidden="true">
      <div className="scholar-axis__line" />
      {[800, 900, 1000, 1100, 1200, 1300, 1400].map((c) => (
        <span key={c} className="scholar-axis__tick" style={{ left: `${x(c)}%` }}>{c}</span>
      ))}
      {scholars.map((s, i) => (
        <span key={s.name} className={`scholar-axis__dot${i === 2 ? ' is-low' : ''}`} style={{ left: `${x(born[i])}%` }} title={s.name} />
      ))}
    </div>
  )
}

/** Чертёж «как в рукописи»: окружность, вписанный многоугольник, хорды — прорисовывается прокруткой. */
function ManuscriptDiagram() {
  const pts = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2
    return [60 + Math.cos(a) * 48, 60 + Math.sin(a) * 48]
  })
  const star = pts.map((_, i) => pts[(i * 3) % 8]).map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ') + 'Z'
  return (
    <svg className="manuscript" viewBox="0 0 120 120" aria-hidden="true">
      <circle className="draw" pathLength={1} cx="60" cy="60" r="48" />
      <path className="draw" pathLength={1} d={star} />
      <path className="draw" pathLength={1} d="M12 60H108M60 12V108" />
      <circle className="draw" pathLength={1} cx="60" cy="60" r="20" />
    </svg>
  )
}

/**
 * Первый экран и путешествие по шести эпохам. Сцена «прилипает» к экрану,
 * прогресс прокрутки ведёт камеру, свет и цвет; подписи появляются у своих кадров.
 * Прокрутка назад проигрывает всё в обратном порядке.
 */
export function HistoricalJourney() {
  const t = useT()
  const go = useRouter((s) => s.go)
  const requireAuth = useFamily((s) => s.requireAuth)
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const fallback = useRef<HTMLDivElement>(null)
  const frames = useRef<(HTMLElement | null)[]>([])
  const captions = useRef<(HTMLElement | null)[]>([])
  const progress = useRef(0)
  const [active, setActive] = useState(0)
  const [inView, setInView] = useState(true)
  const [ready, setReady] = useState(false)
  const reduced = useReducedMotion()
  const webgl = useMemo(() => hasWebGL(), [])

  useLayoutEffect(() => {
    if (!root.current) return
    const env = frameEnv(0)
    const apply = (p: number) => {
      progress.current = p
      frameEnv(p, env)
      frames.current.forEach((el, i) => {
        if (!el) return
        const v = frameVisibility(env.pos, i)
        el.style.opacity = v.toFixed(3)
        el.style.transform = `translate3d(0, ${((1 - v) * (env.pos > i ? -28 : 28)).toFixed(1)}px, 0)`
        el.style.visibility = v < 0.02 ? 'hidden' : 'visible'
        el.style.setProperty('--draw', v.toFixed(3))
      })
      captions.current.forEach((el, i) => {
        if (el) el.style.opacity = frameVisibility(env.pos, i).toFixed(3)
      })
      stage.current?.style.setProperty('--sepia', env.sepia.toFixed(3))
      stage.current?.style.setProperty('--gray', env.gray.toFixed(3))
      if (fallback.current) fallback.current.style.filter = gradeFilter(env)
      const a = Math.round(env.pos)
      setActive((prev) => (prev === a ? prev : a))
    }
    apply(0)
    const st = ScrollTrigger.create({ trigger: root.current, start: 'top top', end: 'bottom bottom', onUpdate: (self) => apply(self.progress) })
    return () => st.kill()
  }, [])

  // Тяжёлая сцена рисуется только пока блок на экране.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '120px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (reduced) return
    const ctx = gsap.context(() => {
      gsap.from('.hero__line', { y: 28, opacity: 0, duration: 1.2, ease: 'power3.out', stagger: 0.1, delay: 0.2 })
    }, root)
    return () => ctx.revert()
  }, [reduced])

  const epochs = t.journey.epochs
  const openFamily = () => requireAuth(() => go('tree'))

  return (
    <section ref={root} id="journey" className="journey" aria-label={t.journey.label}>
      <div ref={stage} className={`journey__stage${ready ? ' is-ready' : ''}`}>
        <div ref={fallback} className="journey__fallback" aria-hidden="true">
          <RegistanSilhouette />
        </div>
        {webgl && (
          <Suspense fallback={null}>
            <JourneyScene progress={progress} active={inView} onReady={() => setReady(true)} />
          </Suspense>
        )}
        <div className="journey__shade" aria-hidden="true" />
        <div className="journey__grain" aria-hidden="true" />

        {/* Первый экран */}
        <header ref={(el) => { frames.current[0] = el }} className="journey-frame hero">
          <div className="hero__content">
            <p className="eyebrow hero__line">{t.hero.eyebrow}</p>
            <h1 className="hero__title hero__line">{t.hero.title}</h1>
            <p className="hero__subtitle hero__line">{t.hero.subtitle}</p>
            <div className="hero__actions hero__line">
              <button className="btn btn--primary" type="button" onClick={() => scrollToFrame(1, !reduced)}>{t.hero.start}</button>
              <button className="btn btn--glass" type="button" onClick={openFamily}>{t.hero.family}</button>
            </div>
          </div>
          <button type="button" className="hero__scroll" onClick={() => scrollToFrame(1, !reduced)}>
            <span className="hero__scroll-icon"><IconArrowDown /></span>
            {t.hero.scrollHint}
          </button>
        </header>

        {/* Эпохи */}
        {epochs.map((ep, i) => (
          <article
            key={i}
            ref={(el) => { frames.current[i + 1] = el }}
            className={`journey-frame epoch epoch--${i + 1}`}
            aria-hidden={active !== i + 1}
          >
            <div className="epoch__card">
              <p className="epoch__era"><span>{ep.era}</span><span aria-hidden="true">·</span><span>{ep.years}</span></p>
              <h2 className="epoch__title">{ep.title}</h2>
              <p className="epoch__text">{ep.text}</p>
              {ep.facts.length > 0 && (
                <ol className="epoch__facts" aria-label={t.journey.timeline}>
                  {ep.facts.map(([date, text]) => (
                    <li key={date}><time>{date}</time><span>{text}</span></li>
                  ))}
                </ol>
              )}
              {i === 2 && <p className="epoch__note">{t.journey.scholarsNote}</p>}
              {i === 4 && <p className="epoch__note">{t.journey.jadids}</p>}
            </div>

            {i === 2 && (
              <div className="epoch__aside scholars">
                <ManuscriptDiagram />
                <ScholarAxis scholars={t.journey.scholars} />
                <ul className="scholars__list">
                  {t.journey.scholars.map((s) => (
                    <li key={s.name} className="ref-card">
                      <p className="ref-card__years">{s.years}</p>
                      <h3>{s.name}</h3>
                      <p>{s.text}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {i === 4 && (
              <div className="epoch__aside memorial">
                <ul className="memorial__list">
                  {t.journey.memorial.map((m) => (
                    <li key={m.name} className="ref-card ref-card--memorial">
                      <p className="ref-card__years">{m.years}</p>
                      <h3>{m.name}</h3>
                      <p>{m.text}</p>
                    </li>
                  ))}
                </ul>
                <p className="memorial__note">{t.journey.memorialNote}</p>
              </div>
            )}
          </article>
        ))}

        {/* Подпись к изображению: что показано и что это реконструкция */}
        <div className="journey__captions" aria-hidden="true">
          {[t.journey.epochs[0].scene, ...epochs.map((e) => e.scene)].map((text, i) => (
            <p key={i} ref={(el) => { captions.current[i] = el }} className="journey__caption">
              {(i === 2 || i === 3) && <span className="badge">{t.hero.reconstruction}</span>}
              {text}
            </p>
          ))}
        </div>

        {/* Шкала эпох */}
        <nav className="journey__rail" aria-label={t.journey.timeline}>
          {epochs.map((ep, i) => (
            <button
              key={i}
              type="button"
              className={active === i + 1 ? 'is-active' : active > i + 1 ? 'is-past' : ''}
              aria-current={active === i + 1 ? 'step' : undefined}
              onClick={() => scrollToFrame(i + 1, !reduced)}
            >
              <span className="journey__rail-dot" />
              <span className="journey__rail-label">{ep.years}</span>
            </button>
          ))}
        </nav>
      </div>
    </section>
  )
}
