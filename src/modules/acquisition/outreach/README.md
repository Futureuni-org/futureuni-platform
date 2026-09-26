# src/modules/acquisition/outreach/

**Owner: Phase 12 (Outreach).** Outreach (Phase 12, `docs/contracts/outreach-channel.md`): sequences, drafts with cited claims and the single send path. Every send checks suppression in the same code path, stays inside the recipient's send window and is idempotent by message ID (INV-2, INV-4, INV-8, INV-22); WhatsApp and LinkedIn are only prepared for a person to send (INV-7).
