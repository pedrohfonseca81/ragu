---
title: web
systems: [web]
status: verified
human_reviewed: false
sources:
  - web/README.md
updated_at: 2026-01-01
---

The customer-facing storefront.

## Purpose

Browse the catalogue, manage the cart and place orders. Holds no business rules of its own; every decision is delegated to [api](api.md).

## Stack

TypeScript, Next.js. npm.

## How to run

`npm install && npm run dev`.

## Communication with other systems

Calls [api](api.md) over REST (`NEXT_PUBLIC_API_URL`).

## Main areas of the code

- `app/checkout/`: the checkout pages, see [Checkout flow](../flows/checkout.md).

## Related

- [api](api.md)
