import "./style.css";
import { laggedFibonacci, middleSquare, multiplicativeLCG, type PRNGOutput } from "./prng";

type Method = "middle-square" | "fibonacci" | "multiplicative";

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
  const seed = toBigIntStrict(el<HTMLInputElement>("seed").value, "seed");

  if (method === "middle-square") {
    const digits = toIntStrict(el<HTMLInputElement>("digits").value, "digits");
    return middleSquare(seed, digits);
  }

  if (method === "fibonacci") {
    const seed2 = toBigIntStrict(el<HTMLInputElement>("seed2").value, "seed2");
    const j = toIntStrict(el<HTMLInputElement>("j").value, "j");
    const k = toIntStrict(el<HTMLInputElement>("k").value, "k");
    const m = toBigIntStrict(el<HTMLInputElement>("mFib").value, "m");
    return laggedFibonacci(seed, seed2, j, k, m);
  }

  const a = toBigIntStrict(el<HTMLInputElement>("a").value, "a");
  const m = toBigIntStrict(el<HTMLInputElement>("mLcg").value, "m");
  return multiplicativeLCG(seed, a, m);
}

function updateMethodVisibility(method: Method) {
  setHidden(".method", true);
  if (method === "middle-square") setHidden(".method-middle-square", false);
  if (method === "fibonacci") setHidden(".method-fibonacci", false);
  if (method === "multiplicative") setHidden(".method-multiplicative", false);
}

function render(rows: PRNGOutput[]) {
  const tbody = el<HTMLTableSectionElement>("tbody");
  tbody.innerHTML = "";

  for (let i = 0; i < rows.length; i += 1) {
    const r = rows[i];
    const tr = document.createElement("tr");

    const tdIdx = document.createElement("td");
    tdIdx.className = "num";
    tdIdx.textContent = String(i + 1);

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

function summarize(method: Method, n: number) {
  const summary = el<HTMLSpanElement>("summary");
  summary.textContent = `${method} · n=${n}`;
}

function getCurrentMethod(): Method {
  return el<HTMLSelectElement>("method").value as Method;
}

function generate() {
  setError(null);
  const method = getCurrentMethod();
  updateMethodVisibility(method);

  const n = toIntStrict(el<HTMLInputElement>("count").value, "n");
  if (n <= 0) throw new Error("n must be > 0");

  const gen = buildGenerator(method);
  const out: PRNGOutput[] = [];
  for (let i = 0; i < n; i += 1) out.push(gen.next().value);

  summarize(method, n);
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

