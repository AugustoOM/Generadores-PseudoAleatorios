import "./style.css";
import {
  laggedFibonacci,
  middleSquare,
  middleProduct,
  multiplicativeLCG,
  mixedLCG,
  checkHullDobellDetailed,
  type PRNGOutput,
} from "./prng";

type Method = "middle-square" | "fibonacci" | "multiplicative" | "mixed" | "middle-product";
type GeminiRole = "user" | "model";
type GeminiMessage = {
  role: GeminiRole;
  parts: { text: string }[];
};

const methodDetails: Record<Method, { name: string; description: string }> = {
  "middle-square": {
    name: "Cuadrados medios",
    description: "Eleva la semilla al cuadrado y toma los dígitos centrales.",
  },
  "middle-product": {
    name: "Producto medio (Bifurcado)",
    description: "Multiplica los últimos valores. Si D es impar, bifurca en dos caminos paralelos.",
  },
  fibonacci: {
    name: "Fibonacci retardado",
    description: "Combina estados separados por retardos j y k dentro de un modulo m.",
  },
  multiplicative: {
    name: "LCG multiplicativo",
    description: "Actualiza cada estado multiplicando por a y reduciendo modulo m.",
  },
  mixed: {
    name: "LCG mixto",
    description: "Suma un incremento c al generador congruencial y valida Hull-Dobell.",
  },
};

// --- CONSTANTES DE CONFIGURACIÓN ---
const TOTAL_INTERNAL_GENERATIONS = 1000; // Total de iteraciones internas para pruebas estadísticas
const INITIAL_TABLE_LIMIT = 20; // Límite inicial de filas visibles en la tabla
const HISTOGRAM_BINS = 10; // Cantidad de intervalos para el histograma
const MAX_PERIOD_OUTPUT = 10000; // Límite máximo para evitar bloqueos por periodos largos
const GEMINI_CHAT_MODEL = "gemini-2.5-flash-lite";

type HistogramMode = "requested" | "full";

// Estructura que almacena el estado actual de la generación activa
type GenerationViewState = {
  requestedRows: PRNGOutput[]; // Filas generadas solicitadas por el usuario
  fullRows: PRNGOutput[]; // Serie completa de 1000 iteraciones para estadísticas
  expanded: boolean; // Indica si se muestran todas las filas en la tabla
  histogramMode: HistogramMode; // Modo de visualización del histograma ("requested" o "full")
  requestedN: number; // Cantidad total N solicitada
  effectiveN: number; // Cantidad efectiva generada en tabla
  method: Method; // Método utilizado para la generación
};

let currentViewState: GenerationViewState | null = null;
let generationWarnings: string[] = [];

function addGenerationWarning(message: string) {
  if (!generationWarnings.includes(message)) {
    generationWarnings.push(message);
  }
}

// Estructura de resultados en la búsqueda de períodos / ciclos
type PeriodResult = {
  rows: PRNGOutput[];
  period: number | null; // Periodo detectado o null si no se repite
  capped: boolean; // True si se superó el límite de seguridad
  limit: number;
};

// Retorna el valor crítico de la tabla t de Student para un df (grados de libertad) a una significancia de 0.05 bilateral
function getTTableValue(df: number): number {
  if (df <= 0) return NaN;
  // Valores tabulados de la tabla t de Student para alfa = 0.05 de dos colas
  const tTable: Record<number, number> = {
    1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
    6: 2.447, 7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
    11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
    16: 2.120, 17: 2.110, 18: 2.101, 19: 2.093, 20: 2.086,
    21: 2.080, 22: 2.074, 23: 2.069, 24: 2.064, 25: 2.060,
    26: 2.056, 27: 2.052, 28: 2.048, 29: 2.045, 30: 2.042,
    40: 2.021, 60: 2.000, 80: 1.990, 100: 1.984, 120: 1.980
  };

  if (tTable[df]) return tTable[df];

  // Interpolación lineal aproximada para valores de df no explícitos en el mapa
  if (df < 30) {
    let lower = 1;
    for (const k in tTable) {
      if (Number(k) < df) lower = Number(k);
    }
    return tTable[lower];
  }

  if (df > 120) return 1.960;

  if (df > 100) return 1.984 - ((df - 100) / 20) * (1.984 - 1.980);
  if (df > 80) return 1.990 - ((df - 80) / 20) * (1.990 - 1.984);
  if (df > 60) return 2.000 - ((df - 60) / 20) * (2.000 - 1.990);
  if (df > 40) return 2.021 - ((df - 40) / 20) * (2.021 - 2.000);
  if (df > 30) return 2.042 - ((df - 30) / 10) * (2.042 - 2.021);

  return 1.960;
}

// Abrevación rápida para buscar y castear un elemento HTML por su ID
function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

// Muestra u oculta múltiples elementos del DOM usando un selector de clase/etiqueta
function setHidden(selector: string, hidden: boolean) {
  for (const node of document.querySelectorAll<HTMLElement>(selector)) {
    node.hidden = hidden;
  }
}

// Convierte un string en BigInt con soporte para expresiones exponenciales (ej. 2^31-1 o 2**31-1)
function toBigIntStrict(value: string, name: string): bigint {
  const s = value.trim().replace(/\s+/g, "");
  if (s.length === 0) throw new Error(`${name} is required`);

  try {
    const match = s.match(/^(\d+)\s*(?:\*\*|\^|\*)\s*(\d+)(?:\s*([-+])\s*(\d+))?$/);
    if (match) {
      const base = BigInt(match[1]);
      const exp = BigInt(match[2]);
      let res = base ** exp;
      if (match[3] === "-") res -= BigInt(match[4]);
      if (match[3] === "+") res += BigInt(match[4]);
      return res;
    }
    return BigInt(s);
  } catch {
    throw new Error(`${name} debe ser un número entero o expresión (ej: 2*31-1)`);
  }
}

// Convierte un string numérico en un entero estándar
function toIntStrict(value: string, name: string): number {
  const bi = toBigIntStrict(value, name);
  if (bi > BigInt(Number.MAX_SAFE_INTEGER) || bi < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new Error(`${name} excede el rango entero seguro de JavaScript`);
  }
  return Number(bi);
}

function requireDigitString(value: string, name: string): string {
  const s = value.trim();
  if (!/^\d+$/.test(s)) {
    throw new Error(`${name} debe contener solo digitos enteros no negativos`);
  }
  return s;
}

function replacementSeed(digits: number, offset = 0): string {
  const width = Math.max(1, digits);
  const mod = 10 ** Math.min(width, 12);
  const base = (Date.now() + offset * 104729) % mod;
  const normalized = base === 0 ? 1 : base;
  return normalized.toString().padStart(width, "0").slice(-width);
}

// Formatea un número decimal u cortando ceros innecesarios a la derecha (máx. 12 decimales)
function formatU(u: number): string {
  if (!Number.isFinite(u)) return String(u);
  return u.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

function getUValues(rows: PRNGOutput[]): number[] {
  const values: number[] = [];
  for (const row of rows) {
    values.push(row.u1 !== undefined ? row.u1 : row.u);
    if (row.isBifurcated && row.u2 !== undefined) {
      values.push(row.u2);
    }
  }
  return values;
}

// Construye e instancia la función generadora (PRNG) activa según el método de la interfaz
function buildGenerator(method: Method): Generator<PRNGOutput> {
  if (method === "middle-square") {
    const seedEl = el<HTMLInputElement>("seed");
    let seedInput = requireDigitString(seedEl.value, "seed");
    if (seedInput.length < 4 || seedInput.length % 2 !== 0) {
      throw new Error("La semilla debe tener una longitud par (n ≥ 4) para el método de cuadrados medios.");
    }
    if (/^0+$/.test(seedInput)) {
      const replacement = replacementSeed(seedInput.length);
      seedEl.value = replacement;
      addGenerationWarning(`La semilla ${seedInput} no sirve para cuadrados medios porque degenera en 0. Se reemplazo por ${replacement}.`);
      seedInput = replacement;
    }
    const seed = toBigIntStrict(seedInput, "seed");
    const digits = seedInput.length;
    return middleSquare(seed, digits);
  }
  if (method === "fibonacci") {
    const seed = toBigIntStrict(el<HTMLInputElement>("seed").value, "seed");
    const seed2 = toBigIntStrict(el<HTMLInputElement>("seed2").value, "seed2");
    const j = toIntStrict(el<HTMLInputElement>("j").value, "j");
    const k = toIntStrict(el<HTMLInputElement>("k").value, "k");
    const m = toBigIntStrict(el<HTMLInputElement>("mFib").value, "m");
    return laggedFibonacci(seed, seed2, j, k, m);
  }

  if (method === "middle-product") {
    const useK = el<HTMLInputElement>("useK").checked;
    const x0Raw = el<HTMLInputElement>("x0Prod").value.trim();
    const x1Raw = useK ? el<HTMLInputElement>("kProd").value.trim() : el<HTMLInputElement>("x1Prod").value.trim();
    
    if (!useK && x0Raw.length !== x1Raw.length) {
      throw new Error("X0 y X1 deben tener idéntica longitud de dígitos (n).");
    }
    if (x0Raw.endsWith("0") || (!useK && x1Raw.endsWith("0"))) {
      throw new Error("Ninguna semilla puede finalizar en cero (estado absorbente destructivo).");
    }
    const x0 = toBigIntStrict(x0Raw, "X0");
    const x1 = toBigIntStrict(x1Raw, useK ? "K" : "X1");
    const d = x0Raw.length;
    return middleProduct(x0, x1, d, useK);
  }

  if (method === "multiplicative") {
    const seedEl = el<HTMLInputElement>("x0Lcg");
    const aEl = el<HTMLInputElement>("aLcg");
    const seed = toBigIntStrict(seedEl.value, "X0");
    if (seed === 0n) throw new Error("La semilla inicial X0 jamás puede ser cero.");
    const a = toBigIntStrict(aEl.value, "a");
    const m = toBigIntStrict(el<HTMLInputElement>("mLcgInput").value, "m");
    if (m <= 1n) throw new Error("El modulo m debe ser > 1");
    let seedEff = seed % m;
    if (seedEff < 0n) seedEff += m;
    if (seedEff === 0n) {
      seedEl.value = "1";
      addGenerationWarning("X0 era congruente con 0 modulo m en el LCG multiplicativo. Se reemplazo por 1 para evitar degeneracion inmediata.");
    }
    let aEff = a % m;
    if (aEff < 0n) aEff += m;
    if (aEff === 0n) {
      aEl.value = "1";
      addGenerationWarning("El multiplicador a era multiplo de m. Se reemplazo por 1 para evitar que todos los estados caigan en 0.");
    }
    return multiplicativeLCG(seedEl.value === "1" ? 1n : seed, aEl.value === "1" ? 1n : a, m);
  }

  const seedEl = el<HTMLInputElement>("x0Mixed");
  const aEl = el<HTMLInputElement>("aMixed");
  const cEl = el<HTMLInputElement>("cMixed");
  const seed = toBigIntStrict(seedEl.value, "X0");
  let a = toBigIntStrict(aEl.value, "a");
  let c = toBigIntStrict(cEl.value, "c");
  const m = toBigIntStrict(el<HTMLInputElement>("mMixed").value, "m");
  if (m <= 1n) throw new Error("El modulo m debe ser > 1");
  let aEff = a % m;
  if (aEff < 0n) aEff += m;
  if (aEff === 0n) {
    aEl.value = "1";
    addGenerationWarning("El multiplicador a era multiplo de m. Se reemplazo por 1 para evitar una secuencia constante.");
    a = 1n;
  }
  let cEff = c % m;
  if (cEff < 0n) cEff += m;
  let seedEff = seed % m;
  if (seedEff < 0n) seedEff += m;
  if (seedEff === 0n && cEff === 0n) {
    cEl.value = "1";
    addGenerationWarning("X0 y c eran 0 modulo m en el LCG mixto. Se reemplazo c por 1 para evitar degeneracion inmediata.");
    c = 1n;
  }
  return mixedLCG(seed, a, c, m);
}

// Configura la visualización de los campos de entrada de datos según el método PRNG seleccionado
function updateMethodVisibility(method: Method) {
  setHidden(".method", true);
  if (method === "middle-square") setHidden(".method-middle-square", false);
  if (method === "middle-product") setHidden(".method-middle-product", false);
  if (method === "fibonacci") setHidden(".method-fibonacci", false);
  if (method === "multiplicative") setHidden(".method-multiplicative", false);
  if (method === "mixed") setHidden(".method-mixed", false);

  const info = el<HTMLDivElement>("methodInfo");
  info.innerHTML = "";
  const title = document.createElement("strong");
  title.textContent = methodDetails[method].name;
  const desc = document.createElement("span");
  desc.textContent = methodDetails[method].description;
  info.append(title, desc);
}

// Genera y rellena dinámicamente las filas de la tabla de resultados en el HTML de la UI
function renderTable(rows: any[], fullRows: any[], method: Method) {
  const tbody = el<HTMLTableSectionElement>("tbody");
  tbody.innerHTML = "";

  const thAux = el("th-aux");
  const thU = el("th-u");
  const thX = el("th-x");

  if (method === "middle-product") {
    thU.textContent = "u1 | u2";
    thAux.textContent = "Producto | Centro";
    thX.textContent = "Val 1 | Val 2";
  } else {
    thU.textContent = "u in [0,1)";
    thAux.textContent = "Cálculo";
    thX.textContent = "X\u1D62";
  }

  const sourceOfRepeat = new Set<number>();
  for (const r of fullRows) {
    if (r?.repeatOf !== undefined) {
      sourceOfRepeat.add(r.repeatOf);
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    if (!r) continue;
    const tr = document.createElement("tr");

    if (r.repeatOf !== undefined) {
      tr.classList.add("row-repeat-target");
    }
    if (sourceOfRepeat.has(i)) {
      tr.classList.add("row-repeat-source");
    }

    const tdIdx = document.createElement("td");
    tdIdx.className = "num";
    if (r.repeatOf !== undefined) {
      tdIdx.innerHTML = `${i} <br><span class="badge badge-red">Repite #${r.repeatOf}</span>`;
    } else if (sourceOfRepeat.has(i)) {
      tdIdx.innerHTML = `${i} <br><span class="badge badge-blue">Origen</span>`;
    } else {
      tdIdx.textContent = String(i);
    }

    const tdU = document.createElement("td");
    tdU.className = "num";
    if (method === "middle-product") {
      tdU.innerHTML = `${formatU(r.u1)}<br>${formatU(r.u2)}`;
    } else {
      tdU.textContent = formatU(r.u);
    }

    const tdAux = document.createElement("td");
    const isRegeneration = r.aux && r.aux.includes("Debido a que la semilla 0");
    tdAux.className = isRegeneration ? "regeneration" : "num";
    if (method === "middle-product") {
      tdAux.style.fontSize = "0.85em";
      tdAux.innerHTML = `P: ${r.productA} | ${r.productB}<br>C: ${r.centerA} | ${r.centerB}`;
      if (r.aux !== "-") {
        tdAux.innerHTML += `<br><span class="badge badge-yellow">${r.aux}</span>`;
      }
    } else {
      tdAux.textContent = r.aux ?? "-";
    }

    const tdX = document.createElement("td");
    tdX.className = "num";
    if (method === "middle-product") {
      tdX.innerHTML = `${r.val1Str} | ${r.val2Str}`;
    } else {
      tdX.textContent = r.x.toString();
    }

    tr.append(tdIdx, tdU, tdAux, tdX);
    tbody.append(tr);
  }
}

// Ejecuta la Prueba Chi-Cuadrado de Uniformidad y renderiza las barras del histograma en la interfaz
function renderHistogram(rows: PRNGOutput[], mode: HistogramMode) {
  const host = el<HTMLDivElement>("hist-bars");
  const meta = el<HTMLParagraphElement>("hist-meta");
  host.innerHTML = "";

  if (rows.length === 0) {
    meta.textContent = "Sin datos";
    el("chi-square").hidden = true;
    el("chi-detail").hidden = true;
    return;
  }

  // 1. Calcular frecuencias por intervalos (Chi-Cuadrado)
  const uValues = getUValues(rows);

  const K = 10;
  const n = uValues.length;
  const counts = new Array<number>(K).fill(0);

  for (const u of uValues) {
    let bin = Math.floor(u * K);
    if (bin >= K) bin = K - 1;
    if (bin < 0) bin = 0;
    counts[bin]++;
  }

  // 2. Renderizar Barras
  const maxCount = Math.max(...counts, 1);
  counts.forEach((count, bin) => {
    const bucket = document.createElement("div");
    bucket.className = "histBucket";

    const bar = document.createElement("div");
    bar.className = "histBar";
    const heightPx = Math.max(8, Math.round((count / maxCount) * 150));
    bar.style.height = `${heightPx}px`;

    const label = document.createElement("span");
    label.className = "histLabel";
    label.textContent = `${(bin / K).toFixed(1)}`;

    const value = document.createElement("span");
    value.className = "histValue";
    value.textContent = String(count);

    bucket.append(value, bar, label);
    host.append(bucket);
  });

  const modeLabel = mode === "requested" ? "n solicitado" : "1000 iteraciones";
  meta.textContent = `Distribución de valores u en 10 intervalos (${modeLabel}).`;

  // 3. Prueba Chi-Cuadrado
  const expected = n / K;
  let chi2 = 0;
  for (let i = 0; i < K; i++) {
    chi2 += Math.pow(counts[i] - expected, 2) / expected;
  }

  const critical = 16.919; // Para k-1 = 9 y alfa = 0.05
  const passed = chi2 <= critical;

  el("chi-square").hidden = false;
  el("chi-val").textContent = chi2.toFixed(4);

  const status = el("chi-status");
  status.textContent = passed ? "CUMPLE" : "NO CUMPLE";
  status.style.background = passed ? "var(--green)" : "var(--red)";

  const msg = el("chi-msg");
  let msgText = passed
    ? "La distribución parece uniforme (no se rechaza H0)."
    : "La distribución no es uniforme (se rechaza H0).";
  
  if (n < 50) {
    msgText += " ⚠ Advertencia: Muestra insuficiente. Se requieren N ≥ 50 para que la frecuencia esperada (E) sea ≥ 5 en 10 intervalos.";
  }
  msg.textContent = msgText;
  msg.style.color = passed ? (n >= 50 ? "var(--green)" : "var(--yellow)") : "var(--red)";

  renderChiSquareDetail(counts, expected, chi2, critical);
}

function renderChiSquareDetail(counts: number[], expected: number, chi2: number, critical: number) {
  const k = counts.length;
  const n = counts.reduce((sum, count) => sum + count, 0);
  const df = k - 1;

  el("chi-detail").hidden = false;
  el("chi-detail-n").textContent = String(n);
  el("chi-detail-k").textContent = String(k);
  el("chi-detail-expected").textContent = `${n} / ${k} = ${expected.toFixed(4)}`;
  el("chi-detail-df").textContent = `${k} - 1 = ${df}`;
  el("chi-detail-critical").textContent = critical.toFixed(3);
  el("chi-detail-total").textContent = chi2.toFixed(4);

  const tbody = el<HTMLTableSectionElement>("chi-detail-tbody");
  tbody.innerHTML = "";

  counts.forEach((observed, index) => {
    const from = index / k;
    const to = (index + 1) / k;
    const contribution = Math.pow(observed - expected, 2) / expected;

    const tr = document.createElement("tr");
    const tdInterval = document.createElement("td");
    tdInterval.textContent = `[${from.toFixed(1)}, ${to.toFixed(1)}${index === k - 1 ? "]" : ")"}`;

    const tdObserved = document.createElement("td");
    tdObserved.className = "num";
    tdObserved.textContent = String(observed);

    const tdExpected = document.createElement("td");
    tdExpected.className = "num";
    tdExpected.textContent = expected.toFixed(4);

    const tdContribution = document.createElement("td");
    tdContribution.className = "num";
    tdContribution.textContent = contribution.toFixed(4);

    tr.append(tdInterval, tdObserved, tdExpected, tdContribution);
    tbody.append(tr);
  });
}

// Ejecuta la Prueba t-Student de Intervalo de Confianza para la media
function renderTTest(rows: PRNGOutput[]) {
  const container = el<HTMLDivElement>("t-test-container");
  const meta = el<HTMLParagraphElement>("t-test-meta");
  const detail = el<HTMLDivElement>("t-detail");

  const uValues = getUValues(rows);
  const n = uValues.length;

  if (n < 2) {
    container.hidden = true;
    meta.textContent = "Datos insuficientes. Se requiere n ≥ 2.";
    meta.hidden = false;
    detail.hidden = true;
    return;
  }

  if (n >= 30) {
    container.hidden = true;
    meta.textContent = `La prueba t-Student aplica rigurosamente para muestras pequeñas (n < 30). Actualmente n=${n}. Utiliza 10 o 20 iteraciones para evaluar la prueba t.`;
    meta.hidden = false;
    detail.hidden = true;
    return;
  }

  container.hidden = false;
  meta.hidden = true;
  detail.hidden = false;

  // 1. Calcular Media
  let sum = 0;
  for (const u of uValues) sum += u;
  const mean = sum / n;

  // 2. Calcular Desviación Estándar Muestral (S)
  let sumSq = 0;
  for (const u of uValues) {
    sumSq += Math.pow(u - mean, 2);
  }
  const variance = sumSq / (n - 1);
  const std = Math.sqrt(variance);

  // 3. Grados de libertad y t Tabla
  const df = n - 1;
  const tTabla = getTTableValue(df); // Usa la tabla existente con alfa=0.05

  // 4. Margen de error y Límites
  const error = tTabla * (std / Math.sqrt(n));
  const li = mean - error;
  const ls = mean + error;

  // 5. Decisión (H0: mu = 0.5)
  const mu = 0.5;
  const passed = mu >= li && mu <= ls;

  // 6. Actualizar UI
  el("t-test-mean").textContent = mean.toFixed(4);
  el("t-test-std").textContent = std.toFixed(4);
  el("t-test-df").textContent = String(df);
  el("t-test-tcrit").textContent = tTabla.toFixed(3);
  el("t-test-error").textContent = error.toFixed(4);

  const status = el("t-test-status");
  status.textContent = passed ? "CUMPLE" : "NO CUMPLE";
  status.style.background = passed ? "var(--green)" : "var(--red)";

  el("t-test-li").textContent = li.toFixed(4);
  el("t-test-ls").textContent = ls.toFixed(4);

  const msg = el("t-test-msg");
  msg.textContent = passed
    ? `El valor esperado μ = 0.5 se encuentra dentro del intervalo [${li.toFixed(4)}, ${ls.toFixed(4)}]. No se rechaza H0.`
    : `El valor esperado μ = 0.5 NO se encuentra dentro del intervalo [${li.toFixed(4)}, ${ls.toFixed(4)}]. Se rechaza H0.`;
  msg.style.color = passed ? "var(--green)" : "var(--red)";

  el("t-detail-n").textContent = String(n);
  el("t-detail-df").textContent = String(df);

  renderScatterPlot(rows);
}

// Dibuja el diagrama de dispersión de desfases (Scatter Plot) en un elemento Canvas (u_i vs u_{i+1})
function renderScatterPlot(rows: PRNGOutput[]) {
  const canvas = el<HTMLCanvasElement>("scatter-plot");
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = "rgba(29, 26, 22, 0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 1; i < 10; i++) {
    ctx.moveTo(0, i * h / 10); ctx.lineTo(w, i * h / 10);
    ctx.moveTo(i * w / 10, 0); ctx.lineTo(i * w / 10, h);
  }
  ctx.stroke();

  ctx.fillStyle = "rgba(32, 95, 143, 0.6)";

  const uValues = getUValues(rows);

  const n = uValues.length;
  for (let i = 0; i < n - 1; i++) {
    const ux = uValues[i];
    const uy = uValues[i + 1];

    const px = ux * w;
    const py = (1 - uy) * h;

    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

// Despacha los datos al DOM basándose en el estado global
function updateView() {
  if (!currentViewState) return;
  const { requestedRows, fullRows, expanded, histogramMode, requestedN, effectiveN, method } = currentViewState;
  
  const displayRows = expanded ? requestedRows : requestedRows.slice(0, INITIAL_TABLE_LIMIT);
  renderTable(displayRows, fullRows, method);
  renderStats(requestedRows);

  const toggleTableBtn = el<HTMLButtonElement>("toggleTable");
  const needsExpansion = requestedRows.length > INITIAL_TABLE_LIMIT;
  toggleTableBtn.hidden = !needsExpansion;
  if (needsExpansion) {
    toggleTableBtn.textContent = expanded
      ? `Ver primeras ${INITIAL_TABLE_LIMIT}`
      : `Ver todas (${requestedRows.length})`;
  }

  const histogramRows = histogramMode === "requested" ? requestedRows : fullRows;
  renderHistogram(histogramRows, histogramMode);
  renderTTest(histogramRows);
  const toggleHistogramBtn = el<HTMLButtonElement>("toggleHistogram");
  toggleHistogramBtn.hidden = fullRows.length === requestedRows.length;
  toggleHistogramBtn.textContent = histogramMode === "requested"
    ? "Ver 1000 iteraciones"
    : `Ver n (${requestedN})`;
}

// Calcula y actualiza las estadísticas principales (Mínimo, Máximo y Cantidad) de los valores generados
function renderStats(rows: PRNGOutput[]) {
  el<HTMLElement>("stat-count").textContent = String(rows.length);

  if (rows.length === 0) {
    el<HTMLElement>("stat-min").textContent = "-";
    el<HTMLElement>("stat-max").textContent = "-";
    return;
  }

  const values = getUValues(rows).filter(Number.isFinite);
  el<HTMLElement>("stat-min").textContent = formatU(Math.min(...values));
  el<HTMLElement>("stat-max").textContent = formatU(Math.max(...values));
}

// Restablece el estado de los resultados y limpia las vistas del frontend
function clearResults() {
  currentViewState = null;
  renderTable([], [], "multiplicative");
  renderStats([]);
  renderHistogram([], "requested");
  renderTTest([]);
  el<HTMLButtonElement>("copy").disabled = true;
  el<HTMLButtonElement>("toggleTable").hidden = true;
}

// Define y despliega un mensaje de error crítico en la interfaz
function setError(message: string | null) {
  const box = el<HTMLDivElement>("error");
  if (!message) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = message;
}

// Define y despliega una advertencia preventiva en la interfaz
function setWarning(message: string | null) {
  const box = el<HTMLDivElement>("warning");
  if (!message) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = message;
}

// Comprueba la validez de la semilla de Cuadrados Medios y devuelve un aviso si se detecta colapso potencial
function getMiddleSquareZeroSeedWarning(): string | null {
  if (getCurrentMethod() !== "middle-square") return null;
  const rawSeed = el<HTMLInputElement>("seed").value.trim();
  if (/^0+$/.test(rawSeed)) {
    return "Advertencia: usar semilla con solo 0 o 000.. en cuadrados medios degenera rapidamente la secuencia.";
  }
  if (/^0+\d+$/.test(rawSeed)) {
    return "Advertencia: al ingresar una cadena con la forma 00...xx, se eliminan los 0 a la izquierda para mejorar la precisión.";
  }
  return null;
}

// Muestra una barra de estado resumen con detalles teóricos y empíricos del generador activo
function summarize(method: Method, n: number, extra?: string) {
  const summary = el<HTMLSpanElement>("summary");
  summary.textContent = extra
    ? `${methodDetails[method].name} | Generados: ${n} | ${extra}`
    : `${methodDetails[method].name} | Generados: ${n}`;
}



function analyzeDegeneration(rows: PRNGOutput[], method: Method, period: number | null) {
  const firstRepeatIndex = rows.findIndex(row => row.repeatOf !== undefined);
  if (firstRepeatIndex >= 0) {
    const repeatOf = rows[firstRepeatIndex].repeatOf ?? 0;
    const detectedPeriod = period ?? firstRepeatIndex - repeatOf;
    if (detectedPeriod === 1) {
      addGenerationWarning(
        `La generacion colapsa (degenera) en la fila ${firstRepeatIndex}: entra en un estado absorbente constante.`
      );
    } else {
      addGenerationWarning(
        `El generador completó su ciclo en la fila ${firstRepeatIndex}: repite exactamente el estado de la fila ${repeatOf} y entra en un bucle de periodo ${detectedPeriod}.`
      );
    }
  }

  const firstZeroIndex = rows.findIndex(row => row.x === 0n || row.u === 0 || row.u1 === 0 || row.u2 === 0);
  if (firstZeroIndex >= 0 && (method === "middle-square" || method === "middle-product" || period === 1)) {
    addGenerationWarning(`Se detecto un estado 0 en la fila ${firstZeroIndex}; desde ahi el generador puede colapsar o perder variabilidad.`);
  }

  if (period !== null && period <= 5) {
    addGenerationWarning(`Periodo muy corto (${period}). Cambia semillas o parametros porque la secuencia no es util para simulacion.`);
  }
}

// Retorna el identificador del método seleccionado actualmente en el control principal
function getCurrentMethod(): Method {
  return el<HTMLSelectElement>("method").value as Method;
}

function appendChatBubble(role: GeminiRole, text: string) {
  const host = el<HTMLDivElement>("ai-chat-messages");
  const bubble = document.createElement("div");
  bubble.className = role === "user"
    ? "aiChatBubble aiChatBubbleUser"
    : "aiChatBubble aiChatBubbleModel";
  bubble.textContent = text;
  host.append(bubble);
  host.scrollTop = host.scrollHeight;
}

function setChatStatus(message: string, isError = false) {
  const status = el<HTMLParagraphElement>("ai-chat-status");
  status.textContent = message;
  status.classList.toggle("errorText", isError);
}

function getGeneratorContext(): string {
  if (!currentViewState) {
    return "Aun no hay una generacion activa en la tabla.";
  }

  const { method, requestedRows, fullRows, effectiveN } = currentViewState;
  const values = getUValues(requestedRows).slice(0, 20).map(formatU).join(", ");
  const firstRepeat = fullRows.find(row => row.repeatOf !== undefined);
  const period = firstRepeat?.repeatOf === undefined
    ? "no detectado"
    : String(fullRows.indexOf(firstRepeat) - firstRepeat.repeatOf);

  return [
    `Metodo activo: ${methodDetails[method].name}.`,
    `Valores visibles generados: ${effectiveN}.`,
    `Periodo detectado: ${period}.`,
    `Primeros U: ${values || "sin datos"}.`,
  ].join("\n");
}

async function askGemini(history: GeminiMessage[], apiKey: string, model: string): Promise<string> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: [
            "Eres un asistente educativo dentro de una app de generadores pseudoaleatorios.",
            "Responde en espanol, con explicaciones breves y practicas.",
            "Ayuda a interpretar semillas, periodos, ciclos, chi-cuadrado y pruebas t.",
            getGeneratorContext(),
          ].join("\n"),
        }],
      },
      contents: history,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data?.error?.message ?? `Error HTTP ${response.status}`;
    throw new Error(message);
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part: { text?: string }) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error("Gemini no devolvio texto para esta consulta.");
  }

  return text;
}

function wireAIChat() {
  const toggle = el<HTMLButtonElement>("rail-chat-toggle");
  const panel = el<HTMLElement>("ai-chat-panel");
  const close = el<HTMLButtonElement>("ai-chat-close");
  const form = el<HTMLFormElement>("ai-chat-form");
  const input = el<HTMLTextAreaElement>("ai-chat-input");
  const send = el<HTMLButtonElement>("ai-chat-send");
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() ?? "";
  const chatHistory: GeminiMessage[] = [];

  const openChat = () => {
    panel.hidden = false;
    input.focus();
  };

  const closeChat = () => {
    panel.hidden = true;
  };

  toggle.addEventListener("click", () => {
    if (panel.hidden) openChat();
    else closeChat();
  });
  close.addEventListener("click", closeChat);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const prompt = input.value.trim();

    if (!prompt) return;
    if (!apiKey) {
      setChatStatus("Falta VITE_GEMINI_API_KEY en web/.env. Reinicia Vite despues de agregarla.", true);
      return;
    }

    input.value = "";
    appendChatBubble("user", prompt);
    chatHistory.push({ role: "user", parts: [{ text: prompt }] });

    send.disabled = true;
    setChatStatus("Consultando Gemini...");

    try {
      const answer = await askGemini(chatHistory, apiKey, GEMINI_CHAT_MODEL);
      appendChatBubble("model", answer);
      chatHistory.push({ role: "model", parts: [{ text: answer }] });
      setChatStatus("Listo");
    } catch (error) {
      setChatStatus(error instanceof Error ? error.message : String(error), true);
    } finally {
      send.disabled = false;
      input.focus();
    }
  });
}

// Controlador maestro que lee parámetros del DOM, invoca el PRNG y guarda el estado para el renderizado
function generate() {
  setError(null);
  setWarning(null);
  generationWarnings = [];
  const initialWarning = getMiddleSquareZeroSeedWarning();
  if (initialWarning) addGenerationWarning(initialWarning);
  const method = getCurrentMethod();
  updateMethodVisibility(method);

  const gen = buildGenerator(method);
  const n = toIntStrict(el<HTMLInputElement>("count").value, "n");
  if (n <= 0) throw new Error("n must be > 0");

  let fullRows: PRNGOutput[] = [];
  let requestedRows: PRNGOutput[] = [];
  let requestedN = n;
  let effectiveN = 0;
  let expanded = false;

  let m: bigint | null = null;
  let full = false;

  const updateCond = (id: string, ok: boolean) => {
    const li = el(id);
    li.className = ok ? "ok" : "fail";
  };

  if (method === "mixed" || method === "multiplicative" || method === "fibonacci") {
    if (method === "mixed") m = toBigIntStrict(el<HTMLInputElement>("mMixed").value, "m");
    else if (method === "multiplicative") m = toBigIntStrict(el<HTMLInputElement>("mLcgInput").value, "m");
    else m = toBigIntStrict(el<HTMLInputElement>("mFib").value, "m");

    if (method === "mixed" && m !== null) {
      const a = toBigIntStrict(el<HTMLInputElement>("aMixed").value, "a");
      const c = toBigIntStrict(el<HTMLInputElement>("cMixed").value, "c");
      const res = checkHullDobellDetailed(a, c, m);
      el("hull-dobell").hidden = false;
      updateCond("hd-c1", res.cond1);
      updateCond("hd-c2", res.cond2);
      updateCond("hd-c3", res.cond3);
      full = res.cond1 && res.cond2 && res.cond3;
      const status = el("hd-status");
      status.textContent = full ? "Cumple Hull-Dobell (Periodo Completo)" : "No cumple (Periodo Incompleto)";
      status.className = full ? "status-ok" : "status-fail";
    } else if (method === "multiplicative" && m !== null) {
      el("hull-dobell").hidden = true;
      if ((m & (m - 1n)) === 0n && m > 1n) {
        const seed = toBigIntStrict(el<HTMLInputElement>("x0Lcg").value, "X0");
        const a = toBigIntStrict(el<HTMLInputElement>("aLcg").value, "a");
        const isOddSeed = seed % 2n !== 0n;
        const validA = a % 8n === 3n || a % 8n === 5n;
        if (isOddSeed && validA) setWarning("✓ Parámetros óptimos para m=2^b: X0 impar y a ≡ 3 o 5 (mod 8).");
        else setWarning("⚠ Para módulo m=2^b, se recomienda semilla X0 impar y multiplicador a ≡ 3 o 5 (mod 8) para maximizar el período.");
      }
    } else {
      el("hull-dobell").hidden = true;
    }
  } else {
    el("hull-dobell").hidden = true;
  }

  const seen = new Map<string, number>();
  const maxGen = Math.max(TOTAL_INTERNAL_GENERATIONS, n);
  
  for (let i = 0; i < maxGen; i += 1) {
    const nextObj = gen.next();
    if (nextObj.done) break;
    const val = nextObj.value;
    const key = val.stateKey ?? val.x.toString();
    
    if (seen.has(key) && val.repeatOf === undefined) {
      val.repeatOf = seen.get(key);
      fullRows.push(val);
      break;
    } else if (!seen.has(key)) {
      if (val.stateKey !== undefined || (method !== "fibonacci" && method !== "middle-product")) {
        seen.set(key, i);
      }
    }
    fullRows.push(val);
  }

  effectiveN = Math.min(n, fullRows.length);
  requestedRows = fullRows.slice(0, effectiveN);
  expanded = effectiveN <= 200;

  const firstRepeat = fullRows.find(row => row.repeatOf !== undefined);
  const period = firstRepeat?.repeatOf === undefined ? null : fullRows.indexOf(firstRepeat) - firstRepeat.repeatOf;
  const periodLabel = period === null ? "Periodo detectado: -" : `Periodo detectado: ${period}`;

  if (method === "mixed" && m !== null) {
    const expected = full ? `Periodo esperado: ${m}` : "Periodo esperado: < m";
    summarize(method, effectiveN, `${expected} | ${periodLabel}`);
    if (full && period !== null && period !== Number(m)) {
      addGenerationWarning("Hull-Dobell indica periodo m, pero se detecto una repeticion antes. Revisar parametros o semilla.");
    }
  } else if (method === "multiplicative" && m !== null) {
    const expected = m > 1n ? `Periodo esperado: <= ${m - 1n}` : "Periodo esperado: -";
    summarize(method, effectiveN, `${expected} | ${periodLabel}`);
  } else if (method === "fibonacci") {
    summarize(method, effectiveN, `Periodo esperado: - | ${periodLabel}`);
  } else {
    summarize(method, effectiveN, `Internas: ${maxGen} | ${periodLabel}`);
  }

  analyzeDegeneration(fullRows, method, period);

  currentViewState = {
    requestedRows,
    fullRows,
    expanded,
    histogramMode: "requested",
    requestedN,
    effectiveN,
    method,
  };
  updateView();
  setWarning(generationWarnings.length > 0 ? generationWarnings.join("\n") : null);

  const copyBtn = el<HTMLButtonElement>("copy");
  copyBtn.disabled = requestedRows.length === 0;
  copyBtn.onclick = async () => {
    const uValues = getUValues(requestedRows);
    const text = uValues.map(u => formatU(u)).join("\n");
    await navigator.clipboard.writeText(text);
    const previous = copyBtn.innerHTML;
    copyBtn.innerHTML = '<span aria-hidden="true">OK</span>Copiado';
    window.setTimeout(() => {
      copyBtn.innerHTML = previous;
    }, 1200);
  };
}

// Inicializa las pestañas, controladores del DOM y eventos de interacción del usuario en la UI
function wire() {
  wireAIChat();
  const method = el<HTMLSelectElement>("method");
  method.addEventListener("change", () => {
    updateMethodVisibility(getCurrentMethod());
    setError(null);
    setWarning(getMiddleSquareZeroSeedWarning());
  });
  el<HTMLInputElement>("seed").addEventListener("input", () => {
    setWarning(getMiddleSquareZeroSeedWarning());
  });
  const tabBtns = document.querySelectorAll<HTMLButtonElement>(".tab-btn");
  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach(c => (c as HTMLElement).hidden = true);

      btn.classList.add("active");
      const targetId = btn.getAttribute("data-target");
      if (targetId) el<HTMLElement>(targetId).hidden = false;
    });
  });

  el<HTMLButtonElement>("toggleTable").addEventListener("click", () => {
    if (!currentViewState) return;
    currentViewState.expanded = !currentViewState.expanded;
    updateView();
  });

  const useKEl = el<HTMLInputElement>("useK");
  if (useKEl) {
    useKEl.addEventListener("change", (e) => {
      const checked = (e.target as HTMLInputElement).checked;
      el("x1ProdContainer").hidden = checked;
      el("kProdContainer").hidden = !checked;
    });
    // Initialize state
    el("x1ProdContainer").hidden = useKEl.checked;
    el("kProdContainer").hidden = !useKEl.checked;
  }

  el<HTMLButtonElement>("toggleHistogram").addEventListener("click", () => {
    if (!currentViewState) return;
    currentViewState.histogramMode = currentViewState.histogramMode === "requested" ? "full" : "requested";
    updateView();
  });

  const runGenerate = () => {
    try {
      generate();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWarning(null);
      clearResults();
    }
  };

  updateMethodVisibility(getCurrentMethod());

  el<HTMLButtonElement>("generate").addEventListener("click", runGenerate);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") runGenerate();
  });

  // Generación inicial para precargar la tabla al montar la página
  try {
    generate();
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  }
}

wire();
