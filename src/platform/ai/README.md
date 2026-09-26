# src/platform/ai/

**Owner: Phase 05 (AI service).** The platform AI service (Phase 5, `docs/contracts/ai-service.md`): `runTask` is the only way to call Claude, and this is the only folder allowed to import `@anthropic-ai/sdk` (ADR-006, enforced by lint). Model tiers come from config (ADR-018), and every call writes an `AiCall` row (INV-13).
