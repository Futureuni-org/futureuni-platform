# evals/_redteam/

**Owner: Phase 20 (Hardening).** Adversarial eval cases built in Phase 20: at least 30 inputs that attempt prompt injection through every untrusted entry point (website text, reviews, job posts, replies, CSV fields and similar). They check that untrusted content stays inside `<untrusted_data>` blocks and never changes a task's behaviour (INV-24), and they run through the runner in `evals/_runner/`.
