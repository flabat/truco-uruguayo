"""Compare the actual fit step on the same recorded trajectories. GPU visits alternate formats."""
import argparse
import json
import os
import platform
import resource
import subprocess
import sys
import time
import torch
from network import build, prepare, train_step


def memory(device):
    usage = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
    rss = usage if sys.platform == "darwin" else usage * 1024
    report = {"peakProcessRSSBytes": rss}
    if device == "mps":
        report["metalDriverBytes"] = torch.mps.driver_allocated_memory()
    if sys.platform == "darwin":
        text = subprocess.run(["memory_pressure", "-Q"], capture_output=True, text=True)
        for line in text.stdout.splitlines():
            if "free percentage" in line:
                report["systemFreePercent"] = int(line.split(":")[-1].strip(" %"))
    return report


def sync(device):
    if device == "mps":
        torch.mps.synchronize()


def benchmark(paths, warmup, steps):
    if os.environ.get("PYTORCH_ENABLE_MPS_FALLBACK") not in (None, "0"):
        raise RuntimeError("Desactivá el fallback MPS para comparar los dispositivos.")
    sources = [json.load(open(path)) for path in paths]
    if [source["format"] for source in sources] != ["pairs", "pairs-private-senas"]:
        raise ValueError("Se requiere un conjunto de parejas sin señas y otro de parejas con señas.")
    devices = ["cpu", "mps"] if torch.backends.mps.is_available() else ["cpu"]
    cases, reports = {}, []
    for device in devices:
        for src in sources:
            params, opt = build(src["state"], device)
            # La misma selección determinista en ambos dispositivos; las dos variantes
            # conservan sus máscaras, longitudes y el orden original de las decisiones.
            rows = src["rows"][:256]
            cases[device, src["format"]] = (params, opt, prepare(rows, device))
            reports.append({"device": device, "format": src["format"], "examples": len(rows),
                            "warmup": warmup, "steps": steps, "elapsedSeconds": 0,
                            "synchronizedSeconds": [], "losses": [], "memorySamples": []})
    for iteration in range(warmup + steps):
        for report in reports:
            device = report["device"]
            params, opt, batch = cases[device, report["format"]]
            sync(device)
            start = time.perf_counter()
            loss = train_step(params, opt, batch)
            sync(device)
            elapsed = time.perf_counter() - start
            if iteration >= warmup:
                report["synchronizedSeconds"].append(elapsed)
                report["elapsedSeconds"] += elapsed
                report["losses"].append(float(loss.cpu()))
                report["memorySamples"].append(memory(device))
    for report in reports:
        report["examplesPerSecond"] = report["examples"] * steps / report["elapsedSeconds"]
    return {"python": platform.python_version(), "torch": torch.__version__, "platform": platform.platform(),
            "mpsAvailable": "mps" in devices, "fallback": False, "reports": reports}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("pairs")
    parser.add_argument("signals")
    parser.add_argument("--warmup", type=int, default=3)
    parser.add_argument("--steps", type=int, default=8)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    if min(args.warmup, args.steps) < 1:
        raise ValueError("El calentamiento y el presupuesto deben ser positivos.")
    result = benchmark([args.pairs, args.signals], args.warmup, args.steps)
    with open(args.output, "w") as out:
        json.dump(result, out, indent=2, allow_nan=False)
