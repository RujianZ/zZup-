/**
 * push.ts — 推送通知的客户端一侧
 *
 * 只做三件事：申请权限 → 拿设备令牌 → 存进 push_tokens。
 * 「谁该收、静音了没、开关关了没」全在服务端（send-push）判 ——
 * 客户端判等于没判。
 *
 * ⚠️ **Expo Go 里跑不了。** 远程推送要 App 有自己的身份（bundle id），
 * 而 Expo Go 里操作系统看到的是 host.exp.exponent，不是 com.zzup.app。
 * 安卓上 Expo Go 从 SDK 53 起直接把这个功能移除了。所以这里的
 * isDevice / projectId 检查失败时**静默返回**，不报错、不打扰用户 ——
 * 我们在安卓上仍然用 Expo Go 做日常调试。
 */

import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device'
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { supabase } from '../supabase'

/**
 * App 在前台时收到推送怎么办。
 *
 * 默认是「什么都不显示」—— 因为你正在用 App，横幅是打扰。
 * 但列表页的未读数要更新，所以还是要让事件走到监听器。
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
})

/**
 * 安卓 8.0+ 必须先建通知渠道，否则通知**根本不显示**，而且不报错。
 * iOS 忽略这一步。
 */
async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return
  await Notifications.setNotificationChannelAsync('dm', {
    name: 'Direct messages',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
  })
}

/** EAS 项目 id —— 拿 Expo push token 必须带它，否则拿到的令牌不指向我们这个项目 */
function projectId(): string | null {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants as any)?.easConfig?.projectId ??
    null
  )
}

/**
 * 申请权限 + 登记令牌。登录后调一次。
 *
 * @returns 登记成功返回令牌；跑不了 / 用户拒绝 / 出错都返回 null（不抛异常）
 */
export async function registerForPushNotifications(): Promise<string | null> {
  try {
    // 模拟器拿不到真实推送令牌
    if (!Device.isDevice) return null

    const pid = projectId()
    if (!pid) {
      // Expo Go 里就是这个分支。不是错误，是预期。
      console.log('[push] 没有 projectId，跳过（Expo Go 里正常）')
      return null
    }

    await ensureAndroidChannel()

    const { status: existing } = await Notifications.getPermissionsAsync()
    let status = existing
    if (existing !== 'granted') {
      // 只在还没决定过的时候弹框。用户拒绝过就不要反复骚扰 ——
      // iOS 上第二次调这个 API 根本不会再弹，只会直接返回 denied。
      const asked = await Notifications.requestPermissionsAsync()
      status = asked.status
    }
    if (status !== 'granted') return null

    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: pid })
    if (!token) return null

    const { error } = await supabase.rpc('register_push_token', {
      p_token: token,
      p_platform: Platform.OS === 'ios' ? 'ios' : 'android',
    })
    // Supabase 的坑：错误在 error 对象里，不抛异常。不检查就等于没写。
    if (error) {
      console.error('[push] 登记令牌失败:', error.message)
      return null
    }

    return token
  } catch (e) {
    // 推送拿不到绝不能挡住 App 启动
    console.error('[push] register 出错:', String(e))
    return null
  }
}

/**
 * 退出登录时调。不删的话，下一个人在这台设备上登录之前，
 * 前任还会继续收到自己的私聊推送。
 */
export async function unregisterPushToken(): Promise<void> {
  try {
    const pid = projectId()
    if (!pid || !Device.isDevice) return
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId: pid })
    if (!token) return
    const { error } = await supabase.rpc('unregister_push_token', { p_token: token })
    if (error) console.error('[push] 注销令牌失败:', error.message)
  } catch (e) {
    console.error('[push] unregister 出错:', String(e))
  }
}

/**
 * 通知里带的数据。只有这两个字段，**消息内容一个字都没有**。
 * sender_name 就是通知标题上那个名字（私聊的会话名 = 对方的名字），
 * ChatScreen 需要它当 groupName。
 */
export type PushPayload = { conversation_id?: string; sender_name?: string }

/**
 * 用户点了通知横幅时的回调。
 *
 * 两种情况都要接：
 *   · App 在后台被点开   → addNotificationResponseReceivedListener
 *   · App 被完全杀掉后点开 → getLastNotificationResponseAsync（冷启动时读一次）
 * 只接前者的话，从「App 已划掉」状态点通知会进首页而不是那个会话。
 */
export function addNotificationTapListener(
  onTap: (payload: PushPayload) => void
): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(res => {
    const data = res?.notification?.request?.content?.data as PushPayload | undefined
    if (data) onTap(data)
  })

  Notifications.getLastNotificationResponseAsync().then(res => {
    const data = res?.notification?.request?.content?.data as PushPayload | undefined
    if (data) onTap(data)
  }).catch(() => { /* 冷启动没有待处理通知时会走这里，正常 */ })

  return () => sub.remove()
}
