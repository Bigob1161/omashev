import { useT } from '../i18n'
import { useFamily } from '../store/family'
import { useRouter } from '../store/router'
import { GirihPattern, OrnamentRule } from '../components/Ornament'

/** «О проекте»: как устроен NASL и где на самом деле хранятся данные. */
export function AboutPage() {
  const t = useT()
  const go = useRouter((s) => s.go)
  const requireAuth = useFamily((s) => s.requireAuth)
  return (
    <main id="main" className="page theme-app about">
      <div className="page__bg" aria-hidden="true"><GirihPattern opacity={0.22} scale={110} /></div>
      <header className="page__head">
        <h1 className="display">{t.about.title}</h1>
        <p className="lead">{t.about.intro}</p>
      </header>

      <section className="page__section" aria-labelledby="how-title">
        <h2 id="how-title" className="page__h2">{t.about.howTitle}</h2>
        <ol className="about-steps">
          {t.about.steps.map((step, i) => (
            <li key={step.title}>
              <span className="about-steps__num" aria-hidden="true">{i + 1}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <OrnamentRule />

      <section className="page__section about-columns">
        <div>
          <h2 className="page__h2">{t.about.privacyTitle}</h2>
          <p>{t.about.privacyText}</p>
        </div>
        <div>
          <h2 className="page__h2">{t.about.languagesTitle}</h2>
          <p>{t.about.languagesText}</p>
        </div>
      </section>

      <div>
        <button className="btn btn--primary" type="button" onClick={() => requireAuth(() => go('tree'))}>{t.about.cta}</button>
      </div>
    </main>
  )
}
