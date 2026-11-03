import { useEffect, useState } from 'react'
import { READ_ONLY } from '../lib/mode'
import { LANGS, type Lang, useLang, useT } from '../i18n'
import { type Route, hrefFor, useRouter } from '../store/router'
import { useFamily } from '../store/family'
import { IconClose, IconMenu, IconUser } from './Icons'
import { ProfileDialog } from './Overlays'
import { scrollToFrame } from '../pages/home/HistoricalJourney'

/** Знак NASL: стрельчатый портал-пештак, внутри — восьмиконечная звезда гириха и корень рода. */
export function Logo() {
  return (
    <svg className="logo-mark" width="34" height="34" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M10 58V28C10 16 20 8 32 4c12 4 22 12 22 24v30z" fill="none" stroke="var(--gold)" strokeWidth="2.4" />
      <path d="M18 58V31c0-8 6-14 14-17 8 3 14 9 14 17v27" fill="#15307a" stroke="var(--gold-bright)" strokeWidth="1.4" />
      <path d="M32 21l3 6 6.5-1-4 5 4 5-6.5-1-3 6-3-6-6.5 1 4-5-4-5 6.5 1z" fill="var(--turquoise)" />
      <path d="M32 42v8M32 50l-6 7M32 50l6 7M32 47l-4 2M32 47l4 2" fill="none" stroke="var(--gold-bright)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

export function LangSwitch({ className = '' }: { className?: string }) {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const setLang = useLang((s) => s.setLang)
  return (
    <div className={`lang-switch ${className}`} role="group" aria-label={t.nav.language}>
      {(Object.keys(LANGS) as Lang[]).map((l, i) => (
        <span key={l} className="lang-switch__item">
          {i > 0 && <span className="lang-switch__sep" aria-hidden="true">|</span>}
          <button type="button" aria-pressed={lang === l} className={lang === l ? 'is-active' : ''} onClick={() => setLang(l)} lang={LANGS[l].htmlLang}>
            {LANGS[l].label}
          </button>
        </span>
      ))}
    </div>
  )
}

const LINKS: Route[] = ['home', 'history', 'tree', 'archive']

export function Nav() {
  const t = useT()
  const route = useRouter((s) => s.route)
  const go = useRouter((s) => s.go)
  const requireAuth = useFamily((s) => s.requireAuth)
  const auth = useFamily((s) => s.auth)
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const [profile, setProfile] = useState(false)
  const labels: Record<Route, string> = { home: t.nav.home, history: t.nav.history, tree: t.nav.tree, archive: t.nav.archive, about: t.nav.about }

  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 24)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])
  useEffect(() => setMenu(false), [route])
  useEffect(() => {
    if (!menu) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menu])

  const solid = scrolled || (route !== 'home' && route !== 'history') || menu
  const signedIn = READ_ONLY || auth === 'open'
  const login = () => requireAuth(() => go('tree'))
  // повторный клик по «Истории Узбекистана» снова ведёт к первой эпохе
  const again = (r: Route) => { if (r === 'history' && route === 'history') scrollToFrame(1) }

  return (
    <header className={`nav${solid ? ' nav--solid' : ''}`}>
      <div className="nav__inner">
        <a className="nav__brand" href={hrefFor('home')} aria-label={`${t.common.brand} — ${t.nav.home}`}>
          <Logo />
          <span>{t.common.brand}</span>
        </a>
        <nav className="nav__links" aria-label={t.nav.menu}>
          {LINKS.map((r) => (
            <a key={r} href={hrefFor(r)} aria-current={route === r ? 'page' : undefined} className={route === r ? 'is-active' : ''} onClick={() => again(r)}>{labels[r]}</a>
          ))}
        </nav>
        <div className="nav__actions">
          <LangSwitch className="nav__lang" />
          {signedIn
            ? <button className="icon-btn nav__profile" type="button" aria-label={t.nav.profile} onClick={() => setProfile(true)}><IconUser /></button>
            : <button className="btn btn--primary btn--small nav__login" type="button" onClick={login}>{t.nav.login}</button>}
          <button className="icon-btn nav__burger" type="button" aria-label={t.nav.menu} aria-expanded={menu} aria-controls="mobile-menu" onClick={() => setMenu((m) => !m)}>
            {menu ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>
      {menu && (
        <div className="mobile-menu" id="mobile-menu">
          <nav aria-label={t.nav.menu}>
            {LINKS.map((r) => (
              <a key={r} href={hrefFor(r)} aria-current={route === r ? 'page' : undefined} onClick={() => { setMenu(false); again(r) }}>{labels[r]}</a>
            ))}
          </nav>
          <div className="mobile-menu__foot">
            <LangSwitch />
            {!signedIn && <button className="btn btn--primary" type="button" onClick={() => { setMenu(false); login() }}>{t.nav.login}</button>}
          </div>
        </div>
      )}
      {profile && <ProfileDialog onClose={() => setProfile(false)} />}
    </header>
  )
}
