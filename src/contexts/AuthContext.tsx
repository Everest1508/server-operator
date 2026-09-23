import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  ApiNotification,
  ApiUser,
  clearAuthSession,
  connectInboxWebSocket,
  fetchMe,
  getCrmBaseUrl,
  listInbox,
  loadStoredToken,
  loadStoredUser,
  loginGuest,
  saveAuthSession,
} from '../api/client';

interface AuthContextValue {
  user: ApiUser | null;
  token: string | null;
  loading: boolean;
  notifications: ApiNotification[];
  guestLogin: () => Promise<void>;
  crmLogin: () => Promise<void>;
  logout: () => void;
  refreshInbox: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ApiUser | null>(() => loadStoredUser());
  const [token, setToken] = useState<string | null>(() => loadStoredToken());
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);

  const refreshInbox = useCallback(async () => {
    if (!token || user?.isGuest) {
      setNotifications([]);
      return;
    }
    try {
      const res = await listInbox();
      setNotifications(res.notifications);
    } catch {
      // CRM may be offline during local dev
    }
  }, [token, user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = loadStoredToken();
      const storedUser = loadStoredUser();
      if (!stored) {
        if (!cancelled) setLoading(false);
        return;
      }
      // Guest sessions are purely local — there's no CRM account to verify.
      if (storedUser?.isGuest) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const res = await fetchMe(stored);
        if (!cancelled) {
          setUser(res.user);
          setToken(stored);
          saveAuthSession(stored, res.user);
        }
      } catch {
        if (!cancelled) {
          clearAuthSession();
          setUser(null);
          setToken(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    refreshInbox();
  }, [refreshInbox]);

  useEffect(() => {
    if (!token || user?.isGuest) return;
    const ws = connectInboxWebSocket(token, (msg) => {
      const data = msg as { event?: string; notification?: ApiNotification; id?: string };
      if (data.event === 'notification' && data.notification) {
        setNotifications((prev) => [data.notification!, ...prev]);
      }
      if (data.event === 'notification_read' && data.id) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === data.id ? { ...n, readAt: new Date().toISOString() } : n)),
        );
      }
    });
    return () => ws?.close();
  }, [token, user]);

  const applySession = useCallback((nextToken: string, nextUser: ApiUser) => {
    saveAuthSession(nextToken, nextUser);
    setToken(nextToken);
    setUser(nextUser);
  }, []);

  const guestLogin = useCallback(async () => {
    const res = await loginGuest();
    applySession(res.token, res.user);
  }, [applySession]);

  const crmLogin = useCallback(async () => {
    const res = await window.serverOperator.crmLogin({ baseUrl: getCrmBaseUrl() });
    applySession(res.token, res.user);
  }, [applySession]);

  const logout = useCallback(() => {
    clearAuthSession();
    setToken(null);
    setUser(null);
    setNotifications([]);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      notifications,
      guestLogin,
      crmLogin,
      logout,
      refreshInbox,
    }),
    [user, token, loading, notifications, guestLogin, crmLogin, logout, refreshInbox],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
