import re
import unittest
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]


class BajasProduccionTest(unittest.TestCase):
    def test_produccion_exige_el_secreto_del_cliente_de_servicio(self):
        # Sin el secreto, ninguna baja vencida se completa: el despliegue debe fallar en lugar de prometer en vano.
        compose = (RAIZ / "compose.production.yaml").read_text()
        self.assertRegex(compose, r"KEYCLOAK_API_CLIENT_SECRET: \$\{KEYCLOAK_API_CLIENT_SECRET:\?[^}]+\}")
        self.assertIn("KEYCLOAK_ADMIN_URL: http://identidad:8080", compose)

    def test_local_no_lo_exige(self):
        compose = (RAIZ / "compose.yaml").read_text()
        self.assertTrue(re.search(r"KEYCLOAK_API_CLIENT_SECRET: \$\{KEYCLOAK_API_CLIENT_SECRET:-\}", compose))


if __name__ == "__main__":
    unittest.main()
