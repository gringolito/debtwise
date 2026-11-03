// The schedule charges an insurance as its base times its monthly rate, rounded half up to
// centavos. A charge on the bank's statement therefore fixes the rate only to a range: those whose
// product with the base lies within half a centavo of it, the lower end included.

const DECIMAL = /^(\d+)(?:\.(\d+))?$/;
// The API reads a rate with up to 12 decimal places.
const MAX_RATE_PLACES = 12;

/** A decimal read exactly, as units / 10^places. */
interface Scaled {
  units: bigint;
  places: number;
}

function parse(decimal: string): Scaled | undefined {
  const match = DECIMAL.exec(decimal);
  if (!match) return undefined;
  const [, integer, fraction = ""] = match;
  return { units: BigInt(integer + fraction), places: fraction.length };
}

function format(units: bigint, places: number): string {
  if (places === 0) return units.toString();
  const digits = units.toString().padStart(places + 1, "0");
  return `${digits.slice(0, -places)}.${digits.slice(-places)}`;
}

const ceilDiv = (a: bigint, b: bigint) => (a <= 0n ? -(-a / b) : (a + b - 1n) / b);

/**
 * rateFromCharge returns the monthly rate, as a fraction, that charges `charge` reais on `base`
 * reais, both decimal strings. Of the rates that do, it takes the one with the fewest decimal
 * places, and of those the nearest to charge / base. It returns undefined when the charge isn't
 * whole centavos, the base isn't positive, or no rate with up to 12 places gives the charge back.
 */
export function rateFromCharge(charge: string, base: string): string | undefined {
  const c = parse(charge);
  const b = parse(base);
  if (!c || !b || c.places > 2 || b.units === 0n) return undefined;

  // In half centavos, a rate r gives the charge back when 2C - 1 <= 200·base·r < 2C + 1.
  const halfCentavos = 2n * c.units * 10n ** BigInt(2 - c.places);
  const divisor = 200n * b.units;

  for (let places = 0; places <= MAX_RATE_PLACES; places++) {
    const scale = 10n ** BigInt(b.places + places);
    const lowest = ceilDiv((halfCentavos - 1n) * scale, divisor);
    const highest = ceilDiv((halfCentavos + 1n) * scale, divisor) - 1n;
    if (lowest > highest) continue;

    const nearest = (2n * halfCentavos * scale + divisor) / (2n * divisor);
    const rate = nearest < lowest ? lowest : nearest > highest ? highest : nearest;
    return format(rate, places);
  }
  return undefined;
}
