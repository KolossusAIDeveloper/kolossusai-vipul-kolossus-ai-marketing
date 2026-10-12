import React from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useTheme } from '../theme'

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const { theme, toggleTheme } = useTheme()
  const isDark = theme === 'dark'

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `block px-3 py-2 rounded text-sm font-medium transition-colors ${isActive ? 'bg-white/25 text-white shadow-sm' : 'text-white/85 hover:bg-white/15 hover:text-white'}`

  function logout() {
    localStorage.removeItem('token')
    navigate('/login')
  }

  return (
    <div className="app-bg flex h-screen bg-gray-100">
      {/* Sidebar */}
      <aside
        className="brand-gradient textured w-56 text-white flex flex-col flex-shrink-0"
        style={{ background: 'linear-gradient(160deg, #4E148C 0%, #02C3BD 100%)', textShadow: '0 1px 2px rgb(0 0 0 / 0.2)' }}
      >
        <div className="brand-header p-4 flex items-center gap-3">
          <div className="brand-logo" aria-hidden="true">K</div>
          <div className="min-w-0">
            <div className="text-lg font-bold leading-tight">KolossusAI</div>
            <div className="text-xs font-medium opacity-75">Marketing Tracker</div>
          </div>
        </div>
        <nav className="flex-1 p-4 space-y-1">
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
          <button
            onClick={logout}
            className="sidebar-soft-btn w-full text-left text-sm text-white px-3 py-2 rounded-lg"
          >
            Logout
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        {children}
      </main>
    </div>
  )
}
