# dsh-firefly-forest

![萤火森林](assets/screenshot-1.png)

萤火森林：给 DeepSeek Harness（dsh）的界面后面垫一层夏夜的灌木林 —— 草叶上的萤火虫呼吸明灭，飞过的光点偶尔照亮树枝上的猫头鹰，或者叶子上的蛾子。

An ambient firefly forest behind the DSH Web UI: a dark shrub layer, breathing fireflies on grass blades, and an owl or a moth that lights up when a drifting spark passes by.

从 v0.3 起，它不再是一组动画，而是几个会自己运转的系统：**夜在走、风在吹、每只虫子有自己的作息**。

## 装 / Install

在 DSH Desktop 的 **设置 → 插件** 里搜索「萤火森林」安装（收录进市场之后），或者用命令行从本地包安装：

```sh
# 从本仓库 Release 里的预构建包安装
dsh plugin --profile web add ./dsh-firefly-forest.tgz
```

装好后刷新一次窗口（Desktop 端需要重启 Harness）。

## 效果 / What it does

**夜之流 / Night flow**

- 一夜压缩成 45 分钟：入夜 → 深夜 → 将明，色温、雾、月光、虫量、声音都跟着相位连续变化
- 午夜之后萤火虫变少变慢；将明时分草叶尖上开始有露水
- 关掉窗口再打开，森林不会重置——相位存在 localStorage 里，接着走
- 面板里有一条 2px 的夜进度线，点一下可以快进一个时相

**风场 / Wind**

- 全局风向量驱动草叶、雾、落叶、雨丝和萤火虫的漂移，每 16–42 秒来一阵风
- 阵风时草整片倒向一边、雾跑得更快、风声变大，雨丝也更斜
- 鼠标不再把萤火虫「吸」过去：慢慢靠近它们会聚拢但保持一圈距离；快速划过会在风场里留下一个短命涡旋，把一串虫子卷成一道弧

**萤火虫 / Fireflies**

- 每只有自己的色温、闪频和作息：大部分时间落在草叶尖上，只有一段时间在飞，落下来时会慢慢贴住叶尖
- 两只离得近又相位接近会「对闪」——同步闪两下，然后各自飞开
- 被照亮的东西（蛾子、猫头鹰、狐狸、龙猫的灯）会把附近的虫吸引过去，形成几秒的光团

**现实锚点 / Real-world anchors**

- **月相**：按朔望月算今晚的月亮，满月时月光更亮、虫更少（真实生态），新月最暗、星最多
- **苏醒**：每天第一次打开，萤火虫从草里慢慢升起来；之后打开直接亮着
- **蛛网**：草叶间偶尔结网，极低概率粘住一只光点，暗下去又亮起来再挣脱
- **声音有方位**：鼠标在左半边，环境音偏左；右半边偏右

**其它 / The rest**

- 暗色灌木林与草叶剪影，薄雾与极弱的月光
- 偶尔一只萤火虫飞近树枝，先点出两点眼睛反光，再照亮猫头鹰的轮廓
- 全窗口 canvas，垫在界面后面，不拦截鼠标；约 30fps，页面隐藏时暂停，尊重「减少动态效果」
- 在带工作台的客户端（如 DSH Desktop）里多一个「萤火森林」面板
- 关闭开关或卸载插件即恢复原界面；设置存在浏览器 localStorage，不联网

## 面板 / Panel

面板里有：**夜之流进度线**（点击快进）、总开关、萤火虫亮度、密度、猫头鹰频率、界面透明化、叠加模式、季节、**允许扰动**（是否让鼠标带起风），以及环境音与音量。

## 兼容性 / Compatibility

- 面向 **DSH Desktop**：背景由 `theme` 服务驱动，「萤火森林」工作台面板由 `desktopWorkbenches` 服务提供
- 纯 `dsh web`（没有 `desktopWorkbenches`）上，客户端会等待该服务，背景暂不启动——这一条会在后续版本拆开，见 `CHANGELOG.md`

## 开发 / Development

- 客户端入口：`lib/client.js`（单文件，`window.__ModuleLoader__.load`）
- 服务端入口：`dsh/index.js`（空插件，只为把 bundle 挂进插件树）
- 预览：直接用浏览器打开 `preview/index.html`
- 设计提案：`DESIGN.md`（v0.3 已实现，v0.4 的天气链与界面感知在里面）
- 打包：`npm pack`，产物用 DSH Desktop 的本地安装流程装进 profile

## 许可 / License

MIT
