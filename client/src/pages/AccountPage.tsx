import { useState, FormEvent } from 'react';
import api from '../api/client';
import { useAuth } from '../context/AuthContext';

/**
 * Account page — available to every user.
 * Change your password (verifies the current one, enforces the same
 * 8-character minimum as signup, and rotates your session so other
 * devices are signed out).
 */
export default function AccountPage() {
  const { user, setToken, setUser } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setBusy(true);
    try {
      const { data } = await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
      });
      // Store the fresh access token so this device stays signed in.
      if (data.accessToken) {
        localStorage.setItem('shiftly_token', data.accessToken);
        setToken(data.accessToken);
      }
      if (data.user) {
        setUser(data.user);
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setSuccess('Password updated. Other devices will need to sign in again.');
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Failed to change password.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.page}>
      <h2 style={styles.pageTitle}>Account</h2>
      <p style={styles.subtitle}>
        {user?.name} ({user?.role === 'FAMILY' ? 'Family Member' : 'Support Worker'})
        {user?.username ? ` · @${user.username}` : ''}
      </p>

      <div style={styles.card}>
        <h3 style={styles.cardTitle}>Change password</h3>

        {success && <div style={styles.success}>{success}</div>}
        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleChangePassword} style={styles.form}>
          <label style={styles.label}>
            Current password
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="Your current password"
              autoComplete="current-password"
            />
          </label>

          <label style={styles.label}>
            New password
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              minLength={8}
              style={styles.input}
              placeholder="At least 8 characters"
              autoComplete="new-password"
            />
          </label>

          <label style={styles.label}>
            Confirm new password
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="Re-enter the new password"
              autoComplete="new-password"
            />
          </label>

          <button type="submit" disabled={busy} style={styles.button}>
            {busy ? '...' : 'Update password'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: '520px',
    margin: '0 auto',
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
    margin: '0.35rem 0 1.25rem',
  },
  card: {
    background: 'var(--surface)',
    borderRadius: '12px',
    padding: '1.5rem',
    boxShadow: '0 2px 12px var(--shadow-lg)',
  },
  cardTitle: {
    fontSize: '1.05rem',
    fontWeight: 600,
    color: 'var(--text)',
    margin: '0 0 1rem',
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
    color: 'var(--text-2)',
  },
  input: {
    padding: '0.6rem 0.8rem',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '1rem',
    outline: 'none',
  },
  button: {
    marginTop: '0.5rem',
    padding: '0.7rem',
    background: 'var(--brand)',
    color: 'var(--on-color)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  success: {
    background: 'var(--success-soft, var(--surface-3))',
    color: 'var(--success-text, var(--text))',
    padding: '0.6rem 0.8rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  error: {
    background: 'var(--danger-soft)',
    color: 'var(--danger-text)',
    padding: '0.6rem 0.8rem',
    borderRadius: '8px',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
};
