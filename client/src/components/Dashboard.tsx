import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Navigate, NavLink, Outlet } from 'react-router-dom';
import type { CSSProperties } from 'react';

// Protected route wrapper — redirects to /login if not authenticated
export function ProtectedRoute() {
  const { token, loading } = useAuth();

  if (loading) return <div style={styles.loading}>Loading...</div>;
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

// Dashboard shell — sidebar + content area.
// The page content (ShiftSummary, Tasks, etc.) renders via <Outlet />;
// there is no separate home card — the index route IS the dashboard.
export default function Dashboard() {
  const { user, logout } = useAuth();
  const { dark, toggle } = useTheme();

  return (
    <div style={styles.layout(dark)}>
      {/* Sidebar */}
      <aside style={styles.sidebar(dark)}>
        <h2 style={styles.brand}>Shiftly</h2>
        <nav style={styles.nav}>
          <SidebarLink to="/" label="Dashboard" dark={dark} />
          <SidebarLink to="/tasks" label="Tasks" dark={dark} />
          <SidebarLink to="/shopping" label="Shopping List" dark={dark} />
          <SidebarLink to="/care-profile" label="Care Profile" dark={dark} />
          <SidebarLink to="/incidents" label="Incidents" dark={dark} />
          {user?.role === 'FAMILY' && (
            <>
              <SidebarLink to="/recurring" label="Recurring Tasks" dark={dark} />
              <SidebarLink to="/calendar" label="Calendar" dark={dark} />
            </>
          )}
          {user?.isAdmin && (
            <SidebarLink to="/admin" label="Admin" dark={dark} />
          )}
          <SidebarLink to="/account" label="Account" dark={dark} />
        </nav>
      </aside>

      {/* Main content */}
      <main style={styles.main(dark)}>
        <header style={styles.header(dark)}>
          <div>
            <h1 style={styles.greeting}>Welcome, {user?.name}</h1>
            <span style={styles.role}>{user?.role === 'FAMILY' ? 'Family Member' : 'Support Worker'}</span>
          </div>
          <div style={styles.headerRight}>
            <button onClick={toggle} style={styles.themeBtn} title="Toggle dark mode">
              {dark ? '☀️' : '🌙'}
            </button>
            <button onClick={logout} style={styles.logoutBtn(dark)}>Log out</button>
          </div>
        </header>

        <div style={styles.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function SidebarLink({ to, label, dark }: { to: string; label: string; dark: boolean }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      style={({ isActive }) => styles.navLink(dark, isActive)}
    >
      {label}
    </NavLink>
  );
}

const styles = {
  layout: (dark) => ({
    display: 'flex',
    minHeight: '100vh',
    background: 'var(--bg)',
  }),
  sidebar: (dark) => ({
    width: '220px',
    background: 'var(--sidebar)',
    color: 'var(--on-color)',
    padding: '1.5rem 0',
    display: 'flex',
    flexDirection: 'column',
  }),
  brand: {
    fontSize: '1.4rem',
    fontWeight: 700,
    margin: '0 0 2rem 1.5rem',
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  navLink: (dark: boolean, isActive = false) => ({
    color: 'var(--sidebar-text)',
    textDecoration: 'none',
    padding: '0.6rem 1.5rem',
    fontSize: '0.95rem',
    cursor: 'pointer',
    background: isActive ? ('var(--nav-active)') : 'transparent',
    borderLeft: isActive ? '3px solid var(--info)' : '3px solid transparent',
    fontWeight: isActive ? 600 : 400,
  }),
  main: (dark) => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg)',
  }),
  header: (dark) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    background: 'var(--surface)',
    borderBottom: '1px solid var(--border)',
  }),
  greeting: {
    fontSize: '1.3rem',
    fontWeight: 600,
    margin: 0,
  },
  role: {
    fontSize: '0.85rem',
    color: 'var(--muted)',
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  themeBtn: {
    background: 'none',
    border: 'none',
    fontSize: '1.3rem',
    cursor: 'pointer',
    padding: '0.25rem',
  },
  logoutBtn: (dark) => ({
    padding: '0.5rem 1rem',
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    color: 'var(--text-2)',
  }),
  content: {
    flex: 1,
    padding: '2rem',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: 'var(--muted)',
  },
} satisfies Record<string, CSSProperties | ((...args: any[]) => CSSProperties)>;
