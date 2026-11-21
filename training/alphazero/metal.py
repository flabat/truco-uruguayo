"""Batched policy/value updates on Apple Metal for the TypeScript search."""

import json
import sys
from time import perf_counter

import torch


def update(command):
    started = perf_counter()
    hidden, inputs = command["shape"]
    trunk = hidden * inputs
    prefix = command["weights"][:trunk]
    suffix = command["weights"][trunk:]
    w0 = torch.tensor(prefix, dtype=torch.float32).reshape(hidden, inputs).to("mps").requires_grad_()
    w1 = torch.tensor(suffix, dtype=torch.float32).reshape(-1, hidden).to("mps").requires_grad_()
    optimizer = torch.optim.SGD((w0, w1), lr=.08, foreach=False)
    examples = command["examples"]
    width = max(len(ex["visits"]) for ex in examples)

    def pad(rows, fill):
        return [r + [fill] * (width - len(r)) for r in rows]

    def device(rows, dtype=torch.float32):
        return torch.tensor(rows, dtype=dtype).to("mps")

    positions = [ex["position"] for ex in examples]
    x = device([p["x"] for p in positions])
    slots = device(pad([p["slots"] for p in positions], 0), torch.long)
    prior = device(pad([p["logPrior"] for p in positions], -1e9))
    visits = device(pad([ex["visits"] for ex in examples], 0))
    value_prior = device([p["valuePrior"] for p in positions])
    outcomes = device([ex["outcome"] for ex in examples])
    metrics = []
    for start in range(0, len(examples), 64):
        rows = slice(start, start + 64)
        z = (x[rows] @ w0.T).tanh()
        logits = (z @ w1[:-1].T).gather(1, slots[rows]) + prior[rows]
        log_probabilities = logits.log_softmax(dim=1)
        value = (z @ w1[-1] + value_prior[rows]).tanh()
        policy_loss = -(visits[rows] * log_probabilities).sum(dim=1).mean()
        value_loss = (value - outcomes[rows]).square().mean()
        optimizer.zero_grad()
        (policy_loss + .25 * value_loss).backward()
        optimizer.step()
        metrics.append(torch.stack((policy_loss.detach(), value_loss.detach())))
    policy_loss, value_loss = torch.stack(metrics).mean(dim=0).cpu().tolist()
    weights = torch.cat((w0.detach().flatten(), w1.detach().flatten())).cpu().tolist()
    return {"net": {"weights": weights}, "policyLoss": policy_loss, "valueLoss": value_loss,
            "updateSeconds": perf_counter() - started, "metalBytes": torch.mps.driver_allocated_memory()}


def main():
    if not torch.backends.mps.is_available():
        raise RuntimeError("PyTorch cannot access Apple Metal. Run from macOS Terminal with GPU access.")
    for line in sys.stdin:
        request = json.loads(line)
        result = {"backend": "mps", "torch": str(torch.__version__)} if request["kind"] == "check" else update(request)
        print(json.dumps(result, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
