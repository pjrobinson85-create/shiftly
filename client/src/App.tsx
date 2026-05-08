import { Routes, Route, Navigate } from 'react-router-dom'

function App() {
  return (
    <Routes>
      <Route path="/login" element={<div style={styles.container}>Login page — coming soon</div>} />
      <Route path="/" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<div style={styles.container}>404 — Page not found</div>} />
    </Routes>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: '1.5rem',
    color: '#333',
  },
}

export default App
