<!-- source: README.md@be41b52a2769 -->
<p align="center">
  <img src="../../assets/ragu-banner.png" alt="Ragu" width="720">
</p>

<p align="center"><strong>一个始终与代码保持一致、并且你的智能体真正能用的知识库。</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-ragu"><img alt="npm" src="https://img.shields.io/npm/v/create-ragu?label=npm&color=c0392b"></a>
  <a href="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml/badge.svg"></a>
  <a href="../../LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-cream"></a>
</p>

<p align="center"><sub><a href="../../README.md">English</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.pt-BR.md">Português</a></sub></p>
<p align="center"><sub>本文由 AI 从英文 README 翻译而来，英文版为准；完整文档为英文。欢迎修正。</sub></p>

Ragu 为业务规则、流程、集成和决策提供一个 markdown 知识库，并带来大多数文档方案所缺少的三样东西：

1. **每个页面都引用它所描述的代码**（`sources: api/src/billing/refund.ts:42`），引用或链接失效时构建即失败。
2. **智能体通过 MCP 读取它**：本地一条命令即可，或部署在 Cloudflare 上并支持语义搜索。
3. **一个智能体插件让它保持同步。** 代码改了而文档没改时，智能体会在宣布任务完成之前被拦下，并拿到引用了这些改动文件的页面清单。

人类则从同一批文件得到一个 [Starlight](https://starlight.astro.build) 站点和一个 Obsidian 库。没有任何东西藏在服务背后：只是 markdown、一个 JSON 配置和几百行 Node。

<p align="center">
  <img src="../../assets/ragu-flow.svg" alt="Code changes reach the agent; the plugin writes the knowledge base and reads it over ragu-mcp; pages cite code back with sources; the build publishes site, vault and llms.txt" width="720">
</p>

## 快速开始

要求：Node ≥ 20、git，以及[下表](#支持的智能体)中的一个智能体。

**1. 创建知识库**，放在它要记录的代码仓库旁边。向导会询问系统（`api:../api, web:../web`），连接每个仓库（`AGENTS.md` 块、`.mcp.json`），并提供安装插件的选项。

```bash
npx create-ragu knowledge-base
```

**2. 为你的智能体安装插件**（按用户安装；如果你在向导里选了是，Claude Code 的已经装好）：

```bash
claude plugin marketplace add pedrohfonseca81/ragu && claude plugin install ragu@ragu
```

**3. 从代码生成文档**，一次一个系统：

```
/ragu-init api
```

这个 skill 会梳理仓库、询问要创建哪些页面，然后以 `status: inferred` 和 `file:line` 来源写出它们。审阅后，把正确的页面标为 `human_reviewed: true`，逐个系统重复。在知识库里运行 `npm run dev` 启动站点；`npx ragu-mcp` 就是你的智能体已经接入的 MCP 服务器（[详情](../agents.md#ragu-mcp)）。

或者把整件事交给智能体：在存放代码仓库的目录里粘贴以下内容。

```
Read https://raw.githubusercontent.com/pedrohfonseca81/ragu/main/AGENT-SETUP.md and set up Ragu for this project.
Systems: api (./api), web (./web). Knowledge base at ./knowledge-base.
```

## 支持的智能体

| Harness | 状态 |
|---|---|
| Claude Code | ✅ 支持 |
| Antigravity (IDE, `agy` CLI) | ✅ 支持 |
| Codex CLI | ❌ 不支持 |
| OpenCode | ❌ 不支持 |
| Cursor | ❌ 不支持 |
| GitHub Copilot | ❌ 不支持 |
| Windsurf | ❌ 不支持 |
| Cline | ❌ 不支持 |
| Kiro | ❌ 不支持 |

“支持”意味着 Stop hook、skills 和 MCP 三者齐全。不支持的 harness 仍然可以通过 MCP 读取知识库（`npx -y ragu-mcp`，[配置](../agents.md#any-mcp-client)）并遵循 `AGENTS.md` 中的规则，但没有任何机制阻止它带着过时的文档结束任务。适配器进展见 [#1](https://github.com/pedrohfonseca81/ragu/issues/1)；新增一个只需[一个函数](../hook.md#adding-a-harness)。网页版 claude.ai 使用[远程服务器](../remote-mcp.md#oauth--cloudflare-access-for-claudeai-on-the-web)。

不会向你的仓库写入任何 harness 专属的内容：`install` 只留下 `AGENTS.md`、`CLAUDE.md` 和 `.mcp.json`，插件按用户安装。

## 工作原理

每个页面的 frontmatter 都带有 `status`（`verified` · `inferred` · `unverified` · `outdated`）、`human_reviewed`，以及引用 `<system>/<file>[:line]` 的 `sources:`。`scripts/check.mjs` 在两秒内校验全部内容，外加链接和 ADR 编号。

插件的 **Stop hook** 在智能体即将结束时运行。如果某个已配置系统的代码变了而知识库没变，它会拦截一次，列出改动的文件以及所有在 `sources:` 中引用它们的页面；智能体要么更新页面（`ragu-sync`），要么说明这次改动为何纯属技术性。如果文档也改了，它会运行 `check`，有错误就拦截。`sources:` 的反向映射正是精确性的来源，所以各个 skill 都坚持 `file:line` 级别的引用。智能体遵循两条规则：**代码即真相**（被代码推翻的页面变为 `outdated` 并记入 `inbox/DIVERGENCES.md`）和**绝不编造原因**（写 `Reason not documented`，并在 `inbox/QUESTIONS.md` 里留下问题）。

| skill | 作用 |
|---|---|
| `ragu-sync` | 更新引用了改动文件的页面，修正 `sources`/`status`/`updated_at`，运行 `check` |
| `ragu-init <system>` | 梳理一个仓库，先询问，再以 `inferred` 写出它的第一批页面 |
| `ragu-adr <title>` | 按下一个编号创建 ADR，并从受影响的页面交叉链接 |
| `ragu-audit [scope]` | 对照代码重新核对每条引用；把不一致的标为 `outdated` |

## 文档

- [使用 Ragu](../workflow.md)：由智能体完成的设置、已有项目与新项目、日常一天
- [支持的智能体](../agents.md)：每个 harness 得到什么、如何接入任意 MCP 客户端、`ragu-mcp`
- [编写页面](../writing-pages.md)：frontmatter、状态、分区、sources、链接
- [配置](../config.md)：`ragu.config.json`、目录布局、`create-ragu` 选项、脚本
- [Stop hook](../hook.md)：它如何判断、如何找到知识库、如何在别处运行
- [Cloudflare 上的远程 MCP](../remote-mcp.md)：语义搜索、令牌、面向 claude.ai 的 OAuth
- [参与贡献](../contributing.md)：仓库结构、约定、[路线图](https://github.com/pedrohfonseca81/ragu/issues?q=is%3Aissue+is%3Aopen+label%3Aroadmap)

[`AGENT-SETUP.md`](../../AGENT-SETUP.md) 是写给智能体的设置指南。MIT 许可。
