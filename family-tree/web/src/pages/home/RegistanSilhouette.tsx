/** Запасной вид без WebGL: силуэт трёх медресе на закатном небе (условный рисунок). */
export function RegistanSilhouette() {
  const portal = (x: number, w: number, h: number) => {
    const aw = w * 0.56, ax = x + (w - aw) / 2, base = 520, top = base - h * 0.78
    return (
      <g key={x}>
        <rect x={x} y={base - h} width={w} height={h} fill="#c49b62" />
        <rect x={x + 6} y={base - h + 6} width={w - 12} height={h * 0.16} fill="#1f3f8f" opacity="0.85" />
        <path d={`M${ax} ${base}V${top + aw * 0.5}Q${ax} ${top} ${ax + aw / 2} ${top - aw * 0.18}Q${ax + aw} ${top} ${ax + aw} ${top + aw * 0.5}V${base}Z`} fill="#2a6f8f" />
        <path d={`M${ax + 10} ${base}V${top + aw * 0.55}Q${ax + 10} ${top + 14} ${ax + aw / 2} ${top}Q${ax + aw - 10} ${top + 14} ${ax + aw - 10} ${top + aw * 0.55}V${base}Z`} fill="#123554" />
      </g>
    )
  }
  const dome = (cx: number, r: number, base: number) => (
    <g key={cx}>
      <rect x={cx - r} y={base - r * 0.9} width={r * 2} height={r * 0.9} fill="#b78f57" />
      <path d={`M${cx - r * 1.04} ${base - r * 0.9}C${cx - r * 1.1} ${base - r * 2.3} ${cx - r * 0.2} ${base - r * 2.5} ${cx} ${base - r * 2.9}C${cx + r * 0.2} ${base - r * 2.5} ${cx + r * 1.1} ${base - r * 2.3} ${cx + r * 1.04} ${base - r * 0.9}Z`} fill="#2aa9b5" />
    </g>
  )
  const minaret = (x: number, h: number) => <rect key={x} x={x - 9} y={520 - h} width={18} height={h} rx={3} fill="#c8a46c" />
  return (
    <svg className="registan-silhouette" viewBox="0 0 1200 600" preserveAspectRatio="xMidYMax slice" role="img">
      <defs>
        <linearGradient id="rs-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d8fd0" />
          <stop offset="0.75" stopColor="#f4d6a6" />
        </linearGradient>
      </defs>
      <rect width="1200" height="600" fill="url(#rs-sky)" />
      <circle cx="260" cy="230" r="46" fill="#fff1d0" opacity="0.8" />
      {dome(450, 62, 400)}
      <rect x="300" y="400" width="600" height="120" fill="#b8915a" />
      {portal(500, 200, 240)}
      {[90, 1110].map((x) => minaret(x, 300))}
      {[310, 890].map((x) => minaret(x, 260))}
      <rect x="80" y="380" width="230" height="140" fill="#c09660" />
      <rect x="890" y="380" width="230" height="140" fill="#c09660" />
      {portal(120, 150, 220)}
      {portal(930, 150, 220)}
      {dome(150, 34, 380)}{dome(1050, 34, 380)}
      <rect y="520" width="1200" height="80" fill="#bfa47c" />
    </svg>
  )
}
