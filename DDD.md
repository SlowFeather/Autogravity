# Autogravity 领域驱动设计 (DDD) 文档

本系统架构文档遵循领域驱动设计（Domain-Driven Design, DDD）原则，对 **Autogravity** 插件的业务边界、核心领域模型及系统交互机制进行了专业化的抽象与定义，确保功能迭代扩展的结构正确性。

## 1. 🎯 核心愿景 (Core Vision)
为 **Antigravity** (基于 VSCode 的智能化 AI 编程基座) 提供极其鲁棒的跨终端管控与 UI 智能自动化操作能力。解决开发者在面对大语言模型产生分步操作需要进行繁杂的 "Accept" 与多级流转确认时产生的枯燥痛点，促成项目的真正“多循环自动运行”。

---

## 2. 🗂️ 领域划分 (Domain Definations)

我们围绕 Autogravity 的业务需求，将其划分为两个核心子域 (Core Subdomains) 和一个支撑子域 (Supporting Subdomain)：

### 2.1 UI 自动化子域 (UI Automation Domain)
- **类型：** 核心领域 (Core Domain)
- **职责：** 通过 Chrome DevTools Protocol (CDP) 发现目标并挂载至 Antigravity Webview。下发 JavaScript 轮询与识别策略，突破普通的 VSCode 插件 API 沙箱。
- **通用语言:**
  - **CDP Bridge:** 扫描指定本地端口靶区，过滤调试目标并维持双向 Socket 链接。
  - **Auto-Acceptor Core:** 极精准的多层复合 DOM 特征策略轮询。

### 2.2 跨端管控子域 (Remote Control Domain)
- **类型：** 核心领域 (Core Domain)
- **职责：** 暴露出网络微服务设施端点。将自动化进展状态对外进行信息推送及接收移动端或内外命令控制。
- **通用语言:**
  - **Express Server Node:** 内嵌的网页网关。
  - **Client Session Worker:** 跟踪、管理长链接的活跃度并发布指令派发操作。

### 2.3 宿主支撑子域 (Host Lifecycle Domain)
- **类型：** 支撑领域 (Supporting Domain)
- **职责：** 接管原生 VSCode 状态栏（StatusBar）与启动参数读取，做宿主环境适配及 UI 重构。

---

## 3. ⚙️ 核心规则设计演进：Automation Engine

我们采用了一套高可用性的“基于类特征与可见性并举”的双向规则驱动引擎（The Bi-directional Rule Engine）来治理杂乱的 VSCode DOM Tree。由于 Antigravity 及 VSCode 经常拼接按键快显（如 `AcceptAlt+O`），单凭文本进行模糊识别不可靠，因此架构逐步升级：

1. **排除规则 (Exclude Rules)**：
   - 防死区：排查由于应用隐藏态导致的无效点击。`(offsetWidth === 0 && offsetHeight === 0)`。
   - 聊群干预：长对话文本气泡内容隔离过滤规避 `accept`。
   - 操作保护：识别上级父容器具有特定描述特征（如 `ran background command` 的模块块状化隔离）避开其按钮行为。

2. **多态穿墙机制 (Quick Pick & List Priority)**:
   针对 Agent 批量改文件产生的 `View X edited files`，自动化引擎通过第一顺理抓取 `.quick-input-widget` 及特定 `.monaco-list-row` 子菜单层级赋予特定最高提权操作。从而直接穿透普通名单对 List 列表类对象的严密封锁。这就实现了自动化逻辑流程的闭环：
   从“全局 Accept” -> “View Files 展开” -> “自动落子 Quick Pick 面板的第一个行对象” -> “转入 Diff 视图进行单体确认继续循环”。

3. **确切命中特性匹配 (Exact Class Pattern Matching)**：
   规避快捷键尾缀空格的缺失问题，采用深层 CSS Token 比对如： `.keep-changes`, `.diff-hunk-button accept` 等保证高优确准投送，避免文本变化或多语种翻译造成脱靶。
