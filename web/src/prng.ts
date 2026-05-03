export type PRNGOutput = {
  u: number; // normalized in [0,1)
  x: bigint; // raw integer state/output
};

function pow10Big(n: number): bigint {
  let r = 1n;
  for (let i = 0; i < n; i += 1) r *= 10n;
  return r;
}

export function* middleSquare(seed: bigint, d: number): Generator<PRNGOutput> {
  if (d <= 0) throw new Error("Dígitos a extraer debe ser > 0");

  let x = seed;
  const mod = pow10Big(d);

  while (true) {
    let s = (x * x).toString();

    // Pad to ensure we have at least 'd' digits
    if (s.length < d) {
      s = s.padStart(d, "0");
    }

    // Determine the start index for the 'd' central digits
    // Example: s="123456", d=2 -> start = (6-2)/2 = 2. s.slice(2, 4) = "34"
    const start = Math.floor((s.length - d) / 2);
    const center = s.slice(start, start + d);

    x = BigInt(center);
    const u = Number(x) / Number(mod);
    yield { u, x };
  }
}

export function* laggedFibonacci(
  seed1: bigint,
  seed2: bigint,
  j: number,
  k: number,
  m: bigint
): Generator<PRNGOutput> {
  if (!Number.isInteger(j) || j <= 0) throw new Error("j must be a positive integer");
  if (!Number.isInteger(k) || k <= 0) throw new Error("k must be a positive integer");
  if (k <= j) throw new Error("k must be > j");
  if (m <= 1n) throw new Error("m must be > 1");

  const buf: bigint[] = [];
  let x0 = seed1 % m;
  let x1 = seed2 % m;
  if (x0 < 0n) x0 += m;
  if (x1 < 0n) x1 += m;
  buf.push(x0);
  if (k > 1) buf.push(x1);
  for (let i = 2; i < k; i += 1) buf.push((buf[i - 1] + buf[i - 2]) % m);

  let idx = 0;
  while (true) {
    const iK = idx % k;
    const iJ = (idx - j + k) % k;
    const x = (buf[iJ] + buf[iK]) % m;
    buf[iK] = x;
    idx += 1;
    yield { u: Number(x) / Number(m), x };
  }
}

export function* multiplicativeLCG(seed: bigint, a: bigint, m: bigint): Generator<PRNGOutput> {
  if (m <= 1n) throw new Error("m must be > 1");
  if (a <= 0n || a >= m) throw new Error("a must satisfy 0 < a < m");

  let x = seed % m;
  if (x === 0n) x = 1n;

  while (true) {
    x = (a * x) % m;
    yield { u: Number(x) / Number(m), x };
  }
}

export function* mixedLCG(seed: bigint, a: bigint, c: bigint, m: bigint): Generator<PRNGOutput> {
  if (m <= 1n) throw new Error("m must be > 1");
  if (a <= 0n || a >= m) throw new Error("a must satisfy 0 < a < m");

  let inc = c % m;
  if (inc < 0n) inc += m;

  let x = seed % m;
  if (x < 0n) x += m;

  // Yield X0 first
  yield { u: Number(x) / Number(m), x };

  while (true) {
    x = (a * x + inc) % m;
    yield { u: Number(x) / Number(m), x };
  }
}

function gcdBigInt(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

function uniquePrimeFactors(n: bigint): bigint[] {
  const factors: bigint[] = [];
  let x = n;

  let p = 2n;
  while (p * p <= x) {
    if (x % p === 0n) {
      factors.push(p);
      while (x % p === 0n) x /= p;
    }
    p = p === 2n ? 3n : p + 2n;
  }

  if (x > 1n) factors.push(x);
  return factors;
}

export function mixedLCGHasFullPeriod(a: bigint, c: bigint, m: bigint): boolean {
  const { cond1, cond2, cond3 } = checkHullDobellDetailed(a, c, m);
  return cond1 && cond2 && cond3;
}

export type HullDobellResult = {
  cond1: boolean; // gcd(c, m) = 1
  cond2: boolean; // (a-1) divisible by all prime factors of m
  cond3: boolean; // if 4|m then 4|(a-1)
};

export function checkHullDobellDetailed(a: bigint, c: bigint, m: bigint): HullDobellResult {
  if (m <= 1n) throw new Error("m must be > 1");

  const cond1 = gcdBigInt(c, m) === 1n;

  const factors = uniquePrimeFactors(m);
  let cond2 = true;
  for (const p of factors) {
    if ((a - 1n) % p !== 0n) {
      cond2 = false;
      break;
    }
  }

  const cond3 = m % 4n !== 0n || (a - 1n) % 4n === 0n;

  return { cond1, cond2, cond3 };
}

