---
title: API error conventions
domain: architecture
systems: [api, web]
status: verified
human_reviewed: false
sources:
  - api/src/http/errors.ts:3
updated_at: 2026-01-01
---

Every error from [api](../systems/api.md) is a JSON body `{ "code": "SNAKE_CASE", "message": "human readable" }` with an HTTP status that follows the code.

## Rules

- Domain errors extend `DomainError` and declare their `code` and `status` (`api/src/http/errors.ts:3`).
- `web` renders `message` verbatim and never branches on it — only on `code`.

## Related

- [Orders can be cancelled until they are shipped](../domain/order-cancellation.md) (`ORDER_NOT_CANCELLABLE`)
