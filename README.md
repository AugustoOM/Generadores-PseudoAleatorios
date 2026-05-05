# Generadores Pseudoaleatorios (Python)

Este proyecto implementa 5 generadores de números pseudoaleatorios:

- **Cuadrados medios** (Middle-square)
- **Producto medio** (Middle-product)
- **Fibonacci con retardo** (Lagged Fibonacci)
- **Multiplicativo** (LCG multiplicativo)
- **Mixto** (LCG mixto)

## Requisitos

- Python 3.10+ (recomendado)
- Node.js 18+ (solo si usas la interfaz web)

## Uso rápido

Generar 10 números de cada método:

```bash
python cli.py --method middle-square --seed 154 --n 10 --digits 6
python cli.py --method middle-product --seed 12 --seed2 34 --d 4 --n 10
python cli.py --method fibonacci --seed 12345 --seed2 67890 --n 10
python cli.py --method multiplicative --seed 12345 --n 10
python cli.py --method mixed --seed 12345 --a 1664525 --c 1013904223 --m 4294967296 --n 10
```

En el modo `mixed`, al final se imprime si cumple (o no) el criterio de periodo completo (m) según Hull-Dobell.

## Ejemplo (ejercicio) — Fibonacci módulo m

Regla:

\[
x_n = (x_{n-1} + x_{n-2}) \bmod m
\]

Ejemplo con \(x_0=1\), \(x_1=1\), \(m=10\):

- \(x_2 = (1+1)\bmod 10 = 2\)
- \(x_3 = (2+1)\bmod 10 = 3\)
- \(x_4 = (3+2)\bmod 10 = 5\)
- \(x_5 = (5+3)\bmod 10 = 8\)
- \(x_6 = (8+5)\bmod 10 = 3\)

En este proyecto podés reproducir esa recurrencia usando Fibonacci con retardo con `j=1` y `k=2`:

```bash
python cli.py --method fibonacci --seed 1 --seed2 1 --m 10 --j 1 --k 2 --n 10
```

Para ver todas las opciones:

```bash
python cli.py --help
```

## Interfaz web (TypeScript + HTML + CSS)

La carpeta `web/` contiene una interfaz web para probar los 5 métodos.

```bash
cd web
npm install
npm run dev
```

## Notas

- Estos generadores son **educativos** y no deben usarse para criptografía.
- Para `middle-square`, si la semilla cae en ciclos cortos (o llega a 0), se recomienda cambiar la semilla o el número de dígitos.

