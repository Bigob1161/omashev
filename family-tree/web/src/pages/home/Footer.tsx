import { READ_ONLY } from '../../lib/mode'
import { useT } from '../../i18n'
import { hrefFor } from '../../store/router'

export function Footer() {
  const t = useT()
  return (
    <footer className="footer">
      <div className="footer__inner">
        <span className="footer__brand">{t.common.brand}</span>
        <p className="footer__motto">{t.hero.motto}</p>
        <p>{READ_ONLY ? t.footer.readOnly : t.footer.note}</p>
        <nav className="footer__links" aria-label={t.nav.menu}>
          <a className="link-btn" href={hrefFor('about')}>{t.nav.about}</a>
          {!READ_ONLY && <a className="link-btn" href="/classic/">{t.footer.classic}</a>}
        </nav>
      </div>
    </footer>
  )
}
