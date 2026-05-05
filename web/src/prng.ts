export type PRNGOutput = {
  u: number; // normalized in [0,1)
  x: bigint; // raw integer state/output
  aux?: string; // auxiliary info (e.g. squared value)
};

function pow10Big(n: number): bigint {
  let r = 1n;
  for (let i = 0; i < n; i += 1) r *= 10n;
  return r;
}

export function* middleSquare(seed: bigint, d: number): Generator<PRNGOutput> {
  if (d <= 0) throw new Error("Dígitos a extraer debe ser > 0");

  const seedText = seed.toString();
  let sSeed = seed.toString();
  // Si la semilla es más larga que D, tomamos su centro para empezar
  if (sSeed.length > d) {
    if ((sSeed.length - d) % 2 !== 0) sSeed = "0" + sSeed;
    const start = (sSeed.length - d) / 2;
    sSeed = sSeed.slice(start, start + d);
  } else if (sSeed.length < d) {
    sSeed = sSeed.padStart(d, "0");
  }

  let x = BigInt(sSeed);
  const mod = pow10Big(d);
  if (seedText.includes("00")) {
    x = (x * 12n) % mod;
  }

  // Yield X0 (la semilla ya recortada al centro si era necesario)
  yield { u: Number(x) / Number(mod), x, aux: seedText.includes("00") ? "Semilla (x12)" : "Semilla (Centro)" };

  while (true) {
    const square = x * x;
    let s = square.toString();

    // Pad to at least 2*D for consistent centering
    const minLen = 2 * d;
    if (s.length < minLen) {
      s = s.padStart(minLen, "0");
    }
    
    // Paridad para centro exacto
    if ((s.length - d) % 2 !== 0) {
      s = "0" + s;
    }

    const start = (s.length - d) / 2;
    const center = s.slice(start, start + d);
    const left = s.slice(0, start);
    const right = s.slice(start + d);

    x = BigInt(center);
    const u = Number(x) / Number(mod);
    yield { u, x, aux: `${left} | [${center}] | ${right} (${square})` };
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
    const nextX = (a * x) % m;
    yield { u: Number(nextX) / Number(m), x: nextX, aux: `${a} * ${x}` };
    x = nextX;
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
  yield { u: Number(x) / Number(m), x, aux: "Semilla" };

  while (true) {
    const nextX = (a * x + inc) % m;
    yield { u: Number(nextX) / Number(m), x: nextX, aux: `(${a} * ${x} + ${inc})` };
    x = nextX;
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

