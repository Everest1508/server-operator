import { useAuth } from './contexts/AuthContext';
import { AuthView } from './components/AuthView';
import App from './App';

export function AppGate() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg-primary text-text-secondary text-sm">
        Loading…
      </div>
    );
  }

  if (!user) return <AuthView />;
  return <App />;
}
