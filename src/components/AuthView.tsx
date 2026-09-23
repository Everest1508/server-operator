import { useState } from 'react';
import { Building2, UserRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { getCrmBaseUrl } from '../api/client';

export function AuthView() {
  const { guestLogin, crmLogin } = useAuth();
  const [loading, setLoading] = useState<'crm' | 'guest' | null>(null);
  const [error, setError] = useState('');

  const handleCrm = async () => {
    setError('');
    setLoading('crm');
    try {
      await crmLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'CRM sign-in failed');
    } finally {
      setLoading(null);
    }
  };

  const handleGuest = async () => {
    setError('');
    setLoading('guest');
    try {
      await guestLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Guest login failed');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary p-6">
      <div className="w-full max-w-md rounded-2xl border border-border/30 bg-bg-secondary/80 backdrop-blur-md shadow-2xl overflow-hidden">
        <div className="px-6 pt-8 pb-4 text-center border-b border-border/20">
          <h1 className="text-lg font-bold text-text-primary">Serop</h1>
          <p className="text-xs text-text-secondary mt-1">Sign in to sync teams, inbox, and shared servers</p>
        </div>

        <div className="p-6 space-y-3">
          <button
            type="button"
            onClick={handleCrm}
            disabled={loading !== null}
            className="w-full py-2.5 rounded-xl bg-accent text-white text-xs font-semibold hover:opacity-90 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <Building2 size={14} /> {loading === 'crm' ? 'Opening browser…' : 'Sign in with CRM'}
          </button>

          {error && <p className="text-[11px] text-error">{error}</p>}

          <div className="relative my-3">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/20" /></div>
            <div className="relative flex justify-center"><span className="px-2 text-[10px] text-text-muted bg-bg-secondary/80">or</span></div>
          </div>

          <button
            type="button"
            onClick={handleGuest}
            disabled={loading !== null}
            className="w-full py-2.5 rounded-xl border border-border/30 text-text-primary text-xs font-semibold hover:bg-bg-tertiary/30 disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            <UserRound size={14} /> {loading === 'guest' ? 'Please wait…' : 'Continue as guest'}
          </button>

          <p className="text-[10px] text-text-muted text-center mt-3">
            CRM: {getCrmBaseUrl()}
          </p>
        </div>
      </div>
    </div>
  );
}
