import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'

// Saved choice first; otherwise follow the computer's light/dark setting.
// index.html applies the same rule before React loads, so there is no white flash.
function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch { /* storage unavailable */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    try { localStorage.setItem('theme', theme) } catch { /* storage unavailable */ }
  }, [theme])

  return { theme, toggleTheme: () => setTheme(t => (t === 'dark' ? 'light' : 'dark')) }
}
