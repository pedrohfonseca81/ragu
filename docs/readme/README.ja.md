<!-- source: README.md@c4a6e00f8d37 -->
<p align="center">
  <img src="../../assets/ragu-banner.png" alt="Ragu" width="720">
</p>

<p align="center"><strong>コードに忠実であり続け、エージェントが実際に使えるナレッジベース。</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-ragu"><img alt="npm" src="https://img.shields.io/npm/v/create-ragu?label=npm&color=c0392b"></a>
  <a href="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml/badge.svg"></a>
  <a href="../../LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-cream"></a>
</p>

<p align="center"><sub><a href="../../README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.fr.md">Français</a> · <a href="README.pt-BR.md">Português</a></sub></p>
<p align="center"><sub>この文書は英語版 README から AI が翻訳したもので、英語版が正となります。完全なドキュメントは英語です。修正歓迎。</sub></p>

Ragu は、ビジネスルール・フロー・連携・意思決定のための markdown ナレッジベースに、多くのドキュメント運用に欠けている 3 つのものを加えます。

1. **すべてのページが、説明対象のコードを引用します**（`sources: api/src/billing/refund.ts:42`）。引用やリンクが切れるとビルドが失敗します。
2. **エージェントは MCP 経由で読みます。** ローカルならコマンド 1 つ、リモートなら Cloudflare 上でセマンティック検索付き。
3. **エージェント用プラグインが同期を保ちます。** コードが変わったのにドキュメントが変わっていなければ、エージェントはタスク完了を宣言する前に止められ、変更ファイルを引用しているページの一覧を受け取ります。

人間には、同じファイルから [Starlight](https://starlight.astro.build) サイトと Obsidian の vault が生成されます。サービスの裏に隠れているものは何もありません。markdown と JSON 設定と数百行の Node だけです。

```
                  ┌──────────────────────────────────────────────────────────┐
                  │                    your code repos                       │
                  │        api/            web/           worker/            │
                  └───────┬─────────────────────────────────────▲────────────┘
        changes           │                                     │  reads rules,
        (git status)      │                                     │  flows, ADRs
                          ▼                                     │
   ┌──── your agent + ragu plugin ─────────────────────┐   ┌────┴─────────────┐
   │  Stop hook: "code changed, these 3 pages cite it" │   │  any MCP client  │
   │  ragu-sync  ragu-init  ragu-adr  ragu-audit       │   │                  │
   └───────────────────────┬───────────────────────────┘   └────▲─────────────┘
                           │ edits                               │ search_docs
                           ▼                                     │ get_document
   ┌───────────────────────────────────────────────┐             │ list_documents
   │        knowledge base  (markdown + config)    │             │
   │  ragu.config.json   src/content/docs/**/*.md  │◄────────────┤
   │  scripts/check.mjs  →  frontmatter, links,    │   ragu-mcp (local, stdio)
   │                        sources, ADR numbering │   or Cloudflare worker (remote)
   └───────────────────────┬───────────────────────┘
                           ▼
                Starlight site · Obsidian vault · llms.txt
```

## クイックスタート

必要なもの: Node ≥ 20、git、そして[下の表](#対応エージェント)にあるエージェント。

**1. ナレッジベースを作成**します。ドキュメント化するリポジトリの隣に置きます。ウィザードがシステム（`api:../api, web:../web`）を尋ね、各リポジトリを接続し（`AGENTS.md` ブロック、`.mcp.json`）、プラグインのインストールを提案します。

```bash
npx create-ragu knowledge-base
```

**2. 使用するエージェントのプラグインをインストール**します（ユーザー単位。ウィザードで「はい」と答えていれば Claude Code 分は済んでいます）:

```bash
claude plugin marketplace add pedrohfonseca81/ragu && claude plugin install ragu@ragu
```

**3. コードからドキュメントを生成**します。システムは 1 つずつ:

```
/ragu-init api
```

この skill はリポジトリを調査し、どのページを作るか確認してから、`status: inferred` と `file:line` の sources 付きでページを書きます。内容を確認し、正しいページに `human_reviewed: true` を付け、システムごとに繰り返します。ナレッジベースで `npm run dev` を実行するとサイトが立ち上がります。`npx ragu-mcp` は、エージェントがすでに接続している MCP サーバーです（[詳細](../agents.md#ragu-mcp)）。

あるいは、すべてエージェントに任せることもできます。リポジトリを置いているディレクトリから、次を貼り付けてください。

```
Read https://raw.githubusercontent.com/pedrohfonseca81/ragu/main/AGENT-SETUP.md and set up Ragu for this project.
Systems: api (./api), web (./web). Knowledge base at ./knowledge-base.
```

## 対応エージェント

| Harness | ステータス |
|---|---|
| Claude Code | ✅ 対応 |
| Antigravity (IDE, `agy` CLI) | ✅ 対応 |
| Codex CLI | ❌ 未対応 |
| OpenCode | ❌ 未対応 |
| Cursor | ❌ 未対応 |
| GitHub Copilot | ❌ 未対応 |
| Windsurf | ❌ 未対応 |
| Cline | ❌ 未対応 |
| Kiro | ❌ 未対応 |

「対応」とは Stop hook・skills・MCP がそろっていることです。未対応の harness でも MCP 経由でナレッジベースを読み（`npx -y ragu-mcp`、[設定](../agents.md#any-mcp-client)）、`AGENTS.md` のルールに従うことはできますが、古いドキュメントのまま作業を終えるのを止める仕組みはありません。アダプターは [#1](https://github.com/pedrohfonseca81/ragu/issues/1) で追跡中で、追加は[関数 1 つ](../hook.md#adding-a-harness)です。Web 版 claude.ai は[リモートサーバー](../remote-mcp.md#oauth--cloudflare-access-for-claudeai-on-the-web)を使います。

harness 固有のものはリポジトリに一切書き込まれません。`install` が残すのは `AGENTS.md`・`CLAUDE.md`・`.mcp.json` だけで、プラグインはユーザー単位でインストールされます。

## 仕組み

各ページの frontmatter には `status`（`verified` · `inferred` · `unverified` · `outdated`）、`human_reviewed`、そして `<system>/<file>[:line]` を引用する `sources:` があります。`scripts/check.mjs` がそれらすべてに加えてリンクと ADR 番号を 2 秒以内に検証します。

プラグインの **Stop hook** は、エージェントが作業を終えようとするときに実行されます。設定済みシステムのコードが変わったのにナレッジベースが変わっていなければ、変更ファイルと、それを `sources:` で引用しているすべてのページを挙げて一度だけブロックします。エージェントはページを更新する（`ragu-sync`）か、変更が純粋に技術的である理由を説明します。ドキュメントも変わっていれば `check` を実行し、エラーがあればブロックします。`sources:` の逆引きマップがこの精度を支えており、だからこそ各 skill は `file:line` 単位の引用にこだわります。エージェントが従うルールは 2 つ。**コードが真実**（コードと矛盾するページは `outdated` になり `inbox/DIVERGENCES.md` に記録される）と、**理由を捏造しない**（`Reason not documented` と書き、`inbox/QUESTIONS.md` に質問を残す）です。

| skill | 役割 |
|---|---|
| `ragu-sync` | 変更ファイルを引用しているページを更新し、`sources`/`status`/`updated_at` を直し、`check` を実行 |
| `ragu-init <system>` | リポジトリを調査し、確認してから最初のページ群を `inferred` として作成 |
| `ragu-adr <title>` | 次の番号の ADR を作成し、影響を受けるページから相互リンク |
| `ragu-audit [scope]` | すべての引用をコードと照合し直し、食い違いを `outdated` にマーク |

## ドキュメント

- [Ragu での作業](../workflow.md): エージェントによるセットアップ、既存プロジェクトと新規プロジェクト、ある一日の流れ
- [対応エージェント](../agents.md): 各 harness が得られるもの、任意の MCP クライアントの接続方法、`ragu-mcp`
- [ページの書き方](../writing-pages.md): frontmatter、ステータス、セクション、sources、リンク
- [設定](../config.md): `ragu.config.json`、レイアウト、`create-ragu` のオプション、スクリプト
- [Stop hook](../hook.md): 判断の仕組み、ナレッジベースの見つけ方、他の環境での実行
- [Cloudflare 上のリモート MCP](../remote-mcp.md): セマンティック検索、トークン、claude.ai 向け OAuth
- [コントリビュート](../contributing.md): リポジトリ構成、規約、[ロードマップ](https://github.com/pedrohfonseca81/ragu/issues?q=is%3Aissue+is%3Aopen+label%3Aroadmap)

[`AGENT-SETUP.md`](../../AGENT-SETUP.md) はエージェント向けに書かれたセットアップガイドです。MIT ライセンス。
