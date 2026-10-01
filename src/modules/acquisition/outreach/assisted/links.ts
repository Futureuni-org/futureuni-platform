/**
 * Pure link builders for assisted channels (no I/O, no WhatsApp/LinkedIn API — INV-7). The send is
 * always performed by a human from the returned link or copied text.
 */

import type { BuildWhatsAppLink } from "@/contracts/outreach-channel";

/** `https://wa.me/<E.164 digits without +>?text=<encodeURIComponent(text)>`. */
export const buildWhatsAppLink: BuildWhatsAppLink = (draft) => {
  const digits = draft.to.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(draft.text)}`;
};
