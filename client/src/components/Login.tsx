import { useState, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'FAMILY' | 'WORKER'>('WORKER');
  const [inviteCode, setInviteCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);

    try {
      if (mode === 'login') {
        await login(username, password);
        navigate('/');
      } else {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          return;
        }
        await register({
          username,
          password,
          confirmPassword,
          name,
          role,
          email: email || undefined,
          inviteCode: inviteCode || undefined,
        });
        navigate('/');
      }
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Something went wrong';
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <h1 style={styles.logo}>Shiftly</h1>
        <p style={styles.subtitle}>Support Worker Shift App</p>

        <div style={styles.tabs}>
          <button
            style={{ ...styles.tab, ...(mode === 'login' ? styles.tabActive : {}) }}
            onClick={() => setMode('login')}
          >
            Log in
          </button>
          <button
            style={{ ...styles.tab, ...(mode === 'register' ? styles.tabActive : {}) }}
            onClick={() => setMode('register')}
          >
            Register
          </button>
        </div>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          {mode === 'register' && (
            <label style={styles.label}>
              Full name
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                style={styles.input}
                placeholder="Your name"
              />
            </label>
          )}

          <label style={styles.label}>
            {mode === 'register' ? 'Username' : 'Name'}
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={styles.input}
              placeholder={mode === 'register' ? 'e.g. sarah' : 'Your name'}
              autoCapitalize="none"
              autoComplete="username"
            />
            {mode === 'register' && (
              <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                A short name you'll use to sign in — lowercase, no spaces
              </span>
            )}
          </label>

          <label style={styles.label}>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="••••••••"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            />
          </label>

          {mode === 'register' && (
            <label style={styles.label}>
              Confirm password
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                style={styles.input}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </label>
          )}

          {mode === 'register' && (
            <>
              <label style={styles.label}>
                Role
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as 'FAMILY' | 'WORKER')}
                  style={styles.input}
                >
                  <option value="WORKER">Support Worker</option>
                  <option value="FAMILY">Family Member</option>
                </select>
              </label>

              <label style={styles.label}>
                {role === 'WORKER' ? 'Email' : 'Email (optional)'}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required={role === 'WORKER'}
                  style={styles.input}
                  placeholder={
                    role === 'WORKER' ? 'you@example.com' : 'Only if you want to share it'
                  }
                />
                {role === 'WORKER' && (
                  <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    You'll get a pre-shift briefing email every morning with anything
                    pertinent for the next day's shift — notes, open tasks, incidents and
                    updated care details.
                  </span>
                )}
              </label>

              {role === 'FAMILY' && (
                <label style={styles.label}>
                  Family invitation code
                  <input
                    type="password"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    required
                    style={styles.input}
                    placeholder="Code provided by the family"
                  />
                  <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    Invites are required for family access
                  </span>
                </label>
              )}
            </>
          )}

          <button type="submit" disabled={busy} style={styles.button}>
            {busy ? '...' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg)',
    padding: '1rem',
  },
  card: {
    background: 'var(--surface)',
    borderRadius: '12px',
    padding: '2.5rem 2rem',
    width: '100%',
    maxWidth: '400px',
    boxShadow: '0 4px 24px var(--shadow-lg)',
  },
  logo: {
    fontSize: '2rem',
    fontWeight: 700,
    color: 'var(--text)',
    margin: 0,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
    color: 'var(--muted)',
    marginBottom: '1.5rem',
    fontSize: '0.9rem',
  },
  tabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
  },
  tab: {
    flex: 1,
    padding: '0.6rem',
    border: 'none',
    borderRadius: '8px',
    background: 'var(--surface-3)',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 500,
  },
  tabActive: {
    background: 'var(--brand)',
    color: 'var(--on-color)',
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
    padding: '0.75rem',
    background: 'var(--brand)',
    color: 'var(--on-color)',
    border: 'none',
    borderRadius: '8px',
    fontSize: '1rem',
    fontWeight: 600,
    cursor: 'pointer',
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
