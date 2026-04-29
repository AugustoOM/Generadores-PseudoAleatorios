from __future__ import annotations

import argparse

from prng.generators import lagged_fibonacci, middle_square, multiplicative_lcg


def _positive_int(value: str) -> int:
    n = int(value)
    if n <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return n


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Generadores pseudoaleatorios: Cuadrados medios, Fibonacci, Multiplicativo",
    )
    parser.add_argument(
        "--method",
        choices=["middle-square", "fibonacci", "multiplicative"],
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
        help="(middle-square) dígitos totales (par): 6 -> R(n) de 3 dígitos",
    )
    parser.add_argument("--j", type=_positive_int, default=24, help="(fibonacci) retardo j")
    parser.add_argument("--k", type=_positive_int, default=55, help="(fibonacci) retardo k")
    parser.add_argument("--m", type=_positive_int, default=2**31 - 1, help="(fibonacci/multiplicative) módulo")
    parser.add_argument("--a", type=_positive_int, default=48271, help="(multiplicative) multiplicador a")

    args = parser.parse_args()

    if args.method == "middle-square":
        gen = middle_square(args.seed, digits=args.digits)
    elif args.method == "fibonacci":
        if args.seed2 is None:
            raise SystemExit("Para fibonacci debes indicar --seed2 (segunda semilla).")
        gen = lagged_fibonacci(args.seed, args.seed2, j=args.j, k=args.k, m=args.m)
    else:
        gen = multiplicative_lcg(args.seed, a=args.a, m=args.m)

    for _ in range(args.n):
        print(next(gen))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

