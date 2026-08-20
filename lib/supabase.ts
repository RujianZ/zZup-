import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

// 这里曾经有个 USE_MOCK 开关和 ~680 行的假客户端（假用户、假好友、假消息，
// 头像全是 Unsplash 外链）。它自 USE_MOCK = false 起就是死代码，但一直摆在
// 真客户端旁边 —— 谁要是手滑把开关拨回 true，整个 App 会连上一堆凭空捏造的
// 数据而且看不出来。上架前一起删了。要离线开发就连本地 supabase start。
//
// 缺环境变量直接抛错，不给默认值。以前默认成 'https://mock.supabase.co'，
// 结果是所有请求静默失败，看起来像后端挂了。
export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
export const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY 没配。检查 .env，然后重启 Metro（--clear）。'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
