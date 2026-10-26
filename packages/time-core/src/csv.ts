/** Read RFC 4180 CSV. `lines[i]` is the 1-based physical line where row `i` starts. */
export function parseCsv(text: string): { rows: string[][]; lines: number[] } {
  const src = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const rows: string[][] = [];
  const lines: number[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let started = false; // the current line has any characters
  let line = 1;
  let rowLine = 1;

  const endRow = () => {
    if (started) {
      row.push(field);
      rows.push(row);
      lines.push(rowLine);
    }
    row = [];
    field = '';
    started = false;
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
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else field += c;
  }
  endRow();
  return { rows, lines };
}

const needsQuotes = /[,"\r\n]/;

function toField(value: string): string {
  return needsQuotes.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Write CSV with LF line ends and a final newline. */
export function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map(toField).join(',') + '\n').join('');
}
