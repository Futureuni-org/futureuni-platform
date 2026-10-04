/**
 * Classes for a `DialogContent` that holds a form. The shared dialog is centred with no maximum
 * height, so on a short viewport (a phone in landscape, a laptop at 200% zoom) a long form runs off
 * both edges and its buttons can't be reached. This caps the dialog at the viewport and lets it
 * scroll. Listed in phases/16/REQUESTS.md (CR-16-DIALOG-SCROLL): the primitive should do this.
 */
export const SCROLLING_DIALOG = "max-h-[calc(100dvh-2rem)] overflow-y-auto";
