# zZuP! 后端接口契约 (v3 · core social)

> 给前端 / Edge Function 开发者(及其 AI)的**精确**对接契约。
> 事实来源 = `zzup_app_decision_tree_v3.svg`。Supabase schema = 迁移 `25–53`。
> 本契约只覆盖**已就绪**的部分(Profile / 好友 / 会话)。Pet Travel、AI、.edu 等见末尾「未就绪」。
> 最后更新:2026-06-24

---

## 0. 核心约定(先读这段)

- **身份 = 账号 + `identity_type ∈ ('real','pet')` 属性**。一账号一只宠物(1:1)。没有独立 pet id。
- **拉黑、会话窗口、可见性按「身份」生效**;好友只在「真人↔真人」之间。
- **`messages.identity_mode`** 逐条标记发言身份 → 前端按它渲染头像(`pet` 段用宠物缩略头像)。
- **四窗口**:两账号间最多 4 个私聊窗口(双真 / 双宠 / 一人一宠 ×2),由 `conversations.dm_key` 区分,**绝不合并**。
- **S_A 展示身份** = `profiles.profile_visibility ∈ ('real_only'=人,'real_with_pet'=同框,'pet_only'=宠)`。
- **写操作几乎全走 SECURITY DEFINER RPC**;关系/会话表对 `authenticated` 只开放 SELECT(messages 额外开放 INSERT)。
- **匿名(本期 A 方案,弱)**:读取仍会拿到对方 `account_id`(`peer_id`/`sender_id`)。**勿用于硬匿名**,后续升级 B/C(见 DEFERRED.md #10)。

---

## 1. 数据表

### profiles(用户主表)
关键列:`id, zzup_id(公开短号), real_name, bio, avatar_url, qr_code_url, date_of_birth, gender, nationality, university, personal_email, edu_email, edu_verified, pet_name, pet_avatar_url, pet_bio, pet_level, pet_xp, pet_stage('child'|'youth'|'adult'), profile_visibility, searchable_by_real_name, allow_add_via_search/_qr/_profile, notify_driftbottle/_petchat/_friend/_dm/_group, onboarded, deleted_at, created_at`。
- **永不对外**:`personal_email`、`date_of_birth`(对外只给派生 `age`)、各开关。
- 受保护(不可自改,RPC/Edge 写):`zzup_id, edu_verified, pet_xp/level/stage, personal_email_verified, deleted_at, id, created_at`。
- **读 profiles 一律走 RPC**(`get_my_profile` / `get_other_profile`),不要直查(敏感列已 REVOKE SELECT)。

### friendships(真人↔真人)
`id, requester_id, addressee_id, status('pending'|'rejected'|'accepted'), source, created_at, responded_at`
- 一对人同时最多 **1 条 pending**、**1 条 accepted**(分区唯一索引);`rejected` 不限(历史)。
- **重发 = 新插一行 pending**;`rejected` 是终结,不复用。
- 写:**只走 RPC**(下方)。读:`list_*` RPC。

### blocked_users(身份级)
PK `(blocker_id, blocked_id, blocked_identity_type∈('real','pet'))`
- SELECT 仅 `blocker` 可见。写:走 RPC。拉黑 `real` 顺带删两人好友;拉黑 `pet` 不动好友。

### conversations(统一会话)
`id, kind('zzuper_talk'|'group'|'dm'|'petchat'|'driftbottle'), name, description, avatar_url, group_type('official'|'edu_verified'|'open'), university, is_searchable, members_count, dm_key, is_temporary, expires_at, status('active'|'expired'|'upgraded'), created_by, created_at`
- `dm` 四窗口由 `dm_key`(规范化 `account:identity|account:identity`)唯一。
- `is_temporary=true` 的窗口(petchat/driftbottle):**首条消息**触发 `expires_at = 首条 +3h`(由触发器自动)。
- 写:走 RPC。读:`list_conversations`。group 搜索可直查(见下)。

### conversation_members
`id, conversation_id, account_id, member_identity('real'|'pet'), role('admin'|'member'), joined_at`,`unique(conversation_id, account_id)`
- `member_identity` = 该账号在此窗口呈现的身份。dm 建好即固定;petchat 随接管演化。
- SELECT:同会话成员可见。写:走 RPC。

### messages
`id, conversation_id, sender_id, identity_mode('real'|'pet'), content, image_url, created_at, edited_at`
- SELECT / INSERT:会话成员(`sender_id = auth.uid()`)。UPDATE:仅本人,仅 `content, edited_at`。**无 DELETE**(留存)。
- **可直接查 / 直接 insert**(配合 Realtime);AI 消息由 Edge Function 用 service_role insert(`identity_mode='pet'`)。

### offer_verifications(.edu,**流程待定**,勿依赖)

---

## 2. 写入 RPC(`supabase.rpc(name, params)`)

| RPC | 参数 | 返回 | 作用 / 失败抛错 |
|---|---|---|---|
| `send_friend_request` | `p_addressee_id uuid, p_source text` | void | 发好友请求。错:`Already friends` / `A pending request already exists` / `This user already sent you a request; accept it instead` / `Cannot send friend request`(被拉黑) |
| `respond_friend_request` | `p_friendship_id uuid, p_accept bool` | void | addressee 接受(true)/拒绝(false) |
| `cancel_friend_request` | `p_friendship_id uuid` | void | requester 撤回自己的 pending |
| `remove_friend` | `p_friendship_id uuid` | void | 双方均可解除已接受好友 |
| `block_identity` | `p_blocked_id uuid, p_identity_type text` | void | 身份级拉黑(`'real'` 顺带删好友) |
| `unblock_identity` | `p_blocked_id uuid, p_identity_type text` | void | 解除拉黑 |
| `create_dm` | `p_target_id uuid, p_my_identity text, p_target_identity text` | **uuid**(会话 id) | 发起/复用四窗口之一。`my_identity`=自选,`target_identity`=对方呈现身份 |
| `create_group` | `p_name text, p_group_type text, p_university text, p_member_ids uuid[]` | **uuid** | 仅从好友建群、含自己 ≥3 人 |
| `join_group` | `p_conversation_id uuid` | void | 仅真人加入可搜索群 |
| `leave_group` | `p_conversation_id uuid` | void | 退群;创建者退出移交最早成员 |
| `transfer_group_ownership` | `p_conversation_id uuid, p_new_owner_id uuid` | void | 转群主 |
| `get_or_create_zzuper_talk` | — | **uuid** | 固定宠物会话(注册已建,幂等兜底) |
| `add_xp` | `p_user_id uuid, p_xp int` | void | 宠物加经验(一般服务端调) |

`p_source ∈ ('search','qr','profile','zzup_id','petchat','driftbottle')`。
`identity_type / *_identity ∈ ('real','pet')`。

---

## 3. 读取 RPC

| RPC | 参数 | 返回 |
|---|---|---|
| `get_my_profile` | — | json(本人全字段,含 `age`/`pet_quota`) |
| `get_other_profile` | `target_id uuid` | json(按对方 S_A 过滤;无敏感列;已删账号返回 null) |
| `pet_quota` | `p_level int` | int(1/3/5) |
| `search_users` | `p_keyword text` | rows:`id, zzup_id, profile_visibility, real_name, avatar_url, university, pet_name, pet_avatar_url, edu_verified` |
| `list_friends` | — | rows:`friendship_id, id, zzup_id, profile_visibility, real_name, avatar_url, university, pet_name, pet_avatar_url, edu_verified` |
| `list_pending_requests` | — | 同上 + `created_at`(我收到的) |
| `list_sent_requests` | — | 同上 + `created_at`(我发出的) |
| `get_friendship_status` | `p_target uuid` | text:`none/pending_sent/pending_received/accepted/blocked`(对方拉黑我→`none`) |
| `list_conversations` | — | rows:`conversation_id, kind, is_temporary, expires_at, status, my_identity, peer_id, display_name, display_avatar, members_count, last_message, last_message_at` |

`search_users`:`zzup_id` 精确永远可搜;`real_name` 模糊仅当对方 `searchable_by_real_name=true`;排除自己+身份级拉黑(真人)。

---

## 4. 典型前端流程

- **会话列表**:`list_conversations()`。临时窗口过期会自动不返回。
- **发起私聊**:进对方主页 → 选我的身份(`real`/`pet`)→ `create_dm(对方id, 我身份, 对方呈现身份)` → 得 `conversation_id`。
- **群里私聊某人**:同上,`对方呈现身份` = 他在群里发言用的身份。
- **收发消息**:`getMessages` 直查 + `subscribeToMessages` Realtime;发 = 直接 insert `messages`(或 `lib/api/messages.sendMessage`)。
- **加好友**:`send_friend_request` → 对方 `respond_friend_request`。状态查 `get_friendship_status`。
- **建群**:从 `list_friends` 选人 → `create_group`(≥3)。
- **参考实现**:`lib/api/{auth,friends,conversations,messages}.ts` 已封装好全部调用。

---

## 5. Edge Function(Pet Travel / AI,Ethan 负责)接入点

- **AI 消息**:用 service_role `insert into messages(conversation_id, sender_id=该账号, identity_mode='pet', content)`。插入会触发状态触发器。
- **Pet Chat 会话**:`kind='petchat'`,`is_temporary=true`。**漂流瓶会话**:`kind='driftbottle'`,`is_temporary=true`,真人对话(宠物只送信)。
- **从这些会话加好友**:调 `send_friend_request(source='petchat'/'driftbottle')`;对方接受后**需把会话翻成永久**(`is_temporary=false, expires_at=null, status='upgraded'`)—— ⚠️ **该「原地升级」RPC 尚未建**,见未就绪。
- **AI 对聊循环**:消息触发器 → `pg_net` 戳 Edge Function → LLM → 回插消息(尚未接线)。
- **embedding / pgvector**:尚未引入。

---

## 6. ⚠️ 未就绪(勿依赖)

- Pet Travel 状态表:`travel_posts / travel_comments / match_queue` + 撮合 RPC(**未建**)
- 所有 **AI / LLM / Edge Function**(zZuPer Talk 回复、Pet Chat 对聊、embedding)
- **pgvector** 扩展与向量列
- 临时窗口 3h 蒸发 / 瓶子 6h 回家的**调度**(过期目前只在 `list_conversations` 懒隐藏,不真删)
- Pet Chat/漂流瓶**加好友后原地升级**会话的 RPC
- 群聊**移除成员**(踢人)RPC
- **通知推送下发**(开关字段有,下发无)
- **.edu 验证**流程、**聊天图片存储桶**、**钱包**、soft delete 清理 job

---

## 7. 前端现存待改(因 schema 变更)

- `OnboardingScreen`:别再向 `updateProfile` 传 `identity_mode` / `location_sharing`(已删);`error` 是 string 不是对象。
- `AuthContext`:Profile 类型对齐 `lib/api/auth.ts` 的 `Profile`(`string | null`)。
- `LoginScreen`:`signIn` 返回 `{ userId, error: string|null }`,别 `.message`。
- `RegisterScreen` / `RootNavigator`:既有的 import 路径错(`screens/auth/RegisterScreen` 不存在 / `../../../` 多一层),与本次无关但需修。
