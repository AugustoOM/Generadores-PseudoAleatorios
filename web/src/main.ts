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
    // Soporte para potencia con '*' (ej: 2*31-1)
    const match = s.match(/^(\d+)\*(\d+)(?:([-+])(\d+))?$/);
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

function render(rows: PRNGOutput[]) {
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
    tdAux.className = "num";
    tdAux.textContent = r.aux ?? "-";

    const tdX = document.createElement("td");
    tdX.className = "num";
    tdX.textContent = r.x.toString();

    tr.append(tdIdx, tdU, tdAux, tdX);
    tbody.append(tr);
  }
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
  render([]);
  renderStats([]);
  el<HTMLButtonElement>("copy").disabled = true;
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

function summarize(method: Method, n: number, extra?: string) {
  const summary = el<HTMLSpanElement>("summary");
  summary.textContent = extra
    ? `${methodDetails[method].name} | Generados: ${n} | ${extra}`
    : `${methodDetails[method].name} | Generados: ${n}`;
}

function getCurrentMethod(): Method {
  return el<HTMLSelectElement>("method").value as Method;
}

function generate() {
  setError(null);
  const method = getCurrentMethod();
  updateMethodVisibility(method);

  const gen = buildGenerator(method);
  const out: PRNGOutput[] = [];

  if (method === "mixed") {
    const m = toBigIntStrict(el<HTMLInputElement>("mMixed").value, "m");
    // Auto mode: Stop at first repeat for Mixed
    const seen = new Set<bigint>();
    for (let i = 0; i < Number(m) + 2; i++) {
      const val = gen.next().value;
      if (seen.has(val.x)) {
        out.push(val);
        break;
      }
      seen.add(val.x);
      out.push(val);
      if (out.length > 2000) break;
    }
  } else {
    // Other methods use the 'count' field
    const n = toIntStrict(el<HTMLInputElement>("count").value, "n");
    if (n <= 0) throw new Error("n must be > 0");
    for (let i = 0; i < n; i += 1) out.push(gen.next().value);
  }

  if (method === "mixed") {
    const a = toBigIntStrict(el<HTMLInputElement>("aMixed").value, "a");
    const c = toBigIntStrict(el<HTMLInputElement>("cMixed").value, "c");
    const m = toBigIntStrict(el<HTMLInputElement>("mMixed").value, "m");
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

    const full = res.cond1 && res.cond2 && res.cond3;
    const status = el("hd-status");
    status.textContent = full ? "Cumple Hull-Dobell (Periodo Completo)" : "No cumple (Periodo Incompleto)";
    status.className = full ? "status-ok" : "status-fail";

    let extra = full ? `Periodo esperado: ${m}` : "Periodo esperado: < m";
    if (out.length > 0) {
      const last = out[out.length - 1];
      const repeatedIdx = out.findIndex((r, idx) => idx < out.length - 1 && r.x === last.x);
      if (repeatedIdx !== -1) {
        extra += ` | Repite X${repeatedIdx}`;
      }
    }
    summarize(method, out.length, extra);
  } else {
    el("hull-dobell").hidden = true;
    summarize(method, out.length);
  }
  render(out);
  renderStats(out);

  const copyBtn = el<HTMLButtonElement>("copy");
  copyBtn.disabled = out.length === 0;
  copyBtn.onclick = async () => {
    const text = out.map((r) => formatU(r.u)).join("\n");
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
  });
  updateMethodVisibility(getCurrentMethod());

  const runGenerate = () => {
    try {
      generate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

