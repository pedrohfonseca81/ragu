---
title: Orders can be cancelled until they are shipped
domain: orders
systems: [api]
status: verified
human_reviewed: false
sources:
  - api/src/orders/cancel.ts:18
  - api/src/orders/order.ts:12
updated_at: 2026-01-01
---

A customer may cancel an order while it has not left the warehouse. Cancelling a paid order triggers a full refund.

## Rule

- Allowed statuses: `pending`, `paid`.
- `shipped` and `delivered` orders cannot be cancelled through the API (`cancelOrder` throws `OrderNotCancellable`).
- If the order was `paid`, a refund for the full amount is requested from the [payment gateway](../integrations/payment-gateway.md) in the same transaction.

## Why

Reason not documented. (Likely to avoid reverse logistics; see `inbox/QUESTIONS.md`.)

## Exceptions

Support staff can cancel any order via the admin endpoint, which bypasses the status check (`api/src/orders/admin-cancel.ts:9`).

## Related

- [Checkout flow](../flows/checkout.md)
- [Glossary → Order](../glossary.md)
