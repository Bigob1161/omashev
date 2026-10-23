import { Suspense, lazy, useEffect } from 'react'
import { useT } from './i18n'
import { useFamily } from './store/family'
import { useRouter } from './store/router'
import { Nav } from './components/Nav'
import { ConfirmDialog, LoginDialog, Toasts } from './components/Overlays'
import { PersonPanel } from './components/PersonPanel'
import { HomePage } from './pages/HomePage'

// Страницы приложения подгружаются отдельно — главная открывается быстрее.
const TreePage = lazy(() => import('./pages/TreePage').then((m) => ({ default: m.TreePage })))
const AboutPage = lazy(() => import('./pages/AboutPage').then((m) => ({ default: m.AboutPage })))
const ArchivePage = lazy(() => import('./pages/ArchivePage').then((m) => ({ default: m.ArchivePage })))

export function App() {
  const t = useT()
  const route = useRouter((s) => s.route)
  const init = useFamily((s) => s.init)
  useEffect(() => { init() }, [init])

  return (
    <>
      <a className="skip-link" href="#main">{t.common.skipToContent}</a>
      <Nav />
      <Suspense fallback={<p className="page-loading">{t.common.loading}</p>}>
        {route === 'home' && <HomePage />}
        {route === 'tree' && <TreePage />}
        {route === 'archive' && <ArchivePage />}
        {route === 'about' && <AboutPage />}
      </Suspense>
      <PersonPanel />
      <LoginDialog />
      <ConfirmDialog />
      <Toasts />
    </>
  )
}
