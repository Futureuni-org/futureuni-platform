/**
 * True while a dialog, sheet or menu is open. A single-key shortcut must not act on the page behind
 * an overlay: pressing "u" while reading a confirmation would otherwise change a thread unseen. The
 * inbox's polling also waits, so a refresh can't swap the data a half-filled dialog is about.
 * Client-only (it reads the document).
 */
export function overlayOpen(): boolean {
  return document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') !== null;
}
