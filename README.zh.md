# Worldlet

Worldlet 是给你已经在用的 AI Agent 配的一个桌面 World。它跑在你自己的 Agent 之上（OpenClaw、Hermes Agent、Claude Code、Codex 或 pi），沿用它的登录、模型和记忆，给它一个你看得见的工作场所：一个由地点和 Applet 组成的小小立体世界，一个放着需要你处理的事的 Attention Center，还有你可以对话的伙伴 Fox。

World 由 AI 来操作，你在一旁看着、做决定。支持 Mac 和 Windows，另有 iPhone 和 Android 伴侣 App。

- 许可证：[Apache License 2.0](LICENSE)；第三方声明见 [NOTICE](NOTICE)
- [参与贡献](CONTRIBUTING.md)、[安全问题报告](SECURITY.md)、[英文 README（权威版本）](README.md)

## 给谁用

已经在用 Agent 的人。你以前用它做的事都能继续做：Worldlet 通过你的 Agent 对话，用它已有的连接和技能，并把它的历史同步进 World。还没有 Agent 的话，Worldlet 会在第一次启动时帮你装一个标准的 [Hermes Agent](core/agent/PORTABILITY.md#local-harnesses-chosen-at-setup)。

Worldlet 不提供自己的模型。Fox 用的是你电脑上已有的东西：你的 Agent、Codex 登录，或者你自己的 API key。

## 用电脑来类比

| 电脑 | AI 时代 | 归谁 |
| --- | --- | --- |
| CPU | 模型 | 你的模型提供方（你自己的登录或 API key） |
| 内核 | Harness：Hermes Agent、OpenClaw、Claude Code、Codex、pi | 你选，可以替换 |
| 驱动和钥匙串 | MCP 服务器、连接器和它们的令牌 | 你的 Harness；Worldlet 借用 |
| 终端 | 聊天 App 和命令行 | Agent 现在待的地方 |
| 图形界面 | Worldlet：World、Applet、Fox、Attention Center | 本项目 |
| 系统 API | World 工具，通过 `worldlet` MCP 服务器提供给 Agent | 本项目 |
| 磁盘 | 你电脑上的 `world.sqlite` 和 World 存储 | 本项目 |

World → Agent 的工具走 MCP；Agent → World 每种 Harness 一个适配器（[Harness 契约](contracts/HARNESS.md)、[交互式架构图](docs/architecture.html)）。

## 安装

Mac 和 Windows 的签名版在 [worldlet.ai](https://worldlet.ai/download/)（预览期需要邀请码）。签名版就是本仓库某个打了标签的提交的正式构建。

## 从源码构建

需要 Node.js 22.19 或更高版本。

```sh
npm ci
npm run setup:hermes   # 没选其他 Agent 时 Fox 用的固定版本 Hermes 运行时
npm run dev            # 带监视的开发构建
npm run build          # 构建一次界面和 Electron 宿主
npm run package        # 为当前系统打包桌面 App（不签名）
```

构建不需要任何账号、密钥或托管服务。检查：`npm run check:pr`（类型、架构和契约边界、文档、源码布局、样式）和 `npm test`。

## 仓库目录

| 目录 | 负责 |
| --- | --- |
| `ui/` | 共享渲染和交互：World、Applet、Fox、Attention Center |
| `core/` | 与平台无关的产品规则和数据 |
| `platform/` | Electron 宿主：系统集成、浏览器引擎、受控执行 |
| `harness/` | Agent 后端和参考 Harness 适配器 |
| `contracts/` | 宿主和 Agent 共用的接口与数据形状 |
| `resources/` | 世界、风格、美术、字体和媒体 |
| `ios/`、`android/` | 手机伴侣：Attention Center 和 Fox，扫码配对，经端到端加密中继连到电脑 |
| `scripts/`、`docs/` | 构建、校验和贡献指南 |

## 隐私

本地优先：没有 Worldlet 账号，你的记录都在你电脑上的 `world.sqlite` 里。官方构建会上报基础使用统计（设置、连接和核心操作的结果，绝不包括消息内容、连接的内容或浏览记录），可以在 设置 › 隐私 里关掉，详见[统计说明](core/diagnostics/ANALYTICS.md)。你自己构建的版本不上报任何东西，除非你配置了自己的 PostHog 项目。

## 文档目录

| 主题 | 入口 |
| --- | --- |
| 产品原则 | [Charter](docs/CHARTER.md) |
| 五层结构与组件边界 | [架构](docs/UI-CORE-PLATFORM.md)、[架构图](docs/architecture.html) |
| 交互、HUD 与 Applet 状态 | [设计](docs/DESIGN.md) |
| 世界构成与环境 | [世界布局](docs/WORLD-LAYOUT.md) |
| Applet 生命周期与执行 | [Applet 运行时](docs/APPLET-RUNTIME.md) |
| 有依据的发现与条目生命周期 | [Attention Center](docs/ATTENTION-CENTER.md) |
| Fox 对话与协助 | [Fox](docs/FOX-AGENT.md) |
| 更换 Harness 与可携带记录 | [Agent 可移植性](docs/AGENT-PORTABILITY.md) |
| 数据归属与生命周期 | [World 存储](docs/WORLD-STORAGE.md) |
| 贡献与验证 | [开发](docs/DEVELOPMENT.md) |
| Applet 制作 | [设计指南](ui/applets/DESIGN-GUIDE.md)、[实现指南](ui/applets/IMPLEMENTATION-GUIDE.md) |

完整文件清单见[英文 README](README.md#complete-inventory)。
