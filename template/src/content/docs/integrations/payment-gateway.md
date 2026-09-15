---
title: Payment gateway
domain: payments
systems: [api]
status: verified
human_reviewed: false
sources:
  - api/src/payments/client.ts:5
  - api/src/payments/webhook.ts:15
updated_at: 2026-01-01
---

The bookshop charges cards through a hosted payment gateway. Only [api](../systems/api.md) talks to it.

## Contract

- **Outbound:** `POST /payment_intents` (create charge), `POST /refunds` (full refund on cancellation).
- **Inbound:** webhooks `payment.succeeded`, `payment.failed`, `refund.succeeded` at `/webhooks/payments`, signed with `PAYMENT_WEBHOOK_SECRET`.

## Environment variables

`PAYMENT_GATEWAY_KEY`, `PAYMENT_WEBHOOK_SECRET` (values never documented here).

## Related

- [Checkout](../flows/checkout.md)
- [Orders can be cancelled until they are shipped](../domain/order-cancellation.md)
