# DEFERRED — 遗留问题清单

> 重构对齐 `zzup_app_decision_tree_v3.svg`(唯一事实来源)期间,**暂不实现**的部分。
> 向量匹配与 AI 对聊由 Joe 与 Ethan 后续单独研究,这里只占位记录。
> 约定:相关 schema 字段/RPC **建好但留空**(NULL / 空函数体 / TODO),不阻塞主线。

最后更新:2026-06-11

## 🎯 本轮范围(core social,让 Ethan 能测)
**做**:lib/api 全线重写(对齐新 schema)+ 补服务端读取 RPC → 让 **Profile + 聊天 tab + 好友** 的真人流程跑起来。之后产出给 Ethan 的接口契约文档。
**本轮不做(仅记录)**:Pet Travel(漂流瓶/Pet Chat)、**所有 AI**(zZuPer Talk 回复 / Pet Chat 对聊,见 #2/#3)、**.edu 验证**(见 #11)、通知推送、临时窗口自动蒸发调度(见 #8)、聊天图片桶(见 #12)。

---

## 1. 向量匹配(embeddings)
- **涉及**:漂流瓶撮合(P5)、Pet Chat 同频撮合(P4)、profiles 兴趣向量。
- **缺**:`pgvector` 扩展、embedding 来源(OpenAI / Gemini)、`match_*` RPC 的相似度逻辑。
- **占位**:相关表保留 `embedding vector(1536)` 列(或先不建,待定);撮合 RPC 先用「同校优先 + 随机扩散」兜底,向量分支留 TODO。
- **状态**:待 Joe + Ethan 研究。

## 2. AI 对聊循环(Pet Chat 双 AI)
- **涉及**:P4 Pet Chat 起始的「双方 AI 各发开场 + 交替对聊 + 单方 ≤15 条」。
- **缺**:消息触发器 → Webhook → LLM → 回插消息 的整条链路;SSE 流式;Edge Function `agent-chat`。
- **占位**:会话表/状态机字段建好;AI 发言部分留空,先支持纯真人模式跑通窗口生命周期。
- **状态**:待 Joe + Ethan 研究。

## 3. zZuPer Talk(固定宠物会话 AI)+ 长期记忆 RAG
- **涉及**:P3 的「和自己宠物 AI 聊、养 bio」。
- **缺**:`pet-chat` Edge Function、(spec C7)`pet_memories` 向量记忆是否纳入本期**未定**。
- **占位**:`pet_chat_messages` 类表建好;AI 回复留空。
- **状态**:待裁决 + 待 Ethan。

## 4. 宠物等级 XP 曲线
- **涉及**:幼/青/成、Lv30/60 进化所需经验。
- **缺**:到 Lv30、Lv60 各需多少 XP 的具体曲线(树只给了进化点,没给曲线)。
- **占位**:暂用 `level = floor(xp/100)+1` 线性占位;阶段按 Lv<30 / <60 / ≥60 划分;配额 1/3/5。
- **状态**:数值待定(可后期调,不影响结构)。

## 5. 钱包(Wallet)
- **涉及**:Profile 设置区 xref 节点。
- **占位倾向**:本期仅建占位表 or 完全不碰 —— **待 Joe 定**。
- **状态**:待定。

## 6. 18+ 年龄门槛 — 服务端校验落点
- **缺**:DOB→年龄的服务端强制校验放在哪(注册 RPC / 触发器)。
- **状态**:P1 注册流程时定。

## 7. 删号三场景清理 job
- **涉及**:soft delete 后 ——(a)发瓶人删:6h 后静默清理;(b)对话方删:conv 变只读;(c)后台留档。
- **缺**:定时清理的调度方案。
- **状态**:P6 时定(与第 8 项一起)。

## 8. 3h 窗口蒸发 & 瓶子 6h 回家 — 调度方案
- **缺**:`pg_cron` vs Supabase Scheduled Edge Function vs 懒触发(查询时判过期)。
- **状态**:P6 时定。

## 9. 推送下发基础设施
- **涉及**:通知开关(漂流瓶/PetChat/好友/私聊/群聊)。
- **占位**:开关字段建在 profiles;**实际下发**(token 表 + APNs/FCM 通道)留空。
- **状态**:待定。

## 12. 聊天图片消息存储桶
- **涉及**:`messages.image_url`、消息栏 [+] 上传文件 / 拍摄。
- **缺**:存放聊天图片的 storage bucket + 访问策略。**需考虑匿名**:私聊/群聊图片不宜放完全公开桶(URL 泄露),路径与权限要按会话成员控制。
- **状态**:建消息上传功能时一并做(35 暂未加该桶)。

## 11. offer_verifications(.edu 验证)是否重建
- **现状**:被 25 的 `drop ... cascade` 级联删除,**尚未重建**。树里有 .edu 验证节点(发起 / 徽章状态)。
- **待定**:是否重建该表 + `verify-offer` Edge Function;或 .edu 验证改走纯 .edu 邮箱域名验证等更轻方式。
- **涉及**:`29_offer_verifications.sql`、profiles 的 `edu_email`/`edu_verified`。
- **状态**:待 Joe 决定做不做。

## 10. 会话匿名强度(四窗口 / 群马甲)
- **现状**:暂选 **A 方案(API 层去标识化)**——库内照存真实 `account_id`,`messages`/`conversation_members` 开放成员直查(保 Realtime),去标识化靠读取 RPC。
- **弱点**:绕过 RPC 直查仍暴露 `account_id`,**挡不住抓包 / 改客户端**,无法对抗确定型攻击者跨窗对照(宠物马甲 ↔ 真人账号)。
- **待办**:正式上线前升级到 **B**(纯 RPC 读取,`account_id` 永不出库,牺牲直 Realtime)或 **C**(每窗口不透明 `member_handle` 列,保 Realtime)。涉及 `messages`/`conversation_members` 的 SELECT 权限 + 读取 RPC + Realtime 推送层重构。
- **涉及**:`27_conversations.sql`、P-会话 读取 RPC。
- **状态**:待定(本期按 A 跑通)。
