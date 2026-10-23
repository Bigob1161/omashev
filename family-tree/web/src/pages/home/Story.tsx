import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { fmt, roman, useLang, useT } from '../../i18n'
import { useFamily } from '../../store/family'
import { useRouter } from '../../store/router'
import { storage } from '../../lib/storage'
import { buildGraph } from '../../lib/graph'
import { hasWebGL, useReducedMotion } from '../../lib/device'
import { demoFamily } from '../../data/demoFamily'
import { STORY_SCREENS } from '../../three/tea/state'
import { GirihPattern } from '../../components/Ornament'
import { IconArrowDown } from '../../components/Icons'
import { TeaIllustration } from './Illustrations'

gsap.registerPlugin(ScrollTrigger)

const StoryScene = lazy(() => import('../../three/tea/TeaScenes').then((m) => ({ default: m.StoryScene })))

/**
 * Первый экран и история из шести глав. Сцена «прилипает» к экрану, а прогресс прокрутки
 * всего блока (0…1) непрерывно ведёт один сценарий: чай → свет → дерево → поколения → схема.
 */
export function Story() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { graph, auth, select, requireAuth } = useFamily()
  const go = useRouter((s) => s.go)
  const root = useRef<HTMLElement>(null)
  const screens = useRef<(HTMLElement | null)[]>([])
  const progress = useRef(0)
  const interactive = useRef(false)
  const [chapter, setChapter] = useState(0)
  const [inView, setInView] = useState(true)
  const [railOn, setRailOn] = useState(true)
  const reduced = useReducedMotion()
  const webgl = useMemo(() => hasWebGL(), [])
  const real = auth === 'open' && graph.people.size >= 2
  // Нет своих данных — показываем вымышленную демонстрационную семью с пометкой.
  const sceneGraph = useMemo(() => (real ? graph : buildGraph(demoFamily(lang))), [real, graph, lang])

  useLayoutEffect(() => {
    if (!root.current) return
    const st = ScrollTrigger.create({
      trigger: root.current,
      start: 'top top',
      end: 'bottom bottom',
      onToggle: (self) => setRailOn(self.isActive),
      onUpdate: (self) => {
        progress.current = self.progress
        interactive.current = self.progress > 0.95
        const c = Math.min(STORY_SCREENS - 1, Math.floor(self.progress * STORY_SCREENS + 0.2))
        setChapter((prev) => (prev === c ? prev : c))
      },
    })
    return () => st.kill()
  }, [])

  // Тяжёлая сцена рисуется только пока блок на экране.
  useEffect(() => {
    const el = root.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '100px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (reduced) return
    const ctx = gsap.context(() => {
      gsap.from('.hero__line', { y: 26, opacity: 0, duration: 1.1, ease: 'power3.out', stagger: 0.09, delay: 0.15 })
    }, root)
    return () => ctx.revert()
  }, [reduced])

  const scrollToScreen = (i: number) => {
    const el = screens.current[i]
    if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: reduced ? 'auto' : 'smooth' })
  }
  const openTree = (mode: 'practical' | 'art') => requireAuth(() => { storage.set('treeMode', mode); go('tree') })

  const chapters = [
    [t.story.s1Title, t.story.s1Text],
    [t.story.s2Title, t.story.s2Text],
    [t.story.s3Title, t.story.s3Text],
    [t.story.s4Title, t.story.s4Text],
    [t.story.s5Title, t.story.s5Text],
  ]

  return (
    <section ref={root} className="story" aria-label={t.hero.title}>
      <div className="story__stage">
        <div className="story__sky" aria-hidden="true" />
        <div className="story__pattern" aria-hidden="true"><GirihPattern opacity={0.4} scale={88} /></div>
        {webgl ? (
          <Suspense fallback={<TeaIllustration className="story__fallback" />}>
            <StoryScene graph={sceneGraph} progress={progress} interactive={interactive} onSelect={real ? select : () => {}} active={inView} />
          </Suspense>
        ) : (
          <TeaIllustration className="story__fallback" />
        )}
        <div className="story__vignette" aria-hidden="true" />
        {!real && chapter >= 4 && <p className="story__demo">{t.common.demoBadge}</p>}
      </div>

      <nav className={`story__rail${railOn ? '' : ' is-hidden'}`} aria-label={t.story.railLabel}>
        {Array.from({ length: STORY_SCREENS }, (_, i) => (
          <button key={i} type="button" className={chapter === i ? 'is-active' : ''} aria-current={chapter === i ? 'step' : undefined} aria-label={i === 0 ? t.hero.eyebrow : fmt(t.story.chapter, { n: roman(i) })} onClick={() => scrollToScreen(i)}>
            <span />
          </button>
        ))}
      </nav>

      <div className="story__screens">
        <header ref={(el) => { screens.current[0] = el }} className="story-screen hero">
          <div className="hero__content">
            <p className="eyebrow hero__line">{t.hero.eyebrow}</p>
            <h1 className="hero__title hero__line">{t.hero.title}</h1>
            <p className="hero__subtitle hero__line">{t.hero.subtitle}</p>
            <div className="hero__actions hero__line">
              <button className="btn btn--primary" type="button" onClick={() => scrollToScreen(1)}>{t.hero.openTree}</button>
              <button className="btn" type="button" onClick={() => go('about')}>{t.hero.howItWorks}</button>
            </div>
          </div>
          <button type="button" className="hero__scroll" onClick={() => scrollToScreen(1)}>
            <span className="hero__scroll-icon"><IconArrowDown /></span>
            {t.hero.scrollHint}
          </button>
          {webgl && <p className="hero__drag" aria-hidden="true">{t.hero.dragHint}</p>}
        </header>

        {chapters.map(([title, text], i) => (
          <article key={i} ref={(el) => { screens.current[i + 1] = el }} className={`story-screen chapter${chapter === i + 1 ? ' is-active' : ''}`}>
            <div className="chapter__card">
              <p className="chapter__num">{fmt(t.story.chapter, { n: roman(i + 1) })}</p>
              <h2>{title}</h2>
              <p>{text}</p>
            </div>
          </article>
        ))}

        <article ref={(el) => { screens.current[6] = el }} className={`story-screen chapter chapter--final${chapter === 6 ? ' is-active' : ''}`}>
          <div className="chapter__card">
            <p className="chapter__num">{fmt(t.story.chapter, { n: roman(6) })}</p>
            <h2>{t.story.s6Title}</h2>
            <p>{t.story.s6Text}</p>
            {!real && <p className="chapter__demo">{t.story.demo}</p>}
            <div className="chapter__actions">
              <button className="btn btn--primary" type="button" onClick={() => openTree('practical')}>{t.story.cta}</button>
              <button className="btn" type="button" onClick={() => openTree('art')}>{t.tree.modeArt}</button>
            </div>
          </div>
        </article>
      </div>
    </section>
  )
}
