"""Policy/value Transformer, driven by the Node arena over JSON lines."""

import copy
import json
import os
from pathlib import Path
import sys

import torch
from torch import nn


ARCHITECTURES = {
    "small": (24, 1, 2, 2),
    "medium": (128, 4, 4, 4),
    "large": (256, 6, 8, 4),
}


class Policy(nn.Module):
    def __init__(self, sizes, size):
        super().__init__()
        width, layers, heads, expansion = ARCHITECTURES[size]
        self.features = nn.Embedding(sizes["features"], width, padding_idx=0)
        self.move = nn.Embedding(sizes["moves"], width)
        self.gesture = nn.Embedding(sizes["gestures"], width)
        self.event = nn.Embedding(sizes["eventAction"], width)
        self.seat = nn.Embedding(4, width)
        self.event_values = nn.Linear(4, width)
        self.position = nn.Embedding(sizes["maxHistory"] + 1, width)
        self.encoder = nn.ModuleList(
            nn.TransformerEncoderLayer(width, heads, expansion * width, dropout=0, batch_first=True)
            for _ in range(layers)
        )
        self.action_score = nn.Linear(width, 1)
        self.value = nn.Linear(width, 1)

    def forward(self, features, events, history_mask, actions, legal):
        context = self.features(features).mean(dim=1, keepdim=True)
        event_tokens = (self.event(events[:, :, 0]) + self.seat(events[:, :, 1])
                        + self.gesture(events[:, :, 2]) + self.event_values(events[:, :, 3:].float() / 40))
        tokens = torch.cat((context, event_tokens), dim=1)
        tokens = tokens + self.position(torch.arange(tokens.shape[1], device=tokens.device))
        for layer in self.encoder:
            tokens = layer(tokens, src_key_padding_mask=history_mask)
        context = tokens[:, 0]
        legal_tokens = (self.move(actions[:, :, 0]) + self.gesture(actions[:, :, 1])
                        + self.features(actions[:, :, 2:]).sum(dim=2) / 4)
        logits = self.action_score(torch.tanh(context[:, None] + legal_tokens)).squeeze(-1)
        return logits.masked_fill(~legal, -1e9), self.value(context).squeeze(-1).tanh()


def batch(rows, device):
    history_size = max(len(row["history"]) for row in rows)
    action_size = max(len(row["actions"]) for row in rows)
    history_lengths = [len(row["history"]) for row in rows]
    action_lengths = [len(row["actions"]) for row in rows]
    # Pad on the CPU and transfer each complete tensor once.
    features = torch.tensor([row["summary"] for row in rows])
    events = torch.tensor([row["history"] + [[0] * 7] * (history_size - length)
                           for row, length in zip(rows, history_lengths)], dtype=torch.long)
    events = events.reshape(len(rows), history_size, 7)
    history_mask = torch.arange(history_size + 1)[None, :] > torch.tensor(history_lengths)[:, None]
    actions = torch.tensor([row["actions"] + [[0] * 6] * (action_size - length)
                            for row, length in zip(rows, action_lengths)])
    legal = torch.arange(action_size)[None, :] < torch.tensor(action_lengths)[:, None]
    return tuple(value.to(device) for value in (features, events, history_mask, actions, legal))


class Experiment:
    def __init__(self, request):
        torch.set_num_threads(1)
        torch.manual_seed(request["seed"])
        self.path = Path(request["checkpoint"])
        self.plan = request["plan"]
        self.device = torch.device(request["device"])
        if self.device.type == "mps" and not torch.backends.mps.is_available():
            raise RuntimeError("Metal is unavailable to PyTorch. Start this run from Terminal on the Mac.")
        self.microbatch = request["microbatch"]
        self.size = request["size"]
        self.sizes = request["sizes"]
        initial = Policy(self.sizes, self.size)
        self.models = {arm: copy.deepcopy(initial).to(self.device) for arm in request["arms"]}
        self.optimizers = {arm: torch.optim.AdamW(model.parameters(), lr=0.001, foreach=False)
                           for arm, model in self.models.items()}
        self.reference = None
        if (reference := request.get("reference")) is not None:
            state = torch.load(reference["path"], map_location="cpu", weights_only=True)
            if state["plan"] != reference["plan"] or state["completed"] != reference["completed"]:
                raise ValueError("Small reference checkpoint does not match its completed training plan")
            weights = state["models"]["full"]
            if reference["legacy"]:
                weights = {key.replace("encoder.", "encoder.0.", 1) if key.startswith("encoder.") else key: value
                           for key, value in weights.items()}
            self.reference = Policy(request["sizes"], "small").requires_grad_(False)
            self.reference.load_state_dict(weights)
        self.completed = 0
        if self.path.exists():
            state = torch.load(self.path, map_location="cpu", weights_only=True)
            if state["plan"] != self.plan:
                raise ValueError("Checkpoint does not match this experiment plan")
            self.completed = state["completed"]
            for arm in self.models:
                self.models[arm].load_state_dict(state["models"][arm])
                self.optimizers[arm].load_state_dict(state["optimizers"][arm])

    @torch.no_grad()
    def predict(self, requests):
        results = [None] * len(requests)
        models = self.models if self.reference is None else {**self.models, "small": self.reference}
        for arm, model in models.items():
            subset = [(i, row) for i, (name, row) in enumerate(requests) if name == arm]
            if subset:
                device = next(model.parameters()).device
                for start in range(0, len(subset), self.microbatch):
                    chunk = subset[start:start + self.microbatch]
                    logits, _ = model(*batch([row for _, row in chunk], device))
                    for (i, row), probs in zip(chunk, logits.softmax(dim=1).cpu().tolist()):
                        results[i] = probs[:len(row["actions"])]
        if any(result is None for result in results):
            raise ValueError("Requested an unknown policy")
        return results

    def export(self):
        for arm, model in self.models.items():
            path = self.path.with_name(f"policy-{arm}.pt")
            temporary = path.with_suffix(".tmp")
            torch.save({"schema": "truco-transformer-policy-v1", "size": self.size, "arm": arm, "plan": self.plan,
                        "architecture": ARCHITECTURES[self.size], "sizes": self.sizes, "weights": {name: tensor.detach().cpu() for name, tensor in model.state_dict().items()}},
                       temporary)
            os.replace(temporary, path)
        return list(self.models)

    def learn(self, request):
        if request["round"] != self.completed:
            raise ValueError("Training rounds must commit in order")
        losses = {}
        for arm, model in self.models.items():
            # One optimizer step per round. Chunking bounds memory and preserves the same weights
            # for every trajectory collected in that round.
            optimizer = self.optimizers[arm]
            optimizer.zero_grad()
            examples = request["examples"][arm]
            total = len(examples)
            loss_sum = torch.zeros((), device=self.device)
            for start in range(0, total, self.microbatch):
                chunk = examples[start:start + self.microbatch]
                rows = [item["row"] for item in chunk]
                logits, value = model(*batch(rows, self.device))
                log_probs = logits.log_softmax(dim=1)
                reward = torch.tensor([item["reward"] for item in chunk], dtype=torch.float32).to(self.device)
                if request["warmup"]:
                    width = log_probs.shape[1]
                    teacher = torch.tensor([item["teacher"] + [0] * (width - len(item["teacher"]))
                                            for item in chunk], dtype=torch.float32).to(self.device)
                    policy_loss = -(teacher * log_probs).sum(dim=1)
                else:
                    picked = torch.tensor([item["choice"] for item in chunk]).to(self.device)
                    log_choice = log_probs.gather(1, picked[:, None]).squeeze(1)
                    advantage = reward - value.detach()
                    entropy = -(log_probs.exp() * log_probs).sum(dim=1)
                    policy_loss = -log_choice * advantage - 0.01 * entropy
                loss = (policy_loss + 0.25 * (value - reward).square()).sum() / total
                loss.backward()
                loss_sum += loss.detach()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            losses[arm] = {"loss": loss_sum.item(), "decisions": total}
        self.completed += 1
        if request["save"]:
            temporary = self.path.with_suffix(".tmp")
            torch.save({"plan": self.plan, "completed": self.completed,
                        "models": {arm: model.state_dict() for arm, model in self.models.items()},
                        "optimizers": {arm: opt.state_dict() for arm, opt in self.optimizers.items()}}, temporary)
            os.replace(temporary, self.path)
        return {"arms": losses, "metalDriverBytes": torch.mps.driver_allocated_memory()
                if self.device.type == "mps" else None}


def main():
    experiment = None
    for line in sys.stdin:
        command = json.loads(line)
        kind = command["kind"]
        if kind == "init":
            experiment = Experiment(command)
            result = {"completed": experiment.completed, "torch": str(torch.__version__),
                      "parameters": sum(p.numel() for p in experiment.models["full"].parameters()),
                      "device": str(experiment.device), "architecture": ARCHITECTURES[command["size"]]}
        elif kind == "predict":
            result = experiment.predict(command["rows"])
        elif kind == "learn":
            result = experiment.learn(command)
        elif kind == "export":
            result = experiment.export()
        else:
            raise ValueError(f"Unknown instruction {kind!r}")
        print(json.dumps(result, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
