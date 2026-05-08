import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import LoginPage from './components/Login';
import Dashboard, { ProtectedRoute } from './components/Dashboard';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Dashboard />}>
            <Route index element={<Navigate to="/tasks" replace />} />
            <Route path="tasks" element={<div style={styles.placeholder}>Tasks — coming soon</div>} />
            <Route path="shopping" element={<div style={styles.placeholder}>Shopping List — coming soon</div>} />
            <Route path="recurring" element={<div style={styles.placeholder}>Recurring Tasks — coming soon</div>} />
            <Route path="calendar" element={<div style={styles.placeholder}>Calendar — coming soon</div>} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </AuthProvider>
  );
}

const styles: Record<string, React.CSSProperties> = {
  placeholder: {
    background: '#fff',
    borderRadius: '12px',
    padding: '3rem',
    textAlign: 'center',
    color: '#666',
    fontSize: '1.1rem',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
};

export default App;
