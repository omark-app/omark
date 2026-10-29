import type { Schema } from '@omark/settings';
import type { SyncStatus } from '@omark/storage';

/** What the one Omark app's Settings page needs to show and write Tasks' own settings. */
export interface PartSettings {
  schema: Schema;
  /** The config.yaml text now; read it again for the latest. */
  readonly text: string;
  write(text: string): void;
  readonly note: string | null;
  readonly status: SyncStatus;
  defaultText: string;
}

/**
 * Tasks as a part of the one Omark app (apps/omark). In apps/tasks alone it stays as it starts: always active,
 * its settings on its own `#settings` page.
 */
class Part {
  /** Whether Tasks is the part on screen: the one app sets it false while another part's tab shows, so Tasks' keys rest. */
  active = $state(true);
  /** Set by the one app: Tasks' gear and `,` open the one Settings page (U.5) instead of `#settings`. */
  openSettings = $state.raw<(() => void) | null>(null);
  /** Published by Tasks once it is open, for the one Settings page. */
  settings = $state.raw<PartSettings | null>(null);
  /** Set by the one app: the project codes and area tags quick add offers as `#` is typed (Goals spec 9). */
  tags = $state.raw<readonly string[]>([]);
  /** Set by the one app's demo: Reset demo resets every part's files (it asks first and reloads), not Tasks' alone. */
  resetDemo = $state.raw<(() => void) | null>(null);
}

export const part = new Part();
