import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import api from '../api/client';
import { io, Socket } from 'socket.io-client';

interface TaskInstance {
  id: string;
  title: string;
  description?: string;
  priority: 'NORMAL' | 'URGENT';
  completed: boolean;
  completedAt?: string;
  dueDate: string;
  isRecurring: boolean;
  createdBy?: { id: string; name: string; role: string };
  completedBy?: { id: string; name: string; role: string };
}

let socket: Socket | null = null;

function getSocket() {
  if (!socket) {
    socket = io(window.location.origin, {
      path: '/shiftly/socket.io',
      autoConnect: false,
    });
  }
  return socket;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Priority color constants — consistent across the app
const PRIORITY_COLORS = {
  NORMAL: '#2563eb',    // blue
  URGENT: '#dc2626',    // red
  COMPLETED: '#16a34a', // green
};

export default function TasksPage() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const [selectedDate, setSelectedDate] = useState(formatDate(new Date()));
  const [tasks, setTasks] = useState<TaskInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [completing, setCompleting] = useState<string | null>(null);

  // Add task form (FAMILY only)
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState<'NORMAL' | 'URGENT'>('NORMAL');
  const [addingTask, setAddingTask] = useState(false);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<TaskInstance[]>(`/tasks?date=${selectedDate}`);
      const sorted = [...data].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        if (a.priority !== b.priority) return a.priority === 'URGENT' ? -1 : 1;
        return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
      });
      setTasks(sorted);
    } catch {
      setError('Failed to load tasks.');
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Socket.io real-time updates
  useEffect(() => {
    const s = getSocket();
    s.connect();
    if (user?.role) {
      s.emit('join-role', user.role);
    }

    s.on('task:created', (task: TaskInstance) => {
      const taskDate = formatDate(new Date(task.dueDate));
      if (taskDate === selectedDate) {
        setTasks(prev => {
          const updated = [...prev.filter(t => t.id !== task.id), task];
          return updated.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            if (a.priority !== b.priority) return a.priority === 'URGENT' ? -1 : 1;
            return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
          });
        });
      }
    });

    s.on('task:completed', (task: TaskInstance) => {
      setTasks(prev =>
        prev.map(t => t.id === task.id ? task : t).sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          if (a.priority !== b.priority) return a.priority === 'URGENT' ? -1 : 1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        })
      );
    });

    return () => {
      s.off('task:created');
      s.off('task:completed');
      s.disconnect();
      socket = null;
    };
  }, [user?.role, selectedDate]);

  async function completeTask(id: string) {
    setCompleting(id);
    try {
      const { data } = await api.patch<TaskInstance>(`/tasks/${id}/complete`);
      setTasks(prev =>
        prev.map(t => t.id === id ? data : t).sort((a, b) => {
          if (a.completed !== b.completed) return a.completed ? 1 : -1;
          if (a.priority !== b.priority) return a.priority === 'URGENT' ? -1 : 1;
          return 0;
        })
      );
    } catch {
      setError('Failed to complete task.');
    } finally {
      setCompleting(null);
    }
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this task?')) return;
    try {
      await api.delete(`/tasks/${id}`);
      setTasks(prev => prev.filter(t => t.id !== id));
    } catch {
      setError('Failed to delete task.');
    }
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAddingTask(true);
    try {
      await api.post('/tasks', {
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        priority: newPriority,
        dueDate: new Date(selectedDate + 'T12:00:00').toISOString(),
      });
      setNewTitle('');
      setNewDesc('');
      setNewPriority('NORMAL');
      setShowAddForm(false);
      fetchTasks();
    } catch {
      setError('Failed to add task.');
    } finally {
      setAddingTask(false);
    }
  }

  const completedCount = tasks.filter(t => t.completed).length;
  const totalCount = tasks.length;
  const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const today = formatDate(new Date());
  const isToday = selectedDate === today;

  function shiftDay(delta: number) {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    setSelectedDate(formatDate(d));
  }

  return (
    <div style={styles.page}>
      {/* Date nav */}
      <div style={styles.dateNav(dark)}>
        <button style={styles.navBtn(dark)} onClick={() => shiftDay(-1)}>‹</button>
        <div style={styles.dateCenter}>
          <div style={styles.dateLabel(dark)}>
            {isToday ? 'Today' : formatDisplayDate(selectedDate)}
          </div>
          {!isToday && (
            <button style={styles.todayBtn} onClick={() => setSelectedDate(today)}>
              Back to today
            </button>
          )}
        </div>
        <button style={styles.navBtn(dark)} onClick={() => shiftDay(1)}>›</button>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div style={styles.progressWrap}>
          <div style={styles.progressBar(dark)}>
            <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
          </div>
          <span style={styles.progressLabel}>{completedCount}/{totalCount} tasks done</span>
        </div>
      )}

      {/* Header row */}
      <div style={styles.headerRow}>
        <h2 style={styles.pageTitle(dark)}>Tasks</h2>
        {user?.role === 'FAMILY' && (
          <button style={styles.addBtn} onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? '✕ Cancel' : '+ Add Task'}
          </button>
        )}
      </div>

      {/* Add task form */}
      {showAddForm && user?.role === 'FAMILY' && (
        <form onSubmit={addTask} style={styles.addForm(dark)}>
          <input
            style={styles.input(dark)}
            placeholder="Task title *"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            required
            autoFocus
          />
          <input
            style={styles.input(dark)}
            placeholder="Description (optional)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <div style={styles.priorityRow(dark)}>
            <label style={styles.priorityLabel}>
              <input
                type="radio"
                name="priority"
                value="NORMAL"
                checked={newPriority === 'NORMAL'}
                onChange={() => setNewPriority('NORMAL')}
              />
              &nbsp;Normal
            </label>
            <label style={{ ...styles.priorityLabel, color: '#dc2626' }}>
              <input
                type="radio"
                name="priority"
                value="URGENT"
                checked={newPriority === 'URGENT'}
                onChange={() => setNewPriority('URGENT')}
              />
              &nbsp;Urgent
            </label>
          </div>
          <button type="submit" disabled={addingTask} style={styles.submitBtn}>
            {addingTask ? 'Adding...' : 'Add Task'}
          </button>
        </form>
      )}

      {error && <div style={styles.error}>{error}</div>}

      {/* Task list */}
      {loading ? (
        <div style={styles.emptyState(dark)}>Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div style={styles.emptyState(dark)}>
          <div style={styles.emptyIcon}>✓</div>
          <div>No tasks for this day</div>
          {user?.role === 'FAMILY' && (
            <div style={styles.emptyHint}>Use the + Add Task button to add one</div>
          )}
        </div>
      ) : (
        <div style={styles.taskList}>
          {tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              role={user?.role}
              dark={dark}
              completing={completing === task.id}
              onComplete={() => completeTask(task.id)}
              onDelete={() => deleteTask(task.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface TaskCardProps {
  task: TaskInstance;
  role?: string;
  dark: boolean;
  completing: boolean;
  onComplete: () => void;
  onDelete: () => void;
}

function TaskCard({ task, role, dark, completing, onComplete, onDelete }: TaskCardProps) {
  const isUrgent = task.priority === 'URGENT';
  const borderColor = task.completed ? PRIORITY_COLORS.COMPLETED : (isUrgent ? PRIORITY_COLORS.URGENT : PRIORITY_COLORS.NORMAL);

  const dueTime = new Date(task.dueDate).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div style={{
      ...styles.taskCard(dark),
      borderLeft: `4px solid ${borderColor}`,
      ...(task.completed ? styles.taskCompleted : {}),
    }}>
      {/* Complete button */}
      {!task.completed ? (
        <button
          style={{
            ...styles.completeBtn(borderColor),
            ...(completing ? styles.completeBtnLoading : {}),
          }}
          onClick={onComplete}
          disabled={completing}
          title="Mark complete"
        >
          {completing ? '...' : '✓'}
        </button>
      ) : (
        <div style={{ ...styles.completedIcon, background: PRIORITY_COLORS.COMPLETED }}>✓</div>
      )}

      {/* Task info */}
      <div style={styles.taskInfo}>
        <div style={styles.taskTitleRow}>
          <span style={{
            ...styles.taskTitle(dark),
            ...(task.completed ? styles.taskTitleDone : {}),
          }}>
            {task.title}
          </span>
          {isUrgent && !task.completed && (
            <span style={styles.urgentBadge}>URGENT</span>
          )}
          {task.isRecurring && (
            <span style={styles.recurringBadge}>↻</span>
          )}
        </div>
        {task.description && (
          <div style={{
            ...styles.taskDesc(dark),
            ...(task.completed ? styles.taskDescDone : {}),
          }}>
            {task.description}
          </div>
        )}
        <div style={styles.taskMeta}>
          {task.completed ? (
            <span style={styles.completedTime}>
              Completed by {task.completedBy?.name || 'someone'}{' '}
              {task.completedAt
                ? new Date(task.completedAt).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
                : ''}
            </span>
          ) : (
            <span style={styles.dueTime}>Due {dueTime}{task.createdBy?.name ? ` · by ${task.createdBy.name}` : ''}</span>
          )}
        </div>
      </div>

      {/* Delete (FAMILY only) */}
      {role === 'FAMILY' && (
        <button style={styles.deleteBtn(dark)} onClick={onDelete} title="Delete task">✕</button>
      )}
    </div>
  );
}

const styles: Record<string, (dark?: boolean) => React.CSSProperties | undefined> = {
  page: () => ({
    maxWidth: '680px',
    margin: '0 auto',
  }),
  dateNav: (dark) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: dark ? '#1e293b' : '#fff',
    borderRadius: '12px',
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
    boxShadow: `0 1px 4px ${dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)'}`,
  }),
  navBtn: (dark) => ({
    background: 'none',
    border: `1px solid ${dark ? '#475569' : '#e5e7eb'}`,
    borderRadius: '8px',
    width: '36px',
    height: '36px',
    fontSize: '1.3rem',
    cursor: 'pointer',
    color: dark ? '#e2e8f0' : '#374151',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  dateCenter: () => ({
    textAlign: 'center',
  }),
  dateLabel: (dark) => ({
    fontWeight: 600,
    fontSize: '1rem',
    color: dark ? '#f1f5f9' : '#111827',
  }),
  todayBtn: () => ({
    background: 'none',
    border: 'none',
    color: '#2563eb',
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: '2px 0',
  }),
  progressWrap: () => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
  }),
  progressBar: (dark) => ({
    flex: 1,
    height: '8px',
    background: dark ? '#334155' : '#e5e7eb',
    borderRadius: '99px',
    overflow: 'hidden',
  }),
  progressFill: () => ({
    height: '100%',
    background: PRIORITY_COLORS.COMPLETED,
    borderRadius: '99px',
    transition: 'width 0.3s ease',
  }),
  progressLabel: () => ({
    fontSize: '0.8rem',
    color: '#6b7280',
    whiteSpace: 'nowrap',
  }),
  headerRow: () => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  }),
  pageTitle: (dark) => ({
    fontSize: '1.3rem',
    fontWeight: 700,
    color: dark ? '#f1f5f9' : '#111827',
    margin: 0,
  }),
  addBtn: () => ({
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  }),
  addForm: (dark) => ({
    background: dark ? '#1e293b' : '#fff',
    borderRadius: '12px',
    padding: '1.25rem',
    marginBottom: '1rem',
    boxShadow: `0 1px 4px ${dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)'}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  }),
  input: (dark) => ({
    padding: '0.6rem 0.8rem',
    border: `1px solid ${dark ? '#475569' : '#e5e7eb'}`,
    borderRadius: '8px',
    fontSize: '0.95rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
    background: dark ? '#0f172a' : '#fff',
    color: dark ? '#e2e8f0' : '#111827',
  }),
  priorityRow: (dark) => ({
    display: 'flex',
    gap: '1.5rem',
    fontSize: '0.9rem',
    color: dark ? '#e2e8f0' : '#374151',
  }),
  priorityLabel: () => ({
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    gap: '0.25rem',
  }),
  submitBtn: () => ({
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.65rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  }),
  error: () => ({
    background: '#fef2f2',
    color: '#dc2626',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  }),
  emptyState: (dark) => ({
    textAlign: 'center' as const,
    padding: '3rem 1rem',
    color: dark ? '#94a3b8' : '#6b7280',
  }),
  emptyIcon: () => ({
    fontSize: '3rem',
    marginBottom: '0.5rem',
    color: '#d1d5db',
  }),
  emptyHint: () => ({
    fontSize: '0.85rem',
    marginTop: '0.5rem',
    color: '#9ca3af',
  }),
  taskList: () => ({
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  }),
  taskCard: (dark) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    background: dark ? '#1e293b' : '#fff',
    borderRadius: '8px',
    boxShadow: `0 1px 3px ${dark ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.06)'}`,
  }),
  taskCompleted: () => ({
    opacity: 0.6,
  }),
  completeBtn: (borderColor: string) => ({
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    border: `2px solid ${borderColor}`,
    background: 'transparent',
    color: borderColor,
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  completeBtnLoading: () => ({
    opacity: 0.5,
  }),
  completedIcon: () => ({
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: PRIORITY_COLORS.COMPLETED,
    color: '#fff',
    fontSize: '1rem',
    fontWeight: 700,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  taskInfo: () => ({
    flex: 1,
    minWidth: 0,
  }),
  taskTitleRow: () => ({
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  }),
  taskTitle: (dark) => ({
    fontSize: '1rem',
    fontWeight: 600,
    color: dark ? '#f1f5f9' : '#111827',
  }),
  taskTitleDone: () => ({
    textDecoration: 'line-through',
    opacity: 0.7,
  }),
  urgentBadge: () => ({
    background: PRIORITY_COLORS.URGENT,
    color: '#fff',
    padding: '0.15rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase' as const,
  }),
  recurringBadge: () => ({
    color: '#9ca3af',
    fontSize: '1rem',
  }),
  taskDesc: (dark) => ({
    fontSize: '0.85rem',
    color: dark ? '#94a3b8' : '#6b7280',
    marginTop: '0.25rem',
  }),
  taskDescDone: () => ({
    textDecoration: 'line-through',
  }),
  taskMeta: () => ({
    fontSize: '0.8rem',
    color: '#9ca3af',
    marginTop: '0.25rem',
  }),
  completedTime: () => ({
    fontSize: '0.8rem',
    color: '#9ca3af',
  }),
  dueTime: () => ({
    fontSize: '0.8rem',
    color: '#9ca3af',
  }),
  deleteBtn: (dark) => ({
    background: 'none',
    border: 'none',
    color: dark ? '#ef4444' : '#dc2626',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '0.25rem',
    opacity: 0.6,
    flexShrink: 0,
  }),
};
