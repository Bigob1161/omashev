import { starPoints } from '../../components/Ornament'

/** Статичная версия для устройств без WebGL: чайник, пиала и дерево из чая — в линиях. */
export function TeaIllustration({ className }: { className?: string }) {
  const branches = [
    'M560 420C560 360 548 320 556 270', 'M556 270C520 230 470 210 430 190', 'M556 270C590 230 640 210 690 190',
    'M430 190C410 150 380 130 350 115', 'M430 190C440 150 460 130 470 110', 'M690 190C690 150 710 130 730 110', 'M690 190C720 160 760 140 790 125',
  ]
  const medallions: [number, number][] = [[430, 190], [690, 190], [350, 115], [470, 110], [730, 110], [790, 125]]
  return (
    <svg className={className} viewBox="0 0 1000 560" role="img" aria-hidden="true">
      <g fill="none" stroke="#d6b46a" strokeWidth="2.4" strokeLinecap="round">
        {branches.map((d) => <path key={d} d={d} />)}
      </g>
      {/* чайник */}
      <g transform="translate(330 395)">
        <path d="M-80 70C-110 40-105-10-70-30C-40-45 40-45 70-30C105-10 110 40 80 70Z" fill="#f3eee3" stroke="#d6b46a" strokeWidth="2" />
        <rect x="-82" y="10" width="164" height="14" fill="#36c6c0" />
        <path d="M78 10C110 0 125-25 140-45" fill="none" stroke="#f3eee3" strokeWidth="13" strokeLinecap="round" />
        <path d="M-78 -10C-115-10-118 40-82 45" fill="none" stroke="#36c6c0" strokeWidth="8" />
        <ellipse cx="0" cy="-36" rx="40" ry="10" fill="#36c6c0" stroke="#d6b46a" strokeWidth="2" />
        <circle cx="0" cy="-50" r="7" fill="#36c6c0" />
      </g>
      {/* пиала с чаем */}
      <path d="M500 420C505 455 530 475 560 475C590 475 615 455 620 420Z" fill="#f3eee3" stroke="#d6b46a" strokeWidth="2" />
      <ellipse cx="560" cy="420" rx="60" ry="9" fill="#b8741e" />
      <polygon points={starPoints(560, 500, 48, 0.72)} transform="matrix(1 0 0 .2 0 400)" fill="none" stroke="#d6b46a" strokeWidth="2" />
      {medallions.map(([x, y]) => (
        <g key={`${x}${y}`}>
          <circle cx={x} cy={y} r="17" fill="#17243b" stroke="#d6b46a" strokeWidth="2.5" />
          <circle cx={x} cy={y} r="12" fill="none" stroke="#36c6c0" strokeWidth="1.2" />
        </g>
      ))}
    </svg>
  )
}

/** Прежнее древо-иллюстрация больше не используется на главной, но может пригодиться разделам. */
export { TeaIllustration as TreeIllustration }
