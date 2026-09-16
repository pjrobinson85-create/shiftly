import { useEffect, useState } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

interface AdminUser {
  id: string;
  name: string;
  username: string | null;
  email: string | null;
  role: 'FAMILY' | 'WORKER';
  phone: string | null;
  isAdmin: boolean;
  canEditCarePlan: boolean;
  createdAt: string;
}

/**
 * Admin panel — visible to users with the isAdmin flag.
 * Manage people: role, admin access, care-plan edit permission, contact info.
 */
export default function AdminPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data } = await api.get<AdminUser[]>('/users/admin');
      setUsers(data);
      setError('');
    } catch (err: any) {
      if (err?.response?.status === 403) {
        setError('You do not have admin access.');
      } else {
        setError('Failed to load users.');
      }
    } finally {
      setLoading(false);
    }
  }

  async function patchUser(id: string, patch: Partial<Pick<AdminUser, 'role' | 'isAdmin' | 'canEditCarePlan'>>) {
    setSavingId(id);
    setError('');
    try {
      const { data } = await api.patch<AdminUser>(`/users/${id}`, patch);
      setUsers(prev => prev.map(u => (u.id === id ? data : u)));
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to update user.');
    } finally {
      setSavingId(null);
    }
  }

  if (!user?.isAdmin) {
    return (
      <div style={styles.page}>
        <div style={styles.denied}>
          <h2 style={styles.pageTitle}>Admin Panel</h2>
          <p>You need admin access to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.pageTitle}>Admin Panel</h2>
          <p style={styles.subtitle}>
            Manage accounts, roles, and who may edit the care plan.
          </p>
        </div>
        <button style={styles.btn} onClick={fetchUsers}>
          ⟳ Refresh
        </button>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.loading}>Loading people…</div>
      ) : (
        users.map(u => (
          <div key={u.id} style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <div style={styles.name}>{u.name}</div>
                <div style={styles.meta}>
                  {u.username ? `@${u.username}` : 'no username'}
                  {u.email ? ` · ${u.email}` : ''}
                  {u.phone ? ` · ${u.phone}` : ''}
                </div>
              </div>
              {u.id === user.id && (
                <span style={styles.youBadge}>you</span>
              )}
            </div>

            <div style={styles.controls}>
              <label style={styles.control}>
                <span style={styles.controlLabel}>Role</span>
                <select
                  style={styles.select}
                  value={u.role}
                  disabled={savingId === u.id}
                  onChange={e => patchUser(u.id, { role: e.target.value as 'FAMILY' | 'WORKER' })}
                >
                  <option value="WORKER">Support Worker</option>
                  <option value="FAMILY">Family</option>
                </select>
              </label>

              <label style={styles.checkboxWrap} title="Full access: admin panel, everything">
                <input
                  type="checkbox"
                  style={styles.checkbox}
                  checked={u.isAdmin}
                  disabled={u.id === user.id || savingId === u.id}
                  onChange={e => patchUser(u.id, { isAdmin: e.target.checked })}
                />
                <span style={styles.controlLabel}>Admin</span>
              </label>

              <label
                style={styles.checkboxWrap}
                title="Can edit the care profile (without full admin access)"
              >
                <input
                  type="checkbox"
                  style={styles.checkbox}
                  checked={u.canEditCarePlan}
                  disabled={u.isAdmin || savingId === u.id}
                  onChange={e => patchUser(u.id, { canEditCarePlan: e.target.checked })}
                />
                <span style={styles.controlLabel}>Can edit care plan</span>
              </label>
            </div>

            {u.isAdmin && (
              <div style={styles.adminNote}>
                Admin: full control of the app, including this panel.
              </div>
            )}
            {!u.isAdmin && u.canEditCarePlan && (
              <div style={styles.adminNote}>
                Can update the care profile. Internal family-only notes stay family-only.
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '680px',
    margin: '0 auto',
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    marginBottom: '1rem',
  },
  pageTitle: {
    fontSize: '1.3rem',
    fontWeight: 700,
    color: 'var(--text)',
    margin: 0,
  },
  subtitle: {
    color: 'var(--muted)',
    fontSize: '0.875rem',
    margin: '0.35rem 0 0',
  },
  btn: {
    background: 'var(--brand)',
    color: 'var(--on-color)',
    border: 'none',
    borderRadius: '8px',
    padding: '0.55rem 1rem',
    fontSize: '0.9rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  denied: {
    background: 'var(--surface)',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 1px 4px var(--shadow-c)',
  },
  error: {
    background: 'var(--danger-soft)',
    color: 'var(--danger-text)',
    padding: '0.75rem 1rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  loading: {
    padding: '2rem',
    textAlign: 'center',
    color: 'var(--muted)',
  },
  card: {
    background: 'var(--surface)',
    borderRadius: '12px',
    padding: '1rem 1.15rem',
    marginBottom: '0.75rem',
    boxShadow: '0 1px 4px var(--shadow-c)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.75rem',
  },
  name: {
    fontWeight: 700,
    color: 'var(--text)',
  },
  meta: {
    color: 'var(--muted)',
    fontSize: '0.8rem',
    marginTop: '0.2rem',
  },
  youBadge: {
    background: 'var(--brand-soft)',
    color: 'var(--brand-strong)',
    borderRadius: '999px',
    padding: '0.15rem 0.6rem',
    fontSize: '0.75rem',
    fontWeight: 700,
  },
  controls: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
    alignItems: 'center',
  },
  control: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  controlLabel: {
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  select: {
    border: '1px solid var(--border)',
    borderRadius: '8px',
    padding: '0.4rem 0.6rem',
    font: 'inherit',
    fontSize: '0.9rem',
    background: 'var(--surface)',
    color: 'var(--text)',
  },
  checkboxWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.3rem',
  },
  checkbox: {
    accentColor: 'var(--brand)',
    transform: 'scale(1.2)',
  },
  adminNote: {
    marginTop: '0.6rem',
    fontSize: '0.8rem',
    color: 'var(--muted)',
  },
};
