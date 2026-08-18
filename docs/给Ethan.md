# 给 Ethan —— 当前未解决的问题

**2026-08-18 重写。** 这份取代之前四份散落的文档
(`给Ethan_2026-08-15.md`、`给Ethan_法务与上架_2026-08-16.md`、
`AI_测试报告_给Ethan_2026-08-13.md`、`上架与法律阻塞项_AI_2026-08-16.md`),
它们已删。**下面每一条都在 2026-08-18 当天对线上重新核实过**,
不是照抄旧文档 —— 已经解决的都没往这里搬。

分工:**LLM 架构、prompt、模型选择、AI 编排逻辑是你的。** 下面全是观察和建议,
`pet-chat` / `agent-chat` / `travel-mode` 的推理部分我一行没改。

---

## 🔴 P0 —— 有功能是断的

### 1. `get_supabase_internal_url()` 返回的地址在云端解析不了

```sql
select public.get_supabase_internal_url();
-- → http://kong:8000/functions/v1/agent-chat     ← 2026-08-18 实测
```

`kong:8000` 是**本地开发**的容器主机名。云端的 Postgres 解析不了它,
所以 `trigger_agent_chat_reply` 发出去的 `pg_net` 请求打不到任何地方。

**症状:Pulse 的 AI 对聊只回一条就停** —— 第一条是客户端直接调函数发起的,
之后靠数据库触发器自动轮转,而那一步从来没成功过。

改成完整的公网 functions URL 即可。这条从 8-15 报到现在,状态未变。

### 2. `agent-chat` 读 `pet_memories.memory_text`,这一列不存在

```sql
-- 2026-08-18 实测，pet_memories 的全部列：
id, user_id, summary, embedding, created_at
```

**列名是 `summary`,不是 `memory_text`。** 读一个不存在的列会让整段记忆检索静默失败。

顺带:`pet_memories` 现在是 **0 行** —— 写入路径也是断的。
所以"宠物记得你说过的话"这个功能**从来没有真正生效过**,
但每条消息仍然在为检索它付费。这两件事要一起看。

### 3. 5 处 `max_tokens` 必须改成 `max_completion_tokens`

```
pet-chat:155
agent-chat:160 / 179 / 319
travel-mode:81
```

而且**数值要往上调**:推理型模型的 reasoning token 也计入这个预算,
照旧值可能整段回复被截断 —— 表现是"宠物说到一半没了"。

---

## 🟠 P1 —— 卖点是断的

### 4. `travel-mode` 的视觉分支只认 `http` 开头

```ts
// travel-mode:81 附近
if (image_url.startsWith("http")) { /* 才跑 vision */ }
```

**Roam 的图片 2026-08-18 改成自托管了** —— 现在存的是 storage 路径(形如
`{uid}/{文件名}.jpg`),不是 URL。所以**带图的 Roam 现在静默跳过了图像理解**。

改法:路径就调 `createSignedUrl` 拿一个一小时的签名链接再传给模型。
一行分支的事,但不改的话"宠物看得懂你发的照片"这个卖点是断的。

改的原因见 §「为什么 Roam 不能用外链」——用户粘贴的任意外链既无法审核
(审过之后可以换掉内容),也会把每个浏览者的 IP 送给发帖人控制的服务器。

---

## 🟡 P2 —— 质量问题,不阻塞上架

### 5. 宠物成长阶段的差异比 prompt 描述的弱

把 `pet_stage` 调成 `adult` 实测下来,语气和用词跟幼体阶段区分度不明显。
prompt 里对各阶段的描述是有的,但输出上体现不出来。

### 6. 41 处硬编码 Unsplash 图片

```bash
grep -ro "images.unsplash.com" app lib components | wc -l   # → 41
```

两个独立的问题:
- **可用性** —— 依赖第三方 CDN,Unsplash 挂了或改了链接,App 里就是一片破图
- **⚠️ 按种族命名的头像预设** —— onboarding 里有 6 张,key 是
  `asian_f` / `caucasian_m` / `african_m` 这种。出现在一个交友软件里,
  提审和公关都是风险点。**换资源的时候顺手把 key 改成中性命名。**

### 7. 没有任何速率限制

`pet-chat` 对单个用户的调用频率没有上限。现在用户少看不出来,
但这是成本和滥用两个方向上的敞口。

---

## 📋 需要你办的(不是代码)

- **OpenAI DPA 未签** —— 账号在你名下。Customer 填 `zZuP!, Inc.`。
  隐私政策里已经写了我们和 OpenAI 的关系,DPA 是那句话的凭证。

---

## ✅ 已经解决的(不用再看)

| 原问题 | 结果 |
|---|---|
| prompt 指示模型否认自己是 AI | ✅ 已改,线上 v9 |
| 自杀意念没有危机处理 | ✅ **已部署并真机验证** —— 用间接说法「I don't want to be here anymore」触发,988 / 741741 / findahelpline / 911 全部给到,且对「I failed my midterm」不误触发。这解除了 SB 243 的合规风险(网站 `zzup.org/safety` 公布了这套协议,公布一个不存在的协议比不公布更糟) |
| Pulse 的 prompt 里带着双方真名 | ✅ 已解决 |
| 泄露知识截止日期 | ✅ 已解决 |
| `c6a67a4` 已 push 未部署 | ✅ 已部署,`pet-chat` version=9 |

**你的 prompt 工程本身经受住了对抗测试** —— 14 轮提示词注入、人格剥离、
系统提示词套取,一次都没破防。2026-08-18 又复测了一遍隐私探测和注入,同样拒绝。

---

## 给你的两条环境提醒

1. **`app/screens/` 我现在会直接改了。** Joe 转全栈之后边界重划为
   「LLM 相关的不动,其余都动」。2026-08-18 我改了六个屏的键盘遮挡
   (`behavior` 在安卓上必须给值,SDK 54+ edge-to-edge 之后窗口不再自动 resize)。
   拉之前建议先 `git stash` 备份本地未提交的工作。
2. **`supabase/functions/contact-submit/` 是我建的**(网站联系/删号表单的后端),
   跟 AI 无关,不用管它。
