/**
 * OneDrive's QuickXorHash of `bytes`, base64-encoded as Graph reports it in `file.hashes.quickXorHash`.
 * A port of Microsoft's reference implementation for one block: the 160-bit state is three cells of 64,
 * 64 and 32 bits; byte i is XORed in at bit 11·i mod 160 (wrapping from the last cell to the first),
 * and the input length, as a little-endian 64-bit number, is XORed into the last 8 of the 20 bytes.
 */
export function quickXorHash(bytes: Uint8Array): string {
  const WIDTH = 160;
  const SHIFT = 11;
  const cells = [0n, 0n, 0n];
  const bitsIn = (cell: number): number => (cell === cells.length - 1 ? 32 : 64);
  let cell = 0;
  let offset = 0;
  for (let i = 0; i < Math.min(bytes.length, WIDTH); i++) {
    // Bytes i, i + 160, i + 320, … land on the same bits.
    let x = 0;
    for (let j = i; j < bytes.length; j += WIDTH) x ^= bytes[j]!;
    const bits = bitsIn(cell);
    cells[cell]! ^= BigInt(x) << BigInt(offset);
    if (offset > bits - 8) {
      // The byte straddles the end of this cell: its high bits go to the low end of the next one.
      const next = cell === cells.length - 1 ? 0 : cell + 1;
      cells[next]! ^= BigInt(x) >> BigInt(bits - offset);
    }
    offset += SHIFT;
    while (offset >= bitsIn(cell)) {
      offset -= bitsIn(cell);
      cell = cell === cells.length - 1 ? 0 : cell + 1;
    }
  }

  const out = new Uint8Array(WIDTH / 8);
  cells.forEach((value, c) => {
    for (let k = 0; k < bitsIn(c) / 8; k++) out[c * 8 + k] = Number((value >> BigInt(8 * k)) & 0xffn);
  });
  let length = BigInt(bytes.length);
  for (let k = out.length - 8; k < out.length; k++) {
    out[k]! ^= Number(length & 0xffn);
    length >>= 8n;
  }
  let binary = '';
  for (const b of out) binary += String.fromCharCode(b);
  return btoa(binary);
}
