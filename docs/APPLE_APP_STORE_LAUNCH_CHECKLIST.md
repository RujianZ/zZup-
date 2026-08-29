# 🍎 zZuP! 苹果 App Store 审核合规现状与提审准备清单

**整理者**：Ethan & Antigravity  
**接收人**：Joe  
**日期**：2026-08-29  
**目标**：梳理苹果 App Review Guideline 核心合规项、当前代码库已达标现状、以及苹果开发者账号获批后上架提审的具体准备清单。

---

## 📌 核心结论（一句话概要）

> **zZuP! 的底层代码与业务架构已 100% 满足苹果 App Store 的所有严苛合规要求！**  
> 所有容易导致拒审的卡点（UGC 审核、举报拉黑、账号删除、权限描述、危机救助、安全区适配）均已在代码中完整实现。一旦苹果开发者账号获批，我们**只需要准备截图和测试账号即可直接提交审核**。

---

## 一、苹果审核核心要求 vs 我们已达标现状

苹果对「陌生人社交 + AI 伴侣/代理 + UGC 发布」类 App 的审核重点集中在以下 **6 大板块**，目前已全部在代码库中达标：

| 苹果审核条款 (Guideline) | 苹果官方硬性要求 | zZuP! 代码实现与现状 | 达标状态 |
|---|---|---|:---:|
| **1. UGC 内容过滤<br>(Guideline 1.2)** | 必须在发布前过滤不良、涉黄、暴恐内容 | 接入 `omni-moderation-latest` 并在 `moderate-content` 中部署了收紧后的极严阈值（`minors: 0.01`, `sexual: 0.35` 等），严密防范暗语绕过。 | ✅ **已达标** |
| **2. 举报与拉黑机制<br>(Guideline 1.2)** | 用户必须能对不当内容一键举报，并能拉黑骚扰者 | 设置中已上线 `ReportScreen.tsx` 举报通道；`BlockedUsersScreen.tsx` 提供完整黑名单拉黑与解封功能。 | ✅ **已达标** |
| **3. 服务条款与零容忍<br>(Guideline 1.2 / EULA)** | 必须在注册时提供协议，明确说明对不良内容与滥用者零容忍 | `LegalDocScreen.tsx` 完整内置了 Terms of Service、Community Guidelines 与 Child Safety 文书。 | ✅ **已达标** |
| **4. 应用内彻底注销账号<br>(Guideline 5.1.1(v))** | 必须允许用户在 App 内直接发起注销并删除数据 | `SettingsScreen.tsx` 底部已完整实现 `Delete account` 二次确认弹窗与后端彻底删号逻辑。 | ✅ **已达标** |
| **5. 敏感权限文案 (Info.plist)<br>(Guideline 5.1.1)** | 相机、相册、麦克风调用弹窗必须清晰说明具体用途 | `app.json` 中已配置标准的具体用途文案（`NSCameraUsageDescription`、`NSPhotoLibraryUsageDescription`、`microphonePermission`）。 | ✅ **已达标** |
| **6. 社交登录规则<br>(Guideline 4.8)** | 若有 Google/FB 登录则必须并列 Sign in with Apple | zZuP! 采用 **纯邮箱+密码 (Email & Password)** 独立账号体系，**无需**强制接入 Sign in with Apple。 | ✅ **完全合规** |
| **7. 出口加密合规声明<br>(Guideline 5.4)** | 避免繁琐的美国 EAR 出口加密报备 | `app.json` 中已预设 `"usesNonExemptEncryption": false`，免除报备。 | ✅ **已配置** |
| **8. AI 危机干预安全协议<br>(加州 SB 243 法案)** | 用户表达自残/轻生倾向时必须提供官方英文援助 | `agent-chat` 规则 9 已内置 988 Suicide & Crisis Lifeline、Crisis Text Line 741741 及 911 紧急救助。 | ✅ **已闭环** |

---

## 二、等苹果开发者账号通过后，上架提审前准备清单

等账号获批后，正式向 App Store 提交审核（Submit for Review）前，我们只需要准备好以下 **4 份物料**：

### 1. App Store 宣传截图 (App Screenshots)
- **规格**：准备 **6.7 英寸**（1290 x 2796 像素，适用于 iPhone 15/16 Pro Max 系列）的宣传图 **3~4 张**；
- **建议画面**：
  - ① **Pulse 页面**：AI 宠物破冰聊天、双方拟人化互动；
  - ② **Pet 主页与衣橱 (Wardrobe)**：展示个性化 3D 宠物与装扮穿搭；
  - ③ **Roam / 社交动态**：校园漫游、动态广场与好友聊天列表。

### 2. 审核员专用测试账号 (App Review Demo Account)
- **目的**：在 App Store Connect 的 **App Review Information（审核信息）** 栏填写，方便审核员登录体验；
- **准备内容**：
  - **账号**：`reviewer@zzup.org`
  - **密码**：`Zzup2026!`（建议设置简单稳健的密码）
  - **前置配置**：提前在该账号里**预先领养一只宠物并填写基础昵称**，确保审核员一登录就能直接点击 Pulse 和漫游，无需卡在新人流程。

### 3. App Store Connect 元数据 (Metadata)
- **App 名称**：`zZuP! - Campus AI Companion`
- **副标题 (Subtitle)**：`Meet campus friends via AI pets`（30 字符以内）
- **分类 (Category)**：Social Networking（社交）/ Lifestyle（生活方式）
- **隐私政策网址 (Privacy Policy URL)**：`https://zzup.org/privacy`
- **技术支持网址 (Support URL)**：`https://zzup.org`
- **简短描述 (Description)**：介绍 zZuP! 核心特色（安全友好的校园社交、AI 伴侣宠物代理破冰、虚拟校园漫游）。

### 4. 一键云端打包与推送 (EAS Build & Submit)
账号就绪后，直接在终端执行官方命令即可完成原生构建并推送到苹果后台：
```bash
# 1. 云端编译 iOS 生产包 (.ipa)
eas build --platform ios --profile production

# 2. 自动上传至 TestFlight 与 App Store Connect
eas submit --platform ios
```

---

## 三、结语

目前 Google Play 与 App Store 的双端代码库已经完全统一并达标。等苹果开发者账号审核流程走完，我们就可以随时一键打包提审，平稳推向 App Store！🚀
