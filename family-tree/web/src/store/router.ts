import { create } from 'zustand'

export type Route = 'home' | 'tree' | 'archive' | 'about'
const ROUTES: Route[] = ['home', 'tree', 'archive', 'about']

function parse(): Route {
  let name = location.hash.replace(/^#\/?/, '').split('?')[0]
  if (name === 'history') name = 'archive' // старая ссылка: история теперь вкладка архива
  return (ROUTES as string[]).includes(name) ? (name as Route) : 'home'
}

interface RouterState {
  route: Route
  go: (route: Route) => void
}

export const useRouter = create<RouterState>((set) => ({
  route: parse(),
  go: (route) => {
    const hash = route === 'home' ? '#/' : `#/${route}`
    if (location.hash !== hash) location.hash = hash
    set({ route })
    window.scrollTo({ top: 0 })
  },
}))

window.addEventListener('hashchange', () => {
  const route = parse()
  if (route !== useRouter.getState().route) {
    useRouter.setState({ route })
    window.scrollTo({ top: 0 })
  }
})

export const hrefFor = (route: Route) => (route === 'home' ? '#/' : `#/${route}`)
