# Questions for a human

Grouped by domain. Each question carries minimal context and the source that raised it. Delete or strike through questions once answered, and move the answer into the relevant page.

## Orders

1. `cancelOrder` allows cancellation while status is `shipped` but the shipping provider is never notified. Intentional (manual process) or a gap? — source: `api/src/orders/cancel.ts:18-31`.
