# 技术债总账（TECH_DEBT.md）

> **单一权威清单。** 所有 TD 状态变更都改这个文件。
> 其他文档（修复清单、V8 任务清单、PR、commit 等）引用 TD 时直接链接 `TD-N`。
>
> 编号规则：连续编号，不复用。即使 TD 被取消（SCRAPPED）也保留编号。

---

## 状态约定

| 标记 | 含义 |
|---|---|
| 🔴 **CRITICAL** | 漏洞性质 / 上线 blocker |
| 🟠 **MAJOR** | 正确性受损 / 用户体验明显问题 |
| 🟡 **MEDIUM** | 边缘场景 / 可维护性 |
| 🟢 **LOW** | 优化 / 代码风格 |

| 状态 | 含义 |
|---|---|
| 🟢 **OPEN** | 待修，未排期 |
| 🟠 **DEFERRED** | 待修，有明确触发时机（如 "Module 10 时一起做"） |
| 🔵 **IN-PROGRESS** | 正在修 |
| ✅ **FIXED** | 已修，保留历史 |
| 📐 **DESIGN** | 设计决策，不修复 |
| 🚫 **SCRAPPED** | 编号曾存在但取消，保留编号防止 ID 复用 |

---

## 总索引

| ID | 标题 | 严重 | 状态 | 触发时机 |
|---|---|---|---|---|
| [TD-1](#td-1--gps-坐标客户端伪造) | GPS 坐标客户端伪造 | 🔴 | 🟠 DEFERRED | Module 10 |
| [TD-2](#td-2--likes_count--comments_count-竞态) | likes_count / comments_count 竞态 | 🟠 | ✅ FIXED | v7 |
| [TD-3](#td-3--blocked_users-应用层过滤不全) | blocked_users 应用层过滤不全 | 🟠 | ✅ 部分 FIXED + 📐 部分 DESIGN | 本次会话 |
| [TD-4](#td-4--pet_only-模式生日泄露) | pet_only 模式生日泄露 | 🟠 | ✅ FIXED | v7 |
| [TD-5](#td-5--隐私-meta-字段对外泄露) | 隐私 meta 字段对外泄露 | 🟠 | ✅ FIXED | v7 |
| [TD-6](#td-6--google-places-api-key-客户端暴露) | Google Places API Key 客户端暴露 | 🟠 | 🟠 DEFERRED | Module 10 |
| [TD-7](#td-7--createdirectmessage-n1-查询) | createDirectMessage N+1 查询 | 🟢 | ✅ FIXED | v7 |
| [TD-8](#td-8--subscribetofriendlocations-profile-缓存不刷新) | subscribeToFriendLocations profile 缓存不刷新 | 🟡 | 🟢 OPEN | — |
| [TD-9](#td-9--landmark_cache_zones-无速率限制) | landmark_cache_zones 无速率限制 | 🟡 | 🟠 DEFERRED | Module 10（与 TD-6 合并） |
| [TD-10](#td-10--user_locations-rls-不检查-location_sharing) | user_locations RLS 不检查 location_sharing | 🟡 | ✅ FIXED | 本次会话确认已部署 |
| [TD-11](#td-11--postdetailscreen-单帖查询不可靠) | PostDetailScreen 单帖查询不可靠 | 🟡 | ✅ FIXED | 本次会话（getPost 已新增） |
| [TD-12](#td-12--landmarktimers-app-重启归零) | landmarkTimers App 重启归零 | 🟡 | 🟢 OPEN | 上线前评估（前端） |
| [TD-13](#td-13--university-修改后未自动-reset-edu_verified) | university 修改后未自动 reset edu_verified | 🟠 | 🟠 DEFERRED | Module 7 开工时 |
| [TD-14](#td-14--get_other_profile-未分好友陌生人层级) | get_other_profile 未分"好友/陌生人"层级 | 🟢 | 🟢 OPEN | 产品决定后 |
| [TD-15](#td-15--storage-bucket-mime--文件大小白名单) | Storage bucket mime / 文件大小白名单 | 🟡 | 🟠 DEFERRED | 上线前 Dashboard 配置 |
| [TD-16](#td-16--scrapped) | (SCRAPPED — 原 explored_paths 清理，已被 TD-17~20 替代) | — | 🚫 SCRAPPED | — |
| [TD-17](#td-17--explored_paths-按视窗加载) | explored_paths 按视窗加载 | 🟢 | 🟠 DEFERRED | 前端配套 |
| [TD-18](#td-18--explored_paths-增量同步) | explored_paths 增量同步 | 🟢 | 🟠 DEFERRED | 前端配套 |
| [TD-19](#td-19--explored_paths-后端防御性-rdp) | explored_paths 后端防御性 RDP | 🟢 | 🟠 DEFERRED | 远期 |
| [TD-20](#td-20--explored_paths-老路径合并归档) | explored_paths 老路径合并/归档 | 🟢 | 🟠 DEFERRED | 远期 |
| [TD-21](#td-21--or-过滤器字符串注入风险) | `.or()` 过滤器字符串注入风险 | 🟡 | 🟢 OPEN | — |
| [TD-22](#td-22--cachenearbyplaces-upsert-返回不全地标) | cacheNearbyPlaces upsert 返回不全地标 | 🟠 | 🟠 DEFERRED | 与 TD-6 一起，迁 Edge Function 时一并 |
| [TD-23](#td-23--xp-竞态条件postscommentsmessages) | XP 竞态条件（posts/comments/messages） | 🟡 | 🟢 OPEN | 上线前评估 |
| [TD-24](#td-24--createdirectmessage-竞态--重复-dm-群) | createDirectMessage 竞态 → 重复 DM 群 | 🟠 | 🟢 OPEN | 上线前修 |

---

## 详细条目

### TD-1 — GPS 坐标客户端伪造

**严重**：🔴 CRITICAL
**状态**：🟠 DEFERRED — Module 10
**位置**：[location.ts:293 discoverLandmark](../lib/api/location.ts) → [42_explorations.sql discover_landmark RPC](../supabase/migrations/42_explorations.sql)

**问题**：用户的 GPS 坐标由客户端上报，可被伪造（虚拟定位 app、root/jailbreak 设备）。攻击者宣称自己在地标范围内 → 刷 XP / 解锁称号 / 占据排行榜。

**已有缓解**：
- 服务端校验坐标在 `landmark.radius_meters` 内（discover_landmark RPC）
- `clampMinutesSpent` 反作弊（每次最多 480 分钟，按真实间隔验证）
- 但都防不了**伪造的"真在地标内"坐标**

**根本修复**：device attestation —— iOS DeviceCheck / Android SafetyNet 验证客户端运行环境是否被篡改。Edge Function 接入这套，校验 attestation token 后再写入。

**触发时机**：Module 10（上线前安全收尾）

---

### TD-2 — likes_count / comments_count 竞态

**严重**：🟠 MAJOR
**状态**：✅ FIXED（v7）
**位置**：[posts.ts](../lib/api/posts.ts), [28_posts_table.sql](../supabase/migrations/28_posts_table.sql)

**问题（已修）**：原来 JS 层手动 `update posts set likes_count = likes_count + 1`，并发场景下两个请求都读到同一旧值，最终少加 1。

**修复**：v7 改用 DB 触发器 `on_like_change` / `on_comment_change`，原子自增。JS 层不再写 count。

---

### TD-3 — blocked_users 应用层过滤不全

**严重**：🟠 MAJOR
**状态**：✅ 部分 FIXED + 📐 部分 DESIGN
**位置**：[posts.ts](../lib/api/posts.ts), [messages.ts](../lib/api/messages.ts), [28_posts_table.sql](../supabase/migrations/28_posts_table.sql)

**问题**：v7 时 getFeed / getComments 在 JS 层过滤拉黑用户，但其他读取路径（messages、群成员列表等）没过滤。JS 层过滤可绕过。

**修复**：
- **本次会话**：posts/comments/likes 的 SELECT RLS 加双向拉黑过滤，不可绕过
- **群聊消息保留不过滤**：📐 设计决策（群聊是共享上下文，拉黑只屏蔽 DM）
- 群成员列表、好友相关 helpers 仍是 JS 层过滤（friends.ts），目前接受

---

### TD-4 — pet_only 模式生日泄露

**严重**：🟠 MAJOR
**状态**：✅ FIXED（v7）
**位置**：[auth.ts getProfile](../lib/api/auth.ts)

**问题（已修）**：`profile_visibility='pet_only'` 时 v7 之前的 getProfile 仍返回 `date_of_birth`。

**修复**：v7 在 pet_only 分支强制把生日设为 null。本次会话进一步把这个过滤逻辑搬到 DB 层的 `get_other_profile()` RPC，更难绕过。

---

### TD-5 — 隐私 meta 字段对外泄露

**严重**：🟠 MAJOR
**状态**：✅ FIXED（v7）
**位置**：[auth.ts getProfile](../lib/api/auth.ts)

**问题（已修）**：`show_date_of_birth` / `show_nationality` / `show_qr_code` 这些"用户的隐私开关"被对外返回，让别人能看出"这个人是不是开启了某项隐私"。

**修复**：v7 在 getProfile 返回时把这些字段对他人设为 false。本次会话进一步搬到 DB 层的 `get_other_profile()` RPC。

---

### TD-6 — Google Places API Key 客户端暴露

**严重**：🟠 MAJOR
**状态**：🟠 DEFERRED — Module 10
**位置**：[location.ts cacheNearbyPlaces](../lib/api/location.ts), [.env / app.json EXPO_PUBLIC_GOOGLE_MAPS_API_KEY](../.env)

**问题**：API Key 通过 `EXPO_PUBLIC_*` 环境变量打包进 RN bundle，反编译可见。即使加了 Bundle ID 限制，恶意用户仍可从 app 里截获后用其他签名 app 模拟调用。

**修复**：把 cacheNearbyPlaces 整个迁到 Supabase Edge Function（service_role），客户端只调 RPC。Key 留在 Supabase secrets 里。
**配套**：与 TD-9（共享缓存污染）一起做，搬完 Edge Function 后两个问题都解决。

**触发时机**：Module 10（同时 Ethan 的地图 UI 需要客户端 Maps SDK Key，这部分仍需保留客户端 Key —— 但是 Maps SDK Key 和 Places API Key 可以是不同的两个 Key）

---

### TD-7 — createDirectMessage N+1 查询

**严重**：🟢 LOW
**状态**：✅ FIXED（v7）
**位置**：[groups.ts createDirectMessage](../lib/api/groups.ts)

**问题（已修）**：v6 时是 `for friend in friends: query` 循环找共同 DM 群。
**修复**：v7 改为两个并行查询 + JS 层 Set 求交集。本次会话保持不变。

---

### TD-8 — subscribeToFriendLocations profile 缓存不刷新

**严重**：🟡 MEDIUM
**状态**：🟢 OPEN
**位置**：[location.ts subscribeToFriendLocations](../lib/api/location.ts)

**问题**：地图页订阅好友位置时，函数内部预加载好友 profile 到 Map 缓存。如果订阅期间好友改了 `identity_mode`（真人/宠物切换）或位置共享设置，这些变更**不会反映**到当前订阅 —— 头像 / 名字 / 模式仍是订阅时的快照。需要重开订阅才生效。

**影响**：用户看好友地图时偶尔看到"老的"显示。不是安全问题，是体验问题。

**修复方案**（任选）：
- A. 同时订阅 `profiles` 表的相关行变更，收到事件时刷新缓存
- B. 订阅每 5 分钟自动重建一次（粗暴）
- C. 接受现状（用户切回地图页就会重订阅）

**触发时机**：上线后看用户反馈。低优先级。

---

### TD-9 — landmark_cache_zones 无速率限制

**严重**：🟡 MEDIUM
**状态**：🟠 DEFERRED — Module 10（与 TD-6 合并）
**位置**：[46_landmark_cache_zones.sql](../supabase/migrations/46_landmark_cache_zones.sql), [41_landmarks.sql](../supabase/migrations/41_landmarks.sql)

**问题**：任何 authenticated 用户都能 INSERT 假网格点 / UPDATE expires_at。可造成：
- 缓存污染（假地标在受害者位置出现）
- 浪费 Google API 配额（提前过期触发 re-fetch）
- 不限制总条数 → 存储膨胀

**修复**：随 TD-6 一起，整个 cacheNearbyPlaces 迁到 Edge Function（service_role 写）。客户端不再能写 landmarks / landmark_cache_zones。

**触发时机**：Module 10

---

### TD-10 — user_locations RLS 不检查 location_sharing

**严重**：🟡 MEDIUM
**状态**：✅ FIXED
**位置**：[40_user_locations.sql](../supabase/migrations/40_user_locations.sql)

**问题（已修）**：v7 时 RLS 只检查"是不是好友"，不检查目标用户的 location_sharing 是否为 'off'。JS 层补的过滤可绕过。

**修复**：本次会话重写 40 时彻底**重新设计**：
- profiles.location_sharing 是用户的偏好设置（私密，REVOKE）
- user_locations.mode 是当前共享快照（'precise' | 'fuzzy'，对好友可见）
- off 状态 = user_locations 没有该用户的行
- RLS 不再查 location_sharing，简化为"自己 + 好友"

**云端验证**：cloud 实际 policy 已含 location_sharing 检查（按 v7 doc 部署），新方案 + 旧方案都安全。

---

### TD-11 — PostDetailScreen 单帖查询不可靠

**严重**：🟡 MEDIUM
**状态**：✅ FIXED
**位置**：[posts.ts getPost](../lib/api/posts.ts)（新增）

**问题（已修）**：v7 之前 PostDetail 用 `getFeed({limit:50})` 再过滤找单条帖子，旧帖子 / 深链接 / 通知点开都打不开。

**修复**：本次会话新增 `getPost(postId)` 函数（[posts.ts:135](../lib/api/posts.ts)），按 ID 直查，靠 RLS 自动过滤可见性。

---

### TD-12 — landmarkTimers App 重启归零

**严重**：🟡 MEDIUM
**状态**：🟢 OPEN（前端）
**位置**：`app/map/MapScreen.tsx`（Ethan 维护）

**问题**：地标累计计时用 `useRef` 内存存储，App 重启后归零 → 用户可能少计时。

**修复方案**：持久化到 AsyncStorage。

**触发时机**：上线前评估（属于前端范畴，Ethan 处理）

---

### TD-13 — university 修改后未自动 reset edu_verified

**严重**：🟠 MAJOR
**状态**：🟠 DEFERRED — Module 7
**位置**：[25_user_profile_table.sql](../supabase/migrations/25_user_profile_table.sql)

**问题**：本次会话发现 —— 用户验证 Offer 通过后（`edu_verified=true, university='MIT'`），可以在 app 里把 university 改成 `'Harvard'`，**edu_verified 不会重置**。攻击者借此进入其他大学的 edu_verified 群和排行榜。

**修复方案**：BEFORE UPDATE trigger，检测到 university 变化且原 edu_verified=true 时，把 edu_verified 改回 false。

**为何 DEFER**：trigger 和 verify-offer Edge Function 的"一次写两列"逻辑强耦合 —— 现在写 trigger 后，Module 7 实现 Edge Function 时几乎肯定要重写。等 Module 7 一起做最经济。

---

### TD-14 — get_other_profile 未分"好友/陌生人"层级

**严重**：🟢 LOW
**状态**：🟢 OPEN（产品决定）
**位置**：[25_user_profile_table.sql get_other_profile](../supabase/migrations/25_user_profile_table.sql)

**问题**：本次会话发现 —— 当前 get_other_profile RPC 对好友和陌生人**返回完全相同**的字段集（按对方的 profile_visibility 过滤）。但产品上可能想要"好友看到比陌生人更多"，例如：
- 好友看 region，陌生人不看
- 好友看完整 bio，陌生人看简短版

**修复方案**：如果产品确定要分级，扩展 RPC：先查 friendship status，再分支返回不同字段。

**触发时机**：产品提出明确需求时再做。当前 MVP 不需要。

---

### TD-15 — Storage bucket mime / 文件大小白名单

**严重**：🟡 MEDIUM
**状态**：🟠 DEFERRED — 上线前
**位置**：Supabase Dashboard → Storage（不在 SQL migration 里）

**问题**：[35_storage_policies.sql](../supabase/migrations/35_storage_policies.sql) 的 RLS 只控制路径权限（`{user_id}/...`），**不限制**文件类型和大小。理论上用户能往 avatars 上传 .exe 或 100MB 文件。

**修复**：去 Supabase Dashboard → Storage → 各 bucket → Configuration 里手动设：
- `avatars`: `image/jpeg, image/png, image/webp`，max 5MB
- `post-images`: 同上，max 10MB
- `offer-screenshots`: 同上，max 10MB

**触发时机**：上线前 Module 10 收尾

---

### TD-16 — (SCRAPPED)

**状态**：🚫 SCRAPPED

原计划：定期清理 explored_paths 老路径。

**取消原因**：用户澄清"无界增长是核心设计"（用户全球足迹永久保存），不该清理。被 TD-17~20（不删但优化）替代。

**保留编号**避免 ID 复用混淆。

---

### TD-17 — explored_paths 按视窗加载

**严重**：🟢 LOW
**状态**：🟠 DEFERRED — 前端配套
**位置**：[location.ts getExploredPaths](../lib/api/location.ts), [44_explored_paths.sql](../supabase/migrations/44_explored_paths.sql)

**问题**：当前 getExploredPaths 一次返回当前用户**所有路径**。用户半年下来可能上千段，加载慢。

**Schema 已就绪**：本次会话给 explored_paths 加了 `min_lat / max_lat / min_lng / max_lng` 列 + 触发器自动算 bbox + (user_id, bbox) 复合索引。

**前端要改**：getExploredPaths 接受可选 bbox 参数（视窗），加 `WHERE` 过滤。Ethan 切换地图后端时改 JS。

---

### TD-18 — explored_paths 增量同步

**严重**：🟢 LOW
**状态**：🟠 DEFERRED — 前端配套
**位置**：前端 + [location.ts getExploredPaths](../lib/api/location.ts)

**问题**：每次打开地图都全量拉历史路径，浪费流量。

**修复方案**：前端 AsyncStorage 缓存最后同步时间 `lastSyncedAt`，每次只查 `WHERE recorded_at > lastSyncedAt` 拉增量，前端合并。

**触发时机**：与 TD-17 一起做或更晚

---

### TD-19 — explored_paths 后端防御性 RDP

**严重**：🟢 LOW
**状态**：🟠 DEFERRED — 远期
**位置**：[44_explored_paths.sql](../supabase/migrations/44_explored_paths.sql)

**问题**：前端用 RDP 简化点数，但万一前端有 bug 漏 RDP，单条路径可能几千点。

**修复方案**：装 PostGIS 扩展，BEFORE INSERT trigger 用 `ST_SimplifyPreserveTopology` 兜底。

**触发时机**：上线后看实际数据出了问题再做。

---

### TD-20 — explored_paths 老路径合并/归档

**严重**：🟢 LOW
**状态**：🟠 DEFERRED — 远期
**位置**：将来的 cron job

**问题**：长期增长无界。

**修复方案**：定期把同一区域的多条短路径合并成一个区域多边形，损失精细度但保留"去过这里"的事实。

**触发时机**：上线后看实际增长。可能一两年都不需要做。

---

### TD-21 — `.or()` 过滤器字符串注入风险

**严重**：🟡 MEDIUM
**状态**：🟢 OPEN
**位置**：[friends.ts:77/189/359](../lib/api/friends.ts), [groups.ts:161](../lib/api/groups.ts)

**问题**：多处 `.or(\`field.eq.${untrustedInput}\`)` 字符串拼接 PostgREST 过滤表达式。如果 `keyword`/`addresseeId`/`university` 含有 `,` `(` `.` 等 PostgREST 特殊字符，可能被解析成额外的过滤条件 —— SQL-injection-style 风险。

**修复方案**（任选）：
- A. 在 JS 调用前对输入做 UUID / 字母数字 校验
- B. 改用单独的 `.eq()` 多次调用（牺牲查询效率）
- C. 把这些查询挪到 SECURITY DEFINER RPC，用类型化参数

**触发时机**：上线前评估实际可利用性，再决定深度

---

### TD-22 — cacheNearbyPlaces upsert 返回不全地标

**严重**：🟠 MAJOR
**状态**：🟠 DEFERRED — 与 TD-6 一起
**位置**：[location.ts:151](../lib/api/location.ts) cacheNearbyPlaces

**问题**：`upsert(places, { onConflict: 'place_id', ignoreDuplicates: true }).select()` 只返回**新插入**的行，已存在的（被 ignore 的）不返回。导致 caller 看到"地标列表"少了一部分。

**影响**：用户在网格 X，相邻网格 Y 用户已缓存了部分地标 → X 用户调用时，重叠的地标在 DB 里被 ignore → `.select()` 返回缺少这些地标 → 用户的"附近地标"不全。

**修复方案**：把 `.select()` 改成"upsert 后再单独 SELECT 一次"，或者随 TD-6 整体迁 Edge Function 时重写。

**触发时机**：与 TD-6 一起做

---

### TD-23 — XP 竞态条件（posts/comments/messages）

**严重**：🟡 MEDIUM
**状态**：🟢 OPEN
**位置**：[posts.ts createPost / createComment](../lib/api/posts.ts), [messages.ts sendMessage](../lib/api/messages.ts)

**问题**：XP 增量计算是"count 今天 → 算差值 → addXP" 三步。两个并行请求可能算出相同的 before/after，导致 XP 漏加或重复加。特别是 sendMessage 在恰好跨过 20 条阈值时双倍触发 +10 XP。

**修复方案**：把"count + 差值 + addXP" 合并为单个 SECURITY DEFINER DB 函数（在事务内原子完成）。类似已有的 `add_xp` RPC，再建 `add_post_xp(user_id)` / `add_comment_xp(user_id)` / `add_message_xp(user_id)`。

**触发时机**：上线前评估，或在用户报告 XP 异常时优先修

---

### TD-24 — createDirectMessage 竞态 → 重复 DM 群

**严重**：🟠 MAJOR
**状态**：🟢 OPEN
**位置**：[groups.ts createDirectMessage](../lib/api/groups.ts)

**问题**：JS 层"先查共同 DM 群，没找到就创建"是 check-then-act 模式，非原子。两人同时首次发私信给对方时可能各自创建一个 group，造成 A↔B 之间存在两个 DM 群。后果：消息分裂到两个群，对方收不到。

**修复方案**：改成 SECURITY DEFINER RPC `get_or_create_dm(friend_id)`，在事务内 SELECT FOR UPDATE 然后 INSERT。

**触发时机**：上线前必修（不是高频但发生即破坏体验）

---

## 维护规则

1. **新加 TD 时**：取下一个未用过的连续编号，加进总索引表 + 详细条目区。
2. **修复 TD 时**：状态改为 ✅ FIXED，加完成时间 + 修复说明（保留历史，不删除）。
3. **取消 TD 时**：状态改为 🚫 SCRAPPED，**保留编号**避免后续 ID 复用混淆。
4. **跨文件引用 TD 时**：直接用 `TD-N` 编号或链接到本文件对应 anchor。
