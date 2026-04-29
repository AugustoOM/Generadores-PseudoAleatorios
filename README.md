# Generadores Pseudoaleatorios (Python)

Este proyecto implementa 3 generadores de números pseudoaleatorios:

- **Cuadrados medios** (Middle-square)
- **Fibonacci con retardo** (Lagged Fibonacci)
- **Multiplicativo** (LCG multiplicativo)

## Requisitos

- Python 3.10+ (recomendado)
- Node.js 18+ (solo si usas la interfaz web)

## Uso rápido

Generar 10 números de cada método:

```bash
python cli.py --method middle-square --seed 154 --n 10 --digits 6
python cli.py --method fibonacci --seed 12345 --seed2 67890 --n 10
python cli.py --method multiplicative --seed 12345 --n 10
```

Para ver todas las opciones:

```bash
python cli.py --help
```

## Interfaz web (TypeScript + HTML + CSS)

La carpeta `web/` contiene una interfaz web para probar los 3 métodos.

```bash
cd web
npm install
npm run dev
```

## Notas

- Estos generadores son **educativos** y no deben usarse para criptografía.
- Para `middle-square`, si la semilla cae en ciclos cortos (o llega a 0), se recomienda cambiar la semilla o el número de dígitos.

