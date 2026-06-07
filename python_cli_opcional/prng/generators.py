from __future__ import annotations

from collections.abc import Iterator
import math


def middle_square(seed: int, *, digits: int = 8) -> Iterator[float]:
    """
    Cuadrados medios (Middle-square).

    - seed: entero no negativo.
    - digits: cantidad de digitos del estado R(n).

    Se eleva al cuadrado, se rellena a 2*digits con ceros a la izquierda y se toman
    los digits centrales.

    Produce floats en [0, 1).
    """
    if seed < 0:
        raise ValueError("seed must be >= 0")
    if digits <= 0:
        raise ValueError("digits must be > 0")

    d = digits
    mod = 10**d
    x = seed % mod

    while True:
        s = str(x * x).zfill(2 * d)
        start = (len(s) - d + 1) // 2
        center = s[start : start + d]
        x = int(center)
        yield x / mod


def lagged_fibonacci(
    seed1: int,
    seed2: int | None = None,
    *,
    j: int = 24,
    k: int = 55,
    m: int = 2**31 - 1,
) -> Iterator[float]:
    """
    Fibonacci con retardo (Lagged Fibonacci) usando suma módulo m.

    x_n = (x_{n-j} + x_{n-k}) mod m, con k > j.

    - seed1, seed2: semillas para inicialización. Si se proveen ambas, se inicializa el
      buffer con una recurrencia Fibonacci módulo m hasta tamaño k. Si seed2 es None,
      se usa una inicialización interna (LCG) para mantener compatibilidad.
    - j, k: retardos (por defecto 24, 55).
    - m: módulo (por defecto 2^31-1).

    Produce floats en [0, 1).
    """
    if k <= j:
        raise ValueError("k must be > j")
    if k <= 0 or j <= 0:
        raise ValueError("j and k must be > 0")
    if m <= 1:
        raise ValueError("m must be > 1")

    buf: list[int] = []
    if seed2 is None:
        # Inicialización con un LCG simple (solo para sembrar el estado).
        # Mantiene el proyecto autocontenido.
        a = 1103515245
        c = 12345
        state = seed1 & 0x7FFFFFFF
        for _ in range(k):
            state = (a * state + c) % m
            buf.append(state)
    else:
        x0 = seed1 % m
        x1 = seed2 % m
        if x0 < 0:
            x0 += m
        if x1 < 0:
            x1 += m
        buf.append(x0)
        if k > 1:
            buf.append(x1)
        for i in range(2, k):
            buf.append((buf[i - 1] + buf[i - 2]) % m)

    idx = 0
    while True:
        i_k = idx % k
        i_j = (idx - j) % k
        new = (buf[i_j] + buf[i_k]) % m
        buf[i_k] = new
        idx += 1
        yield new / m


def multiplicative_lcg(
    seed: int,
    *,
    a: int = 48271,
    m: int = 2**31 - 1,
) -> Iterator[float]:
    """
    Generador congruencial lineal multiplicativo:

    x_{n+1} = (a * x_n) mod m

    Por defecto usa parámetros clásicos del "minimal standard" (Park-Miller):
    a=48271, m=2^31-1.

    Produce floats en (0, 1).
    """
    if m <= 1:
        raise ValueError("m must be > 1")
    if a <= 0 or a >= m:
        raise ValueError("a must satisfy 0 < a < m")

    x = seed % m
    if x == 0:
        x = 1

    while True:
        x = (a * x) % m
        yield x / m


def mixed_lcg(
    seed: int,
    *,
    a: int = 48271,
    c: int = 1,
    m: int = 2**31 - 1,
) -> Iterator[float]:
    """
    Generador congruencial lineal mixto:

    x_{n+1} = (a * x_n + c) mod m

    Produce floats en [0, 1).
    """
    if m <= 1:
        raise ValueError("m must be > 1")
    if a <= 0 or a >= m:
        raise ValueError("a must satisfy 0 < a < m")

    c = c % m
    if c < 0:
        c += m

    x = seed % m
    if x < 0:
        x += m

    while True:
        x = (a * x + c) % m
        yield x / m


def mixed_lcg_has_full_period(a: int, c: int, m: int) -> bool:
    """
    Chequea el criterio de Hull-Dobell para periodo completo (m) en LCG mixto.
    """
    if m <= 1:
        raise ValueError("m must be > 1")

    if math.gcd(c, m) != 1:
        return False

    n = m
    p = 2
    while p * p <= n:
        if n % p == 0:
            if (a - 1) % p != 0:
                return False
            while n % p == 0:
                n //= p
        p = 3 if p == 2 else p + 2

    if n > 1 and (a - 1) % n != 0:
        return False

    if m % 4 == 0 and (a - 1) % 4 != 0:
        return False

    return True


def _center_digits(value: int, d: int) -> int:
    s = str(abs(value))
    if len(s) > d:
        start = (len(s) - d) // 2
        s = s[start : start + d]
    return int(s)


def middle_product(seed1: int, seed2: int, *, d: int = 4) -> Iterator[float]:
    """
    Producto medio (Middle-product).

    x_{n+1} = middle_d_digits(x_n * x_{n-1})

    - seed1, seed2: semillas iniciales (x0, x1)
    - d: cantidad de digitos del estado

    Produce floats en [0, 1).
    """
    if d <= 0:
        raise ValueError("d must be > 0")

    mod = 10**d
    x0 = _center_digits(seed1, d)
    x1 = _center_digits(seed2, d)

    yield x0 / mod
    yield x1 / mod

    while True:
        prod = x0 * x1
        s = str(abs(prod)).zfill(2 * d)
        start = (len(s) - d) // 2
        center = s[start : start + d]
        x2 = int(center)
        yield x2 / mod
        x0, x1 = x1, x2

