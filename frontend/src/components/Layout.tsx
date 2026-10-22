import React, { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../theme'
import { getMe } from '../api'
import { useToast } from './Toast'

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'
  const toast = useToast()
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '')
  const [menuOpen, setMenuOpen] = useState(false)
  // Phones/tablets: the sidebar slides in over the page instead of taking up width
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()
  useEffect(() => { setNavOpen(false) }, [location.pathname])
  // Current section, shown in the phone top bar so you know where you are
  const p = location.pathname
  const pageTitle = p === '/' ? 'Dashboard'
    : p === '/contacts/new' ? 'Add Contact'
    : p.startsWith('/contacts/') ? 'Contact Details'
    : p.startsWith('/contacts') ? 'Contacts'
    : p.startsWith('/daily') ? 'Daily Activity'
    : p.startsWith('/import') ? 'Import Excel'
    : ''

  // Swipe left on the open phone menu (or its backdrop) to close it. The menu follows the finger;
  // letting go past a third of its width, or after a quick flick, closes it, otherwise it springs back.
  const asideRef = useRef<HTMLElement>(null)
  const swipe = useRef<{ x: number; y: number; t: number; horizontal: boolean | null } | null>(null)
  const [dragX, setDragX] = useState(0)
  function onSwipeStart(e: React.TouchEvent) {
    if (!navOpen) return
    const p = e.touches[0]
    swipe.current = { x: p.clientX, y: p.clientY, t: Date.now(), horizontal: null }
  }
  function onSwipeMove(e: React.TouchEvent) {
    const s = swipe.current
    if (!s) return
    const p = e.touches[0]
    const dx = p.clientX - s.x
    const dy = p.clientY - s.y
    // Decide once whether this is a sideways swipe or a vertical scroll of the menu
    if (s.horizontal === null && Math.abs(dx) + Math.abs(dy) > 8) s.horizontal = Math.abs(dx) > Math.abs(dy)
    if (s.horizontal) setDragX(Math.min(0, dx))
  }
  function onSwipeEnd(e: React.TouchEvent) {
    const s = swipe.current
    swipe.current = null
    if (!s?.horizontal) { setDragX(0); return }
    const dx = Math.min(0, e.changedTouches[0].clientX - s.x)
    const width = asideRef.current?.offsetWidth ?? 256
    const fastFlick = dx < -40 && Date.now() - s.t < 250
    if (dx < -width / 3 || fastFlick) setNavOpen(false)
    setDragX(0)
  }
  const swipeHandlers = { onTouchStart: onSwipeStart, onTouchMove: onSwipeMove, onTouchEnd: onSwipeEnd, onTouchCancel: () => { swipe.current = null; setDragX(0) } }
  useEffect(() => {
    if (!navOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setNavOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [navOpen])
  const menuRef = useRef<HTMLDivElement>(null)

  // Ask the server who is logged in, so sessions started before the name was saved still show it
  useEffect(() => {
    getMe()
      .then(d => { setUsername(d.username); localStorage.setItem('username', d.username) })
      .catch(() => { /* keep the saved name */ })
  }, [])

  // Close the account menu on an outside click or Escape
  useEffect(() => {
    if (!menuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded text-sm font-medium transition-colors ${isActive ? 'bg-white/25 text-white shadow-sm' : 'text-white/85 hover:bg-white/15 hover:text-white'}`

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    toast.info('Logged out', 'See you next time.')
    navigate('/login')
  }

  return (
    <div className="app-bg flex h-screen bg-gray-100">
      {/* Backdrop behind the slide-in sidebar on small screens */}
      {navOpen && (
        <div
          className="nav-backdrop fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={() => setNavOpen(false)}
          {...swipeHandlers}
          style={dragX ? { opacity: 1 + dragX / (asideRef.current?.offsetWidth ?? 256) } : undefined}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        ref={asideRef}
        {...swipeHandlers}
        className={`sidebar-panel brand-gradient textured w-64 md:w-56 text-white flex flex-col flex-shrink-0
          fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:translate-x-0
          ${navOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'}`}
        style={{
          background: 'linear-gradient(160deg, #4E148C 0%, #02C3BD 100%)', textShadow: '0 1px 2px rgb(0 0 0 / 0.2)',
          // Follow the finger while swiping closed
          ...(dragX ? { transform: `translateX(${dragX}px)`, transition: 'none' } : {}),
        }}
      >
        <div className="brand-header p-4 flex items-center gap-3">
          {/* Logo goes to the dashboard; also closes the phone menu when already on it */}
          <Link to="/" onClick={() => setNavOpen(false)} className="flex items-center gap-3 min-w-0" aria-label="Go to dashboard">
            <div className="brand-logo" aria-hidden="true">K</div>
            <div className="min-w-0">
              <div className="text-lg font-bold leading-tight">KolossusAI</div>
              <div className="text-xs font-medium opacity-75">Marketing Tracker</div>
            </div>
          </Link>
          <button onClick={() => setNavOpen(false)} className="sidebar-close md:hidden ml-auto" aria-label="Close menu">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Any link tap closes the phone menu, including the page you're already on */}
        <nav className="flex-1 p-4 space-y-1" onClick={e => { if ((e.target as HTMLElement).closest('a')) setNavOpen(false) }}>
          <NavLink
            to="/"
            end
            className={navClass}
          >
            Dashboard
          </NavLink>
          <NavLink
            to="/contacts"
            className={navClass}
          >
            Contacts
          </NavLink>
          <NavLink
            to="/daily"
            className={navClass}
          >
            Daily Activity
          </NavLink>
          <NavLink
            to="/import"
            className={navClass}
          >
            Import Excel
          </NavLink>
        </nav>
        <div className="p-4 border-t border-white/20 space-y-2">
          <button
            onClick={toggleTheme}
            role="switch"
            aria-checked={isDark}
            className="sidebar-soft-btn w-full flex items-center justify-between text-sm text-white px-3 py-2 rounded-lg"
          >
            <span>{isDark ? '🌙 Dark mode' : '☀️ Light mode'}</span>
            <span className={`relative inline-block w-9 h-5 rounded-full transition-colors ${isDark ? 'bg-[#02C3BD]' : 'bg-white/30'}`}>
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full transition-transform ${isDark ? 'translate-x-4' : ''}`}
                style={{ backgroundColor: '#fff' }}
              />
            </span>
          </button>
          <div ref={menuRef} className="relative">
            {menuOpen && (
              <div className="account-menu" role="menu">
                <div className="account-menu-head">
                  <div className="account-avatar">{(username[0] ?? '?').toUpperCase()}</div>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{username || '…'}</div>
                    <div className="text-xs opacity-70">Signed in</div>
                  </div>
                </div>
                <button onClick={logout} role="menuitem" className="account-menu-item">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  Logout
                </button>
              </div>
            )}
            <button
              onClick={() => setMenuOpen(o => !o)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="sidebar-soft-btn w-full flex items-center gap-2 text-sm text-white px-3 py-2 rounded-lg"
            >
              <span className="account-avatar is-sm">{(username[0] ?? '?').toUpperCase()}</span>
              <span className="flex-1 text-left truncate">{username || '…'}</span>
              <svg viewBox="0 0 24 24" className={`w-4 h-4 transition-transform ${menuOpen ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 9l-7 7-7-7" />
              </svg>
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar with menu button, small screens only */}
        <div className="mobile-topbar md:hidden flex items-center gap-3 px-4 py-3">
          <button onClick={() => setNavOpen(true)} className="mobile-menu-btn" aria-label="Open menu" aria-expanded={navOpen}>
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-base font-bold truncate min-w-0">{pageTitle || 'KolossusAI'}</h1>
        </div>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
