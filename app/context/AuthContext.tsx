import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getProfile, Profile } from '../../lib/api/auth';
import type { Session } from '@supabase/supabase-js';

export type { Profile };

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    try {
      const data = await getProfile();
      if (!data) {
        // 如果获取不到用户资料（例如数据库重置，云端用户已不存在），
        // 自动调用登出清除本地残留的 invalid session，强制用户重新登录/注册。
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
      } else {
        setProfile(data);
      }
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    let mounted = true;
    
    // Safety timeout: dismiss loading spinner within 500ms max to guarantee Login screen renders
    const timer = setTimeout(() => {
      if (mounted) setLoading(false);
    }, 500);

    // 1. 获取当前 session（App 启动时）
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      if (session) {
        refreshProfile().finally(() => {
          if (mounted) setLoading(false);
        });
      } else {
        if (mounted) setLoading(false);
      }
    }).catch(() => {
      if (mounted) setLoading(false);
    });

    // 2. 监听登录/登出状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (!mounted) return;
        setSession(session);
        if (session) {
          refreshProfile();
        } else {
          setProfile(null);
        }
      }
    );

    return () => {
      mounted = false;
      clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, profile, loading, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}