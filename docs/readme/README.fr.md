<!-- source: README.md@c4a6e00f8d37 -->
<p align="center">
  <img src="../../assets/ragu-banner.png" alt="Ragu" width="720">
</p>

<p align="center"><strong>Une base de connaissances qui reste fidèle à votre code, et que vos agents peuvent vraiment utiliser.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-ragu"><img alt="npm" src="https://img.shields.io/npm/v/create-ragu?label=npm&color=c0392b"></a>
  <a href="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml/badge.svg"></a>
  <a href="../../LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-cream"></a>
</p>

<p align="center"><sub><a href="../../README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.es.md">Español</a> · <a href="README.pt-BR.md">Português</a></sub></p>
<p align="center"><sub>Traduction générée par IA à partir du README en anglais, qui fait référence ; la documentation complète est en anglais. Les corrections sont les bienvenues.</sub></p>

Ragu vous donne une base de connaissances en markdown pour les règles métier, les flux, les intégrations et les décisions, avec trois choses qui manquent à la plupart des documentations :

1. **Chaque page cite le code qu'elle décrit** (`sources: api/src/billing/refund.ts:42`), et le build échoue quand une citation ou un lien est cassé.
2. **Les agents la lisent via MCP**, en local en une commande ou à distance sur Cloudflare avec recherche sémantique.
3. **Un plugin d'agent la garde synchronisée.** Quand le code change et pas la documentation, l'agent est arrêté avec la liste exacte des pages qui citent les fichiers modifiés, avant de déclarer la tâche terminée.

Les humains obtiennent un site [Starlight](https://starlight.astro.build) et un vault Obsidian à partir des mêmes fichiers. Rien n'est caché derrière un service : c'est du markdown, un JSON de configuration et quelques centaines de lignes de Node.

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

## Démarrage rapide

Prérequis : Node ≥ 20, git et un agent du [tableau ci-dessous](#agents-pris-en-charge).

**1. Créez la base de connaissances** à côté des dépôts qu'elle va documenter. L'assistant demande les systèmes (`api:../api, web:../web`), connecte chaque dépôt (bloc dans `AGENTS.md`, `.mcp.json`) et propose d'installer le plugin.

```bash
npx create-ragu knowledge-base
```

**2. Installez le plugin de votre agent** (par utilisateur ; l'assistant l'a déjà fait pour Claude Code si vous avez dit oui) :

```bash
claude plugin marketplace add pedrohfonseca81/ragu && claude plugin install ragu@ragu
```

**3. Générez la documentation à partir du code**, un système à la fois :

```
/ragu-init api
```

La skill cartographie le dépôt, demande quelles pages créer et les écrit avec `status: inferred` et des sources `file:line`. Relisez, passez `human_reviewed: true` sur celles qui sont justes, répétez par système. `npm run dev` dans la base de connaissances lance le site ; `npx ragu-mcp` est le serveur MCP que votre agent a déjà ([détails](../agents.md#ragu-mcp)).

Ou laissez l'agent tout faire : collez ceci depuis le répertoire qui contient vos dépôts.

```
Read https://raw.githubusercontent.com/pedrohfonseca81/ragu/main/AGENT-SETUP.md and set up Ragu for this project.
Systems: api (./api), web (./web). Knowledge base at ./knowledge-base.
```

## Agents pris en charge

| Harness | Statut |
|---|---|
| Claude Code | ✅ Pris en charge |
| Antigravity (IDE, `agy` CLI) | ✅ Pris en charge |
| Codex CLI | ❌ Non pris en charge |
| OpenCode | ❌ Non pris en charge |
| Cursor | ❌ Non pris en charge |
| GitHub Copilot | ❌ Non pris en charge |
| Windsurf | ❌ Non pris en charge |
| Cline | ❌ Non pris en charge |
| Kiro | ❌ Non pris en charge |

Pris en charge signifie le Stop hook, les skills et MCP. Un harness non pris en charge peut quand même lire la base de connaissances via MCP (`npx -y ragu-mcp`, [configuration](../agents.md#any-mcp-client)) et suivre les règles de `AGENTS.md`, mais rien ne l'empêche de terminer avec une documentation périmée. Les adaptateurs sont suivis dans [#1](https://github.com/pedrohfonseca81/ragu/issues/1) ; en ajouter un, c'est [une fonction](../hook.md#adding-a-harness). claude.ai sur le web passe par le [serveur distant](../remote-mcp.md#oauth--cloudflare-access-for-claudeai-on-the-web).

Rien de spécifique à un harness n'est écrit dans vos dépôts : `install` y laisse `AGENTS.md`, `CLAUDE.md` et `.mcp.json`, et installe les plugins par utilisateur.

## Comment ça marche

Chaque page porte un frontmatter avec `status` (`verified` · `inferred` · `unverified` · `outdated`), `human_reviewed` et `sources:` citant `<system>/<file>[:line]`. `scripts/check.mjs` valide tout cela, plus les liens et la numérotation des ADR, en moins de deux secondes.

Le **Stop hook** du plugin s'exécute quand l'agent est sur le point de terminer. Si le code a changé dans un système configuré et pas la base de connaissances, il bloque une fois, en nommant les fichiers modifiés et chaque page dont le `sources:` les cite ; l'agent met à jour les pages (`ragu-sync`) ou explique pourquoi le changement est purement technique. Si la documentation a aussi changé, il lance `check` et bloque en cas d'erreur. La carte inverse de `sources:` est ce qui rend cela précis, d'où l'insistance des skills sur des citations `file:line`. Deux règles que les agents suivent : **le code fait foi** (une page contredite par le code passe en `outdated` et est consignée dans `inbox/DIVERGENCES.md`) et **ne jamais inventer le pourquoi** (`Reason not documented`, plus une question dans `inbox/QUESTIONS.md`).

| skill | ce qu'elle fait |
|---|---|
| `ragu-sync` | met à jour les pages qui citent les fichiers modifiés, corrige `sources`/`status`/`updated_at`, lance `check` |
| `ragu-init <system>` | cartographie un dépôt, demande, puis écrit ses premières pages en `inferred` |
| `ragu-adr <title>` | ADR au numéro suivant, liée depuis les pages qu'elle affecte |
| `ragu-audit [scope]` | revérifie chaque citation contre le code ; marque les divergences `outdated` |

## Documentation

- [Travailler avec Ragu](../workflow.md) : mise en place par l'agent, projet existant vs nouveau, une journée d'utilisation
- [Agents pris en charge](../agents.md) : ce que chaque harness obtient, comment connecter n'importe quel client MCP, `ragu-mcp`
- [Écrire des pages](../writing-pages.md) : frontmatter, statuts, sections, sources, liens
- [Configuration](../config.md) : `ragu.config.json`, dispositions, options de `create-ragu`, scripts
- [Le Stop hook](../hook.md) : comment il décide, comment il trouve la base de connaissances, l'exécuter ailleurs
- [MCP distant sur Cloudflare](../remote-mcp.md) : recherche sémantique, jetons, OAuth pour claude.ai
- [Contribuer](../contributing.md) : structure du dépôt, conventions, [feuille de route](https://github.com/pedrohfonseca81/ragu/issues?q=is%3Aissue+is%3Aopen+label%3Aroadmap)

[`AGENT-SETUP.md`](../../AGENT-SETUP.md) est le guide de mise en place écrit pour les agents. MIT.
