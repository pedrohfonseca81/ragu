---
title: Glossary
status: verified
human_reviewed: false
sources:
  - api/src/orders/order.ts:12
  - api/src/catalog/book.ts:8
updated_at: 2026-01-01
---

Business term → where it lives in the code. Keep one line per term; link the page that explains it.

| Business term | Code | Meaning |
|---|---|---|
| Order | `Order` (`api/src/orders/order.ts`) | A customer's purchase of one or more books. Has a `status` lifecycle: `pending → paid → shipped → delivered`, or `cancelled`. See [Order cancellation](domain/order-cancellation.md). |
| Title | `Book` (`api/src/catalog/book.ts`) | A sellable book. "Title" in business language, `Book` in code. |
| Charge | `PaymentIntent` (gateway) | The money movement for an order. See [Payment gateway](integrations/payment-gateway.md). |
