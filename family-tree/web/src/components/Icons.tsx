// Тонкие линейные иконки в одном стиле: штрих 1.4, скругления.
const base = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const IconUser = () => <svg {...base}><circle cx="12" cy="8.5" r="3.6" /><path d="M5 20c1.2-3.6 4-5.4 7-5.4s5.8 1.8 7 5.4" /></svg>
export const IconMenu = () => <svg {...base}><path d="M4 7h16M4 12h16M4 17h10" /></svg>
export const IconClose = () => <svg {...base}><path d="M6 6l12 12M18 6L6 18" /></svg>
export const IconSearch = () => <svg {...base}><circle cx="11" cy="11" r="6" /><path d="M20 20l-4.2-4.2" /></svg>
export const IconPlus = () => <svg {...base}><path d="M12 5v14M5 12h14" /></svg>
export const IconMinus = () => <svg {...base}><path d="M5 12h14" /></svg>
export const IconFit = () => <svg {...base}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
export const IconChevronUp = () => <svg {...base}><path d="M6 15l6-6 6 6" /></svg>
export const IconChevronDown = () => <svg {...base}><path d="M6 9l6 6 6-6" /></svg>
export const IconArrowDown = () => <svg {...base}><path d="M12 4v15M6 13l6 6 6-6" /></svg>
export const IconArrowLeft = () => <svg {...base}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
export const IconArrowRight = () => <svg {...base}><path d="M5 12h14M13 6l6 6-6 6" /></svg>
export const IconEdit = () => <svg {...base}><path d="M4 20h4L19 9l-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></svg>
export const IconTrash = () => <svg {...base}><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" /></svg>
export const IconCamera = () => <svg {...base}><path d="M4 8h3l2-2.5h6L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>
export const IconDocument = () => <svg {...base}><path d="M7 3h7l4 4v14H7z" /><path d="M14 3v4h4M9.5 12h6M9.5 15.5h6" /></svg>
export const IconQuote = () => <svg {...base}><path d="M9 7c-3 1-4.5 3.5-4.5 7h4v4h-4M19.5 7c-3 1-4.5 3.5-4.5 7h4v4h-4" /></svg>
export const IconPeople = () => <svg {...base}><circle cx="8.5" cy="9" r="3" /><circle cx="16.5" cy="10" r="2.5" /><path d="M3 19c.8-3 3-4.5 5.5-4.5S13.2 16 14 19M14.5 15c2.6-.6 5 .6 6.5 4" /></svg>
export const IconClock = () => <svg {...base}><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></svg>
export const IconShare = () => <svg {...base}><circle cx="6" cy="12" r="2.4" /><circle cx="18" cy="6" r="2.4" /><circle cx="18" cy="18" r="2.4" /><path d="M8.2 11l7.6-3.8M8.2 13l7.6 3.8" /></svg>
export const IconTree = () => <svg {...base}><path d="M12 21v-7M12 14l-5-4M12 14l5-4M7 10V6M17 10V6M12 14V8" /><circle cx="7" cy="4.5" r="1.5" /><circle cx="17" cy="4.5" r="1.5" /><circle cx="12" cy="6.5" r="1.5" /></svg>
export const IconCube = () => <svg {...base}><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></svg>
export const IconUndo = () => <svg {...base}><path d="M9 7L4 12l5 5" /><path d="M4 12h10a6 6 0 010 12" transform="translate(0 -6)" /></svg>
