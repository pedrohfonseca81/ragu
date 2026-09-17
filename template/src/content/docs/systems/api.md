---
title: api
systems: [api]
status: verified
human_reviewed: false
sources:
  - api/README.md
  - api/package.json
updated_at: 2026-01-01
---

The backend of the bookshop: a single Node.js service that owns orders, the catalogue and payment orchestration.

## Purpose

Source of truth for orders and stock; the only system that talks to the payment gateway.

## Stack

TypeScript, Fastify, PostgreSQL via Prisma. npm.

## How to run

`npm install && npm run dev`; see the repository README for environment variables.

## Communication with other systems

- Serves REST to [web](web.md) (`/orders`, `/catalog`).
- Calls the payment gateway and receives its webhooks at `/webhooks/payments` (`PAYMENT_GATEWAY_KEY`, `PAYMENT_WEBHOOK_SECRET`).

## Main areas of the code

- `src/orders/`: order lifecycle, including [cancellation](../domain/order-cancellation.md).
- `src/catalog/`: books and stock.
- `src/payments/`: gateway client and webhook handler.

## Related

- [Checkout flow](../flows/checkout.md)
- [Single API service](../decisions/0001-single-api-service.md)
