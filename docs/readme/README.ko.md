<!-- source: README.md@e4d55e2bb18e -->
<p align="center">
  <img src="../../assets/ragu-banner.png" alt="Ragu" width="720">
</p>

<p align="center"><strong>코드에 충실하게 유지되고, 에이전트가 실제로 쓸 수 있는 지식 베이스.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-ragu"><img alt="npm" src="https://img.shields.io/npm/v/create-ragu?label=npm&color=c0392b"></a>
  <a href="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml/badge.svg"></a>
  <a href="../../LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-cream"></a>
</p>

<p align="center"><sub><a href="../../README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.pt-BR.md">Português</a></sub></p>
<p align="center"><sub>이 문서는 영어 README를 AI가 번역한 것이며 영어판이 기준입니다. 전체 문서는 영어로 제공됩니다. 수정 제안을 환영합니다.</sub></p>

Ragu는 비즈니스 규칙, 흐름, 연동, 의사결정을 위한 markdown 지식 베이스에, 대부분의 문서 체계에 없는 세 가지를 더합니다.

1. **모든 페이지가 자신이 설명하는 코드를 인용합니다**(`sources: api/src/billing/refund.ts:42`). 인용이나 링크가 깨지면 빌드가 실패합니다.
2. **에이전트가 MCP로 읽습니다.** 로컬에서는 명령 하나로, 원격에서는 Cloudflare 위에서 시맨틱 검색과 함께.
3. **에이전트 플러그인이 동기화를 유지합니다.** 코드는 바뀌었는데 문서가 바뀌지 않으면, 에이전트는 작업 완료를 선언하기 전에 멈추고 변경된 파일을 인용하는 페이지 목록을 받습니다.

사람에게는 같은 파일로부터 [Starlight](https://starlight.astro.build) 사이트와 Obsidian 볼트가 만들어집니다. 서비스 뒤에 숨은 것은 없습니다. markdown, JSON 설정 하나, 그리고 몇백 줄의 Node뿐입니다.

<p align="center">
  <img src="../../assets/ragu-flow.svg" alt="Code changes reach the agent; the plugin writes the knowledge base and reads it over ragu-mcp; pages cite code back with sources; the build publishes site, vault and llms.txt">
</p>

## 빠른 시작

요구 사항: Node ≥ 20, git, 그리고 [아래 표](#지원-에이전트)에 있는 에이전트.

**1. 지식 베이스를 만듭니다.** 문서화할 저장소들 옆에 둡니다. 마법사가 시스템(`api:../api, web:../web`)을 묻고, 각 저장소를 연결하며(`AGENTS.md` 블록, `.mcp.json`), 플러그인 설치를 제안합니다.

```bash
npx create-ragu knowledge-base
```

**2. 사용하는 에이전트의 플러그인을 설치합니다**(사용자 단위. 마법사에서 예라고 했다면 Claude Code는 이미 끝났습니다):

```bash
claude plugin marketplace add pedrohfonseca81/ragu && claude plugin install ragu@ragu
```

**3. 코드로부터 문서를 생성합니다.** 한 번에 한 시스템씩:

```
/ragu-init api
```

이 skill은 저장소를 파악하고 어떤 페이지를 만들지 물은 뒤, `status: inferred`와 `file:line` sources로 페이지를 작성합니다. 검토하고, 맞는 페이지에 `human_reviewed: true`를 표시하고, 시스템마다 반복합니다. 지식 베이스에서 `npm run dev`를 실행하면 사이트가 뜨고, `npx ragu-mcp`는 에이전트가 이미 연결된 MCP 서버입니다([자세히](../agents.md#ragu-mcp)).

또는 전부 에이전트에게 맡기세요. 저장소들이 있는 디렉터리에서 아래를 붙여 넣으면 됩니다.

```
Read https://raw.githubusercontent.com/pedrohfonseca81/ragu/main/AGENT-SETUP.md and set up Ragu for this project.
Systems: api (./api), web (./web). Knowledge base at ./knowledge-base.
```

## 지원 에이전트

| Harness | 상태 |
|---|---|
| Claude Code | ✅ 지원 |
| Antigravity (IDE, `agy` CLI) | ✅ 지원 |
| Codex CLI | ❌ 미지원 |
| OpenCode | ❌ 미지원 |
| Cursor | ❌ 미지원 |
| GitHub Copilot | ❌ 미지원 |
| Windsurf | ❌ 미지원 |
| Cline | ❌ 미지원 |
| Kiro | ❌ 미지원 |

지원이란 Stop hook, skills, MCP를 모두 갖췄다는 뜻입니다. 미지원 harness도 MCP로 지식 베이스를 읽고(`npx -y ragu-mcp`, [설정](../agents.md#any-mcp-client)) `AGENTS.md`의 규칙을 따를 수는 있지만, 오래된 문서인 채로 작업을 끝내는 것을 막아 주지는 않습니다. 어댑터는 [#1](https://github.com/pedrohfonseca81/ragu/issues/1)에서 추적하며, 추가는 [함수 하나](../hook.md#adding-a-harness)면 됩니다. 웹 claude.ai는 [원격 서버](../remote-mcp.md#oauth--cloudflare-access-for-claudeai-on-the-web)를 사용합니다.

harness 전용 파일은 저장소에 전혀 기록되지 않습니다. `install`은 `AGENTS.md`, `CLAUDE.md`, `.mcp.json`만 남기고 플러그인은 사용자 단위로 설치합니다.

## 동작 방식

모든 페이지의 frontmatter에는 `status`(`verified` · `inferred` · `unverified` · `outdated`), `human_reviewed`, 그리고 `<system>/<file>[:line]`을 인용하는 `sources:`가 있습니다. `scripts/check.mjs`가 이 모든 것과 링크, ADR 번호를 2초 안에 검증합니다.

플러그인의 **Stop hook**은 에이전트가 작업을 마치려 할 때 실행됩니다. 설정된 시스템의 코드가 바뀌었는데 지식 베이스가 그대로면, 변경된 파일과 그것을 `sources:`로 인용하는 모든 페이지를 지목하며 한 번 차단합니다. 에이전트는 페이지를 갱신하거나(`ragu-sync`) 변경이 순수하게 기술적인 이유를 설명합니다. 문서도 바뀌었다면 `check`를 실행하고 오류가 있으면 차단합니다. `sources:`의 역방향 맵이 이 정확성을 만들며, 그래서 skill들은 `file:line` 인용을 고집합니다. 에이전트가 따르는 두 규칙: **코드가 진실이다**(코드와 모순되는 페이지는 `outdated`가 되어 `inbox/DIVERGENCES.md`에 기록됨), 그리고 **이유를 지어내지 않는다**(`Reason not documented`라고 쓰고 `inbox/QUESTIONS.md`에 질문을 남김).

| skill | 하는 일 |
|---|---|
| `ragu-sync` | 변경된 파일을 인용하는 페이지를 갱신하고 `sources`/`status`/`updated_at`를 고친 뒤 `check` 실행 |
| `ragu-init <system>` | 저장소를 파악하고, 확인을 거친 뒤 첫 페이지들을 `inferred`로 작성 |
| `ragu-adr <title>` | 다음 번호의 ADR을 만들고, 영향을 받는 페이지에서 상호 링크 |
| `ragu-audit [scope]` | 모든 인용을 코드와 다시 대조하고, 어긋난 것은 `outdated`로 표시 |

## 문서

- [Ragu로 일하기](../workflow.md): 에이전트 주도 설정, 기존 프로젝트와 새 프로젝트, 하루의 흐름
- [지원 에이전트](../agents.md): 각 harness가 얻는 것, 아무 MCP 클라이언트나 연결하는 법, `ragu-mcp`
- [페이지 작성](../writing-pages.md): frontmatter, 상태, 섹션, sources, 링크
- [설정](../config.md): `ragu.config.json`, 레이아웃, `create-ragu` 옵션, 스크립트
- [Stop hook](../hook.md): 판단 방식, 지식 베이스를 찾는 법, 다른 곳에서 실행하기
- [Cloudflare의 원격 MCP](../remote-mcp.md): 시맨틱 검색, 토큰, claude.ai용 OAuth
- [기여하기](../contributing.md): 저장소 구조, 규약, [로드맵](https://github.com/pedrohfonseca81/ragu/issues?q=is%3Aissue+is%3Aopen+label%3Aroadmap)

[`AGENT-SETUP.md`](../../AGENT-SETUP.md)는 에이전트를 위해 쓰인 설정 가이드입니다. MIT.
