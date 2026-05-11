import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Navigate, Outlet, useNavigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
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
  const navigate = useNavigate();
  return (
    <a
      href={to}
      onClick={(e) => { e.preventDefault(); navigate(to); }}
      style={styles.navLink(dark)}
    >
      {label}
    </a>
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
      <h2 style={{ margin: '0 0 0.5rem', color: dark ? '#f1f5f9' : '#111827' }}>Dashboard</h2>
      <p style={{ color: dark ? '#94a3b8' : '#666', marginBottom: '1.5rem' }}>
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
          <div style={{ ...styles.statValue, color: '#16a34a' }}>{stats?.completed ?? 0}</div>
          <div style={styles.statLabel}>Completed</div>
        </div>
        <div style={styles.statCard(dark)}>
          <div style={{ ...styles.statValue, color: '#2563eb' }}>{progressPct}%</div>
          <div style={styles.statLabel}>Progress</div>
        </div>
      </div>

      {/* Top 5 tasks */}
      {topTasks.length > 0 && (
        <div style={{ marginTop: '1.5rem' }}>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', color: dark ? '#e2e8f0' : '#374151' }}>
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
        background: task.completed ? '#16a34a' : (isUrgent ? '#dc2626' : '#2563eb'),
      }}>
        {task.completed ? '✓' : ''}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          ...styles.todayTaskTitle,
          color: dark ? (task.completed ? '#6b7280' : '#f1f5f9') : (task.completed ? '#9ca3af' : '#111827'),
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

const styles: Record<string, (dark?: boolean) => React.CSSProperties | undefined> = {
  layout: (dark) => ({
    display: 'flex',
    minHeight: '100vh',
    background: dark ? '#0f172a' : '#f8fafc',
  }),
  sidebar: (dark) => ({
    width: '220px',
    background: dark ? '#020617' : '#1e293b',
    color: '#fff',
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
  navLink: (dark) => ({
    color: dark ? '#cbd5e1' : '#cbd5e1',
    textDecoration: 'none',
    padding: '0.6rem 1.5rem',
    fontSize: '0.95rem',
    cursor: 'pointer',
  }),
  main: (dark) => ({
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    background: dark ? '#0f172a' : '#f8fafc',
  }),
  header: (dark) => ({
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 2rem',
    background: dark ? '#1e293b' : '#fff',
    borderBottom: `1px solid ${dark ? '#334155' : '#e5e7eb'}`,
  }),
  greeting: {
    fontSize: '1.3rem',
    fontWeight: 600,
    margin: 0,
  },
  role: {
    fontSize: '0.85rem',
    color: '#6b7280',
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
    border: `1px solid ${dark ? '#475569' : '#d1d5db'}`,
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    color: dark ? '#e2e8f0' : '#374151',
  }),
  content: {
    flex: 1,
    padding: '2rem',
  },
  homeCard: (dark) => ({
    background: dark ? '#1e293b' : '#fff',
    borderRadius: '12px',
    padding: '2rem',
    boxShadow: `0 1px 4px ${dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)'}`,
  }),
  statsRow: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1rem',
  },
  statCard: (dark) => ({
    flex: 1,
    background: dark ? '#334155' : '#f8fafc',
    borderRadius: '8px',
    padding: '1rem',
    textAlign: 'center' as const,
  }),
  statValue: {
    fontSize: '1.8rem',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '0.25rem',
  },
  statLabel: {
    fontSize: '0.8rem',
    color: '#6b7280',
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
    background: dark ? '#334155' : '#f8fafc',
    borderRadius: '8px',
    borderLeft: '4px solid #2563eb',
  }),
  todayTaskUrgent: {
    borderLeftColor: '#dc2626',
  },
  todayTaskCompleted: {
    opacity: 0.6,
    borderLeftColor: '#16a34a',
  },
  taskCheckCircle: {
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '0.8rem',
    fontWeight: 700,
    flexShrink: 0,
  },
  todayTaskTitle: {
    fontSize: '0.95rem',
    fontWeight: 500,
  },
  urgentBadge: {
    background: '#dc2626',
    color: '#fff',
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
    color: '#666',
  },
};
