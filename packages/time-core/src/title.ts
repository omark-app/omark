// Event titles: `CODE; Category; description`.

/** A project code: 2-20 characters, letters, digits and `_`, starting with a letter. */
export const CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_]{1,19}$/;

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

/** A structured title. `''` means none. `code` is upper case. */
export interface ParsedTitle {
  code: string;
  category: string;
  description: string;
  /** The code is one of the known project codes. */
  known: boolean;
}

/**
 * Reads a title. Returns null when the title is not structured: the first
 * segment is not a valid code, or there is no `;` and the code is not known.
 * Only the first two `;` split; the rest stays in the description.
 * `knownCodes` holds upper case codes.
 */
export function parseTitle(title: string, knownCodes: ReadonlySet<string>): ParsedTitle | null {
  const parts = title.trim().split(';');
  const first = parts[0]!.trim();
  if (!isValidCode(first)) return null;
  const code = first.toUpperCase();
  const known = knownCodes.has(code);
  if (parts.length === 1) {
    return known ? { code, category: '', description: '', known } : null;
  }
  return {
    code,
    category: parts[1]!.trim(),
    description: parts.slice(2).join(';').trim(),
    known,
  };
}

/** Writes a title: `CODE`, `CODE; Category` or `CODE; Category; description`. */
export function formatTitle(p: { code: string; category?: string; description?: string }): string {
  const category = p.category ?? '';
  const description = p.description ?? '';
  if (description) return `${p.code}; ${category}; ${description}`;
  if (category) return `${p.code}; ${category}`;
  return p.code;
}
