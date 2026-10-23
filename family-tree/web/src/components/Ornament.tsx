import { useId } from 'react'

/** Восьмиконечная звезда гирих — основной мотив. Точки звезды в единичной системе. */
export function starPoints(cx: number, cy: number, r: number, inner = 0.72): string {
  const pts: string[] = []
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i - Math.PI / 2
    const rr = i % 2 === 0 ? r : r * inner
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`)
  }
  return pts.join(' ')
}

export function Star({ size = 14, className, filled = false }: { size?: number; className?: string; filled?: boolean }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <polygon
        points={starPoints(10, 10, 9.2, 0.7)}
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.1}
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * Узор из переплетённых восьмиконечных звёзд и крестов (как в изразцах медресе Улугбека).
 * Используется приглушённо — как фон под маской, а не на каждом элементе.
 */
export function GirihPattern({ className, opacity = 0.12, scale = 64 }: { className?: string; opacity?: number; scale?: number }) {
  const id = useId().replace(/:/g, '')
  const s = scale
  return (
    <svg className={className} width="100%" height="100%" aria-hidden="true" preserveAspectRatio="none">
      <defs>
        <pattern id={`g${id}`} width={s} height={s} patternUnits="userSpaceOnUse">
          <g fill="none" stroke="currentColor" strokeWidth="0.8" opacity={opacity}>
            <polygon points={starPoints(s / 2, s / 2, s * 0.36, 0.72)} />
            <polygon points={starPoints(s / 2, s / 2, s * 0.17, 0.72)} />
            {[0, s].map((x) => [0, s].map((y) => <polygon key={`${x}${y}`} points={starPoints(x, y, s * 0.2, 0.62)} />))}
            <path d={`M${s / 2} 0V${s * 0.14}M${s / 2} ${s}V${s * 0.86}M0 ${s / 2}H${s * 0.14}M${s} ${s / 2}H${s * 0.86}`} />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#g${id})`} />
    </svg>
  )
}

/** Арка михраба: заострённый верх, как у порталов Самарканда. Координаты 100×130. */
export const ARCH_PATH = 'M0 130V50C0 24 28 11 50 0C72 11 100 24 100 50V130Z'
const ARCH_INNER = 'M5 125V51.5C5 28 30 16 50 6C70 16 95 28 95 51.5V125Z'

interface ArchPortraitProps {
  src?: string
  alt: string
  initials: string
  className?: string
  tone?: 'night' | 'paper'
}

/** Портрет в арочной рамке с двойной золотой линией и звездой в замке арки. */
export function ArchPortrait({ src, alt, initials, className, tone = 'night' }: ArchPortraitProps) {
  const id = useId().replace(/:/g, '')
  const fillTop = tone === 'paper' ? '#e4d5b4' : '#1d3554'
  const fillBottom = tone === 'paper' ? '#cdb68a' : '#0d1b2e'
  return (
    <svg className={className} viewBox="-4 -6 108 140" {...(alt ? { role: 'img', 'aria-label': alt } : { 'aria-hidden': true })}>
      <defs>
        <clipPath id={`c${id}`}><path d={ARCH_INNER} /></clipPath>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={fillTop} />
          <stop offset="1" stopColor={fillBottom} />
        </linearGradient>
      </defs>
      <path d={ARCH_INNER} fill={`url(#f${id})`} />
      {src ? (
        <image href={src} x="0" y="0" width="100" height="130" preserveAspectRatio="xMidYMid slice" clipPath={`url(#c${id})`} />
      ) : (
        <g clipPath={`url(#c${id})`}>
          <GirihInArch />
          <text
            x="50" y="84" textAnchor="middle"
            fontFamily="Cormorant Garamond, Georgia, serif" fontSize="30" fontWeight="500"
            fill={tone === 'paper' ? '#5b4a2c' : '#d9c592'} opacity="0.9"
          >{initials}</text>
        </g>
      )}
      <path d={ARCH_PATH} fill="none" stroke="var(--gold, #d6b46a)" strokeWidth="1.3" className="arch-outline" />
      <path d={ARCH_INNER} fill="none" stroke="var(--gold, #d6b46a)" strokeWidth="0.5" opacity="0.65" />
      <polygon points={starPoints(50, -1.5, 4.2, 0.6)} fill="var(--gold, #d6b46a)" />
    </svg>
  )
}

function GirihInArch() {
  return (
    <g fill="none" stroke="#d6b46a" strokeWidth="0.6" opacity="0.28">
      <polygon points={starPoints(50, 60, 34, 0.72)} />
      <polygon points={starPoints(50, 60, 18, 0.72)} />
      <polygon points={starPoints(50, 60, 8, 0.6)} />
    </g>
  )
}

/** Тонкий узорный бордюр — для разделения секций. */
export function OrnamentRule({ className }: { className?: string }) {
  return (
    <div className={`ornament-rule ${className ?? ''}`} aria-hidden="true">
      <span />
      <Star size={12} />
      <Star size={18} />
      <Star size={12} />
      <span />
    </div>
  )
}
