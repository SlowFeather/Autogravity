# Autogravity 自动化增强插件

**Autogravity** 是一款专为 **Antigravity**（基于 VSCode 深度定制的 AI 智能编程助手）打造的高效辅助插件。通过底层的 Chrome DevTools Protocol (CDP) 穿透 VSCode 的安全沙箱，提供全链路的 UI 外挂级自动化能力，致力于消灭研发人员与 AI 协同工作时“繁琐的按键接力”，实现真正的“无人值守”。

## 🌟 核心特性 (Features)

### 1. 🤖 极致全能的自动确流 (Smart UI Automation)
基于独立解耦的高精度 DOM 扫描规则集与 **Node 端后台安全轮询引擎**，彻底释放您的双手：
- **全局动作自动执行**：智能捕获界面的 `Accept`, `Run`, `Accept all`, `Always allow` 等核心按键。
- **底层 CDP 仿真点击**：放弃容易被现代前端框架拦截的原生 `element.click()`，直接向系统抛入最底层的 `Input.dispatchMouseEvent` 物理仿真鼠标事件。并配有 JavaScript 派发回退策略，确保任何深层嵌套（如 `iframe`）内的按钮都被真实触发。
- **深度 Diff 视图审阅闭环**：不仅支持侧边小钩子（Codicon）和普通的 `Accept Changes`，现已全面攻克悬浮工具栏！完美支持 `diff-review` 底部浮层、内联 `peek-view`、`zone-widget` 等高阶组件内的带快捷键操作，自动识别点击 `< Edited files 1/10 >` 及 `Next Change` 导航箭头，形成无缝多文件连跳。
- **智能防误触防御塔**：配备了高达十余项的细化屏蔽规则。严密隔离源码编辑区 (`monaco-editor`)、纯文本消息框、聊天气泡结构以及终端日志打印等区域，确保任何无意义点击操作被彻底拦截。

### 2. 🧩 现代化的解耦架构 (Modular Architecture)
- 彻底摒弃了传统的单一上帝类设计，拆分为极为清爽的 `Connection` (连接维持), `Scanner` (调度与点击), `Rules` (特征库) 子模块。提供高可维护性的拦截与放行微内核，保证长线开发的稳定迭代。

### 3. 📱 跨端远程控制 (Remote Control Server) *(规划中 / 暂未开放)*
- 插件在启动激活时，将自动在后台拉起轻量级 Web 服务器，后续支持通过局域网内的手机终端访问查阅进度。

## 🎯 业务价值 (Value)
在依靠 AI Agent 处理跨多文件的复杂重构作业时，开发者经常被迫卡在“等待下一步点击”的阻塞态中。借助 Autogravity，你彻底告别了“陪聊”和“陪坐”。只需按下一个开关，成百上千次的比对合并与动作确认将由机器连贯般自动代劳，帮您把精力重新聚焦于上层业务架构层面的深度思考设计中。

## 🛠️ 安装与使用
1. 请确保您的 VSCode 或衍生启动器开启了底层远程调试端口（添加启动参数如：`--remote-debugging-port=9222`）。
2. 安装项目编译输出的 `.vsix` 扩展包，您会在编辑器右下角发现专属的 Status Bar Item（也可以呼出命令面板输入 `Toggle Auto Accept`）。
3. 一键切换开关开启引擎，指示器变红即代表自动化引擎已开始为您代理视觉搜寻工作。

## 📖 文档指南 (Documentation)
查阅 [DDD 领域驱动设计文档](./DDD.md) 了解插件详细的系统子域边界与底层核心组件演进方向。