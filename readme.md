# Autogravity 自动化增强插件

**Autogravity** 是一款专为 **Antigravity**（基于 VSCode 深度定制的 AI 智能编程助手）打造的高效自动化增强插件。本插件通过 Chrome DevTools Protocol (CDP) 穿透 VSCode 的安全沙箱，提供全链路的 UI 自动化和远程管控操作能力，致力于提升研发人员与 AI 协同工作时的流畅度与“无人值守”效率。

## 🌟 核心特性 (Features)

### 1. 🤖 极致的全能自动确流 (Smart UI Automation)
借助强大的底层 DOM 扫描规则集，释放您的双手，使复杂长线的 Agent 任务永不阻塞：
- **全局动作自动执行**：智能捕获界面的 `Accept`, `Run`, `Accept all`, `Always allow`。
- **Diff 与文件操作**：精准定位修改对比视图（Diff）的 `Accept Changes` 按钮，以及在边侧栏中单行文件修改旁边的行内 `Accept` 小钩子（Codicon）。
- **多文件批量审批循环处理**：全自动识别并点击 `View X edited files` 进入验收列表，接着智能点选 `Search for files edited by Agent` 的 Quick Pick 候选行，直接形成无人值守的验证闭环。
- **智能化防误触机制**：拥有完善的屏蔽规则。排除文本消息框、聊天气泡结构以及用户运行的后台特定日志块，规避无意义交互。通过类名(class) 侦察，即使面对带有快捷键后缀的操作（如 `Accept Ctrl+⏎`）也将精准点击且不被干扰。

### 2. 📱 跨端远程控制 (Remote Control Server)
- 插件在启动激活时，将自动在后台拉起轻量级 Web 伺服器服务。
- 提供控制面板，支持通过手机或局域网内的其它终端设备访问，查阅进度或进行任务控制的切换。

## 🎯 业务价值 (Value)
在传统模式下，通过 AI Agent 大幅改动结构化项目或多步分析容易处于等待人工点击（Accept）干预的阻塞状态。借助 Autogravity，开发者不需要时刻守在电脑前。插件的多端控制与细颗粒度 UI 自动化闭环确认逻辑可帮助您更加专注于核心架构设计。

## 🛠️ 安装与使用
1. 请确保您的 VSCode 或衍生启动器带有开启了远程调试端口的参数，如：`--remote-debugging-port=9222`。
2. 安装 `.vsix` 扩展包并在界面右下角找到 Status Bar Item （或命令面板调用 `Toggle Auto Accept`）。
3. 随时通过原生状态栏随时随地启停监听即可享受全自动化之旅。

## 📖 文档指南 (Documentation)
查阅 [DDD 领域驱动设计文档](./DDD.md) 了解插件的系统架构与底层设计演进。