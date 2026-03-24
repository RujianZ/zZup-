"use strict";

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  HeadingLevel,
  BorderStyle,
  ShadingType,
  VerticalAlign,
  TableLayoutType,
} = require("docx");
const fs = require("fs");
const path = require("path");

// ─── Helpers ────────────────────────────────────────────────────────────────

const ARIAL = "Arial";

function para(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align || AlignmentType.LEFT,
    spacing: { before: opts.before ?? 80, after: opts.after ?? 80 },
    children: [
      new TextRun({
        text,
        font: ARIAL,
        size: opts.size || 20,
        bold: opts.bold || false,
        color: opts.color || "000000",
        italics: opts.italics || false,
      }),
    ],
  });
}

function heading(text, level = 1) {
  const sizes = { 1: 32, 2: 26, 3: 22 };
  return new Paragraph({
    spacing: { before: 200, after: 100 },
    children: [
      new TextRun({
        text,
        font: ARIAL,
        size: sizes[level] || 22,
        bold: true,
        color: level === 1 ? "1F3864" : level === 2 ? "2E5090" : "2F5496",
      }),
    ],
  });
}

function spacer() {
  return new Paragraph({ spacing: { before: 60, after: 60 }, children: [] });
}

// ─── Table builders ─────────────────────────────────────────────────────────

const HEADER_FILL = { type: ShadingType.SOLID, color: "2E5090", fill: "2E5090" };
const ALT_FILL    = { type: ShadingType.SOLID, color: "EEF2FF", fill: "EEF2FF" };

function headerCell(text, widthPct) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: HEADER_FILL,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({ text, font: ARIAL, size: 18, bold: true, color: "FFFFFF" }),
        ],
      }),
    ],
  });
}

function dataCell(text, widthPct, opts = {}) {
  return new TableCell({
    width: { size: widthPct, type: WidthType.PERCENTAGE },
    shading: opts.shading,
    verticalAlign: VerticalAlign.CENTER,
    children: [
      new Paragraph({
        alignment: opts.align || AlignmentType.LEFT,
        spacing: { before: 60, after: 60 },
        children: [
          new TextRun({
            text,
            font: ARIAL,
            size: opts.size || 18,
            bold: opts.bold || false,
            color: opts.color || "000000",
          }),
        ],
      }),
    ],
  });
}

// Build a standard task table row
// cols: [num, owner, task, status]
function taskRow(num, owner, task, status, isAlt) {
  const sh = isAlt ? ALT_FILL : undefined;
  const done = status && status.includes("Done");
  const statusText = done ? "✅ Done" : (status || "");
  const statusColor = done ? "276221" : "888888";
  return new TableRow({
    children: [
      dataCell(String(num), 6, { shading: sh, align: AlignmentType.CENTER }),
      dataCell(owner, 10, { shading: sh }),
      dataCell(task, 66, { shading: sh }),
      new TableCell({
        width: { size: 18, type: WidthType.PERCENTAGE },
        shading: sh,
        verticalAlign: VerticalAlign.CENTER,
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { before: 60, after: 60 },
            children: [
              new TextRun({ text: statusText, font: ARIAL, size: 18, bold: done, color: statusColor }),
            ],
          }),
        ],
      }),
    ],
  });
}

function taskTableHeader() {
  return new TableRow({
    tableHeader: true,
    children: [
      headerCell("#", 6),
      headerCell("Owner", 10),
      headerCell("Task Description", 66),
      headerCell("Status", 18),
    ],
  });
}

function buildTaskTable(rows) {
  const tableRows = [taskTableHeader()];
  rows.forEach((r, i) => {
    tableRows.push(taskRow(r[0], r[1], r[2], r[3], i % 2 === 1));
  });
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    rows: tableRows,
  });
}

// ─── Note paragraph with warning icon ───────────────────────────────────────

function notePara(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    children: [
      new TextRun({ text, font: ARIAL, size: 18, color: "7B3F00" }),
    ],
  });
}

// ─── Tech Stack Table ────────────────────────────────────────────────────────

function buildTechStackTable() {
  const rows = [
    ["Tech Stack", "Expo (Managed) · Supabase · TypeScript · Google Maps"],
    ["Joe (CSO)", "MacBook + Windows → iOS模拟器 / iOS上线 / Supabase后端 / API / 实时消息 / 地图后端"],
    ["Ethan (CEO)", "Windows专属 → Android模拟器 / Android上线 / Frontend UI / 双形象显示 / 发帖 / 地图UI"],
    ["存储方案", "Supabase Storage（不使用AWS S3）"],
    ["数据库", "Supabase PostgreSQL + Realtime"],
    ["地图", "Google Maps Platform (expo-location + react-native-maps)"],
  ];
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((r, i) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 22, type: WidthType.PERCENTAGE },
            shading: { type: ShadingType.SOLID, color: "2E5090", fill: "2E5090" },
            children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: r[0], font: ARIAL, size: 18, bold: true, color: "FFFFFF" })] })],
          }),
          new TableCell({
            width: { size: 78, type: WidthType.PERCENTAGE },
            shading: i % 2 === 0 ? undefined : ALT_FILL,
            children: [new Paragraph({ spacing: { before: 60, after: 60 }, children: [new TextRun({ text: r[1], font: ARIAL, size: 18 })] })],
          }),
        ],
      })
    ),
  });
}

// ─── Notes section ───────────────────────────────────────────────────────────

function buildNotesSection() {
  const notes = [
    "⚠ AWS S3已从计划中移除。图片存储统一使用Supabase Storage。",
    "⚠ pets独立表已废弃，宠物数据合并至profiles表（一人一宠物设计）。",
    "⚠ RLS策略已融合至各建表SQL中（Module 1.1），不再单独配置。",
    "⚠ 私聊功能通过friendships表 + groups.chat_type = direct实现，无需新建独立表。",
    "⚠ landmarks表改为Places API缓存表（500m半径，30天有效期），不再手动录入。",
    "⚠ offer验证流程：用户在app内打码裁剪截图 → AI提取信息 → 24小时后删除原文件。",
  ];
  return notes.map(n => notePara(n));
}

// ─── Module 1.4 sub-section text blocks ─────────────────────────────────────

function module14Overview() {
  const lines = [
    "• 好友之间可以互相看到彼此实时位置",
    "• 位置分享设置：精确定位 / 模糊定位（默认±500m偏移）/ 不分享",
    "• 探索系统：用户步行进入某地点停留2分钟触发，奖励XP",
    "• 探索奖励：第一次到达+10XP；再次到达+2XP（每天最多一次）；停留30分钟+2XP；停留60分钟+5XP（图书馆+8XP）",
    "• 称号系统：按地点类型累计访问次数解锁称号（7次初级，30次高级）",
    "• 每周排名：按地点类型统计本周停留时长，排名前三显示称号",
    "• Discovery模式：地图叠加覆盖层，去过的区域覆盖消失，只读，不可交互",
    "• 后台追踪：用户授权后后台持续更新位置和Discovery网格",
    "",
    "Joe负责：数据库、API函数、位置权限配置",
    "Ethan负责：地图UI、Discovery界面、后台位置服务、称号排名UI",
  ];
  return lines.map(l => para(l, { size: 18 }));
}

// ─── Build full document ─────────────────────────────────────────────────────

async function buildDocument() {
  const children = [];

  // ── Title ──
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 120 },
      children: [
        new TextRun({ text: "SUDO App Development Task List", font: ARIAL, size: 44, bold: true, color: "1F3864" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({ text: "Joe (CSO) · Ethan (CEO)  |  March 2026", font: ARIAL, size: 22, color: "444444" }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 200 },
      children: [
        new TextRun({ text: "Confidential — Syracuse University", font: ARIAL, size: 20, italics: true, color: "666666" }),
      ],
    }),
  );

  // ── Tech Stack ──
  children.push(heading("Tech Stack", 2));
  children.push(buildTechStackTable());
  children.push(spacer());

  // ── Important Notes ──
  children.push(heading("Important Notes", 2));
  children.push(...buildNotesSection());
  children.push(spacer());

  // ── Module 0 (summary) ──
  children.push(heading("MODULE 0 — 环境配置与项目初始化", 2));
  children.push(para("Tasks 1–24: All COMPLETED ✅  (detailed listing skipped)", { bold: true, color: "276221" }));
  children.push(spacer());

  // ── Module 1 ──
  children.push(heading("MODULE 1 — Supabase后端配置", 2));

  // 1.1
  children.push(heading("1.1 数据库表结构", 3));
  children.push(buildTaskTable([
    [25, "Joe", "25_profiles — 创建profiles表", "Done"],
    [26, "Joe", "26_friendships — 创建friendships表", "Done"],
    [27, "Joe", "27_groups — 创建groups + group_members + messages表", "Done"],
    [28, "Joe", "28_posts — 创建posts + comments + likes表", "Done"],
    [29, "Joe", "29_offer_verifications — 创建offer_verifications表\n注：用户在app内打码裁剪截图后上传。AI提取学校名、专业、入学年份。截图24小时后自动删除。AI不通过可人工申述。", "Done"],
  ]));
  children.push(spacer());

  // 1.2
  children.push(heading("1.2 Realtime配置", 3));
  children.push(buildTaskTable([
    [30, "Joe", "开启4张表Realtime: messages, posts, likes, comments", "Done"],
    [31, "Joe", "创建Supabase客户端配置文件 lib/supabase.ts（AsyncStorage持久化session）", "Done"],
  ]));
  children.push(spacer());

  // 1.3
  children.push(heading("1.3 Storage配置", 3));
  children.push(buildTaskTable([
    [32, "Joe", "创建avatars bucket（Public）", "Done"],
    [33, "Joe", "创建post-images bucket（Public）", "Done"],
    [34, "Joe", "创建offer-screenshots bucket（Private）", "Done"],
    [35, "Joe", "配置storage访问策略（SQL）", "Done"],
  ]));
  children.push(spacer());

  // 1.4
  children.push(heading("1.4 实时地图功能（Google Maps + 探索系统）", 3));
  children.push(para("功能概述：", { bold: true }));
  children.push(...module14Overview());
  children.push(spacer());

  children.push(heading("1.4.1 Google Maps初始配置（Joe）", 3));
  children.push(buildTaskTable([
    [36, "Joe", "获取Google Maps API Key（已启用Maps SDK for iOS/Android + Places API）", "Done"],
    [37, "Joe", "配置app.json集成Google Maps", "Done"],
    [38, "Joe", "配置expo-location权限 + 后台位置追踪（app.json）", "Done"],
  ]));
  children.push(spacer());

  children.push(heading("1.4.2 数据库表（Joe）", 3));
  children.push(buildTaskTable([
    [39, "Joe", "给profiles表加location_sharing字段（precise/fuzzy/off，默认fuzzy）", "Done"],
    [40, "Joe", "创建user_locations表（实时位置存储，好友可读，RLS）", "Done"],
    [41, "Joe", "创建landmarks缓存表（Places API缓存，place_id，500m范围，30天有效期）", "Done"],
    [42, "Joe", "创建explorations表（visit_count、total_time_spent、today_time_spent、today_date、title_earned、first_visited_at）", "Done"],
    [43, "Joe", "开启user_locations Realtime", "Done"],
    [44, "Joe", "创建explored_tiles表（Discovery功能，网格坐标，zoom_level=15约100x100m）", "Done"],
  ]));
  children.push(spacer());

  children.push(heading("1.4.3 位置API函数（Joe）— lib/api/location.ts", 3));
  children.push(buildTaskTable([
    [45, "Joe", "写updateMyLocation函数\n- 获取GPS坐标，根据location_sharing处理后写入user_locations\n- precise: 真实坐标；fuzzy: ±500m偏移；off: 删除记录\n- 同时把坐标转成网格坐标写入explored_tiles", ""],
    [46, "Joe", "写getFriendLocations函数\n- 查询所有status=accepted好友的user_locations\n- 过滤掉location_sharing=off的用户，返回位置列表", ""],
    [47, "Joe", "写cacheNearbyPlaces函数（NEW）\n- 以用户坐标为中心，调用Places API查询500m内地点\n- 结果缓存到landmarks表，30天有效期\n- 若已有有效缓存则直接返回，不重复调用API", ""],
    [48, "Joe", "写discoverLandmark函数（UPDATED）\n- 前端检测用户停留2分钟后调用\n- 先查landmarks缓存，无缓存则调用cacheNearbyPlaces\n- 判断用户是否在某地点半径内（默认50-100m）\n- 查explorations表：第一次到达+10XP；今天已来过不处理；今天未来过+2XP\n- 时长奖励：停留30分钟普通+2XP/图书馆+3XP；停留60分钟普通+5XP/图书馆+8XP/食堂+6XP\n- 称号检查：visit_count=7初级，visit_count=30高级\n  图书馆:书虫/图书馆大王 食堂:干饭人/干饭大王 健身房:健身新手/健身狂人 咖啡厅:咖啡爱好者/咖啡上瘾者", ""],
    [49, "Joe", "写subscribeToFriendLocations函数（Realtime）\n- 用Supabase Realtime订阅user_locations表\n- 好友位置更新时实时推送到地图界面", ""],
    [50, "Joe", "写getExploredTiles函数（NEW）\n- 获取当前用户所有explored_tiles记录\n- 供Discovery模式前端渲染用", ""],
    [51, "Joe", "写getWeeklyRankings函数（NEW）\n- 动态计算每周各地点类型的停留时长排名\n- 返回前三名用户及其时长和称号", ""],
  ]));
  children.push(spacer());

  children.push(heading("1.4.4 地图UI（Ethan）— app/map/", 3));
  children.push(buildTaskTable([
    [52, "Ethan", "写MapScreen（主地图界面）\n- 使用react-native-maps的MapView\n- 显示：自己位置（宠物头像）、好友位置（好友宠物头像）\n- 右上角Discovery按钮", ""],
    [53, "Ethan", "实现好友位置显示\n- 从subscribeToFriendLocations获取实时位置\n- 好友宠物头像作为标记，点击显示名字和距离", ""],
    [54, "Ethan", "实现地标探索UI（UPDATED）\n- 用户停留2分钟后弹出探索提示\n- 调用discoverLandmark，显示XP奖励动画\n- 停留时长计时器，到达30/60分钟时通知后端并显示额外奖励\n- 称号解锁时弹出庆祝动画", ""],
    [55, "Ethan", "写位置分享设置界面\n- 精确定位 / 模糊定位（默认）/ 不分享\n- 切换时调用updateProfile更新profiles.location_sharing", ""],
    [56, "Ethan", "写Discovery模式界面（NEW）\n- 点Discovery按钮进入只读地图\n- 调用getExploredTiles获取已探索网格\n- 去过的网格：覆盖层消失；没去过的网格：半透明覆盖层\n- 只能滑动、缩放、退出，不可点击任何东西", ""],
    [57, "Ethan", "实现后台位置追踪服务（NEW）\n- 用expo-location后台模式\n- 用户授权『始终允许位置』后后台持续运行\n- 移动超过100米触发一次\n- 更新user_locations和explored_tiles\n- 后台不触发Places API（无法判断停留）", ""],
    [58, "Ethan", "写称号与每周排名界面（NEW）\n- 在个人主页显示用户获得的所有称号\n- 显示每周各地点类型排名（前三名）\n- 排名每周更新", ""],
  ]));
  children.push(spacer());

  // ── Module 2 ──
  children.push(heading("MODULE 2 — 用户注册与登录", 2));

  children.push(heading("2.1 Supabase Auth配置（Joe）", 3));
  children.push(buildTaskTable([
    [59, "Joe", "在Supabase开启Email Auth（Dashboard → Authentication → Providers → Email → Enable）", ""],
    [60, "Joe", "关闭Email Confirm（开发阶段，上线前再开启）", ""],
    [61, "Joe", "创建Auth Trigger：注册时自动创建profile（handle_new_user函数）", ""],
  ]));
  children.push(spacer());

  children.push(heading("2.2 注册/登录UI（Ethan）", 3));
  children.push(buildTaskTable([
    [62, "Ethan", "创建app/(auth)目录结构（login.tsx和register.tsx）", ""],
    [63, "Ethan", "写LoginScreen组件（邮箱、密码、登录按钮、跳转注册）", ""],
    [64, "Ethan", "写RegisterScreen组件（邮箱、密码、确认密码、注册按钮）", ""],
    [65, "Ethan", "实现登录逻辑（supabase.auth.signInWithPassword）", ""],
    [66, "Ethan", "实现注册逻辑（supabase.auth.signUp）", ""],
    [67, "Ethan", "写AuthContext（全局session状态管理）", ""],
    [68, "Ethan", "实现路由守卫（app/_layout.tsx检测session）", ""],
    [69, "Ethan", "写Onboarding流程（4步：填姓名+选学校 → 选宠物+命名 → 位置分享偏好 → 完成）", ""],
  ]));
  children.push(spacer());

  children.push(heading("2.3 Onboarding数据保存（Joe）", 3));
  children.push(buildTaskTable([
    [70, "Joe", "写updateProfile API函数（更新real_name、university、pet_name、pet_avatar_url、location_sharing）", ""],
  ]));
  children.push(spacer());

  // ── Module 3 ──
  children.push(heading("MODULE 3 — 双形象系统", 2));

  children.push(heading("3.1 宠物视觉资产准备（Ethan）", 3));
  children.push(buildTaskTable([
    [71, "Ethan", "准备10种宠物静态图片（512×512 PNG透明背景：cat, dog, dinosaur, ufo, dragon, rabbit, bear, fox, robot, ghost）", ""],
    [72, "Ethan", "把宠物图片放进assets/pets/目录", ""],
    [73, "Ethan", "创建PetImage组件（接收petType和size参数）", ""],
  ]));
  children.push(spacer());

  children.push(heading("3.2 身份切换状态管理（Ethan）", 3));
  children.push(buildTaskTable([
    [74, "Ethan", "创建identityStore（Zustand，存储real/pet模式，提供toggle()）", ""],
    [75, "Ethan", "创建IdentityToggle组件（可点击切换按钮，显示当前身份）", ""],
    [76, "Ethan", "在发消息时读取当前identity_mode，传给后端", ""],
  ]));
  children.push(spacer());

  children.push(heading("3.3 宠物经验值与升级", 3));
  children.push(buildTaskTable([
    [77, "Joe", "写addPetXP函数（发消息/发帖/评论/探索地标时调用，每100XP升一级）", ""],
    [78, "Ethan", "在个人主页显示宠物等级和经验条（宠物图、名字、Lv.X、经验条、宠物年龄）", ""],
    [79, "Ethan", "升级时显示动画提示（Lottie庆祝动画或Alert）", ""],
  ]));
  children.push(spacer());

  // ── Module 4 ──
  children.push(heading("MODULE 4 — 群聊与私聊", 2));

  children.push(heading("4.1 群组API（Joe）", 3));
  children.push(buildTaskTable([
    [80, "Joe", "写getMyGroups函数（获取用户所有群含私聊）", ""],
    [81, "Joe", "写createGroup函数（创建新群，记录name、university、group_type、chat_type）", ""],
    [82, "Joe", "写createDirectChat函数（检查好友关系，避免重复创建私聊）", ""],
    [83, "Joe", "写joinGroup函数（插入group_members，更新members_count）", ""],
    [84, "Joe", "写createOfficialGroups函数（每所大学自动创建申请群和新生群）", ""],
  ]));
  children.push(spacer());

  children.push(heading("4.2 实时消息（Joe）", 3));
  children.push(buildTaskTable([
    [85, "Joe", "写sendMessage函数（插入消息，调用addPetXP +1XP）", ""],
    [86, "Joe", "写subscribeToMessages函数（Realtime订阅指定群新消息）", ""],
    [87, "Joe", "写getMessages函数（获取最近50条消息，联表查询sender信息）", ""],
  ]));
  children.push(spacer());

  children.push(heading("4.3 群聊&私聊UI（Ethan）", 3));
  children.push(buildTaskTable([
    [88, "Ethan", "写GroupListScreen（含私聊列表，显示群名/最新消息/未读数）", ""],
    [89, "Ethan", "写GroupChatScreen（消息列表FlatList + 底部输入区域）", ""],
    [90, "Ethan", "写MessageBubble组件（根据identity_mode显示真人或宠物，注销用户显示『已注销用户』）", ""],
    [91, "Ethan", "写MessageInput组件（输入框 + IdentityToggle + 发送按钮）", ""],
    [92, "Ethan", "实现Realtime订阅（挂载时订阅，卸载时取消，防内存泄漏）", ""],
    [93, "Ethan", "写CreateGroupScreen（群名称、类型选择、创建按钮）", ""],
    [94, "Ethan", "写GroupDiscoveryScreen（本校可加入的群，按类型分类）", ""],
  ]));
  children.push(spacer());

  // ── Module 5 ──
  children.push(heading("MODULE 5 — 发帖与Feed", 2));

  children.push(heading("5.1 帖子API（Joe）", 3));
  children.push(buildTaskTable([
    [95, "Joe", "写createPost函数（插入帖子，支持5种可见性，宠物+3XP）", ""],
    [96, "Joe", "写getFeed函数（RLS自动过滤可见性，联表查询作者信息，支持分页）", ""],
    [97, "Joe", "写likePost和unlikePost函数（操作likes表，更新posts.likes_count）", ""],
    [98, "Joe", "写addComment函数（插入评论，宠物+2XP，更新posts.comments_count）", ""],
    [99, "Joe", "写getComments函数（获取指定帖子所有评论，联表查询评论者信息）", ""],
    [100, "Joe", "写图片上传函数（本地图片URI上传到Supabase Storage，返回公开URL）", ""],
  ]));
  children.push(spacer());

  children.push(heading("5.2 发帖UI（Ethan）", 3));
  children.push(buildTaskTable([
    [101, "Ethan", "写FeedScreen（FlatList显示帖子列表，支持下拉刷新和上拉加载）", ""],
    [102, "Ethan", "写PostCard组件（发帖者头像/宠物图、名字、内容、图片、点赞数、评论数、时间）", ""],
    [103, "Ethan", "写CreatePostScreen（文字输入、图片选择最多4张、IdentityToggle、可见性选择、发布按钮）", ""],
    [104, "Ethan", "实现图片选择（expo-image-picker，多选，quality: 0.8）", ""],
    [105, "Ethan", "写PostDetailScreen（完整帖子+评论列表+评论输入框，支持真人/宠物切换）", ""],
  ]));
  children.push(spacer());

  // ── Module 6 ──
  children.push(heading("MODULE 6 — Offer验证与新生群", 2));

  children.push(heading("6.1 Offer验证后端（Joe）", 3));
  children.push(buildTaskTable([
    [106, "Joe", "创建Supabase Edge Function: verify-offer\n- 使用Claude claude-sonnet-4-6 Vision API解析已打码裁剪的Offer截图\n- 提取：大学名称、学生姓名（验证用）、入学年份\n- 返回JSON格式结果\n- 验证通过后截图标记24小时后删除", ""],
    [107, "Joe", "设置ANTHROPIC_API_KEY环境变量（Supabase Dashboard → Edge Functions → Secrets）", ""],
    [108, "Joe", "写前端调用Edge Function的函数（supabase.functions.invoke传入imageBase64和userId）", ""],
    [109, "Joe", "验证通过后：1.更新profiles.university + offer_verified=true 2.找到该校官方新生群并加入 3.触发解锁该校专属宠物服装", ""],
  ]));
  children.push(spacer());

  children.push(heading("6.2 Offer上传UI（Ethan）", 3));
  children.push(buildTaskTable([
    [110, "Ethan", "写OfferUploadScreen（说明文字、上传按钮、预览图、提交按钮、验证状态）", ""],
    [111, "Ethan", "实现图片打码裁剪工具（用户上传后可在app内打码/裁剪敏感信息）", ""],
    [112, "Ethan", "实现图片转base64（expo-file-system的readAsStringAsync）", ""],
    [113, "Ethan", "实现完整验证流程（上传 → 打码裁剪 → 调用Edge Function → loading → 显示结果）", ""],
    [114, "Ethan", "验证成功后显示庆祝界面（学校名称、宠物新皮肤提示、进入新生群按钮）", ""],
  ]));
  children.push(spacer());

  // ── Module 7 ──
  children.push(heading("MODULE 7 — 导航与主框架", 2));
  children.push(buildTaskTable([
    [115, "Ethan", "配置底部Tab导航（5个Tab：首页Feed、群聊/私聊、地图、发布+按钮、个人主页）", ""],
    [116, "Ethan", "写ProfileScreen（真人头像、真实名字、SudoID、学校、宠物形象、等级经验条、称号、帖子列表）", ""],
    [117, "Ethan", "写SettingsScreen（修改显示名字、位置分享设置、是否公开真人与宠物关联、退出登录）", ""],
    [118, "Ethan", "实现推送通知配置（expo-notifications请求权限，注册Expo Push Token）", ""],
  ]));
  children.push(spacer());

  // ── Module 8 ──
  children.push(heading("MODULE 8 — 上线准备", 2));

  children.push(heading("8.1 TestFlight内测（iOS — Joe）", 3));
  children.push(buildTaskTable([
    [119, "Joe", "配置EAS Build（eas build:configure → All platforms）", ""],
    [120, "Joe", "打包iOS测试版（eas build --platform ios --profile preview）", ""],
    [121, "Joe", "上传到TestFlight（eas submit --platform ios）", ""],
    [122, "Joe", "邀请10个内测用户（App Store Connect → TestFlight → 添加邮箱）", ""],
  ]));
  children.push(spacer());

  children.push(heading("8.2 Android内测（Ethan）", 3));
  children.push(buildTaskTable([
    [123, "Ethan", "打包Android测试版（eas build --platform android --profile preview，生成APK）", ""],
    [124, "Ethan", "直接把APK发给Android测试用户安装（开启『允许未知来源』）", ""],
  ]));
  children.push(spacer());

  children.push(heading("8.3 App Store正式上线（Joe）", 3));
  children.push(buildTaskTable([
    [125, "Joe", "准备App图标（1024×1024 PNG，无透明背景，无圆角）", ""],
    [126, "Joe", "准备App Store截图（6.5inch和5.5inch，各至少3张）", ""],
    [127, "Joe", "写App Store文案（标题SUDO - Campus Community，描述，关键词）", ""],
    [128, "Joe", "创建隐私政策页面（sudocollege.com/privacy，需注明位置数据收集方式）", ""],
    [129, "Joe", "提交App Store审核", ""],
  ]));
  children.push(spacer());

  children.push(heading("8.4 Google Play正式上线（Ethan）", 3));
  children.push(buildTaskTable([
    [130, "Ethan", "准备Google Play截图和图标（另需Feature Graphic：1024×500 PNG）", ""],
    [131, "Ethan", "提交Google Play审核", ""],
  ]));
  children.push(spacer());

  children.push(heading("8.5 上线前检查清单", 3));
  children.push(buildTaskTable([
    [132, "Both", "所有页面在iPhone和Android上正常显示（字体、按钮、键盘布局）", ""],
    [133, "Both", "注册→Onboarding→进群聊→发消息完整流程跑通", ""],
    [134, "Both", "发帖→点赞→评论完整流程跑通", ""],
    [135, "Joe", "Supabase开启Email Confirm（上线前必须）", ""],
    [136, "Joe", "RLS所有表都已开启并测试（用不同账号尝试越权访问）", ""],
    [137, "Joe", "Offer验证在真实截图上测试通过（至少3所不同大学）", ""],
    [138, "Joe", "实时消息：两台设备互发消息，确认即时到达", ""],
    [139, "Joe", "地图功能：好友位置实时更新测试（验证模糊定位偏移正常工作）", ""],
    [140, "Joe", "地标探索测试（实地测试触发探索，XP正确增加）", ""],
    [141, "Joe", "Discovery模式测试（已探索区域覆盖消失，未探索区域有覆盖层）", ""],
    [142, "Joe", "称号和排名系统测试", ""],
  ]));
  children.push(spacer());

  // ── Current Progress ──
  children.push(heading("Current Progress", 2));
  children.push(para("Tasks 25–44: All COMPLETED ✅", { bold: true, color: "276221", size: 20 }));
  children.push(para("Next task: Task 45 — writeUpdateMyLocation function", { bold: true, color: "C00000", size: 20 }));

  // ─── Assemble Document ────────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: ARIAL, size: 20 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, bottom: 720, left: 900, right: 900 },
          },
        },
        children,
      },
    ],
  });

  return doc;
}

// ─── Main ────────────────────────────────────────────────────────────────────

(async () => {
  const outPath = "C:\\Users\\joe19\\Downloads\\SUDO_Task_List_v3.docx";
  console.log("Building document...");
  const doc = await buildDocument();
  console.log("Packing DOCX...");
  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outPath, buffer);
  const stats = fs.statSync(outPath);
  console.log(`\nSuccess! File written to: ${outPath}`);
  console.log(`File size: ${(stats.size / 1024).toFixed(1)} KB`);
})();
