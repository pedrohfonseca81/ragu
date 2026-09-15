---
title: Name of the end-to-end flow
domain: ""
systems: [api, web]
status: unverified
human_reviewed: false
sources: []
updated_at: 2026-01-01
---

Two or three sentences: what the flow does and which systems take part.

## Diagram

```mermaid
sequenceDiagram
    participant Web
    participant API
    Web->>API: describe only what was verified
    Note over API: unknown steps are labelled "unknown"
```

## Steps

1. Step by step, with a source (`system/file:line`) for each verified step.

## Failure points

What can go wrong at each step and how the system reacts (or `Not documented`).

## Related

Links to related rules, decisions and flows.
