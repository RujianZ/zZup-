/**
 * 聊天里的时间显示。**一处定义** —— 会话列表和聊天界面用的是同一套词
 * （Today / Yesterday / 星期几），不要各写各的。
 *
 * 判据一律走**日历天**，不走"过了多少毫秒"。昨晚 11 点发的消息，
 * 今早看是「Yesterday」而不是「8h ago」—— 后者要用户自己在脑子里换算。
 *
 * ⚠️ **显示一律跟设备时区**（`toLocaleXxx` 不传 timeZone 就是本地时区），
 * 洛杉矶的人看到的就是洛杉矶时间。库里存的是 timestamptz，本身是绝对时刻，
 * 我们自己在后台按美东读，两件事不冲突。
 *
 * 别把这里改成写死美东 —— 那是**年龄门**（迁移 75）才需要的东西：那条是
 * 规则判定，必须全国统一、且不能被用户改设备时区绕过；这里是显示，跟着人走。
 */

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** 相差几个日历天：今天 0，昨天 1，前天 2 */
function daysApart(a: Date, b: Date): number {
  return Math.round((startOfDay(b) - startOfDay(a)) / 86_400_000)
}

export function isSameDay(a: string | Date, b: string | Date): boolean {
  return daysApart(new Date(a), new Date(b)) === 0
}

/** 气泡下面那行：2:06 PM */
export function clockTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** 聊天里的分日横条：Today / Yesterday / Saturday / June 15 / June 15, 2025 */
export function dayLabel(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const ago = daysApart(d, now)

  if (ago === 0) return 'Today'
  if (ago === 1) return 'Yesterday'
  // 一周以内说星期几；再往前说日期就够了，"7 天前"没人算得清
  if (ago > 1 && ago < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })

  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-US',
    sameYear ? { month: 'long', day: 'numeric' } : { month: 'long', day: 'numeric', year: 'numeric' })
}

// 会话列表（InboxScreen）那侧的 "5m ago / Monday" 是它自己那套，没搬过来 ——
// 那里显示的是"多久没动了"，跟聊天里"这条是哪天发的"不是同一个问题。
