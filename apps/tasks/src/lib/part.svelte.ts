/**
 * Whether Tasks is the part on screen. Always true in apps/tasks; the one Omark app (apps/omark) sets it false
 * while another part's tab shows, so Tasks' keys rest until its tab is back.
 */
export const part = $state({ active: true });
