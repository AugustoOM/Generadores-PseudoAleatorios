import unittest

from prng.generators import (
    lagged_fibonacci,
    middle_product,
    middle_square,
    mixed_lcg,
    mixed_lcg_has_full_period,
    multiplicative_lcg,
)


def take(generator, n):
    return [next(generator) for _ in range(n)]


class GeneratorTests(unittest.TestCase):
    def test_middle_square_known_sequence(self):
        self.assertEqual(
            take(middle_square(154, digits=6), 10),
            [0.371, 0.376, 0.413, 0.705, 0.97, 0.409, 0.672, 0.515, 0.652, 0.251],
        )

    def test_middle_square_rejects_invalid_digits(self):
        with self.assertRaises(ValueError):
            next(middle_square(154, digits=5))

    def test_middle_product_known_sequence(self):
        self.assertEqual(
            take(middle_product(12, 34, d=4), 10),
            [0.0012, 0.0034, 0.0408, 0.1387, 0.6589, 0.1389, 0.1521, 0.1126, 0.7126, 0.0238],
        )

    def test_lagged_fibonacci_matches_fibonacci_modulo_example(self):
        self.assertEqual(
            take(lagged_fibonacci(1, 1, j=1, k=2, m=10), 10),
            [0.2, 0.3, 0.5, 0.8, 0.3, 0.1, 0.4, 0.5, 0.9, 0.4],
        )

    def test_lagged_fibonacci_rejects_invalid_lags(self):
        with self.assertRaises(ValueError):
            next(lagged_fibonacci(1, 1, j=2, k=2, m=10))

    def test_multiplicative_lcg_known_sequence(self):
        self.assertEqual(
            take(multiplicative_lcg(1, a=5, m=7), 8),
            [
                5 / 7,
                4 / 7,
                6 / 7,
                2 / 7,
                3 / 7,
                1 / 7,
                5 / 7,
                4 / 7,
            ],
        )

    def test_mixed_lcg_known_full_period_sequence(self):
        self.assertEqual(
            take(mixed_lcg(0, a=5, c=1, m=8), 10),
            [1 / 8, 6 / 8, 7 / 8, 4 / 8, 5 / 8, 2 / 8, 3 / 8, 0 / 8, 1 / 8, 6 / 8],
        )

    def test_hull_dobell_full_period(self):
        self.assertTrue(mixed_lcg_has_full_period(5, 1, 8))
        self.assertFalse(mixed_lcg_has_full_period(8, 16, 100))


if __name__ == "__main__":
    unittest.main()
