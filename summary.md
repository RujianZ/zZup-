好，两份说明：

---

# 大白话版（给 Ethan）

## location.ts 里有什么？

这个文件管的是**地图相关的所有后端逻辑**，分几块：

---

### 1. `updateMyLocation(coord)` — 更新我的位置

你每隔一段时间调一次，把用户当前 GPS 坐标传进来。

后端会根据用户的隐私设置决定怎么存：
- **precise**：直接存真实坐标
- **fuzzy**：把坐标"磁吸"到最近的网格点（约 ±555m 误差），好友看到的是模糊位置
- **off**：直接从数据库删掉这个用户的位置，好友地图上消失

你不需要判断模式，传真实坐标进来就行，后端自动处理。

---

### 2. `getFriendLocations()` — 获取好友位置列表

调一次，返回所有好友目前的位置（已过滤掉关闭位置共享的人）。

每条数据包含：位置坐标、display_name、头像、身份模式（real/pet）。

你拿到这个数组，在地图上每人放一个头像图标就行。

---

### 3. `subscribeToFriendLocations(friendIds, onUpdate)` — 实时监听好友位置

不用每秒手动查，订阅之后好友一动你就收到回调。

用法：
```typescript
const unsubscribe = await subscribeToFriendLocations(friendIds, (loc) => {
  // loc 是最新的好友位置，更新地图上的图标
})
// 页面关闭时调：
unsubscribe()
```

---

### 4. `cacheNearbyPlaces(coord)` — 获取附近地标

传入坐标，返回附近的地标列表（图书馆、咖啡厅、健身房、餐厅等）。

内部会自动判断这个区域有没有查过——查过的直接从数据库返回，没查过才调 Google Places API。你不需要管这些，直接调就行。

---

### 5. `discoverLandmark(coord, minutesSpent)` — 探索地标（游戏化核心）

用户在某个地标附近停留时调用。`minutesSpent` 是**本周在这个地点的累计分钟数**（你前端维护这个值）。

调用时机：
- 到达满 2 分钟时
- 本周累计达 30 分钟时
- 本周累计达 60 分钟时

返回：
```typescript
{
  xp_earned: 10,          // 这次获得多少 XP
  is_first_visit: true,   // 是否第一次来
  title_unlocked: 'Bookworm', // 解锁了称号（没有就是 null）
  visit_count: 1,
  weekly_time_spent: 5,
}
```

---

### 6. `saveExploredPath(coordinates)` — 保存走过的路径

你用 expo-location 收集 GPS 点，本地用 RDP 算法压缩后，调这个函数存进数据库。

格式：`[{lat, lng}, {lat, lng}, ...]`

---

### 7. `getExploredPaths()` — 获取所有走过的路径

进地图页时调一次，返回用户历史上所有走过的路径，你用来渲染地图迷雾。

返回格式：`[[{lat, lng}, ...], [{lat, lng}, ...]]`（每个数组是一段路径）

---

### 8. `setActiveTitle(explorationId, title)` — 装备/卸下称号

用户在称号管理页选好用哪个称号后调用。`title = null` 表示不装备任何称号。

---

### 9. `getWeeklyRankings(university)` — 获取排行榜

传入大学名称，返回按地点类型分组的本周排行榜（前 3 名）。

只有 edu_verified 的同校用户才能看到数据，否则返回空。

---

### 10. `setRankingPreferences(optIn, identityMode)` — 设置排行榜偏好

用户决定要不要参加排行榜、以真人还是宠物身份上榜。

---
---

# 专业版（给 AI / 未来参考）

## location.ts 技术文档

**文件路径：** `lib/api/location.ts`
**依赖：** `lib/supabase.ts`（Supabase 客户端）
**对应任务：** Module 1 任务 47–51 + 44b + 48b

---

### 内部工具函数

**`applyFuzzyOffset(coord)`**
Grid truncation 实现。将坐标 snap 到最近的 0.005° 网格点（约 555m/格）。使用 `Math.round(x / GRID) * GRID` 而非随机偏移，保证同一用户多次上传相同真实位置时，模糊坐标稳定不抖动。

**`getWeekStart()`**
返回最近一个周一 00:00:00 本地时间的 Date 对象。用于判断周重置和 `week_start_date` 写入。

**`clampMinutesSpent(claimed, prevWeeklyTime, lastVisitedAt, isNewWeek)`**
反作弊核心。双重校验前端传入的 `minutesSpent`：
- 硬性上限：单次调用最多 480 分钟（`MAX_MINUTES_PER_CALL`）
- 时间戳校验：`delta`（本次增量）不得超过距上次访问的真实经过时间 + 10 分钟容差（`TIMESTAMP_TOLERANCE`，补偿网络延迟）
- 新的一周或首次访问时跳过时间戳校验，仅应用硬性上限

---

### 导出函数

**`updateMyLocation(coord)`**
读取当前用户 `profiles.location_sharing`，按模式处理：
- `off`：DELETE `user_locations` 对应行
- `fuzzy`：经 `applyFuzzyOffset` 处理后 upsert
- `precise`：直接 upsert 真实坐标
`user_locations` 表以 `user_id` 为主键，每人只有一行，upsert 语义正确。

**`getFriendLocations()`**
两步查询：先从 `friendships` 表（status = 'accepted'）提取好友 ID 列表，再联表查询 `user_locations` JOIN `profiles`（使用 Supabase `!inner` join 语法）。客户端过滤掉 `location_sharing = 'off'` 的好友后返回。

**`subscribeToFriendLocations(friendIds, onUpdate)`**
订阅前一次性批量预取所有好友 profile 缓存到内存 Map，避免每次 Realtime 事件触发时的 N+1 查询。订阅 `user_locations` 表的 `*` 事件（INSERT/UPDATE/DELETE），filter 为 `user_id=in.(...)`. 收到事件后从缓存取 profile，过滤 `location_sharing = 'off'` 后回调。注意：profile 缓存不自动刷新，若好友在订阅期间修改 identity_mode 或 location_sharing 设置，需前端重新调用此函数重建订阅。

**`cacheNearbyPlaces(coord)`**
两级缓存策略：
1. 查 `landmark_cache_zones`：若 ±0.005° 范围内有未过期（`expires_at >= now`）的 zone 记录，直接从 `landmarks` 表查同范围内未过期地标返回
2. 否则调用 Google Places Nearby Search API（半径 500m），结果 upsert 到 `landmarks`（on conflict `place_id`），并在 `landmark_cache_zones` 插入本次搜索坐标记录
内置 `getPlaceType()` 和 `getPlaceRadius()` 将 Google Places API 的 `types` 数组映射为 SUDO 内部类型（library / cafe / gym / dining / other）和对应探索半径（15–100m）

**`discoverLandmark(coord, minutesSpent)`**
调用 `cacheNearbyPlaces` 获取附近地标后，用欧氏距离公式（考虑纬度余弦修正）判断是否在某地标的 `radius_meters` 范围内。

首次访问：INSERT explorations 行，`is_first_visit = true`，固定 +10 XP。

再次访问：
- 判断周重置（`week_start_date < weekStart`），若是则 `prevWeeklyTime = 0`
- 经 `clampMinutesSpent` 处理后计算新的 `weekly_time_spent`
- XP 阈值奖励：仅在本次调用导致跨越 30/60 分钟阈值时发放（`prevWeeklyTime < 30 && newWeeklyTime >= 30`）
- 称号解锁：`visit_count >= 7` 解锁初级，`>= 30` 解锁高级，均为终身不重置
- **乐观锁**：UPDATE 条件中附加 `.eq('last_visited_at', existing.last_visited_at)`，若返回空行（0 rows updated）说明并发冲突，返回 `null`

XP 写入由 `addXP()` 处理，内含宠物升级公式：`pet_level = floor(pet_xp / 100) + 1`

**`saveExploredPath(coordinates)`**
简单 INSERT 到 `explored_paths`，一行代表一段 RDP 简化后的路径（JSONB 数组）。前端负责 RDP 算法和调用时机，后端只做存储。

**`getExploredPaths()`**
SELECT `explored_paths.coordinates` WHERE `user_id = current_user`，返回 `{lat, lng}[][]`（路径段数组的数组），供前端迷雾渲染使用。

**`setActiveTitle(explorationId, title)`**
双重校验：`.eq('user_id', user.id)` 防止操作他人记录；检查 `titles_earned.includes(title)` 防止装备未解锁称号。`title = null` 表示卸下。

**`getWeeklyRankings(university)`**
调用 `SECURITY DEFINER` RPC `get_weekly_rankings`，传入 `p_university`。RPC 内部校验调用者是否为该校 `edu_verified` 用户，否则返回空集。结果按 `place_type` 分组聚合为 `WeeklyRankings` 对象返回。

**`setRankingPreferences(optIn, identityMode)`**
UPDATE `profiles` 的 `ranking_opt_in` 和 `ranking_identity_mode` 两字段。

---

# auth.ts

## 大白话版（给 Ethan）

### `signUp(email, password)` — 注册

传邮箱和密码，注册新账号。注册成功后 Supabase 会自动发验证邮件（通过 Resend），用户点击邮件里的链接才算激活。

返回：`{ userId, error }`

---

### `signIn(email, password)` — 登录

传邮箱和密码，登录已有账号。登录成功后 session 会自动保存在手机本地（AsyncStorage），下次打开 App 不用重新登录。

返回：`{ userId, error }`

---

### `signOut()` — 登出

清除本地 session，跳回登录页。

返回：`{ error }`

---

### `getProfile()` — 获取当前用户资料

读取当前登录用户的完整 profile（所有字段，包括宠物信息）。没登录返回 null。

---

### `updateProfile(fields)` — 更新资料

传你想改的字段，不传的字段不会被修改。Onboarding 三步都用这个函数写入。

可更新的字段：`real_name` / `bio` / `avatar_url` / `date_of_birth` / `nationality` / `region` / `university` / `personal_email` / `edu_email` / `pet_name` / `pet_avatar_url` / `pet_bio` / `identity_mode` / `location_sharing` / `ranking_opt_in` / `ranking_identity_mode`

用法举例：
```typescript
await updateProfile({ real_name: 'Joe', identity_mode: 'real' })
```

---
---

## 专业版（给 AI）

**文件路径：** `lib/api/auth.ts`
**对应任务：** Module 2 任务 54

**`Profile` 接口**
映射 `profiles` 表全部字段。`sudo_id` 为自增5位编号（数据库生成，不可修改）。

**`ProfileUpdate` 类型**
`Partial<Pick<Profile, ...>>` 限定只有可由用户修改的字段才能传入 `updateProfile`。排除了 `id`、`sudo_id`、`edu_verified`、`personal_email_verified`、`pet_level`、`pet_xp`、`qr_code_url`、`created_at`——这些字段由系统或触发器维护，不允许客户端直接写入。

**`signUp(email, password)`**
调用 `supabase.auth.signUp()`。注册成功后 `on_auth_user_created` 触发器（migration 53）自动在 `profiles` 表插入对应行（id 相同，其余字段为空）。验证邮件由 Resend SMTP 发送（`noreply@sudocollege.com`）。

**`signIn(email, password)`**
调用 `supabase.auth.signInWithPassword()`。Session 由 Supabase JS SDK 自动持久化至 AsyncStorage（在 `lib/supabase.ts` 初始化时配置）。

**`signOut()`**
调用 `supabase.auth.signOut()`，清除本地 session。

**`getProfile()`**
先调 `supabase.auth.getUser()` 取当前用户 ID，再 SELECT `profiles` 表对应行。不接受 `userId` 参数（始终读当前登录用户），Ethan 如需读他人 profile 应另行直接查询。

**`updateProfile(fields)`**
UPDATE `profiles` WHERE `id = auth.uid()`，传入 `ProfileUpdate` 类型确保类型安全。RLS 保证只有本人可以修改自己的行。

---
---

# groups.ts

## 大白话版（给 Ethan）

### `createGroup(data)` — 创建群组

传群名、描述、头像、类型等，创建一个新群。创建者自动成为 admin 并加入群。

```typescript
await createGroup({
  name: '计算机系 2026',
  group_type: 'edu_verified',
  university: 'UCL',
  is_searchable: true,
})
```

---

### `getMyGroups()` — 获取我加入的所有群

返回当前用户加入的所有群（包括群聊和私信）的列表。

---

### `joinGroup(groupId)` — 加入群组

传群的 id，加入该群。已经是成员会报错。

返回：`{ error }`

---

### `leaveGroup(groupId)` — 退出群组

退出某个群。如果你是群主，会自动把群主转给加入时间最早的其他成员。

返回：`{ error }`

---

### `searchGroups(keyword, university?)` — 搜索群组

根据关键词搜索可发现的群（成员 >= 3、可搜索的）。可以加 university 参数缩小范围。

```typescript
const results = await searchGroups('计算机', 'UCL')
```

---

### `createDirectMessage(friendId)` — 打开私信

传好友的 userId，创建或打开与他的私信会话。如果已经有私信会话了，直接返回已有的，不会重复创建。

返回一个 Group 对象（私信复用群的数据结构，`chat_type = 'direct'`）。

---

### `removeMember(groupId, targetUserId)` — 踢人

只有群主可以调用。把某个成员从群里移除。不能踢自己，要退群用 `leaveGroup`。

返回：`{ error }`

---
---

## 专业版（给 AI）

**文件路径：** `lib/api/groups.ts`
**对应任务：** Module 4 任务 71–76, 85

**`syncMembersCount(groupId)`（内部函数）**
不导出。从 `group_members` 表用 `count: 'exact'` 查实际成员数，写回 `groups.members_count`。避免并发 +1/-1 导致的计数漂移。所有成员数变动后均调用此函数。

**`createGroup(data)`**
INSERT `groups`（`chat_type` 固定为 `'group'`），再 INSERT `group_members`（role = `'admin'`）。初始 `members_count` 直接写 1，跳过 `syncMembersCount`（性能优化，建群时成员数确定为 1）。

**`getMyGroups()`**
两步查询：SELECT `group_members.group_id` WHERE `user_id = auth.uid()`，再 SELECT `groups` WHERE `id IN (...)`。返回包含所有 `chat_type`（group 和 direct）的群列表。

**`joinGroup(groupId)`**
INSERT `group_members`（role = `'member'`）。`UNIQUE(group_id, user_id)` 约束保证重复加入时数据库报错，error 透传给前端。成功后调 `syncMembersCount`。

**`leaveGroup(groupId)`**
先读 `groups.created_by`，DELETE `group_members` 对应行，若退出者为群主则查 `group_members` ORDER BY `joined_at ASC LIMIT 1` 取继承人，UPDATE `groups.created_by`（无成员时设 null）。最后调 `syncMembersCount`。

**`searchGroups(keyword, university?)`**
基础过滤：`is_searchable = true`、`chat_type = 'group'`、`members_count >= 3`、`group_type IN ('open','official','edu_verified')`、`name ILIKE '%keyword%'`。若传入 `university`，附加 OR 条件：`open/official` 类型无限制，`edu_verified` 类型要求 `university` 字段匹配。数据库 RLS 已有同等保护，此为双重过滤。

**`createDirectMessage(friendId)`**
防重复逻辑：查当前用户所有 `chat_type = 'direct'` 的群（使用 `!inner` join），遍历每个群检查对方是否也是成员。找到则直接返回已有 Group，否则 INSERT 新 `groups`（`name = ''`，`chat_type = 'direct'`，`group_type = 'direct'`，`is_searchable = false`），再批量 INSERT 两个 `group_members`。

**`removeMember(groupId, targetUserId)`**
校验 `groups.created_by === auth.uid()`（仅群主可操作），校验 `targetUserId !== user.id`（不可自踢），DELETE `group_members`，调 `syncMembersCount`。RLS 作为第二层保护。

---
---

# messages.ts

## 大白话版（给 Ethan）

### `getMessages(groupId, limit?, before?)` — 获取历史消息

拉取某个群（或私信）的消息列表，最新的在前面。默认每次 30 条。

**上拉加载更多（分页）：** 把当前列表里最旧那条消息的 `created_at` 传进 `before`，就能拉到更早的消息。

```typescript
// 第一次加载
const msgs = await getMessages(groupId)

// 上拉加载更多
const older = await getMessages(groupId, 30, msgs[msgs.length - 1].created_at)
```

---

### `sendMessage(groupId, content, identityMode, imageUrl?)` — 发消息

发一条消息。`identityMode` 是这条消息用真人身份还是宠物身份发，一旦发出不可更改。`imageUrl` 是可选的，图片先上传到 Storage，再把 URL 传进来。

```typescript
await sendMessage(groupId, '你好！', 'real')
await sendMessage(groupId, '', 'pet', 'https://...')  // 纯图片消息
```

---

### `subscribeToMessages(groupId, onMessage)` — 实时接收新消息

订阅某个群的新消息，有新消息进来会自动触发回调，你把它加到列表最前面就行。

```typescript
const unsubscribe = subscribeToMessages(groupId, (msg) => {
  setMessages(prev => [msg, ...prev])
})
// 页面关闭时：
unsubscribe()
```

---
---

## 专业版（给 AI）

**文件路径：** `lib/api/messages.ts`
**对应任务：** Module 4 任务 77–79

**`Message` 接口**
映射 `messages` 表字段。`user_id` 为 `null` 时表示发送者账号已删除。`identity_mode` 为内容级别，发布时固定，不受用户全局 `identity_mode` 变化影响。

**`getMessages(groupId, limit?, before?)`**
SELECT `messages` WHERE `group_id = groupId`，ORDER BY `created_at DESC`，LIMIT `limit`（默认 30）。游标分页：传入 `before` 时附加 `created_at < before` 条件，实现无限上拉加载。RLS 保证只有群成员可读。

**`sendMessage(groupId, content, identityMode, imageUrl?)`**
INSERT `messages`。`image_url` 接收前端已上传至 Storage 后返回的 URL，函数本身不处理文件上传。RLS（`group_members` 联查）保证非成员无法发送。`identity_mode` 不可为空（数据库 NOT NULL 约束），由前端选择器决定后传入。

**`subscribeToMessages(groupId, onMessage)`**
订阅 `messages` 表 INSERT 事件，filter 为 `group_id=eq.${groupId}`。channel 名称为 `messages:${groupId}`，保证每个群独立 channel，不同群的消息不会串台。返回 `() => supabase.removeChannel(channel)` 供前端在 `useEffect` cleanup 或页面 unmount 时调用，防止内存泄漏和重复订阅。