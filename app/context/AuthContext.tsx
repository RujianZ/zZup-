import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getProfile } from '../../lib/api/auth';
import type { Session } from '@supabase/supabase-js';

// Profile 类型，映射 profiles 表
export interface Profile {
  id: string;
  sudo_id?: number;
  real_name?: string;
  bio?: string;
  avatar_url?: string;
  pet_name?: string;
  pet_avatar_url?: string;
  pet_bio?: string;
  pet_level?: number;
  pet_xp?: number;
  identity_mode?: 'real' | 'pet';
  location_sharing?: 'precise' | 'fuzzy' | 'off';
  university?: string;
  edu_verified?: boolean;
  ranking_opt_in?: boolean;
  ranking_identity_mode?: 'real' | 'pet';
  created_at?: string;
}

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
      setProfile(data);
    } catch {
      setProfile(null);
    }
  };

  useEffect(() => {
    // 1. 获取当前 session（App 启动时）
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        refreshProfile().finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // 2. 监听登录/登出状态变化
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session) {
          refreshProfile();
        } else {
          setProfile(null);
        }
      }
    );

    return () => subscription.unsubscribe();
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