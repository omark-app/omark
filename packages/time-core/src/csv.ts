/**
 * Read RFC 4180 CSV. `lines[i]` is the 1-based physical line where row `i`
 * starts. A `"` opens a quoted field only at the start of a field; elsewhere
 * it is a plain character. `unterminated` is the line where a quoted field
 * that never closes starts (the rest of the input is in that field), or null.
 */
export function parseCsv(text: string): { rows: string[][]; lines: number[]; unterminated: number | null } {
  const src = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false; // the current line has any characters
  let fieldStart = true; // nothing read yet in the current field
  let line = 1;
  let rowLine = 1;
  let quoteLine = 1;

  const endRow = () => {
    if (started) {
      row.push(field);
      rows.push(row);
      lines.push(rowLine);
    }
    row = [];
    field = '';
    started = false;
    fieldStart = true;
  };

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        if (c === '\n') line++;
        field += c;
      }
      continue;
    }
    if (c === '\r' && src[i + 1] === '\n') continue;
    if (c === '\n') {
      endRow();
      line++;
      continue;
    }
    if (!started) {
      started = true;
      rowLine = line;
    }
    if (c === '"' && fieldStart) {
      quoted = true;
      quoteLine = line;
      fieldStart = false;
    } else if (c === ',') {
      row.push(field);
      field = '';
      fieldStart = true;
    } else {
      field += c;
      fieldStart = false;
    }
  }
  const unterminated = quoted ? quoteLine : null;
  endRow();
  return { rows, lines, unterminated };
}

const needsQuotes = /[,"\r\n]/;

function toField(value: string): string {
  return needsQuotes.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Write CSV with LF line ends and a final newline. */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(toField).join(',') + '\n').join('');
}
