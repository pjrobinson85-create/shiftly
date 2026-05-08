import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
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
    socket = io('/', { autoConnect: false });
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

export default function TasksPage() {
  const { user } = useAuth();
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
      // Sort: URGENT first, then by dueDate, completed last
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
      <div style={styles.dateNav}>
        <button style={styles.navBtn} onClick={() => shiftDay(-1)}>‹</button>
        <div style={styles.dateCenter}>
          <div style={styles.dateLabel}>
            {isToday ? 'Today' : formatDisplayDate(selectedDate)}
          </div>
          {!isToday && (
            <button style={styles.todayBtn} onClick={() => setSelectedDate(today)}>
              Back to today
            </button>
          )}
        </div>
        <button style={styles.navBtn} onClick={() => shiftDay(1)}>›</button>
      </div>

      {/* Progress bar */}
      {totalCount > 0 && (
        <div style={styles.progressWrap}>
          <div style={styles.progressBar}>
            <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
          </div>
          <span style={styles.progressLabel}>{completedCount}/{totalCount} tasks done</span>
        </div>
      )}

      {/* Header row */}
      <div style={styles.headerRow}>
        <h2 style={styles.pageTitle}>Tasks</h2>
        {user?.role === 'FAMILY' && (
          <button style={styles.addBtn} onClick={() => setShowAddForm(!showAddForm)}>
            {showAddForm ? '✕ Cancel' : '+ Add Task'}
          </button>
        )}
      </div>

      {/* Add task form */}
      {showAddForm && user?.role === 'FAMILY' && (
        <form onSubmit={addTask} style={styles.addForm}>
          <input
            style={styles.input}
            placeholder="Task title *"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            required
            autoFocus
          />
          <input
            style={styles.input}
            placeholder="Description (optional)"
            value={newDesc}
            onChange={e => setNewDesc(e.target.value)}
          />
          <div style={styles.priorityRow}>
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
        <div style={styles.emptyState}>Loading tasks...</div>
      ) : tasks.length === 0 ? (
        <div style={styles.emptyState}>
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
  completing: boolean;
  onComplete: () => void;
  onDelete: () => void;
}

function TaskCard({ task, role, completing, onComplete, onDelete }: TaskCardProps) {
  const isUrgent = task.priority === 'URGENT';
  const dueTime = new Date(task.dueDate).toLocaleTimeString('en-AU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div style={{
      ...styles.taskCard,
      ...(task.completed ? styles.taskCompleted : {}),
      ...(isUrgent && !task.completed ? styles.taskUrgent : {}),
    }}>
      {/* Complete button */}
      {!task.completed ? (
        <button
          style={{ ...styles.completeBtn, ...(completing ? styles.completeBtnLoading : {}) }}
          onClick={onComplete}
          disabled={completing}
          title="Mark complete"
        >
          {completing ? '...' : '✓'}
        </button>
      ) : (
        <div style={styles.completedIcon}>✓</div>
      )}

      {/* Task info */}
      <div style={styles.taskInfo}>
        <div style={styles.taskTitleRow}>
          <span style={{
            ...styles.taskTitle,
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
            ...styles.taskDesc,
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
        <button style={styles.deleteBtn} onClick={onDelete} title="Delete task">✕</button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '680px',
    margin: '0 auto',
  },
  dateNav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: '#fff',
    borderRadius: '12px',
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  navBtn: {
    background: 'none',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    width: '36px',
    height: '36px',
    fontSize: '1.3rem',
    cursor: 'pointer',
    color: '#374151',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateCenter: {
    textAlign: 'center',
  },
  dateLabel: {
    fontWeight: 600,
    fontSize: '1rem',
    color: '#111827',
  },
  todayBtn: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: '2px 0',
  },
  progressWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  progressBar: {
    flex: 1,
    height: '8px',
    background: '#e5e7eb',
    borderRadius: '99px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#16a34a',
    borderRadius: '99px',
    transition: 'width 0.3s ease',
  },
  progressLabel: {
    fontSize: '0.8rem',
    color: '#6b7280',
    whiteSpace: 'nowrap',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '1rem',
  },
  pageTitle: {
    fontSize: '1.3rem',
    fontWeight: 700,
    color: '#111827',
    margin: 0,
  },
  addBtn: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  addForm: {
    background: '#fff',
    borderRadius: '12px',
    padding: '1.25rem',
    marginBottom: '1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  input: {
    padding: '0.6rem 0.8rem',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '0.95rem',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  },
  priorityRow: {
    display: 'flex',
    gap: '1.5rem',
    fontSize: '0.9rem',
    color: '#374151',
  },
  priorityLabel: {
    display: 'flex',
    alignItems: 'center',
    cursor: 'pointer',
    gap: '0.25rem',
  },
  submitBtn: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.65rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem 2rem',
    background: '#fff',
    borderRadius: '12px',
    color: '#6b7280',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  emptyIcon: {
    fontSize: '2.5rem',
    color: '#16a34a',
    marginBottom: '0.5rem',
  },
  emptyHint: {
    fontSize: '0.85rem',
    marginTop: '0.5rem',
    color: '#9ca3af',
  },
  taskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  taskCard: {
    background: '#fff',
    borderRadius: '12px',
    padding: '1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    border: '2px solid transparent',
    transition: 'opacity 0.2s',
  },
  taskCompleted: {
    opacity: 0.55,
    background: '#f9fafb',
  },
  taskUrgent: {
    borderColor: '#fca5a5',
    background: '#fff8f8',
  },
  completeBtn: {
    width: '44px',
    height: '44px',
    minWidth: '44px',
    borderRadius: '50%',
    background: '#f0fdf4',
    border: '2px solid #16a34a',
    color: '#16a34a',
    fontSize: '1.2rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'background 0.15s',
    flexShrink: 0,
  },
  completeBtnLoading: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  completedIcon: {
    width: '44px',
    height: '44px',
    minWidth: '44px',
    borderRadius: '50%',
    background: '#16a34a',
    color: '#fff',
    fontSize: '1.2rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  taskInfo: {
    flex: 1,
    minWidth: 0,
  },
  taskTitleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  taskTitle: {
    fontWeight: 600,
    fontSize: '1rem',
    color: '#111827',
  },
  taskTitleDone: {
    textDecoration: 'line-through',
    color: '#9ca3af',
  },
  urgentBadge: {
    background: '#fee2e2',
    color: '#dc2626',
    fontSize: '0.7rem',
    fontWeight: 700,
    padding: '2px 6px',
    borderRadius: '4px',
    letterSpacing: '0.05em',
  },
  recurringBadge: {
    color: '#6b7280',
    fontSize: '0.85rem',
    title: 'Recurring task',
  },
  taskDesc: {
    fontSize: '0.875rem',
    color: '#4b5563',
    marginTop: '0.2rem',
  },
  taskDescDone: {
    color: '#9ca3af',
  },
  taskMeta: {
    marginTop: '0.35rem',
  },
  dueTime: {
    fontSize: '0.8rem',
    color: '#6b7280',
  },
  completedTime: {
    fontSize: '0.8rem',
    color: '#16a34a',
  },
  deleteBtn: {
    background: 'none',
    border: 'none',
    color: '#9ca3af',
    cursor: 'pointer',
    fontSize: '1rem',
    padding: '4px',
    flexShrink: 0,
    lineHeight: 1,
  },
};
