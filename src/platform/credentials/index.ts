/**
 * @/platform/credentials: encrypted integration credentials (INV-21). Server-only.
 *
 * SEAM-AI-CREDENTIALS wires into `getCredential`.
 */

import "server-only";

export {
  deleteCredential,
  getCredential,
  getCredentialStatus,
  listCredentialStatuses,
  resolveProviderKey,
  saveCredential,
  testCredential,
  type CredentialStatus,
} from "./service";
export { rotateEncryptionKey, type RotateResult } from "./rotate";
export {
  getProvider,
  listProviders,
  providerEnvKey,
  type CredentialPayload,
  type ProviderDefinition,
} from "./providers";
