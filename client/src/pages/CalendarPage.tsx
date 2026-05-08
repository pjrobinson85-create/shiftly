import { useState, useEffect } from 'react';
import api from '../api/client';

interface CalendarEvent {
  id: string;
  googleId?: string;
  title: string;
  startTime: string;
  endTime?: string;
  description?: string;
  location?: string;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
}

function formatDateHeading(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

function isoDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

// Group events by date
function groupByDate(events: CalendarEvent[]): Record<string, CalendarEvent[]> {
  return events.reduce<Record<string, CalendarEvent[]>>((acc, ev) => {
    const day = isoDate(new Date(ev.startTime));
    if (!acc[day]) acc[day] = [];
    acc[day].push(ev);
    return acc;
  }, {});
}

export default function CalendarPage() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendAvailable, setBackendAvailable] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Week view
  const [weekStart, setWeekStart] = useState<Date>(() => {
    const today = new Date();
    const day = today.getDay();
    const mon = new Date(today);
    mon.setDate(today.getDate() - day + (day === 0 ? -6 : 1));
    mon.setHours(0, 0, 0, 0);
    return mon;
  });

  useEffect(() => {
    fetchEvents();
  }, []);

  async function fetchEvents() {
    setLoading(true);
    try {
      const today = isoDate(new Date());
      const { data } = await api.get(`/calendar/events?date=${today}`);
      setEvents(data as CalendarEvent[]);
      setBackendAvailable(true);
    } catch (err: any) {
      if (err.response?.status === 404 || err.code === 'ERR_NETWORK') {
        setBackendAvailable(false);
        setEvents([]);
      } else {
        setError('Failed to load calendar events.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function syncCalendar() {
    setSyncing(true);
    setError('');
    setSuccess('');
    try {
      await api.post('/calendar/sync');
      setSuccess('Calendar synced successfully!');
      fetchEvents();
    } catch (err: any) {
      if (err.response?.status === 404) {
        setError('Google Calendar sync is not yet set up on the server. Coming soon!');
      } else {
        setError('Sync failed — check that Google Calendar is connected in your server settings.');
      }
    } finally {
      setSyncing(false);
    }
  }

  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const grouped = groupByDate(events);
  const today = isoDate(new Date());

  function prevWeek() {
    setWeekStart(d => addDays(d, -7));
  }
  function nextWeek() {
    setWeekStart(d => addDays(d, 7));
  }
  function goToToday() {
    const now = new Date();
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() - day + (day === 0 ? -6 : 1));
    mon.setHours(0, 0, 0, 0);
    setWeekStart(mon);
  }

  const weekLabel = `${weekDays[0].toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })} – ${weekDays[6].toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.pageTitle}>Calendar</h2>
          <p style={styles.subtitle}>Shift schedule and appointments</p>
        </div>
        <button
          style={{ ...styles.btn, ...(syncing ? styles.btnDisabled : {}) }}
          onClick={syncCalendar}
          disabled={syncing}
        >
          {syncing ? 'Syncing…' : '⟳ Sync Google Calendar'}
        </button>
      </div>

      {!backendAvailable && (
        <div style={styles.infoBanner}>
          ℹ️ Google Calendar sync requires server configuration. Add your Google OAuth credentials to the server .env to enable this feature.
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}
      {success && <div style={styles.successMsg}>{success}</div>}

      {/* Week navigation */}
      <div style={styles.weekNav}>
        <button style={styles.navBtn} onClick={prevWeek}>‹</button>
        <div style={styles.weekCenter}>
          <span style={styles.weekLabel}>{weekLabel}</span>
          <button style={styles.todayLink} onClick={goToToday}>This week</button>
        </div>
        <button style={styles.navBtn} onClick={nextWeek}>›</button>
      </div>

      {/* Day columns */}
      {loading ? (
        <div style={styles.loadingState}>Loading events...</div>
      ) : (
        <div style={styles.weekGrid}>
          {weekDays.map(day => {
            const key = isoDate(day);
            const dayEvents = grouped[key] || [];
            const isToday = key === today;
            return (
              <div key={key} style={{ ...styles.dayCol, ...(isToday ? styles.dayColToday : {}) }}>
                <div style={{ ...styles.dayHeader, ...(isToday ? styles.dayHeaderToday : {}) }}>
                  <span style={styles.dayName}>
                    {day.toLocaleDateString('en-AU', { weekday: 'short' })}
                  </span>
                  <span style={{ ...styles.dayNum, ...(isToday ? styles.dayNumToday : {}) }}>
                    {day.getDate()}
                  </span>
                </div>
                <div style={styles.dayEvents}>
                  {dayEvents.length === 0 ? (
                    <div style={styles.noEvents}>—</div>
                  ) : (
                    dayEvents
                      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
                      .map(ev => (
                        <EventChip key={ev.id} event={ev} />
                      ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Upcoming list view */}
      {!loading && events.length > 0 && (
        <div style={styles.upcomingSection}>
          <h3 style={styles.sectionTitle}>Upcoming events</h3>
          {Object.entries(grouped)
            .filter(([date]) => date >= today)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, 10)
            .map(([date, evs]) => (
              <div key={date} style={styles.upcomingDay}>
                <div style={styles.upcomingDateLabel}>{formatDateHeading(date + 'T00:00:00')}</div>
                {evs.map(ev => (
                  <div key={ev.id} style={styles.upcomingEvent}>
                    <div style={styles.upcomingTime}>
                      {formatTime(ev.startTime)}
                      {ev.endTime && ` – ${formatTime(ev.endTime)}`}
                    </div>
                    <div style={styles.upcomingTitle}>{ev.title}</div>
                    {ev.location && <div style={styles.upcomingLocation}>📍 {ev.location}</div>}
                    {ev.description && <div style={styles.upcomingDesc}>{ev.description}</div>}
                  </div>
                ))}
              </div>
            ))}
        </div>
      )}

      {!loading && events.length === 0 && (
        <div style={styles.emptyState}>
          <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📅</div>
          <div>No calendar events yet</div>
          <div style={styles.emptyHint}>
            Click "Sync Google Calendar" after connecting your Google account in the server settings.
          </div>
        </div>
      )}
    </div>
  );
}

function EventChip({ event }: { event: CalendarEvent }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div style={styles.eventChip} onClick={() => setExpanded(!expanded)}>
      <div style={styles.eventChipTime}>{formatTime(event.startTime)}</div>
      <div style={styles.eventChipTitle}>{event.title}</div>
      {expanded && (
        <div style={styles.eventChipDetails}>
          {event.endTime && <div>Until {formatTime(event.endTime)}</div>}
          {event.location && <div>📍 {event.location}</div>}
          {event.description && <div>{event.description}</div>}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '900px',
    margin: '0 auto',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
    flexWrap: 'wrap',
    gap: '0.75rem',
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
  btnDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  infoBanner: {
    background: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
    borderRadius: '8px',
    padding: '0.75rem 1rem',
    fontSize: '0.875rem',
    marginBottom: '1rem',
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
  weekNav: {
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
  weekCenter: {
    textAlign: 'center',
  },
  weekLabel: {
    fontWeight: 600,
    fontSize: '0.95rem',
    color: '#111827',
    display: 'block',
  },
  todayLink: {
    background: 'none',
    border: 'none',
    color: '#2563eb',
    cursor: 'pointer',
    fontSize: '0.8rem',
    padding: '2px 0',
  },
  weekGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '0.5rem',
    marginBottom: '2rem',
  },
  dayCol: {
    background: '#fff',
    borderRadius: '10px',
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    minHeight: '120px',
  },
  dayColToday: {
    boxShadow: '0 0 0 2px #2563eb',
  },
  dayHeader: {
    padding: '0.5rem 0.4rem',
    textAlign: 'center',
    borderBottom: '1px solid #f3f4f6',
    background: '#f9fafb',
  },
  dayHeaderToday: {
    background: '#eff6ff',
  },
  dayName: {
    display: 'block',
    fontSize: '0.7rem',
    color: '#6b7280',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  dayNum: {
    display: 'block',
    fontSize: '1rem',
    fontWeight: 700,
    color: '#111827',
  },
  dayNumToday: {
    color: '#2563eb',
  },
  dayEvents: {
    padding: '0.4rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  noEvents: {
    textAlign: 'center',
    color: '#e5e7eb',
    fontSize: '0.85rem',
    padding: '0.5rem 0',
  },
  eventChip: {
    background: '#eff6ff',
    borderLeft: '3px solid #2563eb',
    borderRadius: '4px',
    padding: '0.3rem 0.4rem',
    cursor: 'pointer',
    fontSize: '0.7rem',
  },
  eventChipTime: {
    color: '#6b7280',
    fontSize: '0.65rem',
    fontWeight: 600,
  },
  eventChipTitle: {
    color: '#1d4ed8',
    fontWeight: 600,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  eventChipDetails: {
    color: '#374151',
    marginTop: '0.25rem',
    fontSize: '0.7rem',
    whiteSpace: 'normal',
  },
  loadingState: {
    textAlign: 'center',
    padding: '2rem',
    color: '#6b7280',
  },
  emptyState: {
    textAlign: 'center',
    padding: '3rem 2rem',
    background: '#fff',
    borderRadius: '12px',
    color: '#6b7280',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  emptyHint: {
    fontSize: '0.85rem',
    marginTop: '0.5rem',
    color: '#9ca3af',
    maxWidth: '300px',
    margin: '0.5rem auto 0',
  },
  upcomingSection: {
    marginTop: '1rem',
  },
  sectionTitle: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#111827',
    marginBottom: '0.75rem',
  },
  upcomingDay: {
    marginBottom: '1.25rem',
  },
  upcomingDateLabel: {
    fontSize: '0.8rem',
    fontWeight: 700,
    color: '#6b7280',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.4rem',
  },
  upcomingEvent: {
    background: '#fff',
    borderRadius: '10px',
    padding: '0.75rem 1rem',
    marginBottom: '0.4rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    borderLeft: '3px solid #2563eb',
  },
  upcomingTime: {
    fontSize: '0.8rem',
    fontWeight: 600,
    color: '#2563eb',
    marginBottom: '0.2rem',
  },
  upcomingTitle: {
    fontWeight: 600,
    color: '#111827',
    fontSize: '0.95rem',
  },
  upcomingLocation: {
    fontSize: '0.8rem',
    color: '#6b7280',
    marginTop: '0.2rem',
  },
  upcomingDesc: {
    fontSize: '0.85rem',
    color: '#4b5563',
    marginTop: '0.2rem',
  },
};
