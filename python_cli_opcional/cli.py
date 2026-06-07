from __future__ import annotations

import argparse
import sys
import time

from prng.generators import (
    lagged_fibonacci,
    middle_square,
    multiplicative_lcg,
    mixed_lcg,
    mixed_lcg_has_full_period,
    middle_product,
)


def _positive_int(value: str) -> int:
    n = int(value)
    if n <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return n


def _replacement_seed(mod: int, offset: int = 0) -> int:
    seed = (time.time_ns() + offset * 104729) % mod
    return seed or 1


def _warn_replacement(name: str, old: int, new: int, reason: str) -> None:
    print(f"ADVERTENCIA: {name}={old} no sirve ({reason}). Se reemplazo por {new}.", file=sys.stderr)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generadores pseudoaleatorios: Cuadrados medios, Fibonacci, Multiplicativo, Mixto, Producto medio",
    )
    parser.add_argument(
        "--method",
        choices=["middle-square", "fibonacci", "multiplicative", "mixed", "middle-product"],
        required=True,
        help="Método a usar",
    )
    parser.add_argument("--seed", type=int, required=True, help="Semilla entera")
    parser.add_argument("--seed2", type=int, default=None, help="(fibonacci) segunda semilla entera")
    parser.add_argument("--n", type=_positive_int, default=10, help="Cantidad a generar")

    parser.add_argument(
        "--digits",
        type=_positive_int,
        default=6,
        help="(middle-square) cantidad de digitos del estado",
    )
    parser.add_argument("--d", type=_positive_int, default=4, help="(middle-product) cantidad de dígitos d")
    parser.add_argument("--j", type=_positive_int, default=24, help="(fibonacci) retardo j")
    parser.add_argument("--k", type=_positive_int, default=55, help="(fibonacci) retardo k")
    parser.add_argument("--m", type=_positive_int, default=2**31 - 1, help="(fibonacci/multiplicative/mixed) módulo")
    parser.add_argument("--a", type=_positive_int, default=48271, help="(multiplicative/mixed) multiplicador a")
    parser.add_argument("--c", type=int, default=1, help="(mixed) incremento c")

    args = parser.parse_args()

    if args.method == "middle-square":
        mod = 10**args.digits
        if args.seed % mod == 0:
            replacement = _replacement_seed(mod)
            _warn_replacement("seed", args.seed, replacement, "degenera inmediatamente en 0")
            args.seed = replacement
        gen = middle_square(args.seed, digits=args.digits)
    elif args.method == "fibonacci":
        if args.seed2 is None:
            raise SystemExit("Para fibonacci debes indicar --seed2 (segunda semilla).")
        gen = lagged_fibonacci(args.seed, args.seed2, j=args.j, k=args.k, m=args.m)
    elif args.method == "middle-product":
        if args.seed2 is None:
            raise SystemExit("Para middle-product debes indicar --seed2 (segunda semilla).")
        mod = 10**args.d
        if args.seed % mod == 0:
            replacement = _replacement_seed(mod, 1)
            _warn_replacement("seed", args.seed, replacement, "fuerza productos nulos")
            args.seed = replacement
        if args.seed2 % mod == 0:
            replacement = _replacement_seed(mod, 2)
            _warn_replacement("seed2", args.seed2, replacement, "fuerza productos nulos")
            args.seed2 = replacement
        gen = middle_product(args.seed, args.seed2, d=args.d)
    elif args.method == "multiplicative":
        if args.seed % args.m == 0:
            _warn_replacement("seed", args.seed, 1, "X0 es 0 modulo m y colapsa el LCG multiplicativo")
            args.seed = 1
        if args.a % args.m == 0:
            _warn_replacement("a", args.a, 1, "a es multiplo de m")
            args.a = 1
        gen = multiplicative_lcg(args.seed, a=args.a, m=args.m)
    else:
        if args.a % args.m == 0:
            _warn_replacement("a", args.a, 1, "a es multiplo de m")
            args.a = 1
        if args.seed % args.m == 0 and args.c % args.m == 0:
            _warn_replacement("c", args.c, 1, "X0 y c son 0 modulo m y la secuencia queda constante")
            args.c = 1
        gen = mixed_lcg(args.seed, a=args.a, c=args.c, m=args.m)

    seen: dict[float, int] = {}
    for i in range(args.n):
        value = next(gen)
        print(value)
        if value in seen:
            period = i - seen[value]
            print(
                f"ADVERTENCIA: la generacion empieza a degenerarse en la fila {i}; "
                f"repite la fila {seen[value]} y entra en ciclo de periodo {period}.",
                file=sys.stderr,
            )
            if period <= 5:
                print("ADVERTENCIA: periodo muy corto; cambia semillas o parametros.", file=sys.stderr)
            break
        seen[value] = i

    if args.method == "mixed":
        full = mixed_lcg_has_full_period(args.a, args.c, args.m)
        if full:
            print(f"period={args.m} (completo)")
        else:
            print("period< m (no cumple condiciones de periodo completo)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

