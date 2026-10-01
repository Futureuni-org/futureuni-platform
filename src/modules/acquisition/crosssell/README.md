# Cross-sell (Phase 11)

One voice per company. When a company has two or more open, qualified leads on different service
lines, they become one `CrossSellGroup` with a single **leading lead**; the others are held
(`heldByCrossSell`) so outreach never runs parallel threads (INV-9, enforced in the database by the
`acq_cross_sell_groups_one_active_key` partial unique index and the active-thread check).

- **`detect.ts`** — `detectCrossSell` (runs on `lead.scored` and the periodic sweep) and the pure
  `chooseLeadingLead` (highest score; ties broken by the line with more free capacity, then lead id).
- **`services.ts`** — **`getCrossSellContext`** (SEAM-CROSSSELL), `setLeadingLead`, `splitGroup`
  (allowed only when no thread is active), `listCrossSellOpportunities` (Overview tab).
- **`crosssell.repo.ts`** — all database access.

Group creation emits `crosssell.detected` and notifies the owners of every line in the group once.
`setLeadingLead` and `splitGroup` check `acquisition.crossSell.manage` for each line and are audited.
