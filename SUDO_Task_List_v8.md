# SUDO App

**开发任务清单 v8**

Joe（后端）· Ethan（前端） | 2026年4月 | 内部文件

---

## v8 更新摘要（相对 v7 的变更）

以下内容为 v7 → v8 的主要变更，其余内容与 v7 保持一致。

### Joe 后端变更

- **任务 103b 完成**：`lib/api/posts.ts` 新增 `getUserPosts(userId)`（commit 82e4ef6），按 user_id 返回帖子列表，支持游标分页，双向拉黑时返回空数组
- **新任务 103c 完成**（原 TD-11 升级）：`lib/api/posts.ts` 新增 `getPost(postId)`，按单条 ID 查询帖子，用于 PostDetailScreen、深链接、"我的帖子"入口。使用 `.maybeSingle()` 处理无权限/不存在情况，返回 `{ data: Post | null; error }`
- **`setActiveTitle` 签名确认**：v7 文档描述为 `setActiveTitle(explorationId, title | null)`，实际代码实现为 `setActiveTitle(title: string | null)`（后端自动查找归属 exploration）。v8 以代码为权威，文档对齐

### Ethan 前端变更

- 无新增代码提交。`MyPostsScreen`（任务 109）和 `PostDetailScreen` getPost 切换仍待开发

### 仓库整理

- 删除 `generate_v6_tasklist.js`（v6 时代的 docx 生成脚本，已完成使命）
- `mockup/` 文件夹加入 `.gitignore`（独立 Vite+React UI 原型项目，不属于主 app）

### 待 Ethan 确认项

- **Zustand 状态管理**：package.json 装了 `zustand@5.0.12`，但全项目零处使用。是否卸载取决于 Ethan 是否保留为未来全局状态的扩展口子

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

- **Joe（后端）**：Supabase 数据库建表、RLS 策略、API 函数（lib/api/）、Edge Functions、Realtime、Storage、XP 系统
- **Ethan（前端）**：所有 UI 组件、页面、导航、地图 UI、后台位置追踪、状态管理（AuthContext）

*注意：Ethan 的 UI 任务必须在 Joe 对应的 API 函数完成后才开始，以免调用不存在的接口。*

---

## MODULE 0 — 环境搭建与项目初始化（任务 1-24）✅ 全部完成

所有任务已在 v5 中完成。

## MODULE 1 — Supabase 数据库配置（任务 25-54）✅ 全部完成

17 张表，RLS 全部开启。v7 新增 DB trigger `on_like_change` 和 `on_comment_change`，替代 JS 层手动计数（解决 TD-2 竞态条件）。

## MODULE 2 — 用户注册与登录（任务 55-65）⚠️ 基本完成

### 2.1 Joe 后端 ✅ 完成

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 55 | Joe | 关闭邮件验证（开发阶段） | ✅ |
| 56 | Joe | `auth.ts`：signUp / signIn / signOut / getProfile（v7 修复 TD-4/TD-5） / updateProfile / getMyTitles | ✅ |

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
| 65 | Ethan | ProfileScreen 本人主页（**v8 可推进**：Joe 已提供 getUserPosts，待 Ethan 加入"我的帖子"入口） | ⚠️ |

## MODULE 3 — 双身份系统（任务 66-72）✅ 全部完成

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 66 | Joe | `getMyTitles()` | ✅ |
| 67 | Ethan | MapScreen 真人/宠物切换按钮 | ✅ |
| 68 | Ethan | ProfileScreen 双身份卡片横向滑动 | ✅ |
| 69 | Ethan | `IdentityToggle.tsx` 组件 | ✅ |
| 70 | Ethan | `IdentityAvatar.tsx` 组件 | ✅ |
| 71 | Ethan | TitlesScreen：装备/卸下称号，调用 **`setActiveTitle(title \| null)`**（v8 签名更正） | ✅ |
| 72 | Ethan | RankingScreen 五类地点本周前 3 名 | ✅ |

## MODULE 4 — 好友系统（任务 73-78）✅ 全部完成

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 73 | Joe | `friends.ts`（13 个函数） | ✅ |
| 74 | Ethan | FriendsScreen | ✅ |
| 75 | Ethan | FriendRequestsScreen | ✅ |
| 76 | Ethan | UserSearchScreen | ✅ |
| 77 | Ethan | OtherProfileScreen | ✅ |
| 78 | Ethan | BlockedUsersScreen | ✅ |

## MODULE 5 — 群聊与私信（任务 79-94）✅ 全部完成

### 5.1 Joe 后端 ✅

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 79 | Joe | `groups.ts`（含 v7 TD-7 修复） | ✅ |
| 80 | Joe | `messages.ts`（含 v7 editMessage） | ✅ |

### 5.2 Ethan 前端 ✅

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 89 | Ethan | MessageScreen | ✅ |
| 90 | Ethan | GroupListScreen | ✅ |
| 91 | Ethan | CreateGroupScreen | ✅ |
| 92 | Ethan | ChatScreen（含 Realtime 订阅） | ✅ |
| 93 | Ethan | OtherProfileScreen "发私信" 入口 | ✅ |
| 94 | Ethan | GroupMembersScreen | ✅ |

## MODULE 6 — 广场与帖子（任务 95-109）⚠️ 基本完成

### 6.1 Joe 后端 ✅ **v8 全部完成**

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 95 | Joe | `getFeed`（v6） | ✅ |
| 96 | Joe | `createPost`（v7 接入 XP） | ✅ |
| 97 | Joe | `deletePost`（含 Storage 清理） | ✅ |
| 98 | Joe | `toggleLike`（v7 起 likes_count 由 DB trigger 维护） | ✅ |
| 99 | Joe | `getComments`（含双向屏蔽过滤） | ✅ |
| 100 | Joe | `createComment`（v7 接入 XP，comments_count 由 DB trigger 维护） | ✅ |
| 101 | Joe | `deleteComment` | ✅ |
| 102 | Joe | `addPostViewer` / `removePostViewer` | ✅ |
| 103 | Joe | `editPost` / `editComment`（v7） | ✅ |
| 103b | Joe | **`getUserPosts(userId)`（v8 确认已完成，commit 82e4ef6）** | ✅ |
| 103c | Joe | **【v8 新增】`getPost(postId)`：按单条 ID 查帖子，用于 PostDetailScreen / 深链接 / MyPostsScreen。RLS 自动过滤可见性，`.maybeSingle()` 处理无权限场景** | ✅ |

### 6.2 Ethan 前端 ⚠️

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 104 | Ethan | FeedScreen | ✅ |
| 105 | Ethan | CreatePostScreen | ✅ |
| 106 | Ethan | PostDetailScreen（**v8 建议**：从 `getFeed({limit:50}) + filter` 迁移到新的 `getPost(postId)`，解决 TD-11） | ⚠️ |
| 107 | Ethan | CreatePostScreen 图片上传 | ✅ |
| 108 | Ethan | FeedScreen 乐观点赞 | ✅ |
| 109 | Ethan | **MyPostsScreen + ProfileScreen "我的帖子"入口**（v8 解锁：Joe 已提供 getUserPosts） | ❌ |

## MODULE 7 — Offer 验证与新生群（任务 110-117）❌ 未开始

### 7.1 Joe 后端

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 110 | Joe | Edge Function `verify-offer`：Claude Vision 识别截图 + 写入 offer_verifications | ❌ |
| 111 | Joe | Edge Function 配置 `ANTHROPIC_API_KEY` | ❌ |
| 112 | Joe | `lib/api/verification.ts`：submitVerification / getVerificationStatus | ❌ |
| 113 | Joe | Edge Function 内：edu_verified=true 时自动加入新生群 | ❌ |
| 114 | Joe | 截图定时清理（pg_cron 或 cron Edge Function） | ❌ |

### 7.2 Ethan 前端（前置：Joe 完成 110-112）

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 115 | Ethan | VerificationScreen（图片选择、涂抹、预览、提交） | ❌ |
| 116 | Ethan | VerificationScreen 结果展示 | ❌ |
| 117 | Ethan | edu_verified badge（ProfileScreen + OtherProfileScreen） | ❌ |

## MODULE 8 — 导航框架（任务 118-129）⚠️

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 118-121 | Ethan | RootNavigator / AuthStack / Bottom Tabs / AppStack | ✅ |
| 127 | Ethan | 推送通知（expo-notifications） | ❌ |
| 128 | Ethan | 全局 Toast / 错误提示 | ✅ |
| 129 | Ethan | 深链接（上线前实现，依赖 103c `getPost`） | ❌ |

## MODULE 9 — 地图 UI（任务 130-138）✅ 全部完成

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 130 | Ethan | MapScreen 好友位置 | ✅ |
| 131 | Ethan | 实时订阅好友位置 | ✅ |
| 132 | Ethan | updateMyLocation（45 秒） | ✅ |
| 133 | Ethan | 探索模式路径采集（RDP 简化） | ✅ |
| 134 | Ethan | 探索路径 Polygon 雾效果 | ✅ |
| 135 | Ethan | 地标计时 + discoverLandmark | ✅ |
| 136 | Ethan | RankingScreen | ✅ |
| 137 | Ethan | ranking_opt_in 开关 | ✅ |
| 138 | Ethan | ExplorationLogScreen，调用 `setActiveTitle(title \| null)`（v8 签名更正） | ✅ |

## MODULE 10 — 上线准备（任务 139-154）❌ 未开始

### 10.1 Joe 安全与配置收尾

| # | 负责人 | 任务 | 状态 |
|---|---|---|---|
| 139 | Joe | 重新开启 Enable email confirmations | ❌ |
| 140 | Joe | Google Cloud Console API Key 限制（Bundle ID / SHA-1） | ❌ |
| 141 | Joe | 多角色 RLS 完整回归测试（重点：blocked_users） | ❌ |
| 142 | Joe | 确认数据库自动备份开启 | ❌ |
| 143 | Joe | 测试 Offer 截图清理完整流程 | ❌ |
| 144 | Joe | EAS Build 配置（Bundle ID / 版本号） | ❌ |
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

---

## 附录一：技术债清单（v8 更新）

| 编号 | 严重性 | 位置 | 描述 | 状态 |
|---|---|---|---|---|
| TD-1 | 高 | `location.ts` `discoverLandmark()` | GPS 坐标客户端伪造可刷 XP。已有 `clampMinutesSpent` 缓解，根本方案需迁移至 Edge Function + 设备证明 | ❌ |
| TD-2 | 中 → ✅ | `posts.ts` | likes_count / comments_count 竞态，v7 通过 DB trigger 修复 | ✅ |
| TD-3 | 中 | `posts.ts`、其他 | getFeed / getComments / getUserPosts / getPost 已加双向屏蔽过滤；群成员等其他查询尚未处理 | ⚠️ |
| TD-4 | 中 → ✅ | `auth.ts` getProfile | pet_only 模式生日泄露，v7 修复 | ✅ |
| TD-5 | 中 → ✅ | `auth.ts` getProfile | 隐私 meta 字段暴露给他人，v7 修复 | ✅ |
| TD-6 | 中 | `location.ts` `cacheNearbyPlaces()` | Google Places API Key 暴露在客户端。上线前评估是否迁移至 Edge Function | ❌ |
| TD-7 | 低 → ✅ | `groups.ts` `createDirectMessage()` | N+1 查询，v7 修复 | ✅ |
| TD-8 | 低 | `location.ts` `subscribeToFriendLocations()` | 订阅期间好友 identity_mode / location_sharing 变更不实时刷新 | ❌ |
| TD-9 | 低 | `location.ts` `cacheNearbyPlaces()` | landmark_cache_zones 无速率限制 | ❌ |
| TD-10 | 低 | user_locations RLS | `location_sharing=off` 仅 JS 层过滤，RLS policy 未校验。**上线前必修** | ❌ |
| TD-11 | 低 → ✅ | `PostDetailScreen` 读帖路径 | **v8 已修复**：新增 `getPost(postId)`，前端待切换（任务 106） | ✅（后端） |
| TD-12 | 低 | `MapScreen` landmarkTimers | 地标累计计时 useRef 重启归零，需 AsyncStorage 持久化 | ❌ |

---

## 附录二：当前进度总览

### Joe（后端）进度

| 模块 | 任务 | 状态 |
|---|---|---|
| Module 0 | 环境搭建 | ✅ |
| Module 1 | 数据库（17 张表 + 3 个函数 + 2 个 trigger） | ✅ |
| Module 2 | auth.ts（6 个函数） | ✅ |
| Module 3 | getMyTitles | ✅ |
| Module 4 | friends.ts（13 个函数） | ✅ |
| Module 5 | groups.ts + messages.ts | ✅ |
| Module 6 | posts.ts（含 getUserPosts、**v8 新增 getPost**） | ✅ |
| Module 7 | Offer 验证 + Edge Function + 新生群 + 截图清理 | ❌ |
| Module 10 | 安全收尾 + App Store | ❌ |

**Joe 已完成的 API 函数总计：**
- `_xp.ts`：3 个（addXP、getTodayStart + 3 常量）
- `auth.ts`：6 个（signUp、signIn、signOut、getProfile、updateProfile、getMyTitles）
- `friends.ts`：13 个
- `groups.ts`：7 个
- `messages.ts`：4 个（getMessages、sendMessage、subscribeToMessages、editMessage）
- `location.ts`：11 个
- `posts.ts`：**13 个**（含 v8 新增 `getPost`）

### Ethan（前端）进度

| 模块 | 任务 | 状态 |
|---|---|---|
| Module 0 | 环境搭建 | ✅ |
| Module 2 | Auth / Onboarding / ProfileScreen（v8：可补"我的帖子"入口） | ⚠️ |
| Module 3 | 双身份 UI | ✅ |
| Module 4 | 好友系统 UI | ✅ |
| Module 5 | 群聊/私信 UI | ✅ |
| Module 6 | Plaza UI（v8：MyPostsScreen 待建 + PostDetail 切换至 getPost） | ⚠️ |
| Module 7 | VerificationScreen + badge | ❌ |
| Module 8 | 导航（推送通知、深链接待完成） | ⚠️ |
| Module 9 | 地图 UI | ✅ |
| Module 10 | Android 上线准备 | ❌ |

---

## 下一步优先顺序（v8 更新）

### Joe 建议顺序

1. **TD-10：修复 `user_locations` RLS 的 `location_sharing=off` 漏洞**（低成本，上线前必修）
2. **Module 7 Offer 验证**（110-114）—— 解锁 Ethan Module 7 前端（115-117）
3. **TD-6**：评估 Google Places API Key 迁移 Edge Function
4. **Module 10 安全收尾**（141 多角色 RLS 测试、142 备份确认）

### Ethan 建议顺序

1. **任务 109**：MyPostsScreen + ProfileScreen "我的帖子" 入口（Joe 已提供 `getUserPosts`）
2. **任务 106 升级**：PostDetailScreen 迁移至 `getPost(postId)`（Joe 已提供）
3. **任务 115-117**：Module 7 前端（等 Joe 完成 110-112）
4. **任务 127**：推送通知
5. **任务 129**：深链接（依赖 `getPost`，现已可用）
6. **Module 10 Android 上线**

---

## 来源矛盾记录（v8 更新）

### 已解决

- ~~矛盾1（Bottom Tab 名称）~~：以实际代码为准（消息/广场/星球/地图/我的），v7 文档已更新
- ~~矛盾3（MapScreen 使用假数据）~~：v7 已接入真实 API
- **~~矛盾4（setActiveTitle 签名）~~**：v8 确认以代码为准（单参数版），文档对齐

### 待 Ethan 确认（v8 新增/保留）

- **矛盾2（Zustand）**：`package.json` 装了 Zustand 5.0.12 但全项目零引用。文档技术栈仍写 Zustand。状态管理归 Ethan 分工 →
  - 选项 A：卸载 Zustand，文档仅保留 React Context（推荐，符合 YAGNI）
  - 选项 B：保留依赖，文档加备注"预留未启用"
  - **决定权归 Ethan**，v8 暂保留 Zustand 在技术栈并加"未启用"标注

---

## v8 仓库整理记录

- `generate_v6_tasklist.js` 已删除（v6 时代 docx 生成脚本）
- `mockup/` 已加入 `.gitignore`（独立 Vite+React UI 原型，非主 app）

---

*SUDO Development Task List v8 · Joe & Ethan · 2026年4月 · 内部保密文件*
