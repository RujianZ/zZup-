# Location API — 前端使用指南

> 写给 Ethan 的版本。你可以看后端代码，只需要知道"什么时候调哪个函数、传什么、会拿到什么"。
>
> 所有函数都在 `lib/api/location.ts`，直接 import 用就行。

---

## 快速导航

| 我想做什么 | 用哪个函数 |
|---|---|
| 更新自己的位置 | `updateMyLocation` |
| 获取好友位置（一次性） | `getFriendLocations` |
| 实时监听好友位置变化 | `subscribeToFriendLocations` |
| 用户到了某个地方，触发游戏化 | `discoverLandmark` |
| 保存用户走过的路径（迷雾） | `saveExploredPath` |
| 加载用户所有历史路径（迷雾） | `getExploredPaths` |
| 显示排行榜 | `getWeeklyRankings` |
| 切换排行榜显示身份 | `setRankingPreferences` |
| 切换用户装备的称号 | `setActiveTitle` |

---

## 用户位置

### `updateMyLocation(coord)`

**什么时候调：** 地图页面打开时，每隔 30–60 秒调一次。页面关闭就停，不要在后台调。

**传什么：**
```typescript
import { updateMyLocation } from '../lib/api/location'

await updateMyLocation({ latitude: 40.7128, longitude: -74.0060 })
```

**它会做什么：**
- 去读这个用户的隐私设置（`profiles.location_sharing`）
- 如果是 `precise`：直接存真实坐标
- 如果是 `fuzzy`：自动把坐标模糊到约 500m 的格子里再存（保护隐私，你不用管）
- 如果是 `off`：自动把他的位置从数据库删掉

你只管传坐标，隐私模式后端自动处理。

---

## 好友位置

### `getFriendLocations()`

**什么时候调：** 地图页面刚打开时，拉一次好友位置作为初始显示。

```typescript
import { getFriendLocations } from '../lib/api/location'

const friends = await getFriendLocations()
// friends 是一个数组，每项长这样：
// {
//   user_id: "uuid...",
//   latitude: 40.71,
//   longitude: -74.00,
//   updated_at: "2026-03-25T10:00:00Z",
//   display_name: "张三",        ← 用来显示在地图气泡上
//   avatar_url: "https://...",   ← 真人头像
//   pet_avatar_url: "https://...",
//   identity_mode: "real"        ← "real" 或 "pet"
// }
```

**渲染规则：**
- `identity_mode === 'real'` → 显示 `avatar_url` + `display_name`
- `identity_mode === 'pet'` → 显示 `pet_avatar_url` + `display_name`（display_name 目前始终是真名，待定）

已经关掉位置共享的好友不会出现在结果里，不用自己过滤。

---

### `subscribeToFriendLocations(friendIds, onUpdate)`

**什么时候调：** 初始加载之后，用这个来实时更新好友位置（WebSocket）。

```typescript
import { subscribeToFriendLocations } from '../lib/api/location'

// 先拿到好友 ID 列表（你自己的逻辑）
const friendIds = friends.map(f => f.user_id)

// 开始监听
const unsubscribe = await subscribeToFriendLocations(friendIds, (loc) => {
  // 每当某个好友位置变了，这里就会被调用
  // loc 的结构和 getFriendLocations 返回的每一项一样
  updateMapMarker(loc)  // 你自己更新地图标记的逻辑
})

// 页面关闭时，记得取消订阅！
// useEffect 里：return () => unsubscribe()
```

**注意：** 订阅开启后，如果好友中途改了头像或身份模式，需要重新订阅才能拿到最新的。

---

## 迷雾系统

迷雾的渲染逻辑你来做，后端负责存储路径数据。

### 整体流程

```
用户走动
  → 你用 GPS 采集坐标点
  → 你用 RDP 算法简化点（减少数据量）
  → 调 saveExploredPath() 存到数据库
  → 调 getExploredPaths() 加载历史路径
  → 你把路径渲染成"已探索区域"，覆盖掉迷雾层
```

### `saveExploredPath(coordinates)`

**什么时候调：** 用户走了一段路之后（比如每隔一段时间，或者用户离开某区域时），把这段路径简化后存进来。

**不要** 把原始 GPS 点直接传进来，先用 RDP 压缩一下。

```typescript
import { saveExploredPath } from '../lib/api/location'

// coordinates 是简化后的坐标数组
await saveExploredPath([
  { lat: 40.7128, lng: -74.0060 },
  { lat: 40.7135, lng: -74.0055 },
  { lat: 40.7140, lng: -74.0048 },
])
```

---

### `getExploredPaths()`

**什么时候调：** 迷雾地图页面打开时，加载这个用户所有历史路径。

```typescript
import { getExploredPaths } from '../lib/api/location'

const paths = await getExploredPaths()
// paths 是二维数组，每一项是一段路径：
// [
//   [{ lat: 40.71, lng: -74.00 }, { lat: 40.72, lng: -74.01 }],  ← 第一段路径
//   [{ lat: 40.73, lng: -74.02 }, { lat: 40.74, lng: -74.03 }],  ← 第二段路径
// ]
```

拿到之后，你遍历每段路径，在地图上把这些点周围的迷雾"擦掉"。

---

## 游戏化：地标探索

### `discoverLandmark(coord, minutesSpent)`

**什么时候调（三个时机）：**
1. 用户在某个地方待了 **2 分钟**（首次抵达触发）
2. 用户本周在这里累计待了 **30 分钟**
3. 用户本周在这里累计待了 **60 分钟**

**`minutesSpent` 是什么：** 本周在这个地标的**累计分钟数**，由你在前端自己维护。
- 第一次来：传 2（待了2分钟）
- 下次来，加上这次的时间一起传，比如之前存了 20 分钟，这次又待了 15 分钟 → 传 35

```typescript
import { discoverLandmark } from '../lib/api/location'

const result = await discoverLandmark(
  { latitude: 40.7128, longitude: -74.0060 },
  35  // 本周累计分钟数
)

if (result === null) {
  // 附近没有地标，或者发生了并发冲突（直接忽略，不用报错）
  return
}

// result 长这样：
// {
//   xp_earned: 10,              ← 这次获得了多少 XP
//   is_first_visit: true,       ← 是否是人生第一次来这个地标
//   title_unlocked: "Bookworm", ← 解锁了什么称号（没有则为 null）
//   visit_count: 1,             ← 来过几次了（含这次）
//   weekly_time_spent: 35,      ← 后端确认的本周时间（可能被后端修正过）
//   last_visited_at: null,      ← 上次来的时间（这次是第一次所以是 null）
// }

// 你可以弹出动画："获得 10 XP！"、"解锁称号：书虫！"
```

**XP 怎么算（了解就好，后端自动处理）：**

| 事件 | XP |
|---|---|
| 第一次来任何地标 | +10 |
| 本周在图书馆累计 30 分钟 | +3 |
| 本周在图书馆累计 60 分钟 | +8 |
| 本周在餐厅/健身房/咖啡厅累计 30 分钟 | +2 |
| 本周在餐厅/健身房/咖啡厅累计 60 分钟 | +5 或 +6 |

**称号怎么解锁（了解就好）：**

| 来过次数 | 图书馆 | 餐厅 | 健身房 | 咖啡厅 |
|---|---|---|---|---|
| ≥ 7 次 | 书虫 | 大胃王 | 健身新手 | 咖啡爱好者 |
| ≥ 30 次 | 图书馆之王 | 食堂霸主 | 健身狂人 | 咖啡成瘾者 |

---

### `setActiveTitle(explorationId, title)`

**什么时候调：** 用户在设置里装备/卸下称号时。

```typescript
import { setActiveTitle } from '../lib/api/location'

// 装备称号
await setActiveTitle('exploration-uuid', 'Bookworm')

// 卸下称号（不显示任何称号）
await setActiveTitle('exploration-uuid', null)
```

`explorationId` 是 `explorations` 表的主键，你需要先查一下用户在某个地标的探索记录来拿到这个 ID。

---

## 排行榜

### `getWeeklyRankings(university)`

**什么时候调：** 排行榜页面打开时。

**注意：** 只有 `edu_verified = true` 的用户才能看到排行榜，否则返回空。

```typescript
import { getWeeklyRankings } from '../lib/api/location'

const rankings = await getWeeklyRankings('MIT')

// rankings 长这样：
// {
//   library: [
//     { rank: 1, display_name: "张三", avatar_url: "...", weekly_time_spent: 120, active_title: "图书馆之王", ... },
//     { rank: 2, ... },
//     { rank: 3, ... },
//   ],
//   gym: [ ... ],
//   cafe: [ ... ],
//   dining: [ ... ],
// }
// 每个类别最多 3 名
// 某类别如果没人去过，那个 key 就不存在（不是空数组，是不存在）
```

---

### `setRankingPreferences(optIn, identityMode)`

**什么时候调：** 用户在设置里开关排行榜、或者切换以真人/宠物身份上榜时。

```typescript
import { setRankingPreferences } from '../lib/api/location'

// 开启排行榜，以真人身份显示
await setRankingPreferences(true, 'real')

// 开启排行榜，以宠物身份显示
await setRankingPreferences(true, 'pet')

// 退出排行榜
await setRankingPreferences(false, 'real')  // 第二个参数随便传，不影响
```

---

## 常见问题

**Q：我不需要处理隐私模式逻辑吗？**
A：不需要，`updateMyLocation` 内部自动处理了。你只管传坐标。

**Q：`discoverLandmark` 返回 `null` 怎么办？**
A：直接忽略就行，说明附近没有已知地标，或者短暂的并发冲突（很罕见，不需要报错给用户）。

**Q：`getWeeklyRankings` 返回空对象 `{}` 怎么办？**
A：显示"本周暂无数据"的空状态页面。

**Q：所有函数都需要登录吗？**
A：是的，没登录时函数会返回空结果，不会报错。
