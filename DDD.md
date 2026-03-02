# Autogravity 领域驱动设计 (DDD) 文档

本系统架构文档遵循领域驱动设计（Domain-Driven Design, DDD）原则，对 **Autogravity** 插件的业务边界、核心领域模型及系统交互机制进行了专业化的抽象与定义，确保功能迭代扩展的结构正确性。

## 1. 🎯 核心愿景 (Core Vision)
为 **Antigravity** (基于 VSCode 的智能化 AI 编程基座) 提供极其鲁棒的跨终端管控与 UI 智能自动化操作能力。解决开发者在面对大语言模型产生分步操作需要进行繁杂的 "Accept" 与多级流转确认时产生的枯燥痛点，促成项目的真正“多循环自动运行”。

---

## 2. 🗂️ 领域划分 (Domain Definations)

我们围绕 Autogravity 的业务需求，将其划分为三个核心子域 (Core Subdomains) 和一个支撑子域 (Supporting Subdomain)：

### 2.1 自动化扫描与点击子域 (Scanner & Execution Domain)
- **类型：** 核心领域 (Core Domain)
- **职责：** 构建页面端查找靶点（DOM）的特征表达式，并执行最终的点击动作。
- **通用语言:**
  - **Button Finder:** 负责拼装复合的 JS IIFE 表达式，下发到目标环境识别按钮坐标。
  - **Click Executor (Two-tier Strategy):** 采用双层点击降级策略，优先使用底层 `CDP Input.dispatchMouseEvent` 模拟真实硬件鼠标点击，若环境受限则回退至纯 JS `dispatchEvent` 模式点击。

### 2.2 连接管控子域 (CDP Connection Domain)
- **类型：** 核心领域 (Core Domain)
- **职责：** 通过 Chrome DevTools Protocol (CDP) 维持与 VSCode 内核 (Electron) 的长链接通道，突破原生的沙箱屏障。
- **通用语言:**
  - **CDP Client Node:** 扫描指定本地端口靶区，筛选 `page`, `webview`, `iframe` 等目标靶点。
  - **Dynamic Target Reconnection (Hot Plug):** 实时感知新弹出的 Manager 外部面板，热挂载 CDP 长链接，防止漏网。

### 2.3 规则治理子域 (Rules Governance Domain)
- **类型：** 核心领域 (Core Domain)
- **职责：** 管理极为复杂的 DOM 特征匹配法则，决定哪些被认定为“有效自动化按钮”，哪些必须“被屏蔽以防误触”。目前已实现彻底的物理拆分独立。
- **通用语言:**
  - **Include Rules (命中守卫):** 确定可执行的操作（如 `Accept`, `Run`, `Next Change`, 高阶 Diff 浮层）。
  - **Exclude Rules (排除守卫):** 严密屏蔽无意义或危险的区域（如 `monaco-editor` 源码编辑区、聊天文本气泡、侧边栏文件树）。

### 2.4 宿主支撑子域 (Host Lifecycle Domain)
- **类型：** 支撑领域 (Supporting Domain)
- **职责：** 接管原生 VSCode 状态栏（StatusBar）的 UI 生命周期控制、指令注册以及配置参数读取。

---

## 3. ⚙️ 核心架构演进 (Architecture Evolution)

为了应对日益复杂的 DOM Tree 变动和不可靠的简单文本匹配，Autogravity 的底层自动化引擎经历了彻底的**模块化重构 (Modularization)**：

### 3.1 极简的松耦合组件化
原先庞大的上帝核心类被完美拆解为协同工作的独立微模块：
1. **`CDPManager` (顶层协调器):** 仅负责处理定时轮询心跳 (Polling) 和调度各子系统工作，控制插件全局启停。
2. **`connection` (连接层):** 切断了与其他业务的强聚合，专注抛出有效活跃的通信连接。
3. **`scanner` (执行层):** 将 DOM AST 解析诊断逻辑与系统级鼠标下压逻辑切开，确保行为的纯粹与可控。
4. **`rules` (规则层):** 形成完全独立的策略特征库，日后增补规则（如支持新出现的弹窗组件）只需向纯 JS 导出文件中添加匹配钩子即可，无需侵入核心引擎。

### 3.2 高阶浮层穿墙与闭环操作组件集
面对新版 VSCode 与 Antigravity 复合界面的特殊结构：
- **Diff 审阅浮层全面接管:** 升级并构建了强力白名单认证通道，在复杂的 `diff-review` (底部操作栏)、`peek-view` (内联弹窗)、`zone-widget` 等原本容易被父级屏蔽规则抹杀的高阶组件内，强势放行带有快捷键的 `Accept Changes` 。
- **批量审单的文件轮转:** 原生精准拦截处理并触发自动化向后翻页逻辑（例如 `< Edited files X/Y >` ），直接打通了批作业的自动化闭环流水线：
  由最初的 **全局 Accept** -> **批量 View Files 面板展开** -> **自动落子挑选修改对象** -> **深入 Diff 对比界面** -> **连续循环 Accept 与 Next Change 下一单**，构成了终极连环无人值守技流。

### 3.3 Node-Side 心跳轮询与死者苏生
全面废弃嵌入页面的驻留定时器，采用高可靠的远端 Node 主进程 `pollTimer` 下发心跳指令。杜绝了受由于前端页面跳转重刷而导致脚本遗失的断连风险；并在主动停用插件时向所有通道散布强力 GC (`cleanupCode`)，干净优雅地摧毁页面残留脏对象与定时器。
