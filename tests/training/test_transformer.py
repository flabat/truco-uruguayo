"""Run with the Python environment from training/partners/python."""

import importlib.util
from pathlib import Path
import tempfile
import unittest

import torch


source = Path(__file__).resolve().parents[2] / "training/transformer/model.py"
spec = importlib.util.spec_from_file_location("transformer_model", source)
model = importlib.util.module_from_spec(spec)
spec.loader.exec_module(model)
SIZES = {"features": 257, "moves": 17, "gestures": 14, "eventAction": 54, "maxHistory": 64}
ROWS = [
    {"summary": [1, 2], "history": [], "actions": [[0, 0, 1, 2, 3, 4]]},
    {"summary": [1, 3], "history": [[0, 1, 0, 2, 0, 0, -1]],
     "actions": [[0, 0, 1, 2, 3, 4], [1, 0, 4, 3, 2, 1]]},
]


class TransformerTest(unittest.TestCase):
    def test_architecture_presets_have_increasing_capacity(self):
        counts = {}
        for size in model.ARCHITECTURES:
            network = model.Policy(SIZES, size)
            counts[size] = sum(parameter.numel() for parameter in network.parameters())
        self.assertEqual(counts["small"], 14906)
        self.assertTrue(800_000 < counts["medium"] < 1_000_000)
        self.assertTrue(4_000_000 < counts["large"] < 6_000_000)

    def check_training(self, device):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            path = root / "checkpoint.pt"
            small_path = root / "old-small.pt"
            small = model.Policy(SIZES, "small")
            legacy_weights = {k.replace("encoder.0.", "encoder."): v for k, v in small.state_dict().items()}
            torch.save({"models": {"full": legacy_weights}, "plan": "old", "completed": 7}, small_path)
            config = {"seed": 1, "checkpoint": str(path), "plan": "test", "sizes": SIZES, "device": device,
                      "size": "medium", "arms": ["full"], "microbatch": 2,
                      "reference": {"path": str(small_path), "plan": "old", "completed": 7, "legacy": True}}
            first = model.Experiment(config)
            self.assertEqual(next(first.models["full"].parameters()).device.type, device)
            self.assertEqual(next(first.reference.parameters()).device.type, "cpu")
            samples = [("full", row) for row in ROWS]
            before = first.predict(samples)
            self.assertEqual(before[0], [1.0])
            self.assertAlmostEqual(sum(before[1]), 1.0, places=6)
            reference_before = first.predict([("small", ROWS[1])])
            examples = {"full": [{"row": ROWS[1], "choice": 0, "reward": 1, "teacher": [1.0, 0.0]}]}
            first.learn({"round": 0, "warmup": True, "examples": examples, "save": False})
            self.assertFalse(path.exists())
            first.learn({"round": 1, "warmup": True, "examples": examples, "save": True})
            after = first.predict(samples)
            self.assertNotEqual(before[1], after[1])
            self.assertEqual(reference_before, first.predict([("small", ROWS[1])]))
            resumed = model.Experiment(config)
            self.assertEqual(resumed.completed, 2)
            for actual, expected in zip(resumed.predict(samples)[1], after[1]):
                self.assertAlmostEqual(actual, expected, places=6)
            resumed.learn({"round": 2, "warmup": False, "examples": examples, "save": True})
            self.assertEqual(model.Experiment(config).completed, 3)
            self.assertEqual(resumed.export(), ["full"])
            exported = torch.load(root / "policy-full.pt", weights_only=True)
            self.assertEqual(exported["size"], "medium")
            self.assertTrue(all(weight.device.type == "cpu" for weight in exported["weights"].values()))
            loaded = model.Policy(SIZES, "medium")
            loaded.load_state_dict(exported["weights"])
            for actual, expected in zip(loaded.parameters(), resumed.models["full"].parameters()):
                torch.testing.assert_close(actual, expected.cpu())

    def test_cpu_checkpoint_and_frozen_reference(self):
        self.check_training("cpu")

    @unittest.skipUnless(torch.backends.mps.is_available(), "Metal GPU required")
    def test_metal_checkpoint_and_frozen_reference(self):
        self.check_training("mps")


if __name__ == "__main__":
    unittest.main()
