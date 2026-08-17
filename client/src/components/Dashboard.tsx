import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Navigate, NavLink, Outlet } from 'react-router-dom';
import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import api from '../api/client';

interface TaskInstance {
  id: string;
  title: string;
  description?: string;
  priority: 'NORMAL' | 'URGENT';
  completed: boolean;
}

// Protected route wrapper — redirects to /login if not authenticated
export function ProtectedRoute() {
  const { token, loading } = useAuth();

  if (loading) return <div style={styles.loading}>Loading...</div>;
  return token ? <Outlet /> : <Navigate to="/login" replace />;
}

// Dashboard shell — sidebar + content area
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
          <DashboardHome />
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

function DashboardHome() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const today = new Date().toISOString().split('T')[0];
  const [stats, setStats] = useState<{ total: number; completed: number } | null>(null);
  const [topTasks, setTopTasks] = useState<TaskInstance[]>([]);

  useEffect(() => {
    api.get(`/tasks?date=${today}`).then(({ data }) => {
      const tasks = data as TaskInstance[];
      const sorted = [...tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.priority !== b.priority) return a.priority === 'URGENT' ? -1 : 1;
        return 0;
      });
      setStats({ total: tasks.length, completed: tasks.filter((t) => t.completed).length });
      setTopTasks(sorted.slice(0, 5));
    }).catch(() => {});
  }, [today]);

  const progressPct = stats ? Math.round((stats.completed / Math.max(stats.total, 1)) * 100) : 0;

  return (
    <div style={styles.homeCard(dark)}>
      <h2 style={{ margin: '0 0 0.5rem', color: 'var(--text)' }}>Dashboard</h2>
      <p style={{ color: 'var(--muted)', marginBottom: '1.5rem' }}>
        {user?.role === 'FAMILY'
          ? 'Add tasks and recurring schedules for your support workers.'
          : 'Your shift task list will appear here when tasks are assigned.'}
      </p>

      {/* Stats row */}
      <div style={styles.statsRow}>
        <div style={styles.statCard(dark)}>
          <div style={styles.statValue}>{stats?.total ?? '...'}</div>
          <div style={styles.statLabel}>Today's Tasks</div>
        </div>
        <div style={styles.statCard(dark)}>
          <div style={{ ...styles.statValue, color: 'var(--success)' }}>{stats?.completed ?? 0}</div>
          <div style={styles.statLabel}>Completed</div>
        </div>
        <div style={styles.statCard(dark)}>
          <div style={{ ...styles.statValue, color: 'var(--brand-text)' }}>{progressPct}%</div>
          <div style={styles.statLabel}>Progress</div>
        </div>
      </div>

      {/* Top 5 tasks */}
      {topTasks.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: 'var(--text-2)' }}>
            Today's Tasks
          </h3>
          <div style={styles.taskList}>
            {topTasks.map(task => (
              <TodayTaskCard key={task.id} task={task} dark={dark} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TodayTaskCard({ task, dark }: { task: TaskInstance; dark: boolean }) {
  const isUrgent = task.priority === 'URGENT';
  return (
    <div style={{
      ...styles.todayTaskCard(dark),
      ...(isUrgent && !task.completed ? styles.todayTaskUrgent : {}),
      ...(task.completed ? styles.todayTaskCompleted : {}),
    }}>
      <div style={{
        ...styles.taskCheckCircle,
        background: task.completed ? 'var(--success-surface)' : (isUrgent ? 'var(--danger)' : 'var(--brand)'),
      }}>
        {task.completed ? '✓' : ''}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          ...styles.todayTaskTitle,
          color: task.completed ? 'var(--muted)' : 'var(--text)',
          textDecoration: task.completed ? 'line-through' : 'none',
        }}>
          {task.title}
        </span>
      </div>
      {isUrgent && !task.completed && (
        <span style={styles.urgentBadge}>URGENT</span>
      )}
    </div>
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
  homeCard: (dark) => ({
    background: 'var(--surface)',
    borderRadius: '12px',
    padding: '2rem',
    boxShadow: '0 1px 4px var(--shadow-c)',
  }),
  statsRow: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1rem',
  },
  statCard: (dark) => ({
    flex: 1,
    background: 'var(--surface-2)',
    borderRadius: '8px',
    padding: '1rem',
    textAlign: 'center' as const,
  }),
  statValue: {
    fontSize: '1.8rem',
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: '0.25rem',
  },
  statLabel: {
    fontSize: '0.8rem',
    color: 'var(--muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
  },
  taskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  todayTaskCard: (dark) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    background: 'var(--surface-2)',
    borderRadius: '8px',
    borderLeft: '4px solid var(--brand)',
  }),
  todayTaskUrgent: {
    borderLeftColor: 'var(--danger)',
  },
  todayTaskCompleted: {
    opacity: 0.6,
    borderLeftColor: 'var(--success)',
  },
  taskCheckCircle: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--on-color)',
    fontSize: '0.8rem',
    fontWeight: 700,
    flexShrink: 0,
  },
  todayTaskTitle: {
    fontSize: '0.95rem',
    fontWeight: 500,
  },
  urgentBadge: {
    background: 'var(--danger)',
    color: 'var(--on-color)',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
    flexShrink: 0,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100vh',
    color: 'var(--muted)',
  },
} satisfies Record<string, CSSProperties | ((...args: any[]) => CSSProperties)>;
