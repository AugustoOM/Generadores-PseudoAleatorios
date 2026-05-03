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
  const s = value.trim();
  if (s.length === 0) throw new Error(`${name} is required`);
  if (!/^-?\d+$/.test(s)) throw new Error(`${name} must be an integer`);
  return BigInt(s);
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
    const seed = toBigIntStrict(el<HTMLInputElement>("seed").value, "seed");
    const a = toBigIntStrict(el<HTMLInputElement>("a").value, "a");
    const m = toBigIntStrict(el<HTMLInputElement>("mLcg").value, "m");
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
  setHidden(".method-non-mixed", method === "mixed");
}

function render(rows: PRNGOutput[]) {
  const tbody = el<HTMLTableSectionElement>("tbody");
  tbody.innerHTML = "";

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const tr = document.createElement("tr");

    const tdIdx = document.createElement("td");
    tdIdx.className = "num";
    tdIdx.textContent = String(i); // Change to 0-indexed to match Xi notation better if desired

    const tdU = document.createElement("td");
    tdU.className = "num";
    tdU.textContent = formatU(r.u);

    const tdX = document.createElement("td");
    tdX.className = "num";
    tdX.textContent = r.x.toString();

    tr.append(tdIdx, tdU, tdX);
    tbody.append(tr);
  }
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
  const methodNames: Record<Method, string> = {
    "middle-square": "Cuadrados Medios",
    fibonacci: "Fibonacci Retardado",
    multiplicative: "LCG Multiplicativo",
    mixed: "LCG Mixto",
  };
  summary.textContent = extra
    ? `${methodNames[method]} | Generados: ${n} | ${extra}`
    : `${methodNames[method]} | Generados: ${n}`;
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
    const seen = new Set<bigint>();
    const m = toBigIntStrict(el<HTMLInputElement>("mMixed").value, "m");
    // Generate until we see a duplicate or reach a safe limit (m)
    for (let i = 0; i < Number(m) + 1; i++) {
      const val = gen.next().value;
      if (seen.has(val.x)) break;
      seen.add(val.x);
      out.push(val);
      if (out.length > 5000) break; // Safety cap
    }
  } else {
    const n = toIntStrict(el<HTMLInputElement>("count").value, "n");
    if (n <= 0) throw new Error("n must be > 0");
    for (let i = 0; i < n; i += 1) out.push(gen.next().value);
  }

  if (method === "mixed") {
    const a = toBigIntStrict(el<HTMLInputElement>("aMixed").value, "a");
    const c = toBigIntStrict(el<HTMLInputElement>("cMixed").value, "c");
    const m = toBigIntStrict(el<HTMLInputElement>("mMixed").value, "m");
    const res = checkHullDobellDetailed(a, c, m);
    const n = out.length;

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

    summarize(method, n, full ? `Periodo completo (${m})` : `Periodo incompleto (${n})`);
  } else {
    el("hull-dobell").hidden = true;
    summarize(method, out.length);
  }
  render(out);

  const copyBtn = el<HTMLButtonElement>("copy");
  copyBtn.disabled = out.length === 0;
  copyBtn.onclick = async () => {
    const text = out.map((r) => formatU(r.u)).join("\n");
    await navigator.clipboard.writeText(text);
  };
}

function wire() {
  const method = el<HTMLSelectElement>("method");
  method.addEventListener("change", () => updateMethodVisibility(getCurrentMethod()));
  updateMethodVisibility(getCurrentMethod());

  el<HTMLButtonElement>("generate").addEventListener("click", () => {
    try {
      generate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  });

  // Generate an initial sample
  try {
    generate();
  } catch (e) {
    setError(e instanceof Error ? e.message : String(e));
  }
}

wire();

