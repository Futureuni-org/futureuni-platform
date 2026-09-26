# src/platform/credentials/

**Owner: Phase 06 (Platform services).** The credentials vault (Phase 6): integration credentials stored only as AES-256-GCM ciphertext with IV, auth tag and key version, and shown masked in the UI (INV-21). Plaintext never reaches the database, logs or client code.
