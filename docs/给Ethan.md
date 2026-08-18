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

> ⚠️ **这条我改不了** —— 它藏在 `get_supabase_internal_url()` 这个 SECURITY DEFINER
> 函数里,属于你那条 AI 编排链路。改一行就好:换成完整的公网 functions URL。

---

## 🟡 P2 —— 质量问题,不阻塞上架

### 2. 宠物成长阶段的差异比 prompt 描述的弱

把 `pet_stage` 调成 `adult` 实测下来,语气和用词跟幼体阶段区分度不明显。
prompt 里对各阶段的描述是有的,但输出上体现不出来。

### 3. 41 处硬编码 Unsplash 图片

```bash
grep -ro "images.unsplash.com" app lib components | wc -l   # → 41
```

两个独立的问题:
- **可用性** —— 依赖第三方 CDN,Unsplash 挂了或改了链接,App 里就是一片破图
- **⚠️ 按种族命名的头像预设** —— onboarding 里有 6 张,key 是
  `asian_f` / `caucasian_m` / `african_m` 这种。出现在一个交友软件里,
  提审和公关都是风险点。**换资源的时候顺手把 key 改成中性命名。**

### 4. 没有任何速率限制

`pet-chat` 对单个用户的调用频率没有上限。现在用户少看不出来,
但这是成本和滥用两个方向上的敞口。

---

## 📋 需要你办的(不是代码)

- ~~OpenAI DPA 未签~~ ✅ **Joe 2026-08-18 确认已解决** —— 账号已转公司邮箱 +
  公司银行卡,API 客户走标准商务条款时 DPA 自动生效。
  **建议导一份 PDF 存档** —— 填苹果隐私标签、以后谈校园合作时手上要有那张纸。

## ✅ 已经解决的(不用再看)

| 原问题 | 结果 |
|---|---|
| prompt 指示模型否认自己是 AI | ✅ 已改,线上 v9 |
| 自杀意念没有危机处理 | ✅ **已部署并真机验证** —— 用间接说法「I don't want to be here anymore」触发,988 / 741741 / findahelpline / 911 全部给到,且对「I failed my midterm」不误触发。这解除了 SB 243 的合规风险(网站 `zzup.org/safety` 公布了这套协议,公布一个不存在的协议比不公布更糟) |
| Pulse 的 prompt 里带着双方真名 | ✅ 已解决 |
| 泄露知识截止日期 | ✅ 已解决 |
| `c6a67a4` 已 push 未部署 | ✅ 已部署,`pet-chat` version=9 |
| `agent-chat` 读 `pet_memories.memory_text`(列不存在) | ✅ **你自己在 `15e8dec` 里改成 `summary` 了**,线上 v7 就是改过的。这条是我文档写漏了没复核,已撤 |
| 5 处 `max_tokens` 让宠物记忆 100% 写不进去 | ✅ **你让我做,我改完部署了**(见下) |
| `travel-mode` 的视觉分支只认 `http` 开头 | ✅ **同上** |

### 我动了你三个函数,只动了这两件事(2026-08-18)

你让我做的那两条。**prompt 正文、模型、编排逻辑一个字没动**,
部署后 `pet-chat` v10 / `agent-chat` v8 / `travel-mode` v8。

**一、`max_tokens` → `max_completion_tokens`,5 处**

`gpt-5.6-luna` 不接受 `max_tokens`,**整个请求 400,不是截断**。
线上日志一天 9 次,每次宠物聊天一次:

```
Async memory extraction error: Error: 400
Unsupported parameter: 'max_tokens' is not supported with this model.
```

所以你那条记忆管道(提取 → embedding → 写 `pet_memories`)代码是完整的,
但**从来没成功过一次**,`pet_memories` 一直是 0 行。

⚠️ **值也一起调大了,这一步不能省**:`max_completion_tokens` 的预算**包含推理 token**,
照抄原来的 60 / 30 / 120 / 150 的话请求会成功但 `content` 是空的 ——
从「会报错的失败」变成「不报错的失败」。现在是
`pet-chat` 400、`agent-chat` 200/400/400、`travel-mode` 300。
另外在提取那处加了一条 log,把「模型说 NONE」和「模型返回空」分开。

实测:发一句 "My major is computer science and my favorite food is tonkotsu ramen"
→ 日志 `Saved new pet memory: Owner is majoring in computer science and loves tonkotsu ramen.`
→ 表里第一行有了,带 embedding。

**二、`travel-mode` 的图片分支认路径了**

Roam 图片 8-18 改成自托管(`roam-media` 私有桶)之后存的是路径,
原来 `startsWith("http")` 那个判据让整段 vision **静默跳过**。
现在:路径 → `createSignedUrl(1h)` → 送模型;老数据的 http 外链原样放行;
签名失败留 `console.error`。

实测(这条我特意做了对照组):同一句文字发两条,一条带图一条不带,
两个 embedding 的余弦相似度 **0.685** —— 如果 vision 没跑,两个向量会一模一样。

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
