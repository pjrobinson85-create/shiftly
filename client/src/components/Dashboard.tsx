import { useAuth } from '../context/AuthContext';
import { Navigate, Outlet } from 'react-router-dom';

// Protected route wrapper — redirects to /login if not authenticated
export function ProtectedRoute() {
  const { token, loading } = useAuth();

  if (loading) return <div style={styles.loading}>Loading...</div>;
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

// Dashboard shell — sidebar + content area
export default function Dashboard() {
  const { user, logout } = useAuth();

  return (
    <div style={styles.layout}>
      {/* Sidebar */}
      <aside style={styles.sidebar}>
        <h2 style={styles.brand}>Shiftly</h2>
        <nav style={styles.nav}>
          <a href="/" style={styles.navLink}>Dashboard</a>
          <a href="/tasks" style={styles.navLink}>Tasks</a>
          <a href="/shopping" style={styles.navLink}>Shopping List</a>
          {user?.role === 'FAMILY' && (
            <>
              <a href="/recurring" style={styles.navLink}>Recurring Tasks</a>
              <a href="/calendar" style={styles.navLink}>Calendar</a>
            </>
          )}
        </nav>
      </aside>

      {/* Main content */}
      <main style={styles.main}>
        <header style={styles.header}>
          <div>
            <h1 style={styles.greeting}>Welcome, {user?.name}</h1>
            <span style={styles.role}>{user?.role === 'FAMILY' ? 'Family Member' : 'Support Worker'}</span>
          </div>
          <button onClick={logout} style={styles.logoutBtn}>Log out</button>
        </header>

        <div style={styles.content}>
          {/* Child routes render here */}
          <Outlet />

          {/* Default content if no child route matched */}
          <DashboardHome />
        </div>
      </main>
    </div>
  );
}

function DashboardHome() {
  const { user } = useAuth();
  return (
    <div style={styles.homeCard}>
      <h2 style={{ margin: '0 0 0.5rem' }}>Dashboard</h2>
      <p style={{ color: '#666' }}>
        {user?.role === 'FAMILY'
          ? 'Add tasks and recurring schedules for your support workers.'
          : 'Your shift task list will appear here when tasks are assigned.'}
      </p>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  layout: {
    display: 'flex',
    minHeight: '100vh',
  },
  sidebar: {
    width: '220px',
    background: '#1e293b',
    color: '#fff',
    padding: '1.5rem 0',
    display: 'flex',
    flexDirection: 'column',
  },
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
  navLink: {
    color: '#cbd5e1',
    textDecoration: 'none',
    padding: '0.6rem 1.5rem',
    fontSize: '0.95rem',
  },
  main: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: '#f8fafc',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    background: '#fff',
    borderBottom: '1px solid #e5e7eb',
  },
  greeting: {
    fontSize: '1.3rem',
    fontWeight: 600,
    margin: 0,
  },
  role: {
    fontSize: '0.85rem',
    color: '#6b7280',
  },
  logoutBtn: {
    padding: '0.5rem 1rem',
    background: 'transparent',
    border: '1px solid #d1d5db',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  content: {
    flex: 1,
    padding: '2rem',
  },
  homeCard: {
    background: '#fff',
    borderRadius: '12px',
    padding: '2rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: '#666',
  },
};
