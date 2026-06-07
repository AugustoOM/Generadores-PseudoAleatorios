export type PRNGOutput = {
  u: number; // Valor normalizado en [0,1)
  x: bigint; // Estado o salida entera cruda (sin normalizar)
  aux?: string; // Información auxiliar opcional (ej: valor al cuadrado)
  repeatOf?: number; // Índice de la fila donde este valor se repite
  stateKey?: string; // Cadena de texto que representa el estado completo único del generador
  isBifurcated?: boolean; // Verdadero si este estado contiene dos valores separados (ej. producto medio bifurcado)
  u1?: number; // Primer valor U en caso de bifurcación
  u2?: number; // Segundo valor U en caso de bifurcación
  productA?: string;
  productB?: string;
  centerA?: string;
  centerB?: string;
  val1Str?: string;
  val2Str?: string;
  val1?: bigint;
  val2?: bigint;
  d?: number;
};

// Utilidad para calcular potencias de 10 con BigInt
function pow10Big(n: number): bigint {
  let r = 1n;
  for (let i = 0; i < n; i += 1) r *= 10n;
  return r;
}

// Extrae los d dígitos centrales de un número BigInt
function centerDigits(value: bigint, d: number): bigint {
  let s = (value < 0n ? -value : value).toString();
  if (s.length > d) {
    const start = Math.floor((s.length - d) / 2);
    s = s.slice(start, start + d);
  }
  return BigInt(s);
}

// Generador de Números Pseudoaleatorios: Método de Cuadrados Medios
export function* middleSquare(seed: bigint, d: number): Generator<PRNGOutput> {
  if (d <= 0) throw new Error("Dígitos a extraer debe ser > 0");
  if (seed < 0n) throw new Error("La semilla debe ser >= 0");

  let x = seed;
  const mod = pow10Big(d);

  // Normalizar la semilla original basándonos en su propia longitud para no desbordar U en [0,1)
  const seedStr = x.toString();
  const seedMod = pow10Big(Math.max(d, seedStr.length));

  yield { u: Number(x) / Number(seedMod), x, aux: "Semilla Original" };

  while (true) {
    const square = x * x;
    let s = square.toString();

    // Regla de 2n: Rellenar siempre con ceros a la izquierda hasta 2*D
    const targetLen = 2 * d;
    if (s.length < targetLen) {
      s = s.padStart(targetLen, "0");
    }
    
    // Índice de inicio inclinado hacia la derecha si D es impar
    const start = Math.ceil((s.length - d) / 2);
    const center = s.slice(start, start + d);
    const left = s.slice(0, start);
    const right = s.slice(start + d);

    x = BigInt(center);
    const u = Number(x) / Number(mod);
    
    if (x === 0n) {
      yield { u, x, aux: `${left} | [${center}] | ${right} (${square}) - ¡DEGENERADO!` };
      break; // Abortar la secuencia para evitar bucle infinito en 0
    }
    
    yield { u, x, aux: `${left} | [${center}] | ${right} (${square})` };
  }
}

// Generador de Números Pseudoaleatorios: Método de Producto Medio Bifurcado
export function* middleProduct(seed1: bigint, seed2: bigint, d: number, useK: boolean): Generator<PRNGOutput> {
  if (d <= 0) throw new Error("La cantidad de digitos d debe ser > 0");
  if (seed1 < 0n || seed2 < 0n) throw new Error("Las semillas X0 y X1 deben ser >= 0");

  const mod = pow10Big(d);
  let prev = useK ? seed2 : seed1; // Si useK, prev actúa como la constante K fija
  let curr = useK ? seed1 : seed2; // Si useK, curr es X0. Si no, curr es X1
  
  while (true) {
    const prod = prev * curr;
    let s = prod.toString();
    
    // Regla de 2n: Rellenar SIEMPRE con ceros a la izquierda hasta 2*D
    const targetLen = 2 * d;
    if (s.length < targetLen) {
      s = s.padStart(targetLen, "0");
    }
    
    const diff = s.length - d;
    let v1: bigint;
    let v2: bigint;
    let centerText = "-";

    if (diff % 2 === 0) {
      // D es par, hay un centro exacto (no hay bifurcación)
      const start = diff / 2;
      centerText = s.slice(start, start + d);
      v1 = BigInt(centerText);
      v2 = 0n;
    } else {
      // D es impar, el centro es ambiguo (bifurcación)
      const start1 = Math.floor(diff / 2);
      const start2 = Math.ceil(diff / 2);
      
      const c1 = s.slice(start1, start1 + d);
      const c2 = s.slice(start2, start2 + d);
      
      // El bloque central superpuesto abarca D + 1 caracteres
      centerText = s.slice(start1, start2 + d);
      
      v1 = BigInt(c1);
      v2 = BigInt(c2);
    }

    let auxMessage = "-";
    if (v1 === 0n) {
      yield {
        productA: s,
        productB: "-",
        centerA: centerText,
        centerB: "-",
        val1Str: v1.toString().padStart(d, "0"),
        val2Str: v2.toString().padStart(d, "0"),
        val1: v1,
        val2: v2,
        u1: Number(v1) / Number(mod),
        u2: Number(v2) / Number(mod),
        x: v1,
        u: Number(v1) / Number(mod),
        aux: "Degeneración: el método llega a 0",
        d: d,
        stateKey: useK ? `${curr}` : `${prev},${curr}`,
        isBifurcated: diff % 2 !== 0
      };
      break; // Abortar
    }

    yield {
      productA: s,
      productB: "-",
      centerA: centerText,
      centerB: "-",
      val1Str: v1.toString().padStart(d, "0"),
      val2Str: v2.toString().padStart(d, "0"),
      val1: v1,
      val2: v2,
      u1: Number(v1) / Number(mod),
      u2: Number(v2) / Number(mod),
      x: v1,
      u: Number(v1) / Number(mod),
      aux: auxMessage,
      d: d,
      stateKey: useK ? `${curr}` : `${prev},${curr}`,
      isBifurcated: diff % 2 !== 0
    };

    if (!useK) {
      prev = curr;
    }
    // Si useK es true, prev (K) se mantiene constante
    curr = v1;
  }
}

// Generador de Números Pseudoaleatorios: Método de Fibonacci Retardado (LFG)
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

  if (seed1 >= m || seed1 < 0n) throw new Error(`Semilla 1 (${seed1}) debe ser mayor o igual a 0 y estrictamente menor que el módulo m (${m})`);
  if (seed2 >= m || seed2 < 0n) throw new Error(`Semilla 2 (${seed2}) debe ser mayor o igual a 0 y estrictamente menor que el módulo m (${m})`);

  const buf: bigint[] = [];
  let x0 = seed1;
  let x1 = seed2;
  buf.push(x0);
  if (k > 1) buf.push(x1);
  for (let i = 2; i < k; i += 1) buf.push((buf[i - 1] + buf[i - 2]) % m);

  // Devolver el estado inicial completo
  for (let i = 0; i < k; i++) {
    const stateKey = i === 0 ? buf.join(',') : undefined;
    yield { u: Number(buf[i]) / Number(m), x: buf[i], aux: i < 2 ? "Semilla" : "Relleno inicial", stateKey };
  }

  let idx = 0;
  while (true) {
    const iK = idx % k;
    const iJ = (idx - j + k) % k;
    const x = (buf[iJ] + buf[iK]) % m;
    buf[iK] = x;
    idx += 1;
    
    // El estado completo es la ventana de longitud k en orden cronológico
    const orderedBuf = [];
    for (let i = 0; i < k; i++) {
      orderedBuf.push(buf[(idx + i) % k]);
    }
    const stateKey = orderedBuf.join(',');
    
    yield { u: Number(x) / Number(m), x, stateKey };
  }
}

// Generador de Números Pseudoaleatorios: Generador Congruencial Lineal (LCG) Multiplicativo
export function* multiplicativeLCG(seed: bigint, a: bigint, m: bigint): Generator<PRNGOutput> {
  if (m <= 1n) throw new Error("El módulo m debe ser > 1");
  
  let aEff = a % m;
  if (aEff < 0n) aEff += m;
  if (aEff === 0n) throw new Error("El multiplicador a no puede ser múltiplo del módulo m");

  if (seed >= m || seed < 0n) throw new Error(`La semilla X0 (${seed}) debe ser mayor o igual a 0 y estrictamente menor que el módulo m (${m})`);
  let x = seed;
  if (x === 0n) {
    x = 1n;
    yield { u: Number(x) / Number(m), x, aux: "Semilla 0 reemplazada por 1 para evitar degeneracion inmediata" };
  } else {
    // Devolver el estado inicial X0 primero
    yield { u: Number(x) / Number(m), x, aux: "Semilla" };
  }

  while (true) {
    const nextX = (aEff * x) % m;
    if (nextX === 0n) {
      yield { u: 0, x: 0n, aux: "Estado absorbente destructivo (Xn = 0)" };
      break;
    }
    yield { u: Number(nextX) / Number(m), x: nextX, aux: `${aEff} · ${x}` };
    x = nextX;
  }
}

// Generador de Números Pseudoaleatorios: Generador Congruencial Lineal (LCG) Mixto
export function* mixedLCG(seed: bigint, a: bigint, c: bigint, m: bigint): Generator<PRNGOutput> {
  if (m <= 1n) throw new Error("El módulo m debe ser > 1");

  let aEff = a % m;
  if (aEff < 0n) aEff += m;
  if (aEff === 0n) throw new Error("El multiplicador a no puede ser múltiplo del módulo m");

  let inc = c % m;
  if (inc < 0n) inc += m;

  if (seed >= m || seed < 0n) throw new Error(`La semilla X0 (${seed}) debe ser mayor o igual a 0 y estrictamente menor que el módulo m (${m})`);
  let x = seed;

  // Devolver el estado inicial X0 primero
  yield { u: Number(x) / Number(m), x, aux: "Semilla" };

  while (true) {
    const nextX = (aEff * x + inc) % m;
    yield { u: Number(nextX) / Number(m), x: nextX, aux: `(${aEff} · ${x} + ${inc})` };
    x = nextX;
  }
}

// Calcula el Máximo Común Divisor (MCD) de dos números BigInt
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

// Descompone un número BigInt en sus factores primos únicos
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

// Comprueba si un generador congruencial lineal mixto tiene período completo usando Hull-Dobell
export function mixedLCGHasFullPeriod(a: bigint, c: bigint, m: bigint): boolean {
  const { cond1, cond2, cond3 } = checkHullDobellDetailed(a, c, m);
  return cond1 && cond2 && cond3;
}

export type HullDobellResult = {
  cond1: boolean; // Condición 1: MCD(c, m) = 1
  cond2: boolean; // Condición 2: (a-1) divisible por todos los factores primos de m
  cond3: boolean; // Condición 3: si 4 divide a m, entonces 4 divide a (a-1)
};

// Evalúa individualmente y en detalle las tres condiciones matemáticas del Teorema de Hull-Dobell
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
