import { useLayoutEffect, useMemo, useRef } from 'react'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useT } from '../../i18n'
import { useFamily } from '../../store/family'
import { useRouter } from '../../store/router'
import { fileUrl } from '../../api/client'
import { portraitOf } from '../../lib/graph'
import { displayName, lifeYears } from '../../lib/names'
import { smooth } from '../../three/heritage/epochs'

interface Shot { key: string; url?: string; name: string; years: string }

/**
 * От истории страны — к истории семьи: деревянный стол, старый альбом раскрывается прокруткой,
 * фотографии проявляются из размытия. Если своих фото ещё нет — пустые рамки с подписью.
 */
export function FamilyTransition() {
  const t = useT()
  const { graph, auth, requireAuth } = useFamily()
  const go = useRouter((s) => s.go)
  const root = useRef<HTMLElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const steps = useRef<(HTMLElement | null)[]>([])

  const shots = useMemo<Shot[]>(() => {
    const list: Shot[] = []
    if (auth === 'open') {
      for (const p of graph.people.values()) {
        const ph = portraitOf(graph, p.id)
        if (ph) list.push({ key: p.id, url: fileUrl(ph), name: displayName(p, t), years: lifeYears(p, t) })
        if (list.length === 6) break
      }
    }
    while (list.length < 6) list.push({ key: `empty-${list.length}`, name: '', years: '' })
    return list
  }, [graph, auth, t])

  // Окна появления текстов: [начало, конец] по прогрессу блока.
  const windows: [number, number][] = [[0, 0.2], [0.06, 0.2], [0.5, 1], [0.56, 1], [0.62, 1], [0.68, 1], [0.74, 1], [0.82, 1]]

  useLayoutEffect(() => {
    if (!root.current) return
    const apply = (q: number) => {
      const s = stage.current
      if (!s) return
      s.style.setProperty('--table', smooth(0.04, 0.22, q).toFixed(3))
      s.style.setProperty('--album', smooth(0.18, 0.3, q).toFixed(3))
      s.style.setProperty('--open', smooth(0.26, 0.5, q).toFixed(3))
      s.style.setProperty('--sharp', smooth(0.4, 0.7, q).toFixed(3))
      s.style.setProperty('--lift', smooth(0.46, 0.66, q).toFixed(3))
      steps.current.forEach((el, i) => {
        if (!el) return
        const [a, b] = windows[i]
        const v = smooth(a, a + 0.06, q) * (b < 1 ? 1 - smooth(b - 0.05, b, q) : 1)
        el.style.opacity = v.toFixed(3)
        el.style.transform = `translate3d(0, ${((1 - v) * 16).toFixed(1)}px, 0)`
        el.style.visibility = v < 0.02 ? 'hidden' : 'visible'
      })
    }
    apply(0)
    const st = ScrollTrigger.create({ trigger: root.current, start: 'top top', end: 'bottom bottom', onUpdate: (self) => apply(self.progress) })
    return () => st.kill()
    // windows — константа компонента
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const step = (i: number) => (el: HTMLElement | null) => { steps.current[i] = el }

  return (
    <section ref={root} className="family-transition" aria-label={t.transition.title}>
      <div ref={stage} className="ft__stage">
        <div className="ft__table" aria-hidden="true" />
        <div className="ft__light" aria-hidden="true" />

        <div className="ft__intro">
          <p ref={step(0)} className="ft__line">{t.transition.line1}</p>
          <p ref={step(1)} className="ft__line ft__line--strong">{t.transition.line2}</p>
        </div>

        <div className="ft__scene" aria-hidden="true">
          <div className="ft__letters">
            <span className="ft__letter ft__letter--1" />
            <span className="ft__letter ft__letter--2" />
            <span className="ft__letter ft__letter--3" />
          </div>
          <div className="album">
            <div className="album__page album__page--right">
              {shots.slice(3, 6).map((s, i) => <AlbumPhoto key={s.key} shot={s} i={i + 3} empty={t.transition.emptyPhoto} />)}
            </div>
            {/* обложка открывается влево, и её оборот становится левой страницей разворота */}
            <div className="album__cover">
              <div className="album__cover-front"><span>{t.transition.album}</span></div>
              <div className="album__cover-back album__page album__page--left">
                {shots.slice(0, 3).map((s, i) => <AlbumPhoto key={s.key} shot={s} i={i} empty={t.transition.emptyPhoto} />)}
              </div>
            </div>
          </div>
        </div>

        <div className="ft__text">
          <h2 ref={step(2)}>{t.transition.title}</h2>
          {t.transition.text.map((p, i) => <p key={i} ref={step(3 + i)}>{p}</p>)}
          <div ref={step(7)} className="ft__cta">
            <button className="btn btn--primary" type="button" onClick={() => requireAuth(() => go('tree'))}>{t.transition.cta}</button>
            <p className="ft__closing">{t.transition.closing}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

function AlbumPhoto({ shot, i, empty }: { shot: Shot; i: number; empty: string }) {
  return (
    <figure className={`album-photo album-photo--${i}`}>
      <div className="album-photo__frame">
        {shot.url ? <img src={shot.url} alt="" loading="lazy" decoding="async" /> : <span className="album-photo__empty">{empty}</span>}
      </div>
      {shot.name && <figcaption>{shot.name}{shot.years && <small>{shot.years}</small>}</figcaption>}
    </figure>
  )
}
