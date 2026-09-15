---
title: 0001 - One API service instead of microservices
domain: architecture
systems: [api]
status: verified
human_reviewed: false
sources:
  - api/docs/adr/0001-single-service.md
updated_at: 2026-01-01
---

Orders, catalogue and payments live in one deployable service.

## Status

`accepted`

## Context

A two-person team shipping a bookshop; the operational cost of several services outweighed the isolation benefits.

## Decision

Keep a single Node.js service with clear module boundaries (`orders/`, `catalog/`, `payments/`).

## Alternatives considered

- Separate payments service — rejected: the webhook handler needs order state anyway.

## Consequences

- Simple deploys and local setup.
- Module boundaries are enforced by convention only (see [API error conventions](../standards/api-errors.md)).

## Verification in code

Implemented: there is a single `api` repository. See [api](../systems/api.md).

## Related

- [api](../systems/api.md)
