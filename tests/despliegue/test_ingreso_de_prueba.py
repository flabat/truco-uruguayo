import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


class IngresoDePruebaTest(unittest.TestCase):
    def test_la_pila_local_lo_habilita_por_omision(self):
        compose = (RAIZ / "compose.yaml").read_text()
        self.assertIn('AUTH_DEV: "${AUTH_DEV:-1}"', compose)

    def test_produccion_no_lo_habilita_por_omision(self):
        # Abre la cuenta de cualquier jugador de prueba: en el VPS lo decide quien opera, nunca un valor por omisión.
        compose = (RAIZ / "compose.production.yaml").read_text()
        for valor in re.findall(r"AUTH_DEV:\s*(.+)", compose):
            self.assertNotRegex(valor, r'^"?1"?$|:-1\}')


if __name__ == "__main__":
    unittest.main()
