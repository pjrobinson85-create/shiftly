import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api/client';

interface ShiftTask {
  id: string;
  title: string;
  priority: 'NORMAL' | 'URGENT';
  completed: boolean;
  dueDate: string;
}

interface CalendarEvent {
  id: string;
  title: string;
  startTime: string;
  endTime?: string;
  location?: string;
}

interface ShiftNote {
  id: string;
  content: string;
  shiftDate: string;
  user?: { name: string };
}

interface ShiftData {
  date: string;
  tasks: {
    total: number;
    completed: number;
    pending: number;
    list: ShiftTask[];
  };
  calendarEvents: CalendarEvent[];
  shiftNotes: ShiftNote[];
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function ShiftSummary() {
  const { user } = useAuth();
  const [shift, setShift] = useState<ShiftData | null>(null);
  const [loading, setLoading] = useState(true);
  const [noteText, setNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  const today = isoDate(new Date());

  useEffect(() => {
    fetchShift();
  }, []);

  async function fetchShift() {
    setLoading(true);
    try {
      const { data } = await api.get<ShiftData>(`/shifts/${today}`);
      setShift(data);
    } catch {
      // Shift endpoint may return 404 if no data — treat as empty
      setShift(null);
    } finally {
      setLoading(false);
    }
  }

  async function addNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setAddingNote(true);
    setNoteError('');
    try {
      const { data } = await api.post<ShiftNote>(`/shifts/${today}/notes`, {
        content: noteText.trim(),
      });
      setNoteText('');
      setShift(prev =>
        prev ? { ...prev, shiftNotes: [data, ...prev.shiftNotes] } : prev
      );
    } catch {
      setNoteError('Failed to add note.');
    } finally {
      setAddingNote(false);
    }
  }

  const progressPct = shift && shift.tasks.total > 0
    ? Math.round((shift.tasks.completed / shift.tasks.total) * 100)
    : 0;

  const upcomingEvents = shift?.calendarEvents
    .filter(ev => new Date(ev.startTime) >= new Date())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
    .slice(0, 3) ?? [];

  const urgentTasks = shift?.tasks.list.filter(t => t.priority === 'URGENT' && !t.completed) ?? [];

  return (
    <div style={styles.page}>
      {/* Greeting */}
      <div style={styles.greeting}>
        <div>
          <h2 style={styles.greetingTitle}>
            Good {getTimeOfDay()}, {user?.name?.split(' ')[0]}!
          </h2>
          <div style={styles.greetingDate}>{formatDate(today)}</div>
        </div>
        <div style={styles.rolePill}>
          {user?.role === 'FAMILY' ? '👨‍👩‍👧 Family' : '🧑‍⚕️ Support Worker'}
        </div>
      </div>

      {loading ? (
        <div style={styles.loadingState}>Loading today's shift...</div>
      ) : (
        <div style={styles.grid}>

          {/* Task progress card */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>Today's Tasks</span>
              <a href="/tasks" style={styles.viewAll}>View all →</a>
            </div>
            {shift?.tasks.total ? (
              <>
                <div style={styles.progressWrap}>
                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${progressPct}%` }} />
                  </div>
                  <span style={styles.progressLabel}>{progressPct}%</span>
                </div>
                <div style={styles.taskCounts}>
                  <div style={styles.countItem}>
                    <span style={styles.countNum}>{shift.tasks.completed}</span>
                    <span style={styles.countLabel}>Done</span>
                  </div>
                  <div style={styles.countDivider} />
                  <div style={styles.countItem}>
                    <span style={{ ...styles.countNum, color: '#f59e0b' }}>{shift.tasks.pending}</span>
                    <span style={styles.countLabel}>Pending</span>
                  </div>
                  <div style={styles.countDivider} />
                  <div style={styles.countItem}>
                    <span style={styles.countNum}>{shift.tasks.total}</span>
                    <span style={styles.countLabel}>Total</span>
                  </div>
                </div>

                {urgentTasks.length > 0 && (
                  <div style={styles.urgentAlert}>
                    <span style={styles.urgentAlertIcon}>⚠️</span>
                    <div>
                      <div style={styles.urgentAlertTitle}>{urgentTasks.length} urgent task{urgentTasks.length > 1 ? 's' : ''} pending</div>
                      {urgentTasks.slice(0, 2).map(t => (
                        <div key={t.id} style={styles.urgentTaskItem}>• {t.title}</div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={styles.emptyCard}>
                No tasks scheduled for today.
                {user?.role === 'FAMILY' && (
                  <div style={styles.emptyHint}>
                    <a href="/tasks" style={styles.link}>Add tasks</a> or{' '}
                    <a href="/recurring" style={styles.link}>generate from recurring schedule</a>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Calendar events card */}
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>Today's Schedule</span>
              <a href="/calendar" style={styles.viewAll}>View calendar →</a>
            </div>
            {upcomingEvents.length > 0 ? (
              <div style={styles.eventList}>
                {upcomingEvents.map(ev => (
                  <div key={ev.id} style={styles.eventRow}>
                    <div style={styles.eventTime}>{formatTime(ev.startTime)}</div>
                    <div style={styles.eventInfo}>
                      <div style={styles.eventTitle}>{ev.title}</div>
                      {ev.location && <div style={styles.eventLocation}>📍 {ev.location}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyCard}>
                No upcoming events today.
                {user?.role === 'FAMILY' && (
                  <div style={styles.emptyHint}>
                    <a href="/calendar" style={styles.link}>Sync Google Calendar</a> to show appointments
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Shift notes card */}
          <div style={{ ...styles.card, ...styles.cardWide }}>
            <div style={styles.cardHeader}>
              <span style={styles.cardTitle}>Shift Notes</span>
            </div>

            {/* Add note form */}
            <form onSubmit={addNote} style={styles.noteForm}>
              <textarea
                style={styles.noteInput}
                placeholder="Add a note for today's shift…"
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                rows={2}
              />
              {noteError && <div style={styles.noteError}>{noteError}</div>}
              <button
                type="submit"
                style={styles.noteBtn}
                disabled={addingNote || !noteText.trim()}
              >
                {addingNote ? 'Adding…' : 'Add Note'}
              </button>
            </form>

            {shift?.shiftNotes && shift.shiftNotes.length > 0 ? (
              <div style={styles.noteList}>
                {shift.shiftNotes.map(note => (
                  <div key={note.id} style={styles.noteCard}>
                    <div style={styles.noteContent}>{note.content}</div>
                    {note.user && (
                      <div style={styles.noteMeta}>— {note.user.name}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={styles.emptyCard}>No notes for today's shift yet.</div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '860px',
    margin: '0 auto',
  },
  greeting: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  greetingTitle: {
    fontSize: '1.5rem',
    fontWeight: 700,
    color: '#111827',
    margin: '0 0 0.25rem',
  },
  greetingDate: {
    color: '#6b7280',
    fontSize: '0.9rem',
  },
  rolePill: {
    background: '#f1f5f9',
    border: '1px solid #e5e7eb',
    borderRadius: '99px',
    padding: '0.35rem 0.9rem',
    fontSize: '0.85rem',
    fontWeight: 500,
    color: '#374151',
  },
  loadingState: {
    textAlign: 'center',
    padding: '3rem',
    color: '#6b7280',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
    gap: '1rem',
  },
  card: {
    background: '#fff',
    borderRadius: '14px',
    padding: '1.25rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  cardWide: {
    gridColumn: '1 / -1',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  cardTitle: {
    fontWeight: 700,
    fontSize: '0.95rem',
    color: '#111827',
  },
  viewAll: {
    fontSize: '0.8rem',
    color: '#2563eb',
    textDecoration: 'none',
    fontWeight: 500,
  },
  progressWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '1rem',
  },
  progressBar: {
    flex: 1,
    height: '10px',
    background: '#e5e7eb',
    borderRadius: '99px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: '#16a34a',
    borderRadius: '99px',
    transition: 'width 0.4s ease',
  },
  progressLabel: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: '#16a34a',
    minWidth: '36px',
    textAlign: 'right',
  },
  taskCounts: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  countItem: {
    textAlign: 'center',
    flex: 1,
  },
  countNum: {
    display: 'block',
    fontSize: '1.4rem',
    fontWeight: 700,
    color: '#111827',
    lineHeight: 1,
  },
  countLabel: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#9ca3af',
    marginTop: '0.2rem',
  },
  countDivider: {
    width: '1px',
    height: '32px',
    background: '#f3f4f6',
  },
  urgentAlert: {
    display: 'flex',
    gap: '0.6rem',
    alignItems: 'flex-start',
    background: '#fff8f8',
    border: '1px solid #fca5a5',
    borderRadius: '8px',
    padding: '0.6rem 0.75rem',
    marginTop: '0.5rem',
  },
  urgentAlertIcon: {
    fontSize: '1rem',
    flexShrink: 0,
  },
  urgentAlertTitle: {
    fontWeight: 600,
    fontSize: '0.85rem',
    color: '#dc2626',
  },
  urgentTaskItem: {
    fontSize: '0.8rem',
    color: '#7f1d1d',
    marginTop: '0.2rem',
  },
  emptyCard: {
    color: '#9ca3af',
    fontSize: '0.9rem',
  },
  emptyHint: {
    marginTop: '0.4rem',
    fontSize: '0.85rem',
  },
  link: {
    color: '#2563eb',
    textDecoration: 'none',
  },
  eventList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  eventRow: {
    display: 'flex',
    gap: '0.75rem',
    alignItems: 'flex-start',
  },
  eventTime: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#2563eb',
    minWidth: '52px',
    paddingTop: '2px',
  },
  eventInfo: {
    flex: 1,
  },
  eventTitle: {
    fontWeight: 600,
    fontSize: '0.9rem',
    color: '#111827',
  },
  eventLocation: {
    fontSize: '0.78rem',
    color: '#6b7280',
    marginTop: '0.15rem',
  },
  noteForm: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    marginBottom: '1rem',
  },
  noteInput: {
    padding: '0.65rem 0.8rem',
    border: '1px solid #e5e7eb',
    borderRadius: '8px',
    fontSize: '0.9rem',
    outline: 'none',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  noteError: {
    color: '#dc2626',
    fontSize: '0.85rem',
  },
  noteBtn: {
    alignSelf: 'flex-end',
    background: '#2563eb',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    padding: '0.5rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  noteList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
  },
  noteCard: {
    background: '#f9fafb',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    borderLeft: '3px solid #e5e7eb',
  },
  noteContent: {
    fontSize: '0.9rem',
    color: '#111827',
    lineHeight: 1.5,
  },
  noteMeta: {
    fontSize: '0.78rem',
    color: '#9ca3af',
    marginTop: '0.35rem',
    textAlign: 'right',
  },
};
