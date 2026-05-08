import { useState, useEffect } from 'react';
import api from '../api/client';

interface RecurringTask {
  id: string;
  title: string;
  description?: string;
  dayOfWeek: number | null; // null = every day, 0=Sun…6=Sat
  time?: string; // "HH:MM"
  priority: 'NORMAL' | 'URGENT';
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatSchedule(task: RecurringTask): string {
  const day = task.dayOfWeek === null ? 'Every day' : DAY_NAMES[task.dayOfWeek];
  const time = task.time ? ` at ${task.time}` : '';
  return `${day}${time}`;
}

function getWeekRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = (d: Date) => d.toISOString().split('T')[0];
  return { startDate: fmt(monday), endDate: fmt(sunday) };
}

interface FormState {
  title: string;
  description: string;
  dayOfWeek: string; // '' = every day, else '0'-'6'
  time: string;
  priority: 'NORMAL' | 'URGENT';
}

const emptyForm: FormState = {
  title: '',
  description: '',
  dayOfWeek: '',
  time: '',
  priority: 'NORMAL',
};

export default function RecurringTasksPage() {
  const [tasks, setTasks] = useState<RecurringTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Generate state
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    fetchTasks();
  }, []);

  async function fetchTasks() {
    setLoading(true);
    try {
      const { data } = await api.get<RecurringTask[]>('/recurring-tasks');
      setTasks(data);
    } catch {
      setError('Failed to load recurring tasks.');
    } finally {
      setLoading(false);
    }
  }

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
    setError('');
    setSuccess('');
  }

  function openEditForm(task: RecurringTask) {
    setEditingId(task.id);
    setForm({
      title: task.title,
      description: task.description || '',
      dayOfWeek: task.dayOfWeek === null ? '' : String(task.dayOfWeek),
      time: task.time || '',
      priority: task.priority,
    });
    setShowForm(true);
    setError('');
    setSuccess('');
  }

  function cancelForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function saveTask(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setSaving(true);
    setError('');

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      dayOfWeek: form.dayOfWeek === '' ? null : parseInt(form.dayOfWeek),
      time: form.time || undefined,
      priority: form.priority,
    };

    try {
      if (editingId) {
        const { data } = await api.put<RecurringTask>(`/recurring-tasks/${editingId}`, payload);
        setTasks(prev => prev.map(t => t.id === editingId ? data : t));
        setSuccess('Task updated.');
      } else {
        const { data } = await api.post<RecurringTask>('/recurring-tasks', payload);
        setTasks(prev => [...prev, data]);
        setSuccess('Task created.');
      }
      cancelForm();
    } catch {
      setError('Failed to save task.');
    } finally {
      setSaving(false);
    }
  }

  async function deleteTask(id: string) {
    if (!confirm('Delete this recurring task? Any already-generated task instances will remain.')) return;
    try {
      await api.delete(`/recurring-tasks/${id}`);
      setTasks(prev => prev.filter(t => t.id !== id));
      setSuccess('Task deleted.');
    } catch {
      setError('Failed to delete task.');
    }
  }

  async function generateThisWeek() {
    setGenerating(true);
    setError('');
    setSuccess('');
    const { startDate, endDate } = getWeekRange();
    try {
      const { data } = await api.post<{ count: number; tasks: unknown[] }>('/recurring-tasks/generate', {
        startDate,
        endDate,
      });
      setSuccess(`Generated ${data.count} task instance${data.count !== 1 ? 's' : ''} for this week (${startDate} → ${endDate}).`);
    } catch {
      setError('Failed to generate tasks.');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.pageTitle}>Recurring Tasks</h2>
          <p style={styles.subtitle}>Define tasks that automatically appear on a schedule.</p>
        </div>
        <div style={styles.headerActions}>
          <button
            style={{ ...styles.btn, ...styles.btnSecondary }}
            onClick={generateThisWeek}
            disabled={generating}
          >
            {generating ? 'Generating…' : '⟳ Generate this week'}
          </button>
          <button style={styles.btn} onClick={openAddForm}>+ New Task</button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.successMsg}>{success}</div>}

      {/* Form */}
      {showForm && (
        <div style={styles.formCard}>
          <h3 style={styles.formTitle}>{editingId ? 'Edit Task' : 'New Recurring Task'}</h3>
          <form onSubmit={saveTask} style={styles.form}>
            <label style={styles.label}>
              Title *
              <input
                style={styles.input}
                value={form.title}
                onChange={e => setField('title', e.target.value)}
                placeholder="e.g. Morning medication"
                required
                autoFocus
              />
            </label>

            <label style={styles.label}>
              Description
              <input
                style={styles.input}
                value={form.description}
                onChange={e => setField('description', e.target.value)}
                placeholder="Optional details"
              />
            </label>

            <div style={styles.row}>
              <label style={{ ...styles.label, flex: 1 }}>
                Day of week
                <select
                  style={styles.input}
                  value={form.dayOfWeek}
                  onChange={e => setField('dayOfWeek', e.target.value)}
                >
                  <option value="">Every day</option>
                  {DAY_NAMES.map((name, i) => (
                    <option key={i} value={String(i)}>{name}</option>
                  ))}
                </select>
              </label>

              <label style={{ ...styles.label, flex: 1 }}>
                Time
                <input
                  type="time"
                  style={styles.input}
                  value={form.time}
                  onChange={e => setField('time', e.target.value)}
                />
              </label>
            </div>

            <label style={styles.label}>
              Priority
              <div style={styles.priorityRow}>
                <label style={styles.radioLabel}>
                  <input
                    type="radio"
                    name="priority"
                    checked={form.priority === 'NORMAL'}
                    onChange={() => setField('priority', 'NORMAL')}
                  />
                  &nbsp;Normal
                </label>
                <label style={{ ...styles.radioLabel, color: '#dc2626' }}>
                  <input
                    type="radio"
                    name="priority"
                    checked={form.priority === 'URGENT'}
                    onChange={() => setField('priority', 'URGENT')}
                  />
                  &nbsp;Urgent
                </label>
              </div>
            </label>

            <div style={styles.formActions}>
              <button type="button" style={styles.cancelBtn} onClick={cancelForm}>
                Cancel
              </button>
              <button type="submit" style={styles.btn} disabled={saving}>
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create task'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Task list */}
      {loading ? (
        <div style={styles.emptyState}>Loading...</div>
      ) : tasks.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📋</div>
          <div>No recurring tasks yet.</div>
          <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '0.5rem' }}>
            Add a task above and click "Generate this week" to schedule instances.
          </div>
        </div>
      ) : (
        <div style={styles.taskList}>
          {tasks.map(task => (
            <div key={task.id} style={styles.taskCard}>
              <div style={styles.taskLeft}>
                {task.priority === 'URGENT' && <span style={styles.urgentDot} />}
                <div>
                  <div style={styles.taskTitle}>
                    {task.title}
                    {task.priority === 'URGENT' && (
                      <span style={styles.urgentBadge}>URGENT</span>
                    )}
                  </div>
                  {task.description && (
                    <div style={styles.taskDesc}>{task.description}</div>
                  )}
                  <div style={styles.schedule}>{formatSchedule(task)}</div>
                </div>
              </div>
              <div style={styles.taskActions}>
                <button style={styles.editBtn} onClick={() => openEditForm(task)}>Edit</button>
                <button style={styles.deleteBtn} onClick={() => deleteTask(task.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '720px',
    margin: '0 auto',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
    gap: '1rem',
    marginBottom: '1.5rem',
  },
  pageTitle: {
    fontSize: '1.3rem',
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 0.25rem',
  },
  subtitle: {
    color: '#6b7280',
    fontSize: '0.875rem',
    margin: 0,
  },
  headerActions: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  btn: {
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.55rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: '#f1f5f9',
    color: '#374151',
    border: '1px solid #e5e7eb',
  },
  error: {
    background: '#fef2f2',
    color: '#dc2626',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  successMsg: {
    background: '#f0fdf4',
    color: '#16a34a',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  formCard: {
    background: '#fff',
    borderRadius: '12px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 1px 8px rgba(0,0,0,0.08)',
    border: '1px solid #e5e7eb',
  },
  formTitle: {
    margin: '0 0 1.25rem',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#111827',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#374151',
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
  row: {
    display: 'flex',
    gap: '1rem',
  },
  priorityRow: {
    display: 'flex',
    gap: '1.5rem',
    marginTop: '0.25rem',
  },
  radioLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '0.9rem',
    cursor: 'pointer',
    color: '#374151',
  },
  formActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  cancelBtn: {
    background: 'none',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    padding: '0.55rem 1rem',
    fontSize: '0.9rem',
    cursor: 'pointer',
    color: '#374151',
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem 2rem',
    background: '#fff',
    borderRadius: '12px',
    color: '#6b7280',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  taskList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  taskCard: {
    background: '#fff',
    borderRadius: '12px',
    padding: '1rem 1.25rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  taskLeft: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.75rem',
    flex: 1,
    minWidth: 0,
  },
  urgentDot: {
    width: '8px',
    height: '8px',
    minWidth: '8px',
    borderRadius: '50%',
    background: '#dc2626',
    marginTop: '6px',
  },
  taskTitle: {
    fontWeight: 600,
    fontSize: '0.95rem',
    color: '#111827',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem',
    flexWrap: 'wrap',
  },
  urgentBadge: {
    background: '#fee2e2',
    color: '#dc2626',
    fontSize: '0.65rem',
    fontWeight: 700,
    padding: '2px 5px',
    borderRadius: '4px',
    letterSpacing: '0.05em',
  },
  taskDesc: {
    fontSize: '0.85rem',
    color: '#6b7280',
    marginTop: '0.2rem',
  },
  schedule: {
    fontSize: '0.8rem',
    color: '#2563eb',
    marginTop: '0.3rem',
    fontWeight: 500,
  },
  taskActions: {
    display: 'flex',
    gap: '0.5rem',
    flexShrink: 0,
  },
  editBtn: {
    background: '#f1f5f9',
    border: '1px solid #e5e7eb',
    borderRadius: '6px',
    padding: '0.4rem 0.75rem',
    fontSize: '0.85rem',
    cursor: 'pointer',
    color: '#374151',
    fontWeight: 500,
  },
  deleteBtn: {
    background: 'none',
    border: '1px solid #fca5a5',
    borderRadius: '6px',
    padding: '0.4rem 0.75rem',
    fontSize: '0.85rem',
    cursor: 'pointer',
    color: '#dc2626',
    fontWeight: 500,
  },
};
