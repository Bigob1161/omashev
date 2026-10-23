// Без импорта three: модуль используется и в основном бандле (число экранов истории).

/**
 * Весь сценарий главной страницы — функция одного числа p ∈ [0, 1] (прогресс прокрутки).
 * Каждая величина ниже — «ползунок» своего этапа, поэтому обратная прокрутка
 * автоматически проигрывает всё в обратном порядке.
 *
 * Экраны истории (7 штук): первый экран, «Чай», «Наливание», «Свет», «Древо», «Поколения», «Ваше древо».
 */
export interface TeaState {
  p: number
  lift: number        // чайник приподнимается
  tilt: number        // и наклоняется к пиале
  streamHead: number  // струя вытягивается от носика к пиале
  streamTail: number  // хвост струи догоняет голову — струя иссякает
  fill: number        // уровень чая в пиале
  glow: number        // чай начинает светиться
  threads: number     // световые нити поднимаются из пиалы
  grow: number        // рост ствола и ветвей (окна ветвей — в модели дерева)
  mature: number      // золото «остывает» в древесину с золотыми прожилками
  pull: number        // камера отдаляется, видно всё дерево
  morph: number       // дерево складывается в читаемую схему
}

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export function teaState(p: number, out: TeaState): TeaState {
  out.p = p
  out.lift = smooth(0.15, 0.21, p) - smooth(0.43, 0.48, p)
  out.tilt = smooth(0.19, 0.25, p) - smooth(0.41, 0.46, p)
  out.streamHead = smooth(0.245, 0.27, p)
  out.streamTail = smooth(0.395, 0.425, p)
  out.fill = smooth(0.26, 0.4, p)
  out.glow = smooth(0.42, 0.5, p)
  out.threads = smooth(0.45, 0.58, p)
  out.grow = smooth(0.52, 0.8, p)
  out.mature = smooth(0.6, 0.8, p)
  out.pull = smooth(0.8, 0.86, p)
  out.morph = smooth(0.86, 0.96, p)
  return out
}

export const emptyState = (): TeaState => ({ p: 0, lift: 0, tilt: 0, streamHead: 0, streamTail: 0, fill: 0, glow: 0, threads: 0, grow: 0, mature: 0, pull: 0, morph: 0 })

/** Количество экранов истории — должно совпадать с разметкой в Story.tsx. */
export const STORY_SCREENS = 7
