export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'restobar-theme'

type Listener = () => void

let currentTheme: Theme = resolveTheme()
const listeners = new Set<Listener>()

function resolveTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function getTheme(): Theme {
  return currentTheme
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
}

export function initTheme(): void {
  currentTheme = resolveTheme()
  applyTheme(currentTheme)
}

export function setTheme(theme: Theme): void {
  currentTheme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // almacenamiento no disponible
  }
  applyTheme(theme)
  listeners.forEach((listener) => listener())
}

export function toggleTheme(): void {
  setTheme(currentTheme === 'dark' ? 'light' : 'dark')
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
