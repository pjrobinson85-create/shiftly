import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import LoginPage from './components/Login';
import Dashboard, { ProtectedRoute } from './components/Dashboard';
import TasksPage from './pages/TasksPage';
import RecurringTasksPage from './pages/RecurringTasksPage';
import ShoppingListPage from './pages/ShoppingListPage';
import CalendarPage from './pages/CalendarPage';
import ShiftSummary from './pages/ShiftSummary';
import CareProfilePage from './pages/CareProfilePage';
import IncidentsPage from './pages/IncidentsPage';
import { useAuth } from './context/AuthContext';

// FAMILY-only guard — redirects workers away from family pages
function FamilyRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'FAMILY') return <Navigate to="/tasks" replace />;
  return <>{children}</>;
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Protected routes */}
          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Dashboard />}>
              <Route index element={<ShiftSummary />} />
              <Route path="tasks" element={<TasksPage />} />
              <Route path="shopping" element={<ShoppingListPage />} />
              <Route path="care-profile" element={<CareProfilePage />} />
              <Route path="incidents" element={<IncidentsPage />} />
              <Route
                path="recurring"
                element={
                  <FamilyRoute>
                    <RecurringTasksPage />
                  </FamilyRoute>
                }
              />
              <Route
                path="calendar"
                element={
                  <FamilyRoute>
                    <CalendarPage />
                  </FamilyRoute>
                }
              />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
