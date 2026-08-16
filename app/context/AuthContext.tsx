import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { getProfile, Profile } from '../../lib/api/auth';
import type { Session } from '@supabase/supabase-js';

export type { Profile };

interface AuthContextValue {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  /**
   * 已经把资料查完的那个用户 id。
   *
   * 为什么需要它：`profile === null` 有**两种**含义 —— "还没查回来" 和 "确实没填过"。
   * 混在一起就会出现启动时闪一下 onboarding 再跳进主界面：session 从本地存储恢复只要几毫秒，
   * profile 要走网络，中间那几帧 profile 还是 null，导航就误判成"新用户，去引导页"。
   *
   * 存 user id 而不是布尔值，是因为登录/切号时也要重新等一次 —— 布尔值一旦置 true
   * 就再也不会变回去，老用户登录的瞬间照样会闪 onboarding。
   */
  profileSettledFor: string | null;
  /** 连不上服务端，正在退避重试。用来把加载页的文案从"转圈"换成"连接有问题"。 */
  authError: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  session: null,
  profile: null,
  loading: true,
  profileSettledFor: null,
  authError: false,
  refreshProfile: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileSettledFor, setProfileSettledFor] = useState<string | null>(null);
  const [authError, setAuthError] = useState(false);
  const mounted = useRef(true);
  // onAuthStateChange 的回调只在挂载时创建一次，闭包里读到的 state 永远是首帧的值。
  // 判定"是不是同一个人"必须走 ref，否则每次令牌续期都会当成换号处理。
  const settledRef = useRef<string | null>(null);

  /**
   * 手动刷新（引导完成、改完资料时调）。
   *
   * 失败时**保留**现有 profile，不置 null —— 改个昵称时网络抖一下，
   * 不该让整个界面退化成"没有资料"的状态。
   */
  const refreshProfile = async () => {
    try {
      const data = await getProfile();
      if (mounted.current && data) setProfile(data);
    } catch {
      // 交给下次刷新，当前显示的资料继续用
    }
  };

  useEffect(() => {
    mounted.current = true;

    /**
     * 启动 / 登录 / 切号时加载资料，加载完把 settled 标记到这个 user id 上。
     *
     * `getProfile()` 抛异常和返回 null 含义不同，处理方式也必须不同：
     *   · 返回 null = 会话有效但确实没有这一行（数据库重置、用户已被删）→ 登出
     *   · 抛异常   = 根本没查成（断网、服务端 5xx）→ 退避重试，**绝不能**登出，
     *                也绝不能放行到 onboarding。老用户被丢进引导页填一遍，
     *                会直接把自己原来的名字和宠物覆盖掉。
     */
    const loadFor = async (s: Session) => {
      for (let attempt = 0; mounted.current; attempt++) {
        try {
          const data = await getProfile();
          if (!mounted.current) return;

          if (!data) {
            await supabase.auth.signOut();
            if (!mounted.current) return;
            setSession(null);
            setProfile(null);
            settledRef.current = null;
            setProfileSettledFor(null);
          } else {
            setProfile(data);
            settledRef.current = s.user.id;
            setProfileSettledFor(s.user.id);
          }
          setAuthError(false);
          setLoading(false);
          return;
        } catch {
          if (!mounted.current) return;
          setAuthError(true);
          setLoading(false); // 让加载页显示出来（带"连接有问题"的文案），而不是空白
          // 退避重试，上限 10 秒。网络恢复后会自动接上，不需要用户手动操作。
          const wait = Math.min(1000 * 2 ** attempt, 10000);
          await new Promise((r) => setTimeout(r, wait));
        }
      }
    };

    // 1. 启动时恢复 session
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (!mounted.current) return;
        setSession(session);
        if (session) loadFor(session);
        else setLoading(false);
      })
      .catch(() => {
        if (mounted.current) setLoading(false);
      });

    // 2. 监听登录 / 登出
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted.current) return;
      setSession(session);
      if (!session) {
        setProfile(null);
        settledRef.current = null;
        setProfileSettledFor(null);
        return;
      }
      // 令牌自动续期也会走到这里。同一个人就不要重新进加载态了，
      // 否则每次续期整个 App 都会闪回加载页。
      if (session.user.id === settledRef.current) refreshProfile();
      else loadFor(session);
    });

    return () => {
      mounted.current = false;
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, profile, loading, profileSettledFor, authError, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
