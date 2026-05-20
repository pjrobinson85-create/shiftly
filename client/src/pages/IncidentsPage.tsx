import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';

interface IncidentUser {
  id: string;
  name: string;
  role: 'FAMILY' | 'WORKER';
}

interface IncidentRecord {
  id: string;
  title: string;
  description: string;
  severity: 'low' | 'medium' | 'high';
  occurredAt: string;
  photos: string[];
  createdAt: string;
  user?: IncidentUser;
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

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function toLocalDateTimeValue(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parsePhotoLines(value: string) {
  return value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean);
}

export default function IncidentsPage() {
  const { user } = useAuth();
  const { dark } = useTheme();
  const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<'low' | 'medium' | 'high'>('low');
  const [occurredAt, setOccurredAt] = useState(toLocalDateTimeValue(new Date()));
  const [photosText, setPhotosText] = useState('');
  const [success, setSuccess] = useState('');

  const fetchIncidents = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get<IncidentRecord[]>('/incidents');
      setIncidents(data);
    } catch {
      setError('Failed to load incidents.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIncidents();
  }, [fetchIncidents]);

  useEffect(() => {
    const s = getSocket();
    s.connect();
    if (user?.role) {
      s.emit('join-role', user.role);
    }

    const handleCreated = (incident: IncidentRecord) => {
      setIncidents(prev => {
        const updated = [incident, ...prev.filter(item => item.id !== incident.id)];
        return updated.sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
      });
    };

    s.on('incident:created', handleCreated);

    return () => {
      s.off('incident:created', handleCreated);
      s.disconnect();
      socket = null;
    };
  }, [user?.role]);

  async function submitIncident(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const { data } = await api.post<IncidentRecord>('/incidents', {
        title: title.trim(),
        description: description.trim(),
        severity,
        occurredAt: new Date(occurredAt).toISOString(),
        photos: parsePhotoLines(photosText),
      });

      setIncidents(prev => [data, ...prev.filter(item => item.id !== data.id)]);
      setTitle('');
      setDescription('');
      setSeverity('low');
      setOccurredAt(toLocalDateTimeValue(new Date()));
      setPhotosText('');
      setSuccess('Incident report logged. Family listeners will receive the update in real time.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to create incident report.');
    } finally {
      setSaving(false);
    }
  }

  const counts = useMemo(() => ({
    total: incidents.length,
    high: incidents.filter(incident => incident.severity === 'high').length,
    medium: incidents.filter(incident => incident.severity === 'medium').length,
  }), [incidents]);

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.pageTitle(dark)}>Incident Log</h2>
          <p style={styles.subtitle(dark)}>
            Record falls, equipment issues, behavior changes, or anything family should know about immediately.
          </p>
        </div>
      </div>

      <div style={styles.statsRow}>
        <div style={styles.statCard(dark)}>
          <div style={styles.statValue(dark)}>{counts.total}</div>
          <div style={styles.statLabel}>Total logged</div>
        </div>
        <div style={styles.statCard(dark)}>
          <div style={{ ...styles.statValue(dark), color: '#dc2626' }}>{counts.high}</div>
          <div style={styles.statLabel}>High severity</div>
        </div>
        <div style={styles.statCard(dark)}>
          <div style={{ ...styles.statValue(dark), color: '#d97706' }}>{counts.medium}</div>
          <div style={styles.statLabel}>Medium severity</div>
        </div>
      </div>

      <div style={styles.layout}>
        <form onSubmit={submitIncident} style={styles.formCard(dark)}>
          <div style={styles.cardTitle(dark)}>Create incident report</div>
          <div style={styles.helperText(dark)}>
            Timestamp defaults to now and can be adjusted if you’re logging something that happened earlier.
          </div>

          <label style={styles.fieldWrap}>
            <span style={styles.fieldLabel(dark)}>Title</span>
            <input
              style={styles.input(dark)}
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="E.g. Wheelchair battery warning"
              required
            />
          </label>

          <label style={styles.fieldWrap}>
            <span style={styles.fieldLabel(dark)}>Description</span>
            <textarea
              style={styles.textarea(dark)}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What happened, what you observed, and what you did next..."
              rows={5}
              required
            />
          </label>

          <div style={styles.row}>
            <label style={{ ...styles.fieldWrap, flex: 1 }}>
              <span style={styles.fieldLabel(dark)}>Severity</span>
              <select
                style={styles.input(dark)}
                value={severity}
                onChange={e => setSeverity(e.target.value as 'low' | 'medium' | 'high')}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>

            <label style={{ ...styles.fieldWrap, flex: 1 }}>
              <span style={styles.fieldLabel(dark)}>Occurred at</span>
              <input
                type="datetime-local"
                style={styles.input(dark)}
                value={occurredAt}
                onChange={e => setOccurredAt(e.target.value)}
                required
              />
            </label>
          </div>

          <label style={styles.fieldWrap}>
            <span style={styles.fieldLabel(dark)}>Photo links / paths</span>
            <textarea
              style={styles.textarea(dark)}
              value={photosText}
              onChange={e => setPhotosText(e.target.value)}
              placeholder="Optional — one link or file path per line"
              rows={3}
            />
          </label>

          {error && <div style={styles.error}>{error}</div>}
          {success && <div style={styles.success}>{success}</div>}

          <button type="submit" style={styles.primaryBtn} disabled={saving}>
            {saving ? 'Saving…' : 'Log Incident'}
          </button>
        </form>

        <div style={styles.feedCard(dark)}>
          <div style={styles.cardTitle(dark)}>Recent incidents</div>
          {loading ? (
            <div style={styles.emptyState(dark)}>Loading incident feed...</div>
          ) : incidents.length === 0 ? (
            <div style={styles.emptyState(dark)}>No incidents logged yet.</div>
          ) : (
            <div style={styles.listWrap}>
              {incidents.map(incident => (
                <article key={incident.id} style={styles.incidentCard(dark)}>
                  <div style={styles.incidentHeader}>
                    <div>
                      <div style={styles.incidentTitle(dark)}>{incident.title}</div>
                      <div style={styles.incidentMeta(dark)}>
                        {formatDateTime(incident.occurredAt)}
                        {incident.user ? ` • ${incident.user.name}` : ''}
                      </div>
                    </div>
                    <span style={severityPillStyle(incident.severity)}>
                      {incident.severity.toUpperCase()}
                    </span>
                  </div>
                  <p style={styles.incidentDescription(dark)}>{incident.description}</p>
                  {incident.photos?.length > 0 && (
                    <div style={styles.photoWrap}>
                      {incident.photos.map(photo => (
                        <span key={photo} style={styles.photoTag}>{photo}</span>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function severityPillStyle(severity: 'low' | 'medium' | 'high') {
  if (severity === 'high') {
    return { ...styles.severityPillBase, background: '#fef2f2', color: '#b91c1c' };
  }
  if (severity === 'medium') {
    return { ...styles.severityPillBase, background: '#fff7ed', color: '#c2410c' };
  }
  return { ...styles.severityPillBase, background: '#ecfdf5', color: '#047857' };
}

const styles: Record<string, any> = {
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
  },
  pageTitle: (dark: boolean) => ({
    margin: 0,
    fontSize: '1.75rem',
    color: dark ? '#f8fafc' : '#0f172a',
  }),
  subtitle: (dark: boolean) => ({
    margin: '0.35rem 0 0',
    color: dark ? '#94a3b8' : '#64748b',
    maxWidth: '720px',
  }),
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '1rem',
  },
  statCard: (dark: boolean) => ({
    background: dark ? '#1e293b' : '#fff',
    borderRadius: '14px',
    padding: '1rem 1.1rem',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  }),
  statValue: (dark: boolean) => ({
    fontSize: '1.7rem',
    fontWeight: 700,
    color: dark ? '#f8fafc' : '#0f172a',
  }),
  statLabel: {
    marginTop: '0.25rem',
    fontSize: '0.8rem',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    color: '#64748b',
  },
  layout: {
    display: 'grid',
    gridTemplateColumns: 'minmax(320px, 420px) minmax(0, 1fr)',
    gap: '1rem',
    alignItems: 'start',
  },
  formCard: (dark: boolean) => ({
    background: dark ? '#1e293b' : '#fff',
    borderRadius: '16px',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.9rem',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  }),
  feedCard: (dark: boolean) => ({
    background: dark ? '#1e293b' : '#fff',
    borderRadius: '16px',
    padding: '1.25rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    boxShadow: '0 10px 30px rgba(15, 23, 42, 0.08)',
  }),
  cardTitle: (dark: boolean) => ({
    fontSize: '1.05rem',
    fontWeight: 700,
    color: dark ? '#f8fafc' : '#0f172a',
  }),
  helperText: (dark: boolean) => ({
    fontSize: '0.9rem',
    color: dark ? '#94a3b8' : '#64748b',
  }),
  fieldWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.45rem',
  },
  fieldLabel: (dark: boolean) => ({
    fontWeight: 600,
    color: dark ? '#e2e8f0' : '#0f172a',
  }),
  input: (dark: boolean) => ({
    width: '100%',
    borderRadius: '10px',
    border: `1px solid ${dark ? '#475569' : '#cbd5e1'}`,
    background: dark ? '#0f172a' : '#fff',
    color: dark ? '#f8fafc' : '#0f172a',
    padding: '0.8rem 0.9rem',
    font: 'inherit',
    boxSizing: 'border-box' as const,
  }),
  textarea: (dark: boolean) => ({
    width: '100%',
    borderRadius: '10px',
    border: `1px solid ${dark ? '#475569' : '#cbd5e1'}`,
    background: dark ? '#0f172a' : '#fff',
    color: dark ? '#f8fafc' : '#0f172a',
    padding: '0.8rem 0.9rem',
    font: 'inherit',
    resize: 'vertical' as const,
    boxSizing: 'border-box' as const,
  }),
  row: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap' as const,
  },
  error: {
    borderRadius: '10px',
    padding: '0.8rem 0.9rem',
    background: '#fef2f2',
    color: '#b91c1c',
  },
  success: {
    borderRadius: '10px',
    padding: '0.8rem 0.9rem',
    background: '#ecfdf5',
    color: '#047857',
  },
  primaryBtn: {
    border: 'none',
    borderRadius: '10px',
    background: '#2563eb',
    color: '#fff',
    padding: '0.85rem 1rem',
    fontWeight: 700,
    cursor: 'pointer',
  },
  emptyState: (dark: boolean) => ({
    color: dark ? '#94a3b8' : '#64748b',
    padding: '1rem 0',
  }),
  listWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.9rem',
  },
  incidentCard: (dark: boolean) => ({
    border: `1px solid ${dark ? '#334155' : '#e2e8f0'}`,
    borderRadius: '14px',
    padding: '1rem',
    background: dark ? '#0f172a' : '#f8fafc',
  }),
  incidentHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '0.75rem',
  },
  incidentTitle: (dark: boolean) => ({
    fontSize: '1rem',
    fontWeight: 700,
    color: dark ? '#f8fafc' : '#0f172a',
  }),
  incidentMeta: (dark: boolean) => ({
    marginTop: '0.25rem',
    fontSize: '0.85rem',
    color: dark ? '#94a3b8' : '#64748b',
  }),
  incidentDescription: (dark: boolean) => ({
    margin: '0.8rem 0 0',
    color: dark ? '#e2e8f0' : '#334155',
    lineHeight: 1.55,
    whiteSpace: 'pre-wrap' as const,
  }),
  photoWrap: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
    marginTop: '0.8rem',
  },
  photoTag: {
    background: '#e0f2fe',
    color: '#0369a1',
    borderRadius: '999px',
    padding: '0.35rem 0.65rem',
    fontSize: '0.8rem',
  },
  severityPillBase: {
    display: 'inline-flex',
    alignItems: 'center',
    borderRadius: '999px',
    padding: '0.3rem 0.65rem',
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.03em',
  },
};
