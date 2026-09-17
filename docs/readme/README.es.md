<!-- source: README.md@6502891e6e50 -->
<p align="center">
  <img src="../../assets/ragu-banner.png" alt="Ragu" width="720">
</p>

<p align="center"><strong>Una base de conocimiento que se mantiene fiel a tu código, y que tus agentes pueden usar de verdad.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-ragu"><img alt="create-ragu on npm" src="https://img.shields.io/npm/v/create-ragu?label=create-ragu&color=c0392b"></a>
  <a href="https://www.npmjs.com/package/ragu-mcp"><img alt="ragu-mcp on npm" src="https://img.shields.io/npm/v/ragu-mcp?label=ragu-mcp&color=c0392b"></a>
  <a href="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/pedrohfonseca81/ragu/actions/workflows/ci.yml/badge.svg"></a>
  <a href="../../LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-cream"></a>
</p>

<p align="center"><sub><a href="../../README.md">English</a> · <a href="README.zh-CN.md">中文</a> · <a href="README.ja.md">日本語</a> · <a href="README.ko.md">한국어</a> · <a href="README.fr.md">Français</a> · <a href="README.pt-BR.md">Português</a></sub></p>
<p align="center"><sub>Traducción generada por IA a partir del README en inglés, que es la versión de referencia; la documentación completa está en inglés. Las correcciones son bienvenidas.</sub></p>

Ragu te da una base de conocimiento en markdown para reglas de negocio, flujos, integraciones y decisiones, con tres cosas que a la mayoría de las documentaciones les faltan:

1. **Cada página cita el código que describe** (`sources: api/src/billing/refund.ts:42`), y el build falla cuando una cita o un enlace se rompe.
2. **Los agentes la leen por MCP**, localmente con un comando o de forma remota en Cloudflare con búsqueda semántica.
3. **Un plugin de agente la mantiene sincronizada.** Cuando el código cambia y la documentación no, el agente es detenido con la lista exacta de páginas que citan los archivos modificados, antes de dar la tarea por terminada.

Las personas obtienen un sitio [Starlight](https://starlight.astro.build) y un vault de Obsidian a partir de los mismos archivos. Nada se esconde detrás de un servicio: es markdown, un JSON de configuración y unos cientos de líneas de Node.

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

## Inicio rápido

Requisitos: Node ≥ 20, git y un agente de la [tabla de abajo](#agentes-soportados).

**1. Crea la base de conocimiento** junto a los repositorios que va a documentar. El asistente pregunta por los sistemas (`api:../api, web:../web`), conecta cada repositorio (bloque en `AGENTS.md`, `.mcp.json`) y ofrece instalar el plugin.

```bash
npx create-ragu knowledge-base
```

**2. Instala el plugin de tu agente** (por usuario; el asistente ya lo hizo para Claude Code si dijiste que sí):

```bash
claude plugin marketplace add pedrohfonseca81/ragu && claude plugin install ragu@ragu
```

**3. Genera la documentación a partir del código**, un sistema a la vez:

```
/ragu-init api
```

La skill mapea el repositorio, pregunta qué páginas crear y las escribe con `status: inferred` y sources `file:line`. Revísalas, marca `human_reviewed: true` en las que estén bien, repite por sistema. `npm run dev` en la base de conocimiento levanta el sitio; `npx ragu-mcp` es el servidor MCP que tu agente ya tiene ([detalles](../agents.md#ragu-mcp)).

O deja que el agente lo haga todo: pega esto desde el directorio que contiene tus repositorios.

```
Read https://raw.githubusercontent.com/pedrohfonseca81/ragu/main/AGENT-SETUP.md and set up Ragu for this project.
Systems: api (./api), web (./web). Knowledge base at ./knowledge-base.
```

## Agentes soportados

| Harness | Estado |
|---|---|
| Claude Code | ✅ Soportado |
| Antigravity (IDE, `agy` CLI) | ✅ Soportado |
| Codex CLI | ❌ No soportado |
| OpenCode | ❌ No soportado |
| Cursor | ❌ No soportado |
| GitHub Copilot | ❌ No soportado |
| Windsurf | ❌ No soportado |
| Cline | ❌ No soportado |
| Kiro | ❌ No soportado |

Soportado significa el Stop hook, las skills y MCP. Un harness no soportado puede igualmente leer la base de conocimiento por MCP (`npx -y ragu-mcp`, [configuración](../agents.md#any-mcp-client)) y seguir las reglas de `AGENTS.md`, pero nada le impide terminar con la documentación desactualizada. Los adaptadores se siguen en [#1](https://github.com/pedrohfonseca81/ragu/issues/1); añadir uno es [una función](../hook.md#adding-a-harness). claude.ai en la web usa el [servidor remoto](../remote-mcp.md#oauth--cloudflare-access-for-claudeai-on-the-web).

Nada específico de un harness se escribe en tus repositorios: `install` deja `AGENTS.md`, `CLAUDE.md` y `.mcp.json` ahí e instala los plugins por usuario.

## Cómo funciona

Cada página lleva frontmatter con `status` (`verified` · `inferred` · `unverified` · `outdated`), `human_reviewed` y `sources:` citando `<system>/<file>[:line]`. `scripts/check.mjs` valida todo eso, más enlaces y numeración de ADRs, en menos de dos segundos.

El **Stop hook** del plugin se ejecuta cuando el agente está por terminar. Si el código cambió en un sistema configurado y la base de conocimiento no, bloquea una vez, nombrando los archivos modificados y cada página cuyo `sources:` los cita; el agente actualiza las páginas (`ragu-sync`) o explica por qué el cambio es puramente técnico. Si la documentación también cambió, ejecuta `check` y bloquea si hay errores. El mapa inverso de `sources:` es lo que hace esto preciso, y por eso las skills insisten en citas `file:line`. Dos reglas que siguen los agentes: **el código es la verdad** (una página que el código contradice pasa a `outdated` y se registra en `inbox/DIVERGENCES.md`) y **nunca inventar el porqué** (`Reason not documented`, más una pregunta en `inbox/QUESTIONS.md`).

| skill | qué hace |
|---|---|
| `ragu-sync` | actualiza las páginas que citan los archivos modificados, corrige `sources`/`status`/`updated_at`, ejecuta `check` |
| `ragu-init <system>` | mapea un repositorio, pregunta y luego escribe sus primeras páginas como `inferred` |
| `ragu-adr <title>` | ADR con el siguiente número, enlazada desde las páginas a las que afecta |
| `ragu-audit [scope]` | vuelve a comprobar cada cita contra el código; marca las divergencias como `outdated` |

## Documentación

- [Trabajar con Ragu](../workflow.md): setup guiado por el agente, proyecto existente vs. nuevo, un día de uso
- [Agentes soportados](../agents.md): qué recibe cada harness, cómo conectar cualquier cliente MCP, `ragu-mcp`
- [Escribir páginas](../writing-pages.md): frontmatter, estados, secciones, sources, enlaces
- [Configuración](../config.md): `ragu.config.json`, layouts, opciones de `create-ragu`, scripts
- [El Stop hook](../hook.md): cómo decide, cómo encuentra la base de conocimiento, cómo ejecutarlo en otro lugar
- [MCP remoto en Cloudflare](../remote-mcp.md): búsqueda semántica, tokens, OAuth para claude.ai
- [Contribuir](../contributing.md): estructura del repositorio, convenciones, [roadmap](https://github.com/pedrohfonseca81/ragu/issues?q=is%3Aissue+is%3Aopen+label%3Aroadmap)

[`AGENT-SETUP.md`](../../AGENT-SETUP.md) es la guía de setup escrita para agentes. MIT.
