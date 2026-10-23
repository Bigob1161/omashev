/**
 * Режим «только просмотр» для публикации на GitHub Pages: данные читаются из снимка family.json,
 * а все кнопки изменения скрыты. Включается сборкой `npm run build:static`.
 */
export const READ_ONLY = import.meta.env.VITE_STATIC === '1'
