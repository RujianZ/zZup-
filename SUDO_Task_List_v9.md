# SUDO App

**开发任务清单 v9**

Joe（后端）· Ethan（前端） | 2026年4月 | 内部文件

---

## v9 更新摘要（相对 v8 的变更）

**v9 是一次安全 hardening + Schema 重构版本**。Joe 对所有已写好的后端代码做了一次系统性 Code Review，从 migration 25 开始**逐文件重写**到 53，配套修改 5 个 JS 文件。**所有"已完成的 Joe 任务"功能不变**，但安全性、防作弊、隐私保护、并发正确性大幅升级。

### 关键改动

- **14 个 migration 重写**（25/26/27/28/29/40/41/42/44/45/53），2 个合并删除（54、55→25）
- **15 个 SECURITY DEFINER RPC / 触发器函数新增**：把"敏感写入"和"隐私读取"全搬到 DB 层，客户端绕不过
- **JS 配套改动**（auth/groups/location/posts/_xp）：~250 行业务逻辑下沉到 SQL，前端代码反而精简
- **修复 4 个 latent BUG**：specific_friends 受邀者看不到帖子、群主退群转让悄无声息失败、explorations 写入完全开放（可刷排行榜/称号）、Realtime publication cascade drop 后未恢复
- **形式化 6 项产品设计决策**（账号软删除、sudo_id 稀缺、群聊不按拉黑过滤等）
- **TD 体系重构**：所有技术债迁到 [docs/TECH_DEBT.md](docs/TECH_DEBT.md) 单一权威清单

### 文档结构

| 文件 | 作用 |
|---|---|
| 本文件（V9） | 任务进度 + 模块状态 + 接口变更通知 |
| [docs/TECH_DEBT.md](docs/TECH_DEBT.md) | TD 总账（24 条），状态变更只改这里 |
| [docs/修复清单_2026-04-17.md](docs/修复清单_2026-04-17.md) | 本次重构的逐问题日志 |
| [docs/summary_human.md](docs/summary_human.md) | 给 Ethan 的 API 大白话说明 |
| [docs/summary_ai.md](docs/summary_ai.md) | 给 AI 的代码库参考 |

---

## 技术栈与分工

### 技术栈

- 框架：Expo (Managed Workflow) + TypeScript
- 后端：Supabase（PostgreSQL + Realtime + Storage + Edge Functions）
- 地图：Google Maps Platform（expo-location + react-native-maps）
- AI：Claude Vision API（Supabase Edge Function 调用，用于 Offer 验证）
- 状态管理：React Context（AuthContext）※ Zustand 已安装但未启用，待 Ethan 确认
- 导航：React Navigation（Stack + Bottom Tabs）

### 分工

- **Joe（后端）**：Supabase 数据库建表、RLS 策略、API 函数（lib/api/）、SECURITY DEFINER RPC、Edge Functions、Realtime、Storage、XP 系统、反作弊
- **Ethan（前端）**：所有 UI 组件、页面、导航、地图 UI、后台位置追踪、状态管理（AuthContext）

*注意：Ethan 的 UI 任务必须在 Joe 对应的 API 函数完成后才开始。*

---

## MODULE 0 — 环境搭建与项目初始化（任务 1–24）✅

所有任务已在 v5 中完成。

---

## MODULE 1 — Supabase 数据库配置（任务 25–54）✅ 全部完成

历程：
- **v5**：16 张表初建，RLS 全部开启
- **v7**：DB triggers（`on_like_change` / `on_comment_change` 修复 TD-2 计数竞态）
- **v9（本次）**：全面 hardening 重构 —— 详见 [修复清单](docs/修复清单_2026-04-17.md)

### v9 重构后的数据库架构

| 项 | 数量 |
|---|---|
| 表 | 16 |
| RLS policies | ~40（含列级 GRANT/REVOKE 防御） |
| SECURITY DEFINER RPC | 9 个（隐私过滤 + 原子写 + 反作弊） |
| 触发器函数 | 6 个（计数维护 + bbox 自动计算 + 注册自动建 profile） |

### v9 RPC 清单

| 函数 | 用途 | 替代了什么 |
|---|---|---|
| `get_my_profile()` | 本人完整资料 | JS 层 80 行隐私过滤 |
| `get_other_profile(uuid)` | 他人过滤后资料 | 同上 |
| `add_xp(uuid, integer)` | 原子 XP 增加 | TD-2 修复路径 |
| `leave_group(uuid)` | 退群 + 自动转让群主 | JS 层 leaveGroup（修了 RLS 静默失败 BUG） |
| `transfer_group_ownership(uuid, uuid)` | 主动转让群主 | **新功能** |
| `is_post_viewer(uuid)` | specific_friends 可见性检查 | 修了"受邀者看不到帖子" BUG |
| `set_active_title(text)` | 装备/卸下称号 | 之前 JS 直接 update（可被绕过） |
| `discover_landmark(uuid, double, double, integer)` | 打卡 + XP + 称号 + 反作弊 | 110 行 JS 反作弊（可被绕过） |
| `get_weekly_rankings(text)` | 排行榜 | v7 已有，v9 修了 pet_avatar_url 泄露 |
| `is_location_shared(uuid)` | 内部用于 RLS（已废弃，简化掉了） | — |
| `compute_explored_path_bbox()` | 触发器：自动计算路径 bbox | **新功能** |
| `handle_new_user()` | 注册时自动建 profile | v7 已有 |
| `reassign_group_owner()` | 用户被硬删时转让群 | v7 已有 |
| `update_members_count()` | 群成员计数 | v7 已有 |
| `update_likes_count()` / `update_comments_count()` | 帖子计数 | v7 已有 |

---

## MODULE 2 — 用户注册与登录（任务 55–65）⚠️ 基本完成

### 2.1 Joe 后端 ✅

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 55 | Joe | 关闭邮件验证（开发阶段） | ✅ |
| 56 | Joe | `auth.ts`：signUp / signIn / signOut / **getProfile（v9 改用 RPC）** / updateProfile / getMyTitles | ✅ |

**v9 改动**：`getProfile` 内部全部走 `get_my_profile` / `get_other_profile` RPC。隐私过滤逻辑下沉到 DB（约 50 行 JS 删除）。**对调用方接口不变**。

### 2.2 Ethan 前端

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 57 | Ethan | AuthContext + onAuthStateChange | ✅ |
| 58 | Ethan | RootNavigator 路由守卫 | ✅ |
| 59 | Ethan | RegisterScreen | ✅ |
| 60 | Ethan | LoginScreen | ✅ |
| 61 | Ethan | OnboardingScreen Step 1（真人资料） | ✅ |
| 62 | Ethan | OnboardingScreen Step 2（宠物资料） | ✅ |
| 63 | Ethan | OnboardingScreen Step 3（位置/排行榜偏好） | ✅ |
| 64 | Ethan | Onboarding 完成跳转主页 | ✅ |
| 65 | Ethan | ProfileScreen 本人主页（待补"我的帖子"入口） | ⚠️ |

---

## MODULE 3 — 双身份系统（任务 66–72）✅

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 66 | Joe | `getMyTitles()` | ✅ |
| 67 | Ethan | MapScreen 真人/宠物切换按钮 | ✅ |
| 68 | Ethan | ProfileScreen 双身份卡片横向滑动 | ✅ |
| 69 | Ethan | `IdentityToggle.tsx` 组件 | ✅ |
| 70 | Ethan | `IdentityAvatar.tsx` 组件 | ✅ |
| 71 | Ethan | TitlesScreen：装备/卸下称号 → **`setActiveTitle(title \| null)`（v9 内部改 RPC）** | ✅ |
| 72 | Ethan | RankingScreen 五类地点本周前 3 名 | ✅ |

**v9 改动**：`setActiveTitle` 内部走 `set_active_title` RPC（服务端校验称号已解锁）。Ethan 调用方式不变。

---

## MODULE 4 — 好友系统（任务 73–78）✅

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 73 | Joe | `friends.ts`（13 个函数） | ✅ |
| 74 | Ethan | FriendsScreen | ✅ |
| 75 | Ethan | FriendRequestsScreen | ✅ |
| 76 | Ethan | UserSearchScreen | ✅ |
| 77 | Ethan | OtherProfileScreen | ✅ |
| 78 | Ethan | BlockedUsersScreen | ✅ |

**v9 后台变化（不影响 Ethan）**：
- friendships 列级 UPDATE 限制为 `status` 一列（防 addressee 篡改 requester_id）
- 双向 unique index 防止 A→B 和 B→A 重复申请
- blocked_users 加 `blocked_id` 索引

---

## MODULE 5 — 群聊与私信（任务 79–94）✅

### 5.1 Joe 后端

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 79 | Joe | `groups.ts`（v9 含 **leaveGroup → RPC** 修转让 BUG + **新增 transferGroupOwnership**） | ✅ |
| 80 | Joe | `messages.ts` | ✅ |

**v9 改动**：
- `leaveGroup` 改用 `leave_group` RPC，修复了"群主退群但 created_by 没转让"的 RLS 静默失败 BUG
- **新增 `transferGroupOwnership(groupId, newOwnerId)`** —— 群主主动转让的接口（之前没有）
- messages 列级 UPDATE 限制为 (content, edited_at)（identity_mode、group_id 不可改）

### 5.2 Ethan 前端

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 89 | Ethan | MessageScreen | ✅ |
| 90 | Ethan | GroupListScreen | ✅ |
| 91 | Ethan | CreateGroupScreen | ✅ |
| 92 | Ethan | ChatScreen（含 Realtime 订阅） | ✅ |
| 93 | Ethan | OtherProfileScreen "发私信" 入口 | ✅ |
| 94 | Ethan | GroupMembersScreen | ✅ |
| **94b** | **Ethan** | **【v9 新增】GroupSettingsScreen 主动转让群主的 UI（调用 `transferGroupOwnership`）** | ❌ |

---

## MODULE 6 — 广场与帖子（任务 95–109）⚠️ 基本完成

### 6.1 Joe 后端 ✅

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 95 | Joe | `getFeed`（v9 RLS 加双向拉黑过滤） | ✅ |
| 96 | Joe | `createPost` | ✅ |
| 97 | Joe | `deletePost` | ✅ |
| 98 | Joe | `toggleLike` | ✅ |
| 99 | Joe | `getComments` | ✅ |
| 100 | Joe | `createComment` | ✅ |
| 101 | Joe | `deleteComment` | ✅ |
| 102 | Joe | `addPostViewer` / `removePostViewer` | ✅ |
| 103 | Joe | `editPost` / `editComment` | ✅ |
| 103b | Joe | `getUserPosts(userId)` | ✅ |
| 103c | Joe | `getPost(postId)` —— 修 TD-11 | ✅ |

**v9 后台变化（不影响 Ethan）**：
- 列级 UPDATE 限制：posts 只允许 (content, image_url, edited_at)，comments 只允许 (content, edited_at)
- comments / likes SELECT 现在跟随 post 可见性 + 双向拉黑过滤
- 新增 `is_post_viewer` RPC 修了 specific_friends 受邀者看不到帖子的 BUG

### 6.2 Ethan 前端

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 104 | Ethan | FeedScreen | ✅ |
| 105 | Ethan | CreatePostScreen | ✅ |
| 106 | Ethan | PostDetailScreen 切换 `getPost(postId)`（解决 TD-11） | ⚠️ 待 |
| 107 | Ethan | CreatePostScreen 图片上传 | ✅ |
| 108 | Ethan | FeedScreen 乐观点赞 | ✅ |
| 109 | Ethan | MyPostsScreen + ProfileScreen "我的帖子"入口 | ❌ |

---

## MODULE 7 — Offer 验证与新生群（任务 110–117）❌ 未开始

### 7.1 Joe 后端

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 110 | Joe | Edge Function `verify-offer`：Claude Vision 识别截图 + 写 offer_verifications + 设 profiles.edu_verified（service_role 写） | ❌ |
| 111 | Joe | Edge Function 配置 `ANTHROPIC_API_KEY` | ❌ |
| 112 | Joe | `lib/api/verification.ts`：submitVerification / getVerificationStatus | ❌ |
| 113 | Joe | Edge Function 内：edu_verified=true 时自动加入新生群 | ❌ |
| 114 | Joe | 截图定时清理（pg_cron 或 cron Edge Function） | ❌ |
| **114b** | **Joe** | **【v9 新增】TD-13: BEFORE UPDATE trigger，user 改 university 时自动 reset edu_verified=false。和 110 一起做** | ❌ |

### 7.2 Ethan 前端（前置：Joe 完成 110–112）

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 115 | Ethan | VerificationScreen（图片选择、涂抹、预览、提交） | ❌ |
| 116 | Ethan | VerificationScreen 结果展示 | ❌ |
| 117 | Ethan | edu_verified badge（ProfileScreen + OtherProfileScreen） | ❌ |

---

## MODULE 8 — 导航框架（任务 118–129）⚠️

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 118–121 | Ethan | RootNavigator / AuthStack / Bottom Tabs / AppStack | ✅ |
| 127 | Ethan | 推送通知（expo-notifications） | ❌ |
| 128 | Ethan | 全局 Toast / 错误提示 | ✅ |
| 129 | Ethan | 深链接（依赖 `getPost`，现已可用） | ❌ |

---

## MODULE 9 — 地图 UI（任务 130–138）✅

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 130 | Ethan | MapScreen 好友位置 —— **v9 注意：FriendLocation 新增 mode 字段，渲染 precise/fuzzy 不同形状** | ✅⚠️ |
| 131 | Ethan | 实时订阅好友位置（v9 RLS 简化，行为不变） | ✅ |
| 132 | Ethan | updateMyLocation（v9 内部改用 get_my_profile RPC + 写 user_locations.mode 列） | ✅ |
| 133 | Ethan | 探索模式路径采集（RDP 简化） | ✅ |
| 134 | Ethan | 探索路径 Polygon 雾效果 | ✅ |
| 135 | Ethan | 地标计时 + discoverLandmark（v9 内部改用 RPC，反作弊在服务端） | ✅ |
| 136 | Ethan | RankingScreen —— **v9 注意：RankingEntry 删 pet_avatar_url 字段** | ✅⚠️ |
| 137 | Ethan | ranking_opt_in 开关 | ✅ |
| 138 | Ethan | ExplorationLogScreen | ✅ |

**v9 后台变化**：
- `user_locations` 表加 `mode` 列（'precise' | 'fuzzy'）
- 共享模式从 profiles.location_sharing（私密）解耦到 user_locations.mode（对好友可见）
- `explored_paths` 加 bbox 列 + 触发器自动计算（为 TD-17 视窗加载预留）
- `discover_landmark` RPC 包含完整反作弊（坐标半径、clampMinutesSpent、乐观锁）

---

## MODULE 10 — 上线准备（任务 139–161）❌ 未开始

### 10.1 Joe 安全与配置收尾

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 139 | Joe | 重新开启 Enable email confirmations | ❌ |
| 140 | Joe | Google Cloud Console API Key 限制（Bundle ID / SHA-1） | ❌ |
| 141 | Joe | 多角色 RLS 完整回归测试（v9 重构后必跑） | ❌ |
| 142 | Joe | 确认数据库自动备份开启 | ❌ |
| 143 | Joe | 测试 Offer 截图清理完整流程 | ❌ |
| 144 | Joe | EAS Build 配置 | ❌ |
| 145 | Joe | iOS 构建 + TestFlight 内测 | ❌ |
| 146 | Joe | App Store 素材 + 提审 | ❌ |
| 147 | Joe | Apple Developer Program 注册 | ❌ |

### 10.2 Ethan Android 上线

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 148 | Ethan | Google Play Developer 账号 | ❌ |
| 149 | Ethan | Android .aab 构建 | ❌ |
| 150 | Ethan | 内测轨道发布 | ❌ |
| 151 | Ethan | iPhone + Android 双端完整测试 | ❌ |
| 152 | Ethan | 端到端全流程冒烟（注册→Onboarding→...→地图探索） | ❌ |
| 153 | Ethan | 错误上报（Sentry / Expo Crash Reporting） | ❌ |
| 154 | Ethan | Google Play 生产轨道发布 | ❌ |

### 10.3 【v9 新增】上线前必做的安全债

详细见 [TECH_DEBT.md](docs/TECH_DEBT.md)。任务编号衔接 154：

| # | 负责人 | TD | 任务 | 状态 |
|---|---|---|---|---|
| 155 | Joe | TD-1 | GPS 客户端伪造防护：Edge Function 接 device attestation（iOS DeviceCheck / Android SafetyNet） | ❌ |
| 156 | Joe | TD-6 + TD-9 + TD-22 | `cacheNearbyPlaces` 整体迁 Edge Function（service_role 写 landmarks/landmark_cache_zones）。同时修 upsert 返回不全的 BUG | ❌ |
| 157 | Joe | TD-15 | Supabase Dashboard → Storage 三个 bucket 设 mime / 文件大小白名单（运维操作，无代码改动） | ❌ |
| 158 | Joe | TD-21 | `.or()` 字符串注入加固（friends.ts / groups.ts 的 untrusted input 拼接） | ❌ |
| 159 | Joe | TD-23 | XP 竞态修复：把 createPost / createComment / sendMessage 的 XP 增量算法搬进 SECURITY DEFINER RPC | ❌ |
| 160 | Joe | TD-24 | `createDirectMessage` 竞态：改成 `get_or_create_dm` RPC，事务内 SELECT FOR UPDATE | ❌ |
| 161 | Ethan | TD-12 | landmarkTimers 持久化到 AsyncStorage（防 App 重启计时归零） | ❌ |

---

## 附录一：技术债

**v9 起 TD 总账迁到 [docs/TECH_DEBT.md](docs/TECH_DEBT.md)。** 本文件不再维护重复列表。

简略状态（v9 时点）：
- 已修：TD-2, TD-3（部分）, TD-4, TD-5, TD-7, TD-10, TD-11
- 上线前必做：TD-1, TD-6, TD-9, TD-13, TD-15, TD-22, TD-24（已纳入 Module 10.3）
- 上线前评估：TD-21, TD-23
- 远期/前端：TD-8, TD-12, TD-14, TD-17, TD-18, TD-19, TD-20

---

## 附录二：进度总览

### Joe（后端）

| 模块 | 内容 | 状态 |
|---|---|---|
| Module 0 | 环境 | ✅ |
| Module 1 | 数据库（v9 hardening 完成） | ✅ |
| Module 2 | auth.ts（v9 接 RPC） | ✅ |
| Module 3 | getMyTitles | ✅ |
| Module 4 | friends.ts | ✅ |
| Module 5 | groups.ts（含 v9 transferGroupOwnership）+ messages.ts | ✅ |
| Module 6 | posts.ts | ✅ |
| Module 7 | Offer 验证 + Edge Function | ❌ |
| Module 10.1 | 安全收尾 | ❌ |
| Module 10.3 | TD 修复（上线前必做） | ❌ |

**Joe 已完成的 lib/api 函数总计：** 58 个（_xp:3, auth:6, friends:13, groups:**8**, messages:4, location:11, posts:13）

**Joe 已完成的 DB 函数总计：** 15 个（见 Module 1 RPC 清单）

### Ethan（前端）

| 模块 | 内容 | 状态 |
|---|---|---|
| Module 0 | 环境 | ✅ |
| Module 2 | Auth / Onboarding / ProfileScreen（待补"我的帖子"入口） | ⚠️ |
| Module 3 | 双身份 UI | ✅ |
| Module 4 | 好友系统 UI | ✅ |
| Module 5 | 群聊/私信 UI（v9 新增任务 94b 转让群主 UI） | ⚠️ |
| Module 6 | Plaza UI（待 PostDetail 切 getPost + MyPostsScreen） | ⚠️ |
| Module 7 | VerificationScreen + badge | ❌ |
| Module 8 | 导航（推送、深链接待完成） | ⚠️ |
| Module 9 | 地图 UI（v9 注意 mode 字段 + RankingEntry 删 pet_avatar_url） | ✅⚠️ |
| Module 10.2 | Android 上线 | ❌ |
| Module 10.3 | TD-12（landmarkTimers 持久化） | ❌ |

---

## 附录三：Ethan 需要关注的接口变更（v8 → v9）

**所有变更对 Ethan 透明性的最大化原则**：函数签名尽量不变，只有 **2 处 接口数据 shape 变了**，可能影响 UI 渲染。

### 函数签名不变（行为略有不同，但调用方式一致）

| 函数 | v9 内部变化 | 对 Ethan 的影响 |
|---|---|---|
| `getProfile()` / `getProfile(userId)` | 走 RPC，隐私过滤在服务端 | 无（行为相同） |
| `setActiveTitle(title)` | 走 RPC | 无（无效 title 仍然是静默忽略） |
| `discoverLandmark(coord, minutes)` | 走 RPC，反作弊在服务端 | 无（返回值结构同 v8） |
| `leaveGroup(groupId)` | 走 RPC | **行为更对**：之前群主退群"创始人转让"是悄无声息失败的，v9 真的会转让 |
| `updateMyLocation(coord)` | 内部读 location_sharing 改用 getProfile() RPC，写入 user_locations 时附带 mode 字段 | 无 |

### 接口 shape 变化（**需要 Ethan 适配**）

#### 1. `FriendLocation` 接口新增 `mode` 字段

```typescript
// v9
export interface FriendLocation {
  user_id: string
  latitude: number
  longitude: number
  mode: 'precise' | 'fuzzy'  // ← 新增
  updated_at: string
  display_name: string
  avatar_url: string | null
  pet_avatar_url: string | null
  identity_mode: 'real' | 'pet'
}
```

**Ethan 要做**：MapScreen 渲染好友 marker 时，用 `mode` 字段决定形状：
- `'precise'` → 精确小点
- `'fuzzy'` → 大圆圈（约 500m 半径）
- 不存在该好友的 user_locations 行 → 根本不显示

#### 2. `RankingEntry` 接口删除 `pet_avatar_url` 字段

```typescript
// v9
export interface RankingEntry {
  rank: number
  user_id: string
  display_name: string
  avatar_url: string | null  // ← 已经按 ranking_identity_mode 选好的
  identity_mode: 'real' | 'pet'
  weekly_time_spent: number
  active_title: string | null
  // pet_avatar_url 已删除（v9 修了隐私泄露）
}
```

**Ethan 要做**：RankingScreen 如果之前用 pet_avatar_url 渲染，改成只用 `avatar_url` 字段（已经是用户在 ranking 设置里选的那个）。

### 新增函数

| 函数 | 用途 |
|---|---|
| `transferGroupOwnership(groupId, newOwnerId)` | 群主主动转让（不退群）。需要 Ethan 在 GroupSettingsScreen 加 UI（任务 94b） |

---

## 附录四：产品设计决策（v9 形式化）

以下决策在本次 review 中明确确认，**不视为 BUG**，未来不应被"修复"：

| 决策 | 内容 | 详细出处 |
|---|---|---|
| **账号软删除** | 用户"注销" = 软删除（auth.users + profiles 行保留），帖子/评论/消息全部保留显示"已注销用户"。防止恶意发言后注销逃避追责 | 修复清单 设计决策 |
| **sudo_id 顺序递增** | 第一个注册的用户必然是 `00001`，作为稀缺性产品功能 | 修复清单 设计决策 |
| **群聊不按拉黑过滤** | 拉黑只影响 DM；群聊作为共享上下文，被拉黑用户的消息仍可见 | 修复清单 设计决策 |
| **消息不可删除** | 保留所有消息用于内容审核 | summary_human.md |
| **offer-screenshots 用户不可 UPDATE/DELETE** | 保 Offer 截图审计完整性，用户不能事后修改/删除 | 修复清单 设计决策 |
| **blocked_users 透明可见** | 被拉黑的用户能看到谁拉黑了自己，主动透明而非反骚扰 | 修复清单 设计决策 |

---

## 下一步优先顺序（v9）

### Joe 建议顺序

1. **Module 7 Offer 验证（含任务 114b TD-13）**：解锁 Ethan Module 7 + 闭合"university 改了不重置 edu_verified"漏洞
2. **任务 160 TD-24**：`createDirectMessage` 竞态修复（上线前必修，risk vs cost 比例最高）
3. **任务 156 TD-6/9/22**：`cacheNearbyPlaces` 迁 Edge Function（一举三得）
4. **任务 159 TD-23**：XP 竞态修复（顺手做，防上线后用户报告 XP 异常）
5. **任务 155 TD-1**：device attestation（最大工作量，需要研究 iOS / Android 各自的 attestation API）
6. **任务 158 TD-21**：`.or()` 注入加固
7. **Module 10.1 收尾**：备份验证、API Key 限制、TestFlight 提交

### Ethan 建议顺序

1. **任务 109**：MyPostsScreen + ProfileScreen "我的帖子" 入口
2. **任务 106**：PostDetailScreen 迁移 `getPost(postId)`
3. **任务 130 / 136**：Map / RankingScreen 适配 v9 接口变更（FriendLocation.mode + RankingEntry 删 pet_avatar_url）
4. **任务 94b**：GroupSettingsScreen 主动转让群主 UI（新功能）
5. **任务 115–117**：Module 7 前端（等 Joe 完成 110–112）
6. **任务 127**：推送通知
7. **任务 129**：深链接（已可用）
8. **任务 161 TD-12**：landmarkTimers AsyncStorage 持久化
9. **Module 10.2 Android 上线**

---

## 来源矛盾记录（v9 更新）

### 已解决（保留历史，不删）

- 矛盾1（Bottom Tab 名称）：以代码为准
- 矛盾3（MapScreen 假数据）：v7 已接入真实 API
- 矛盾4（setActiveTitle 签名）：v8 确认以代码为准
- ~~矛盾2（Zustand）~~：v8 时未决，v9 仍待 Ethan 确认是否卸载 / 启用

### 仍待确认

- **矛盾2（Zustand）**：`package.json` 装了 Zustand 5.0.12 但全项目零引用
  - 选项 A：卸载（推荐，YAGNI）
  - 选项 B：保留备用
  - **决定权归 Ethan**

---

## v9 仓库整理记录

- 新增：[docs/TECH_DEBT.md](docs/TECH_DEBT.md)（TD 总账权威文件）
- 新增：[docs/修复清单_2026-04-17.md](docs/修复清单_2026-04-17.md)（本次重构日志）
- 删除：`supabase/migrations/54_profile_visibility.sql`（合并进 25）
- 删除：`supabase/migrations/55_protect_profile_columns.sql`（合并进 25）
- v8 删除：`generate_v6_tasklist.js` / `mockup/` 进 .gitignore（保持不变）

---

*SUDO Development Task List v9 · Joe & Ethan · 2026年4月 · 内部保密文件*
