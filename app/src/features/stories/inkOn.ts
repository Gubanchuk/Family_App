// Text colour that reads on a plate of the given colour.
export function inkOn(hex: string): '#111111' | '#FFFFFF' {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 160 ? '#111111' : '#FFFFFF';
}
