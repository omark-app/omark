/** The note for sync clients' conflict copies in a picked folder (`conflictCopies`), or null when there are none. */
export function conflictNote(names: string[]): string | null {
  if (names.length === 0) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
  return names.length === 1
    ? `${list} in the folder looks like a sync app's conflict copy. It isn't merged: open it and copy over anything you need.`
    : `${list} in the folder look like a sync app's conflict copies. They aren't merged: open them and copy over anything you need.`;
}
