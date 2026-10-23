import type { CSSProperties } from 'react'
import { ArchPortrait, Star } from './Ornament'
import { useT } from '../i18n'

export interface PersonCardProps {
  first: string
  last: string
  years?: string
  place?: string
  kin?: string
  story?: string
  portrait?: string
  initials: string
  /** Демонстрационная карточка — помечается «Пример». */
  example?: boolean
  variant?: 'archive' | 'chart'
  state?: 'normal' | 'dim' | 'family' | 'selected' | 'hidden'
  compact?: boolean
  onClick?: () => void
  style?: CSSProperties
  ariaLabel?: string
  dataId?: string
}

/**
 * Карточка в эстетике семейного архива: портрет в арке, имя крупной антиквой,
 * годы жизни, родство; при наведении карточка приподнимается и раскрывает место рождения и историю.
 */
export function PersonCard(p: PersonCardProps) {
  const t = useT()
  const { variant = 'archive', state = 'normal', compact } = p
  const Tag = p.onClick ? 'button' : 'article'
  const hasMore = !!(p.place || p.story)
  return (
    <Tag
      type={p.onClick ? 'button' : undefined}
      className={`pcard pcard--${variant} pcard--${state}${compact ? ' pcard--compact' : ''}${hasMore ? ' pcard--more' : ''}`}
      onClick={p.onClick}
      style={p.style}
      aria-label={p.ariaLabel}
      data-id={p.dataId}
    >
      {p.example && <span className="pcard__badge">{t.common.example}</span>}
      <span className="pcard__portrait">
        <ArchPortrait src={p.portrait} alt="" initials={p.initials} />
      </span>
      <span className="pcard__body">
        {p.kin && !compact && <span className="pcard__kin">{p.kin}</span>}
        <span className="pcard__name">
          <span className="pcard__first">{p.first || t.common.noName}</span>
          {p.last && <span className="pcard__last">{p.last}</span>}
        </span>
        {!compact && (
          <span className="pcard__years">
            {p.years || <span className="pcard__unknown">{t.common.yearsUnknown}</span>}
          </span>
        )}
        {hasMore && !compact && (
          <span className="pcard__more">
            <span className="pcard__more-inner">
              <span className="pcard__rule" aria-hidden="true"><Star size={9} /></span>
              {p.place && <span className="pcard__place">{p.place}</span>}
              {p.story && <span className="pcard__story">{p.story}</span>}
            </span>
          </span>
        )}
      </span>
    </Tag>
  )
}
