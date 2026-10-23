import { useEffect, useState } from 'react'
import { READ_ONLY } from '../lib/mode'
import { LANGS, type Lang, useLang, useT } from '../i18n'
import { type Route, hrefFor, useRouter } from '../store/router'
import { useFamily } from '../store/family'
import { useUi } from '../store/ui'
import { IconClose, IconMenu, IconUser } from './Icons'
import { ProfileDialog } from './Overlays'

/**
 * Знак Omashev: золотое кольцо «O» с бусинами, внутри — кобальтовая пиала,
 * из которой растёт ветвь с тремя бирюзовыми почками (чай → древо → поколения).
 */
export function Logo() {
  return (
    <svg className="logo-mark" width="36" height="36" viewBox="0 0 64 64" aria-hidden="true">
      <circle cx="32" cy="32" r="27" fill="none" stroke="var(--gold)" strokeWidth="2.2" />
      {Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return <circle key={i} cx={32 + Math.cos(a) * 27} cy={32 + Math.sin(a) * 27} r="1.9" fill="var(--gold)" />
      })}
      <path d="M19 41h26c-1.5 6.5-6.6 10-13 10s-11.5-3.5-13-10z" fill="#15216a" stroke="#f7f6f2" strokeWidth="1.4" />
      <g fill="none" stroke="var(--gold-bright)" strokeWidth="2" strokeLinecap="round">
        <path d="M32 41V25M32 33c-3.5-2-6-5-6.5-9M32 30c3-2 5.5-4.5 6-8.5" />
      </g>
      <g fill="var(--turquoise)">
        <circle cx="25.5" cy="22.5" r="2.6" /><circle cx="32" cy="20" r="2.6" /><circle cx="38.5" cy="21" r="2.6" />
      </g>
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

const LINKS: Route[] = ['home', 'tree', 'archive', 'about']

export function Nav() {
  const t = useT()
  const route = useRouter((s) => s.route)
  const go = useRouter((s) => s.go)
  const requireAuth = useFamily((s) => s.requireAuth)
  const [scrolled, setScrolled] = useState(false)
  const [menu, setMenu] = useState(false)
  const [profile, setProfile] = useState(false)
  const labels: Record<Route, string> = { home: t.nav.home, tree: t.nav.tree, archive: t.nav.archive, about: t.nav.about }

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

  const solid = scrolled || route !== 'home' || menu
  const create = () => requireAuth(() => { useUi.getState().requestCreate(); go('tree') })

  return (
    <header className={`nav${solid ? ' nav--solid' : ''}`}>
      <div className="nav__inner">
        <a className="nav__brand" href={hrefFor('home')} aria-label={`${t.common.brand} — ${t.nav.home}`}>
          <Logo />
          <span>{t.common.brand}</span>
        </a>
        <nav className="nav__links" aria-label={t.nav.menu}>
          {LINKS.map((r) => (
            <a key={r} href={hrefFor(r)} aria-current={route === r ? 'page' : undefined} className={route === r ? 'is-active' : ''}>{labels[r]}</a>
          ))}
        </nav>
        <div className="nav__actions">
          <LangSwitch className="nav__lang" />
          <button className="icon-btn nav__profile" type="button" aria-label={t.nav.profile} onClick={() => setProfile(true)}><IconUser /></button>
          {!READ_ONLY && <button className="btn btn--primary btn--small nav__create" type="button" onClick={create}>{t.nav.create}</button>}
          <button className="icon-btn nav__burger" type="button" aria-label={t.nav.menu} aria-expanded={menu} aria-controls="mobile-menu" onClick={() => setMenu((m) => !m)}>
            {menu ? <IconClose /> : <IconMenu />}
          </button>
        </div>
      </div>
      {menu && (
        <div className="mobile-menu" id="mobile-menu">
          <nav aria-label={t.nav.menu}>
            {LINKS.map((r) => (
              <a key={r} href={hrefFor(r)} aria-current={route === r ? 'page' : undefined} onClick={() => setMenu(false)}>{labels[r]}</a>
            ))}
          </nav>
          <div className="mobile-menu__foot">
            <LangSwitch />
            {!READ_ONLY && <button className="btn btn--primary" type="button" onClick={() => { setMenu(false); create() }}>{t.nav.create}</button>}
          </div>
        </div>
      )}
      {profile && <ProfileDialog onClose={() => setProfile(false)} />}
    </header>
  )
}
