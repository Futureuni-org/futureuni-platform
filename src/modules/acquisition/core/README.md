# src/modules/acquisition/core/

**Owner: Phase 02 (Core schema and registry).** The shared acquisition rules (Phase 2): the lead state machine, where `transitionLead()` is the only way a status changes and writes its `LeadEvent` in the same transaction (INV-1, INV-15), and the suppression check (INV-2).
