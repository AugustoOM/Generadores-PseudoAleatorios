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
  return Number(bi);
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
    const seedInput = el<HTMLInputElement>("seed").value.trim();
    if (seedInput.length !== 6) {
      throw new Error("La semilla debe tener exactamente 6 dígitos para el método de cuadrados medios.");
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
    const x0Raw = el<HTMLInputElement>("x0Prod").value.trim();
    const x1Raw = el<HTMLInputElement>("x1Prod").value.trim();
    const x0 = toBigIntStrict(x0Raw, "X0");
    const x1 = toBigIntStrict(x1Raw, "X1");
    const d = x0Raw.length;
    return middleProduct(x0, x1, d);
  }

  if (method === "multiplicative") {
    const seed = toBigIntStrict(el<HTMLInputElement>("x0Lcg").value, "X0");
    const a = toBigIntStrict(el<HTMLInputElement>("aLcg").value, "a");
    const m = toBigIntStrict(el<HTMLInputElement>("mLcgInput").value, "m");
    return multiplicativeLCG(seed, a, m);
  }

  const seed = toBigIntStrict(el<HTMLInputElement>("x0Mixed").value, "X0");
  const a = toBigIntStrict(el<HTMLInputElement>("aMixed").value, "a");
  const c = toBigIntStrict(el<HTMLInputElement>("cMixed").value, "c");
  const m = toBigIntStrict(el<HTMLInputElement>("mMixed").value, "m");
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
function renderTable(rows: any[], method: Method) {
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
  for (const r of rows) {
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
  msg.textContent = passed
    ? "La distribución parece uniforme (no se rechaza H0)."
    : "La distribución no es uniforme (se rechaza H0).";
  msg.style.color = passed ? "var(--green)" : "var(--red)";

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

type TTestResult = {
  h: number;
  pairs: number;
  sum: number;
  averageProduct: number;
  rho: number;
  df: number;
  tCalc: number;
  tTabla: number;
  passed: boolean;
};

// Ejecuta la Prueba t-Student de Autocorrelación para lags 1, 2 y 3 evaluando la independencia estadística
function renderTTest(rows: PRNGOutput[]) {
  const container = el<HTMLDivElement>("t-test-container");
  const meta = el<HTMLParagraphElement>("t-test-meta");
  const tbody = el<HTMLTableSectionElement>("t-test-tbody");
  const detail = el<HTMLDivElement>("t-detail");
  tbody.innerHTML = "";

  const uValues = getUValues(rows);

  const n = uValues.length;
  if (n <= 3) {
    container.hidden = true;
    meta.hidden = false;
    detail.hidden = true;
    return;
  }

  container.hidden = false;
  meta.hidden = true;

  const lags = [1, 2, 3];
  const results: TTestResult[] = [];

  for (const h of lags) {
    if (n - h <= 0) continue;

    let sum = 0;
    for (let i = 0; i < n - h; i++) {
      sum += uValues[i] * uValues[i + h];
    }

    const pairs = n - h;
    const averageProduct = sum / pairs;
    const rho = (averageProduct - 0.25) / (1 / 12);

    const df = pairs - 2;
    if (df <= 0) continue;

    const denominator = Math.sqrt(Math.max(0, 1 - rho * rho));
    let tCalc = 0;
    if (denominator > 0) {
      tCalc = (rho * Math.sqrt(df)) / denominator;
    } else {
      tCalc = Infinity;
    }

    const tTabla = getTTableValue(df);
    const passed = Math.abs(tCalc) < tTabla;
    results.push({ h, pairs, sum, averageProduct, rho, df, tCalc, tTabla, passed });

    const tr = document.createElement("tr");

    const tdH = document.createElement("td");
    tdH.className = "num";
    tdH.textContent = String(h);

    const tdRho = document.createElement("td");
    tdRho.className = "num";
    tdRho.textContent = rho.toFixed(4);

    const tdTCalc = document.createElement("td");
    tdTCalc.className = "num";
    tdTCalc.textContent = tCalc === Infinity ? "Inf" : Math.abs(tCalc).toFixed(4);

    const tdTTabla = document.createElement("td");
    tdTTabla.className = "num";
    tdTTabla.textContent = tTabla.toFixed(4);

    const tdDec = document.createElement("td");
    if (passed) {
      tdDec.innerHTML = `<span class="tag" style="background:var(--green);margin:0;">Acepta H0</span>`;
    } else {
      tdDec.innerHTML = `<span class="tag" style="background:var(--red);margin:0;">Rechaza H0</span>`;
    }

    tr.append(tdH, tdRho, tdTCalc, tdTTabla, tdDec);
    tbody.append(tr);
  }

  if (results.length > 0) {
    renderTTestDetail(uValues, results[0]);
  } else {
    detail.hidden = true;
  }

  renderScatterPlot(rows);
}

function formatTValue(value: number): string {
  if (!Number.isFinite(value)) return "Inf";
  return Math.abs(value).toFixed(4);
}

function renderTTestDetail(uValues: number[], result: TTestResult) {
  el<HTMLDivElement>("t-detail").hidden = false;
  el("t-detail-h").textContent = `h = ${result.h}`;
  el("t-detail-pairs").textContent = String(result.pairs);
  el("t-detail-sum").textContent = result.sum.toFixed(4);
  el("t-detail-avg").textContent = `${result.sum.toFixed(4)} / ${result.pairs} = ${result.averageProduct.toFixed(4)}`;
  el("t-detail-rho").textContent = `(${result.averageProduct.toFixed(4)} - 0.25) / (1 / 12) = ${result.rho.toFixed(4)}`;
  el("t-detail-df").textContent = `${result.pairs} - 2 = ${result.df}`;
  el("t-detail-tcalc").textContent = formatTValue(result.tCalc);
  el("t-detail-ttable").textContent = result.tTabla.toFixed(4);

  const decision = result.passed
    ? `Decision: como |t calculado| es menor que t tabla, se acepta H0. No hay evidencia de dependencia para h = ${result.h}.`
    : `Decision: como |t calculado| es mayor o igual que t tabla, se rechaza H0. Puede existir dependencia para h = ${result.h}.`;
  el("t-detail-decision").textContent = decision;

  const tbody = el<HTMLTableSectionElement>("t-detail-tbody");
  tbody.innerHTML = "";

  const visiblePairs = Math.min(result.pairs, 20);
  el("t-detail-table-note").textContent = visiblePairs === result.pairs
    ? `Se muestran los ${result.pairs} pares usados en el calculo.`
    : `Se muestran los primeros ${visiblePairs} pares de ${result.pairs}; la suma y el calculo usan todos los pares.`;

  for (let i = 0; i < visiblePairs; i++) {
    const ui = uValues[i];
    const uLag = uValues[i + result.h];
    const product = ui * uLag;
    const tr = document.createElement("tr");

    const tdI = document.createElement("td");
    tdI.className = "num";
    tdI.textContent = String(i + 1);

    const tdUi = document.createElement("td");
    tdUi.className = "num";
    tdUi.textContent = formatU(ui);

    const tdULag = document.createElement("td");
    tdULag.className = "num";
    tdULag.textContent = formatU(uLag);

    const tdProduct = document.createElement("td");
    tdProduct.className = "num";
    tdProduct.textContent = product.toFixed(4);

    tr.append(tdI, tdUi, tdULag, tdProduct);
    tbody.append(tr);
  }
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

// Actualiza y sincroniza todos los componentes de la interfaz (tabla, histograma, dispersión) según el estado actual
function updateView() {
  if (!currentViewState) return;

  const { requestedRows, fullRows, expanded, requestedN, histogramMode, method } = currentViewState;
  const visibleRows = expanded ? requestedRows : requestedRows.slice(0, INITIAL_TABLE_LIMIT);
  renderTable(visibleRows, method);
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
  renderTable([], "multiplicative");
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

// Ejecuta iteraciones continuas hasta detectar que un estado previo se repite, estimando el periodo
function generateUntilRepeat(gen: Generator<PRNGOutput>, limit: number): PeriodResult {
  const seen = new Map<string, number>();
  const rows: PRNGOutput[] = [];
  let period: number | null = null;
  const maxSteps = limit + 1;

  for (let i = 0; i < maxSteps; i += 1) {
    const nextObj = gen.next();
    if (nextObj.done) break;
    const val = nextObj.value;
    const key = val.stateKey ?? val.x.toString();
    if (seen.has(key)) {
      val.repeatOf = seen.get(key);
      period = i - (seen.get(key) ?? i);
      if (rows.length < limit) rows.push(val);
      break;
    }
    seen.set(key, i);
    if (rows.length < limit) rows.push(val);
  }

  return {
    rows,
    period,
    capped: rows.length === limit && period === null,
    limit,
  };
}

function generateRowsWithRepeatMarks(gen: Generator<PRNGOutput>, total: number): PeriodResult {
  const seen = new Map<string, number>();
  const rows: PRNGOutput[] = [];
  let period: number | null = null;

  for (let i = 0; i < total; i += 1) {
    const nextObj = gen.next();
    if (nextObj.done) break;
    const val = nextObj.value;
    const key = val.stateKey ?? val.x.toString();
    if (seen.has(key) && val.repeatOf === undefined) {
      val.repeatOf = seen.get(key);
      if (period === null) period = i - (seen.get(key) ?? i);
    } else if (!seen.has(key)) {
      seen.set(key, i);
    }
    rows.push(val);
  }

  return { rows, period, capped: false, limit: total };
}

// Retorna el identificador del método seleccionado actualmente en el control principal
function getCurrentMethod(): Method {
  return el<HTMLSelectElement>("method").value as Method;
}

// Controlador maestro que lee parámetros del DOM, invoca el PRNG y guarda el estado para el renderizado
function generate() {
  setError(null);
  setWarning(getMiddleSquareZeroSeedWarning());
  const method = getCurrentMethod();
  updateMethodVisibility(method);

  const gen = buildGenerator(method);
  let fullRows: PRNGOutput[] = [];
  let requestedRows: PRNGOutput[] = [];
  let requestedN = 0;
  let effectiveN = 0;
  let expanded = false;

  if (method === "mixed" || method === "multiplicative" || method === "fibonacci") {
    let m: bigint;
    if (method === "mixed") {
      m = toBigIntStrict(el<HTMLInputElement>("mMixed").value, "m");
    } else if (method === "multiplicative") {
      m = toBigIntStrict(el<HTMLInputElement>("mLcgInput").value, "m");
    } else {
      m = toBigIntStrict(el<HTMLInputElement>("mFib").value, "m");
    }

    let full = false;
    if (method === "mixed") {
      const a = toBigIntStrict(el<HTMLInputElement>("aMixed").value, "a");
      const c = toBigIntStrict(el<HTMLInputElement>("cMixed").value, "c");
      const res = checkHullDobellDetailed(a, c, m);

      const box = el<HTMLDivElement>("hull-dobell");
      box.hidden = false;

      const updateCond = (id: string, ok: boolean) => {
        const li = el(id);
        li.className = ok ? "ok" : "fail";
      };
      updateCond("hd-c1", res.cond1);
      updateCond("hd-c2", res.cond2);
      updateCond("hd-c3", res.cond3);

      full = res.cond1 && res.cond2 && res.cond3;
      const status = el("hd-status");
      status.textContent = full ? "Cumple Hull-Dobell (Periodo Completo)" : "No cumple (Periodo Incompleto)";
      status.className = full ? "status-ok" : "status-fail";
    } else {
      el("hull-dobell").hidden = true;
    }

    const maxPeriod = method === "mixed"
      ? (full ? m : m)
      : (method === "fibonacci" ? m : m - 1n);
    const limit = maxPeriod > BigInt(MAX_PERIOD_OUTPUT) ? MAX_PERIOD_OUTPUT : Number(maxPeriod);

    const periodResult = generateUntilRepeat(gen, limit);
    requestedRows = periodResult.rows;

    fullRows = [...periodResult.rows];
    while (fullRows.length < TOTAL_INTERNAL_GENERATIONS) {
      const nextObj = gen.next();
      if (nextObj.done) break;
      fullRows.push(nextObj.value);
    }
    if (fullRows.length > TOTAL_INTERNAL_GENERATIONS) {
      fullRows = fullRows.slice(0, TOTAL_INTERNAL_GENERATIONS);
    }
    requestedN = requestedRows.length;
    effectiveN = requestedRows.length;
    expanded = requestedRows.length <= 200;

    if (periodResult.capped) {
      setWarning(`Salida limitada a ${periodResult.limit} valores para evitar demoras.`);
    }

    const periodLabel = periodResult.period === null ? "Periodo detectado: -" : `Periodo detectado: ${periodResult.period}`;
    if (method === "mixed") {
      const expected = full ? `Periodo esperado: ${m}` : "Periodo esperado: < m";
      summarize(method, effectiveN, `${expected} | ${periodLabel}`);

      if (full && periodResult.period !== null && periodResult.period !== Number(m)) {
        setWarning("Hull-Dobell indica periodo m, pero se detecto una repeticion antes. Revisar parametros o semilla.");
      }
    } else {
      const expected = m > 1n ? `Periodo esperado: <= ${m - 1n}` : "Periodo esperado: -";
      summarize(method, effectiveN, `${expected} | ${periodLabel}`);
    }
  } else {
    const n = toIntStrict(el<HTMLInputElement>("count").value, "n");
    if (n <= 0) throw new Error("n must be > 0");

    const seen = new Map<string, number>();

    for (let i = 0; i < TOTAL_INTERNAL_GENERATIONS; i += 1) {
      const nextObj = gen.next();
      if (nextObj.done) break;
      const val = nextObj.value;
      const key = val.stateKey ?? val.x.toString();
      if (seen.has(key) && val.repeatOf === undefined) {
        val.repeatOf = seen.get(key);
      } else if (!seen.has(key)) {
        seen.set(key, i);
      }
      fullRows.push(val);
    }

    effectiveN = Math.min(n, TOTAL_INTERNAL_GENERATIONS);
    requestedRows = fullRows.slice(0, effectiveN);
    requestedN = n;
    el("hull-dobell").hidden = true;
    summarize(method, effectiveN, `Internas: ${TOTAL_INTERNAL_GENERATIONS}`);
  }

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
