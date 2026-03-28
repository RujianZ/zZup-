# SUDO App — 后端函数大白话说明书
> 给 Ethan 看的版本 | 更新于 2026年3月
> 代码位置：`D:\sudo-app\lib\api\`

---

## 目录
1. [auth.ts — 用户认证与资料](#1-authts)
2. [posts.ts — 帖子与朋友圈](#2-poststs)
3. [groups.ts — 群组与私信](#3-groupsts)
4. [messages.ts — 消息](#4-messagests)
5. [location.ts — 位置与探索系统](#5-locationts)
6. [friends.ts — 好友与屏蔽](#6-friendsts)

---

## 关于数据库

Joe 和 Ethan 都是 Supabase 的 owner，可以直接在 Supabase Dashboard 看到所有表结构。

关键概念：
- **RLS（行级安全）**：数据库自带的权限控制。比如"只有本人能删自己的帖子"这类规则，不需要在代码里手动判断，数据库自动拒绝非法操作。
- **所有函数都需要用户已登录**，未登录调用大多数函数会直接返回空或 null。
- **identity_mode**：每条帖子/消息/评论发布时选择"以真人身份"还是"以宠物身份"，发布后**不可更改**。

---

## 1. auth.ts

**文件路径**：`lib/api/auth.ts`

### signUp(email, password)

**是什么**：注册新账号。

**流程**：
1. 调用 Supabase Auth 创建账号
2. Supabase 自动触发数据库触发器，在 `profiles` 表给这个用户建一行空记录
3. 返回 `{ userId, error }`

**用户分支**：
- ✅ 注册成功 → 返回 userId，前端跳转 Onboarding 填写资料
- ❌ 邮箱已被注册 / 密码太短 → 返回 error 信息，前端显示报错

---

### signIn(email, password)

**是什么**：登录。

**流程**：
1. 调用 Supabase Auth 验证邮箱密码
2. 返回 `{ userId, error }`

**用户分支**：
- ✅ 登录成功 → 返回 userId，前端跳转主页
- ❌ 密码错误 / 账号不存在 → 返回 error，前端显示"邮箱或密码错误"

---

### signOut()

**是什么**：退出登录。

**流程**：调用 Supabase Auth 清除 session，返回 `{ error }`。

---

### getProfile(userId?)

**是什么**：读取用户资料。

**两种用法**：
- 不传 userId → 读自己的完整资料（所有字段都返回）
- 传别人的 userId → 读对方的资料，但会按对方的隐私设置过滤

**查自己时**：直接返回所有字段，无过滤。

**查别人时，有以下过滤规则**：

| 字段 | 规则 |
|------|------|
| personal_email、edu_email、region | 永远隐藏，返回 null |
| location_sharing、ranking_opt_in | 永远隐藏，返回 null |
| show_date_of_birth、show_nationality、show_qr_code | 永远返回 false（查看者不需要知道对方的隐私开关状态） |
| date_of_birth | 只有对方开启了 `show_date_of_birth` 才显示 |
| nationality | 只有对方开启了 `show_nationality` 才显示 |
| qr_code_url | 只有对方开启了 `show_qr_code` 才显示 |

**再按 profile_visibility 决定显示哪个身份**：
- `real_only` → 隐藏宠物所有信息（pet_name、pet_avatar_url、pet_bio、pet_level、pet_xp）
- `pet_only` → 隐藏真人信息（real_name、avatar_url、bio），同时也隐藏 date_of_birth、nationality、qr_code_url（这些属于真实身份，宠物模式下不应泄露）
- `real_with_pet` → 真人和宠物都显示

**用户分支**：
- 查自己 → 返回完整资料
- 查好友（已接受）→ 返回按隐私设置过滤后的资料
- 查陌生人 → 同上，按对方隐私设置过滤
- 未登录 → 返回 null

---

### updateProfile(fields)

**是什么**：更新当前用户的资料。

**可以更新的字段**：real_name、bio、avatar_url、date_of_birth、nationality、region、university、personal_email、edu_email、pet_name、pet_avatar_url、pet_bio、identity_mode、location_sharing、ranking_opt_in、ranking_identity_mode、profile_visibility、show_date_of_birth、show_nationality、show_qr_code

**用法**：只传需要更新的字段，不传的字段不会被清空。

**用户分支**：
- ✅ 更新成功 → 返回 `{ error: null }`
- ❌ 未登录 → 返回 `{ error: 'Not authenticated' }`
- ❌ 数据库报错（比如 email 已被别人用）→ 返回 error 信息

---

### getMyTitles()

**是什么**：获取当前用户所有已解锁的称号列表。

**流程**：查询 `explorations` 表中本用户所有记录的 `titles_earned` 字段（每条记录是一个地标的探索记录，每个地标最多解锁2个称号），汇总去重后返回所有称号。

**返回**：`string[]`，比如 `["Bookworm", "Coffee Lover", "Explorer"]`

**用途**：供宠物主页和称号管理界面展示已解锁称号。

---

## 2. posts.ts

**文件路径**：`lib/api/posts.ts`

### 关于帖子可见性（重要）

帖子有 5 种可见性：
| 值 | 谁能看 |
|----|--------|
| `logged_in` | 所有登录用户（默认） |
| `university` | 同一所大学的用户 |
| `friends` | 已接受好友关系的用户 |
| `specific_friends` | 只有被作者手动添加到 post_viewers 表的指定好友 |
| `private` | 只有作者自己 |

**注意**：没有"所有人可见"选项，未登录用户看不到任何帖子。

---

### getFeed(options?)

**是什么**：获取帖子列表（朋友圈首页）。

**参数**（都是可选的）：
- `visibility`：只看某种可见性的帖子（不传则看所有可见帖子）
- `limit`：每次加载几条（默认20）
- `before`：游标分页，传上一批最早那条帖子的 created_at，用于"加载更多"

**流程**：
1. 验证登录
2. 先查屏蔽列表（双向），把屏蔽了你或被你屏蔽的人都过滤掉
3. 查询 posts 表（数据库 RLS 自动过滤掉不该看到的帖子）
4. 联查作者的 profiles，根据帖子的 identity_mode 返回对应的名字和头像
5. 批量查当前用户对这些帖子的点赞状态（避免一条一条查）
6. 返回 Post 数组

**用户分支**：
- 滚动到底部"加载更多" → 传 `before` 参数（上一批最早的帖子时间），获取更早的帖子
- 只看好友帖子 → 传 `visibility: 'friends'`
- 只看同校帖子 → 传 `visibility: 'university'`
- 未登录 → 返回空数组

---

### createPost(content, identityMode, imageUrl?, visibility?)

**是什么**：发帖。

**参数**：
- `content`：帖子文字内容
- `identityMode`：`'real'`（以真人身份发）或 `'pet'`（以宠物身份发）
- `imageUrl`：图片 URL（可选，图片需要 Ethan 先上传到 post-images bucket 再传 URL 进来）
- `visibility`：可见性，默认 `'logged_in'`

**流程**：插入一条 posts 记录，返回 `{ postId, error }`。

**用户分支**：
- 选择 `specific_friends` 可见性 → 发帖后还需要调用 `addPostViewer()` 逐个添加可以看到的好友
- 不选图片 → imageUrl 不传，帖子纯文字
- 未登录 → 返回 `{ postId: null, error: 'Not authenticated' }`

---

### deletePost(postId)

**是什么**：删除本人帖子。

**流程**：
1. 先查这条帖子的 image_url
2. 从数据库删除帖子（数据库 RLS 保证只能删自己的帖子，评论和点赞会自动级联删除）
3. 如果帖子有图片，同时从 Storage 删除图片文件
4. 返回 `{ error }`

**用户分支**：
- ✅ 删除成功 → 图片和帖子都删掉
- ❌ 删别人的帖子 → 数据库拒绝，返回 error
- 帖子没有图片 → 跳过 Storage 删除步骤

---

### toggleLike(postId)

**是什么**：点赞或取消点赞（自动判断当前状态）。

**流程**：
1. 先查 likes 表，看当前用户是否已点赞这条帖子
2. **已点赞** → 删除 likes 记录，返回 `{ liked: false }`
3. **未点赞** → 插入 likes 记录，返回 `{ liked: true }`

**注意**：likes_count 的更新由数据库触发器自动完成，代码里不需要手动 +1 / -1。

**用户分支**：
- 第一次点击点赞按钮 → 点赞
- 已点赞再次点击 → 取消点赞
- 未登录 → 返回 `{ liked: false, error: 'Not authenticated' }`

---

### getComments(postId)

**是什么**：获取某条帖子的所有评论。

**流程**：先查屏蔽列表（双向），过滤掉被屏蔽用户的评论。然后查询 comments 表，按时间升序（最早的评论在最上面），联查评论者的 profiles 获取名字和头像（根据评论的 identity_mode 返回真人或宠物信息）。

**返回**：Comment 数组（已过滤屏蔽用户的评论）

---

### createComment(postId, content, identityMode)

**是什么**：发评论。

**流程**：
1. 插入 comments 记录
2. 返回 `{ commentId, error }`

**注意**：comments_count 的更新由数据库触发器自动完成，代码里不需要手动 +1。

---

### deleteComment(commentId)

**是什么**：删除本人评论。

**流程**：
1. 删除评论（数据库 RLS 保证只能删自己的评论）
2. 返回 `{ error }`

**注意**：comments_count 的 -1 由数据库触发器自动完成，代码里不需要手动处理。

---

### editPost(postId, content, imageUrl?)

**是什么**：编辑本人帖子的内容或图片。

**参数**：
- `postId`：要编辑的帖子 ID
- `content`：新的文字内容
- `imageUrl`（可选，三种情况）：
  - 不传（undefined）→ 保留原来的图片不变
  - 传 `null` → 删除图片（同时从 Storage 删除图片文件）
  - 传新的图片 URL → 替换图片（先删旧图，再存新图 URL）

**流程**：更新 posts 记录，同时设置 `edited_at` 为当前时间。数据库 RLS 保证只能编辑自己的帖子。

**用户分支**：
- ✅ 编辑成功 → 返回 `{ error: null }`
- ❌ 编辑别人的帖子 → 数据库拒绝，返回 error

---

### editComment(commentId, content)

**是什么**：编辑本人评论的内容。

**流程**：更新 comments 记录的 content 字段，同时设置 `edited_at` 为当前时间。数据库 RLS 保证只能编辑自己的评论。

**注意**：只能改文字内容，不能改 identity_mode（发布时选的身份永久固定）。

**用户分支**：
- ✅ 编辑成功 → 返回 `{ error: null }`
- ❌ 编辑别人的评论 → 数据库拒绝，返回 error

---

### addPostViewer(postId, friendId)

**是什么**：给 `specific_friends` 可见的帖子添加一个可以看到的好友。

**用法**：用户发了一条 `specific_friends` 可见的帖子后，对每个选中的好友调用一次。

**流程**：在 post_viewers 表插入一条记录，数据库 RLS 保证只有帖子作者可以操作。

---

### removePostViewer(postId, friendId)

**是什么**：将某个好友从 `specific_friends` 帖子的可见名单中移除。

---

## 3. groups.ts

**文件路径**：`lib/api/groups.ts`

### 关于群组类型

| chat_type | group_type | 说明 |
|-----------|-----------|------|
| `group` | `open` | 公开群，任何人可加入 |
| `group` | `edu_verified` | 学校认证群，仅同校已验证用户可见/加入 |
| `group` | `official` | 官方群，平台创建 |
| `direct` | `direct` | 私信，两人之间的对话 |

---

### createGroup(data)

**是什么**：创建新群组。

**流程**：
1. 创建 groups 记录（chat_type = 'group'）
2. 自动将创建者加入 group_members（role = 'admin'）
3. 设置 members_count = 1
4. 返回 Group 对象

**用户分支**：
- 创建成功 → 返回群组信息，前端跳转群聊页
- 未登录 → 返回 null

---

### getMyGroups()

**是什么**：获取当前用户加入的所有群组列表（包括群聊和私信）。

**流程**：先查 group_members 找到所有 group_id，再查 groups 表获取详情。

---

### joinGroup(groupId)

**是什么**：加入一个群组。

**流程**：
1. 插入 group_members 记录（role = 'member'）
2. 更新 members_count
3. 返回 `{ error }`

**用户分支**：
- ✅ 加入成功
- ❌ 已经是成员 → 数据库唯一约束报错，返回 error
- ❌ 尝试加入 edu_verified 群但未验证 → 数据库 RLS 拒绝

---

### leaveGroup(groupId)

**是什么**：退出群组。

**流程**：
1. 查群组的 created_by（群主是谁）
2. 删除自己的 group_members 记录
3. **如果退出的人是群主** → JS 层找到最早加入的其他成员，更新 groups.created_by 转让群主
4. 更新 members_count
5. 返回 `{ error }`

**用户分支**：
- 普通成员退出 → 直接退出，members_count - 1
- 群主退出 → 自动转让给入群时间最早的其他成员
- 最后一个成员退出 → 群组变成空群，保留记录（不自动删除，用于内容审核）

---

### searchGroups(keyword, university?)

**是什么**：搜索可以加入的群组。

**条件**：is_searchable = true，members_count >= 3，group_type 为 open/official/edu_verified。

**university 参数**：如果传了，则 edu_verified 类型的群只搜索该校的。

---

### createDirectMessage(friendId)

**是什么**：和某个好友开启私信对话。

**流程**：
1. 并行查询：同时获取当前用户的所有 direct 群组 ID 和好友的所有 direct 群组 ID
2. 在 JS 里找两个列表的交集（共同属于的群组就是已有的私信会话）
3. **找到已有会话** → 直接返回这个群组
4. **没有会话** → 创建新的 chat_type = 'direct' 群组，将双方都加入 group_members

**用户分支**：
- 已经有私信会话 → 返回现有会话，直接跳转聊天页
- 第一次开启私信 → 创建新会话，跳转聊天页

---

### removeMember(groupId, targetUserId)

**是什么**：群主踢人。

**流程**：
1. 验证当前用户是否是群主（created_by）
2. 不能踢自己
3. 删除目标用户的 group_members 记录
4. 更新 members_count
5. 返回 `{ error }`

**用户分支**：
- 群主踢人 → 成功
- 非群主调用 → 返回 `{ error: 'Permission denied' }`
- 踢自己 → 返回 `{ error: 'Cannot remove yourself' }`

---

## 4. messages.ts

**文件路径**：`lib/api/messages.ts`

### getMessages(groupId, limit?, before?)

**是什么**：获取群聊或私信的历史消息。

**参数**：
- `groupId`：群组/私信 ID
- `limit`：每次加载几条（默认 30）
- `before`：游标分页，传当前列表最早那条消息的 created_at

**返回**：按时间降序的 Message 数组（最新的在最前面）。每条消息现在包含 `author_name` 和 `author_avatar_url`，根据消息的 identity_mode 自动选择真人或宠物信息填充。

**注意**：消息没有删除功能（设计决策：保留所有消息用于内容审核）。

---

### sendMessage(groupId, content, identityMode, imageUrl?)

**是什么**：发送消息。

**参数**：
- `identityMode`：本条消息以真人还是宠物身份发送
- `imageUrl`：图片 URL（可选，图片需先上传到 post-images bucket）

**流程**：插入 messages 记录，返回 Message 对象（包含刚发送的消息数据）。

---

### subscribeToMessages(groupId, onMessage)

**是什么**：实时监听新消息（WebSocket 连接）。

**用法**：
```typescript
// 进入聊天页时调用
const unsubscribe = subscribeToMessages(groupId, (newMessage) => {
  // 把新消息加到消息列表最前面
  setMessages(prev => [newMessage, ...prev])
})

// 离开聊天页时调用，断开连接
return () => unsubscribe()
```

**用户分支**：
- 对方发送消息 → onMessage 回调被触发，前端立即收到新消息
- 进入页面时 → 建立 WebSocket 连接
- 离开页面时 → 必须调用 unsubscribe()，否则内存泄漏

**注意**：实时推送过来的消息是数据库原始行，不包含 author_name / author_avatar_url，如果需要显示作者信息要前端自己处理。

---

### editMessage(messageId, content)

**是什么**：编辑本人发送的消息内容。

**流程**：更新 messages 记录的 content 字段，同时设置 `edited_at` 为当前时间。数据库 RLS 保证只能编辑自己的消息。

**注意**：只能改文字内容，不能改 identity_mode（发送时选的身份永久固定）。

**用户分支**：
- ✅ 编辑成功 → 返回 `{ error: null }`
- ❌ 编辑别人的消息 → 数据库拒绝，返回 error

---

## 5. location.ts

**文件路径**：`lib/api/location.ts`

### 关于位置共享模式

用户在设置里可以选择三种位置共享模式：
- `precise`：好友看到精确位置
- `fuzzy`：好友看到模糊位置（精度约 500m，会对坐标取整）
- `off`：不共享位置（从 user_locations 表删除自己的记录）

---

### updateMyLocation(coord)

**是什么**：更新自己的当前位置（由 Ethan 的后台位置追踪服务定期调用）。

**流程**：
1. 查询当前用户的 location_sharing 设置
2. **off 模式** → 从 user_locations 表删除自己的记录
3. **fuzzy 模式** → 对坐标取整（精度约 500m）后 upsert 到 user_locations
4. **precise 模式** → 直接 upsert 精确坐标到 user_locations

**用户分支**：
- 用户关闭位置共享 → 删除 user_locations 记录，好友地图上消失
- 用户选择模糊位置 → 好友看到的是附近 ~500m 范围内的某个点
- 用户选择精确位置 → 好友看到真实位置

---

### getFriendLocations()

**是什么**：获取所有已接受好友的当前位置。

**流程**：
1. 查询 friendships 表，找到所有 accepted 状态的好友 ID
2. 查询这些好友的 user_locations 和 profiles（获取名字/头像）
3. 过滤掉 location_sharing = 'off' 的好友
4. 根据每个好友的 identity_mode 返回对应的显示名字和头像
5. 返回 FriendLocation 数组

---

### subscribeToFriendLocations(friendIds, onUpdate)

**是什么**：实时监听好友位置更新（WebSocket）。

**用法**：
```typescript
// 打开地图页时调用
const unsubscribe = await subscribeToFriendLocations(friendIds, (location) => {
  // 更新地图上该好友的 Marker
})

// 离开地图页时断开连接
return () => unsubscribe()
```

**注意**：订阅创建时会预加载所有好友的 profile 到内存缓存。如果好友在订阅期间修改了 identity_mode，需要重新订阅才能生效。

---

### cacheNearbyPlaces(coord)

**是什么**：获取附近的地标（咖啡厅、图书馆、健身房等）。先查数据库缓存，缓存没有才调用 Google Places API。

**核心设计：网格缓存**

坐标会先被"吸附"到最近的 0.005° 网格点（约 555m 一格），整个校园可以理解成被分成了很多个格子。同一个格子里的所有用户共享一次 Google API 查询结果，不会重复请求。随着越来越多用户探索不同格子，缓存覆盖范围逐步扩大。

**流程**：
1. 把当前坐标吸附到最近的网格点
2. 查询 landmark_cache_zones 表，用网格坐标做精确匹配，看这个格子是否已缓存且未过期
3. **已缓存** → 直接从 landmarks 表返回附近地标，不调用 Google API
4. **未缓存** → 以网格点为中心调用 Google Places API（搜索半径500m），把结果存入 landmarks 表，同时在 landmark_cache_zones 表记录（如果该格子之前有过期记录则刷新过期时间）
5. 返回 CachedLandmark 数组

**地标类型映射**（Google Places → SUDO 内部类型）：
| Google 类型 | SUDO 类型 | 打卡半径 |
|------------|----------|---------|
| library, university, gym, stadium | library / gym | 100m |
| restaurant, cafeteria, food | dining | 30m |
| cafe, bar | cafe | 15m |
| 其他 | other | 30m |

---

### discoverLandmark(coord, minutesSpent)

**是什么**：核心游戏化函数。用户在某个地标内停留时触发，计算 XP 奖励和称号解锁。

**参数**：
- `coord`：用户当前坐标
- `minutesSpent`：**本周在这个地标的累计总时长（分钟）**，由 Ethan 前端的计时器维护，不是单次停留时长

**调用时机**（Ethan 负责判断）：
1. 进入地标范围后**满 2 分钟**时调用一次
2. 本周累计时长**达到 30 分钟**时调用一次
3. 本周累计时长**达到 60 分钟**时调用一次

**流程**：
1. 调用 cacheNearbyPlaces() 获取附近地标
2. 找到用户当前所在的地标（判断距离是否在 radius_meters 内）
3. 查询 explorations 表，看这个用户+地标是否有记录
4. 判断是否需要重置周数据（当前周开始时间 > 记录中的 week_start_date）

**用户分支**：
- **全新地标（第一次来）**：
  - 给 XP +10（首次探索奖励）
  - 如果 minutesSpent >= 30，再 +对应地点类型的 XP
  - 如果 minutesSpent >= 60，再 +更多 XP
  - 在 explorations 表创建新记录

- **老地标，新的一周**：
  - 重置周数据（weekly_time_spent 从 0 开始计算）
  - 按新的 minutesSpent 计算本周 XP 奖励
  - visit_count + 1（终身累计）

- **老地标，同一周**：
  - 检查是否突破了 30 分钟或 60 分钟阈值（只奖励首次突破）
  - visit_count + 1
  - 检查是否解锁称号（visit_count 满 7 次 → 初级称号，满 30 次 → 高级称号）

- **找不到地标** → 返回 null

**XP 奖励表**：

| 地点 | 首次探索 | 周累计30分钟 | 周累计60分钟 |
|------|---------|------------|------------|
| library | +10 | +3 | +8 |
| dining | +10 | +2 | +6 |
| gym/cafe/other | +10 | +2 | +5 |

**称号解锁表**：

| 地点 | 7次解锁 | 30次解锁 |
|------|--------|---------|
| library | Bookworm | Library King |
| dining | Big Eater | Dining Hall King |
| gym | Gym Newbie | Gym Fanatic |
| cafe | Coffee Lover | Coffee Addict |
| other | Explorer | Master Explorer |

**返回**：DiscoverResult 对象，包含 `{ xp_earned, is_first_visit, title_unlocked, visit_count, weekly_time_spent }`

**反作弊机制**：
- 单次调用最多记录 480 分钟（8小时上限）
- 同一周内，系统会对比上次记录时间，按实际经过时间校验传入的 minutesSpent 是否合理
- 使用乐观锁防止并发冲突（两个设备同时打开 App 时）

---

### setActiveTitle(explorationId, title)

**是什么**：装备或卸下一个称号。

**用法**：
- `title` 传某个称号字符串 → 装备这个称号
- `title` 传 `null` → 卸下当前称号

**安全校验**：只能装备 titles_earned 数组中已解锁的称号，装备未解锁的称号会被静默忽略。

---

### saveExploredPath(coordinates)

**是什么**：保存一段探索路径（用于地图雾效果）。

**参数**：`[{ lat, lng }, ...]` 格式的坐标数组，由 Ethan 前端用 RDP 算法简化后传入。

**流程**：在 explored_paths 表插入一行，一次调用对应一段路径。

---

### getExploredPaths()

**是什么**：获取当前用户所有探索过的路径，用于渲染地图雾效果（已探索区域清除雾）。

**返回**：`{ lat, lng }[][]`（路径段数组，每个元素是一段路径的坐标数组）

---

### getWeeklyRankings(university)

**是什么**：获取本周排行榜数据。

**安全机制**：调用的是数据库 SECURITY DEFINER 函数 `get_weekly_rankings()`。只有 edu_verified = true 且 university 匹配的用户才能看到排行榜数据，其他人调用返回空对象。

**返回**：按地点类型分组的排行榜，格式为：
```
{
  library: [{ rank: 1, user_id, display_name, avatar_url, weekly_time_spent, active_title }, ...],
  cafe: [...],
  gym: [...],
  dining: [...]
}
```

---

### setRankingPreferences(optIn, identityMode)

**是什么**：设置是否参与排行榜以及以什么身份展示。

**参数**：
- `optIn`：true = 参加，false = 退出排行榜
- `identityMode`：`'real'` 或 `'pet'`，排行榜上显示真名还是宠物名

---

## 6. friends.ts

**文件路径**：`lib/api/friends.ts`

### 关于好友关系

好友关系存在 `friendships` 表里，有两种状态：
- `pending`：申请已发出，对方还没回应
- `accepted`：双方已成为好友

屏蔽关系单独存在 `blocked_users` 表里，和好友关系是两张独立的表。

---

### sendFriendRequest(addresseeId)

**是什么**：向某人发送好友申请。

**流程**：
1. 检查双方是否有屏蔽关系（任意方向）
2. 检查对方是否已经向你发过申请（提示去申请列表接受，而不是重复创建）
3. 两项检查通过 → 在 `friendships` 表插入一条 pending 记录
4. 返回 `{ error }`

**用户分支**：
- ✅ 成功 → 申请发出，等待对方回应
- ❌ 存在屏蔽关系（任意方向）→ 返回 `'无法发送申请'`（不告诉你是谁屏蔽了谁）
- ❌ 对方已向你发过申请 → 返回提示，让你去申请列表接受

---

### acceptFriendRequest(friendshipId)

**是什么**：接受别人发来的好友申请。

**流程**：把 `friendships` 表里那条记录的 status 从 `pending` 改为 `accepted`。数据库 RLS 保证只有收到申请的人（addressee）才能执行这个操作。

返回 `{ error }`。

---

### declineFriendRequest(friendshipId)

**是什么**：拒绝别人发来的好友申请。

**流程**：直接删除那条 pending 记录。RLS 保证只有收到申请的人才能操作。

返回 `{ error }`。

---

### cancelRequest(friendshipId)

**是什么**：撤回自己发出的好友申请（对方还没回应）。

**流程**：删除那条 pending 记录，同时验证当前用户是申请发起人。

返回 `{ error }`。

---

### removeFriend(friendshipId)

**是什么**：删除好友关系（双方都可以操作）。

**流程**：删除 `friendships` 表里对应的 accepted 记录。RLS 保证只有关系中的两人之一才能操作。

返回 `{ error }`。

---

### blockUser(userId)

**是什么**：屏蔽某个用户。

**流程**：
1. 在 `blocked_users` 表插入屏蔽记录
2. 同时删除双方所有好友关系（无论是 pending 还是 accepted，无论谁是发起人）
3. 返回 `{ error }`

**注意**：屏蔽后，被屏蔽的人可以知道自己被屏蔽了（调用 `getFriendshipStatus` 时会返回相应状态）。但屏蔽不会发通知，只有对方主动查才会知道。

---

### unblockUser(userId)

**是什么**：解除屏蔽。

**流程**：从 `blocked_users` 表删除对应记录。解除屏蔽后双方不会自动恢复好友关系，需要重新发申请。

返回 `{ error }`。

---

### getFriends() → FriendProfile[]

**是什么**：获取当前用户的所有好友列表。

**流程**：查询所有 `status='accepted'` 且自己参与的 friendships 记录，联查每个好友的 profile 信息。

**每条记录包含**：`friendship_id`（删好友时用）、对方的 `id`、`sudo_id`、`real_name`、`pet_name`、`avatar_url`、`pet_avatar_url`、`university`、`profile_visibility`、`identity_mode`

---

### getPendingRequests() → FriendRequest[]

**是什么**：获取收到的好友申请列表（别人发给你的、你还没回应的）。

**每条记录包含**：`friendship_id`（接受/拒绝时用）、申请人的 profile 信息、`created_at`（申请时间）

---

### getSentRequests() → FriendRequest[]

**是什么**：获取你发出的好友申请列表（你发给别人的、对方还没回应的）。

**每条记录包含**：`friendship_id`（撤回时用）、对方的 profile 信息、`created_at`（申请时间）

---

### getFriendshipStatus(userId) → FriendshipStatus

**是什么**：查询当前用户与某个人之间的关系状态。

**用途**：前端用来决定显示什么按钮（加好友 / 待确认 / 已是好友 / 已屏蔽）。

**返回值**：

| 返回值 | 含义 |
|--------|------|
| `'none'` | 没有任何关系（或对方屏蔽了你，但不会告诉你） |
| `'pending_sent'` | 你发了申请，对方还没回应 |
| `'pending_received'` | 对方发了申请给你，你还没回应 |
| `'accepted'` | 已经是好友 |
| `'blocked'` | 你屏蔽了对方 |

---

### searchUsers(keyword) → UserSearchResult[]

**是什么**：搜索其他用户（用于添加好友）。

**搜索逻辑**：
- `keyword` 完全匹配某人的 `sudo_id`（那个5位数字ID）
- 或者 `keyword` 模糊匹配某人的 `real_name`

**自动过滤**：排除自己、排除双向屏蔽的用户（你屏蔽的人和屏蔽你的人都不会出现）。

**最多返回 20 条**。

**注意**：搜索结果不区分是否已是好友，所有匹配的人都会返回。前端拿到结果后调用 `getFriendshipStatus()` 来决定每条结果显示什么按钮。

---

### getBlockedUsers() → BlockedUser[]

**是什么**：获取你屏蔽的用户列表（用于黑名单管理页面）。

**每条记录包含**：`blocked_id`（解除屏蔽时用）、`sudo_id`、`real_name`、`avatar_url`

---

## 附录：Storage Bucket 使用说明

| Bucket | 公开/私有 | 用途 | 路径格式 |
|--------|---------|------|---------|
| `avatars` | 公开 | 用户头像、宠物头像 | `{user_id}/avatar.jpg` 或 `{user_id}/pet_avatar.jpg` |
| `post-images` | 公开 | 帖子图片、消息图片 | `{user_id}/{timestamp}.jpg` |
| `offer-screenshots` | 私有 | Offer 验证截图 | `{user_id}/{timestamp}.jpg` |

**重要**：上传路径必须以 `{user_id}/` 开头，否则 Storage RLS 会拒绝上传。
