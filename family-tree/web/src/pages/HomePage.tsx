import { useEffect } from 'react'
import { useRouter } from '../store/router'
import { HistoricalJourney, scrollToFrame } from './home/HistoricalJourney'
import { FamilyTransition } from './home/FamilyTransition'
import { Footer } from './home/Footer'

export function HomePage() {
  const route = useRouter((s) => s.route)
  // «История Узбекистана» в меню — та же главная, сразу у первой эпохи.
  useEffect(() => {
    if (route !== 'history') return
    const id = requestAnimationFrame(() => scrollToFrame(1, false))
    return () => cancelAnimationFrame(id)
  }, [route])
  return (
    <main id="main" className="home">
      <HistoricalJourney />
      <FamilyTransition />
      <Footer />
    </main>
  )
}
