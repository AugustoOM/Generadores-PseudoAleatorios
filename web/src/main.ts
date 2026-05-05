import "./style.css";
import {
  laggedFibonacci,
  middleSquare,
  multiplicativeLCG,
  mixedLCG,
  checkHullDobellDetailed,
  type PRNGOutput,
} from "./prng";

type Method = "middle-square" | "fibonacci" | "multiplicative" | "mixed";

const methodDetails: Record<Method, { name: string; description: string }> = {
  "middle-square": {
    name: "Cuadrados medios",
    description: "Eleva la semilla al cuadrado y toma los digitos centrales.",
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

const TOTAL_INTERNAL_GENERATIONS = 1000;
const INITIAL_TABLE_LIMIT = 20;
const HISTOGRAM_BINS = 10;
const MAX_PERIOD_OUTPUT = 10000;

type HistogramMode = "requested" | "full";

type GenerationViewState = {
  requestedRows: PRNGOutput[];
  fullRows: PRNGOutput[];
  expanded: boolean;
  histogramMode: HistogramMode;
  requestedN: number;
  effectiveN: number;
};

let currentViewState: GenerationViewState | null = null;

type PeriodResult = {
  rows: PRNGOutput[];
  period: number | null;
  capped: boolean;
  limit: number;
};

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element #${id}`);
  return node as T;
}

function setHidden(selector: string, hidden: boolean) {
  for (const node of document.querySelectorAll<HTMLElement>(selector)) {
    node.hidden = hidden;
  }
}

function toBigIntStrict(value: string, name: string): bigint {
  const s = value.trim().replace(/\s+/g, "");
  if (s.length === 0) throw new Error(`${name} is required`);

  try {
    // Soporte para potencia con *, ** o ^ (ej: 2*31-1, 2**31-1, 2^31-1)
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

function toIntStrict(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error(`${name} must be an integer`);
  return n;
}

function formatU(u: number): string {
  if (!Number.isFinite(u)) return String(u);
  return u.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

function buildGenerator(method: Method): Generator<PRNGOutput> {
  if (method === "middle-square") {
    const seed = toBigIntStrict(el<HTMLInputElement>("seed").value, "seed");
    const digits = toIntStrict(el<HTMLInputElement>("digits").value, "digits");
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

function updateMethodVisibility(method: Method) {
  setHidden(".method", true);
  if (method === "middle-square") setHidden(".method-middle-square", false);
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

function renderTable(rows: PRNGOutput[]) {
  const tbody = el<HTMLTableSectionElement>("tbody");
  tbody.innerHTML = "";

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const tr = document.createElement("tr");

    const tdIdx = document.createElement("td");
    tdIdx.className = "num";
    tdIdx.textContent = String(i);

    const tdU = document.createElement("td");
    tdU.className = "num";
    tdU.textContent = formatU(r.u);

    const tdAux = document.createElement("td");
    const isRegeneration = r.aux && r.aux.includes("Debido a que la semilla 0");
    tdAux.className = isRegeneration ? "regeneration" : "num";
    tdAux.textContent = r.aux ?? "-";

    const tdX = document.createElement("td");
    tdX.className = "num";
    tdX.textContent = r.x.toString();

    tr.append(tdIdx, tdU, tdAux, tdX);
    tbody.append(tr);
  }
}

function renderHistogram(rows: PRNGOutput[], mode: HistogramMode) {
  const host = el<HTMLDivElement>("hist-bars");
  const meta = el<HTMLParagraphElement>("hist-meta");
  host.innerHTML = "";

  if (rows.length === 0) {
    meta.textContent = "Sin datos";
    return;
  }

  const counts = new Array<number>(10).fill(0);
  for (const row of rows) {
    const lastDigit = Number(row.x.toString().slice(-1));
    counts[lastDigit] += 1;
  }

  const maxCount = Math.max(...counts, 1);
  counts.forEach((count, digit) => {
    const bucket = document.createElement("div");
    bucket.className = "histBucket";

    const bar = document.createElement("div");
    bar.className = "histBar";
    const heightPx = Math.max(8, Math.round((count / maxCount) * 150));
    bar.style.height = `${heightPx}px`;

    const label = document.createElement("span");
    label.className = "histLabel";
    label.textContent = String(digit);

    const value = document.createElement("span");
    value.className = "histValue";
    value.textContent = String(count);

    bucket.append(value, bar, label);
    host.append(bucket);
  });

  const modeLabel = mode === "requested" ? "n solicitado" : "1000 iteraciones";
  meta.textContent = `Distribución de últimos dígitos en ${rows.length} valores (${modeLabel}).`;
}

function updateView() {
  if (!currentViewState) return;

  const { requestedRows, fullRows, expanded, requestedN, histogramMode } = currentViewState;
  const visibleRows = expanded ? requestedRows : requestedRows.slice(0, INITIAL_TABLE_LIMIT);
  renderTable(visibleRows);
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
  const toggleHistogramBtn = el<HTMLButtonElement>("toggleHistogram");
  toggleHistogramBtn.hidden = fullRows.length === requestedRows.length;
  toggleHistogramBtn.textContent = histogramMode === "requested"
    ? "Ver 1000 iteraciones"
    : `Ver n (${requestedN})`;
}

function renderStats(rows: PRNGOutput[]) {
  el<HTMLElement>("stat-count").textContent = String(rows.length);

  if (rows.length === 0) {
    el<HTMLElement>("stat-min").textContent = "-";
    el<HTMLElement>("stat-max").textContent = "-";
    return;
  }

  const values = rows.map((r) => r.u).filter(Number.isFinite);
  el<HTMLElement>("stat-min").textContent = formatU(Math.min(...values));
  el<HTMLElement>("stat-max").textContent = formatU(Math.max(...values));
}

function clearResults() {
  currentViewState = null;
  renderTable([]);
  renderStats([]);
  renderHistogram([], "requested");
  el<HTMLButtonElement>("copy").disabled = true;
  el<HTMLButtonElement>("toggleTable").hidden = true;
}

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

function summarize(method: Method, n: number, extra?: string) {
  const summary = el<HTMLSpanElement>("summary");
  summary.textContent = extra
    ? `${methodDetails[method].name} | Generados: ${n} | ${extra}`
    : `${methodDetails[method].name} | Generados: ${n}`;
}

function generateUntilRepeat(gen: Generator<PRNGOutput>, limit: number): PeriodResult {
  const seen = new Map<bigint, number>();
  const rows: PRNGOutput[] = [];
  let period: number | null = null;
  const maxSteps = limit + 1;

  for (let i = 0; i < maxSteps; i += 1) {
    const val = gen.next().value;
    if (seen.has(val.x)) {
      period = i - (seen.get(val.x) ?? i);
      break;
    }
    seen.set(val.x, i);
    if (rows.length < limit) rows.push(val);
  }

  return {
    rows,
    period,
    capped: rows.length === limit && period === null,
    limit,
  };
}

function getCurrentMethod(): Method {
  return el<HTMLSelectElement>("method").value as Method;
}

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

  if (method === "mixed" || method === "multiplicative") {
    const m = method === "mixed"
      ? toBigIntStrict(el<HTMLInputElement>("mMixed").value, "m")
      : toBigIntStrict(el<HTMLInputElement>("mLcgInput").value, "m");

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
      : m - 1n;
    const limit = maxPeriod > BigInt(MAX_PERIOD_OUTPUT) ? MAX_PERIOD_OUTPUT : Number(maxPeriod);

    const periodResult = generateUntilRepeat(gen, limit);
    fullRows = periodResult.rows;
    requestedRows = periodResult.rows;
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

    for (let i = 0; i < TOTAL_INTERNAL_GENERATIONS; i += 1) {
      fullRows.push(gen.next().value);
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
  };
  updateView();

  const copyBtn = el<HTMLButtonElement>("copy");
  copyBtn.disabled = requestedRows.length === 0;
  copyBtn.onclick = async () => {
    const text = requestedRows.map((r) => formatU(r.u)).join("\n");
    await navigator.clipboard.writeText(text);
    const previous = copyBtn.innerHTML;
    copyBtn.innerHTML = '<span aria-hidden="true">OK</span>Copiado';
    window.setTimeout(() => {
      copyBtn.innerHTML = previous;
    }, 1200);
  };
}

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

  updateMethodVisibility(getCurrentMethod());

  const runGenerate = () => {
    try {
      generate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setWarning(null);
      clearResults();
    }
  };

  el<HTMLButtonElement>("generate").addEventListener("click", runGenerate);
  document.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") runGenerate();
  });

  // Generate an initial sample
  try {
    generate();
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  }
}

wire();

