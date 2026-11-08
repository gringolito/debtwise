/** atCommonScale reads two decimal strings as integers of the same number of decimal places. */
export function atCommonScale(a: string, b: string): [bigint, bigint] {
  const [aInteger, aFraction = ""] = a.split(".");
  const [bInteger, bFraction = ""] = b.split(".");
  const places = Math.max(aFraction.length, bFraction.length);
  return [
    BigInt(aInteger + aFraction.padEnd(places, "0")),
    BigInt(bInteger + bFraction.padEnd(places, "0")),
  ];
}

/**
 * compareDecimals orders two signed decimal strings exactly, as no float rounding can tie two
 * amounts a cent apart: negative when a is the smaller, positive when b is.
 */
export function compareDecimals(a: string, b: string): number {
  const [scaledA, scaledB] = atCommonScale(a, b);
  return scaledA === scaledB ? 0 : scaledA < scaledB ? -1 : 1;
}
