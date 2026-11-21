"""Small policy/value Transformer, driven by the Node arena over JSON lines."""

import copy
import json
import os
from pathlib import Path
import sys

import torch
from torch import nn
from torch.nn import functional as F


ARMS = ("full", "summary")
WIDTH = 24


class Policy(nn.Module):
    def __init__(self, sizes):
        super().__init__()
        self.features = nn.Embedding(sizes["features"], WIDTH, padding_idx=0)
        self.move = nn.Embedding(sizes["moves"], WIDTH)
        self.gesture = nn.Embedding(sizes["gestures"], WIDTH)
        self.event = nn.Embedding(sizes["eventAction"], WIDTH)
        self.seat = nn.Embedding(4, WIDTH)
        self.event_values = nn.Linear(4, WIDTH)
        self.position = nn.Embedding(sizes["maxHistory"] + 1, WIDTH)
        self.encoder = nn.TransformerEncoderLayer(WIDTH, 2, 2 * WIDTH, dropout=0, batch_first=True)
        self.action_score = nn.Linear(WIDTH, 1)
        self.value = nn.Linear(WIDTH, 1)

    def forward(self, features, events, history_mask, actions, legal):
        context = self.features(features).mean(dim=1, keepdim=True)
        event_tokens = (self.event(events[:, :, 0]) + self.seat(events[:, :, 1])
                        + self.gesture(events[:, :, 2]) + self.event_values(events[:, :, 3:].float() / 40))
        tokens = torch.cat((context, event_tokens), dim=1)
        tokens = tokens + self.position(torch.arange(tokens.shape[1], device=tokens.device))
        context = self.encoder(tokens, src_key_padding_mask=history_mask)[:, 0]
        legal_tokens = (self.move(actions[:, :, 0]) + self.gesture(actions[:, :, 1])
                        + self.features(actions[:, :, 2:]).sum(dim=2) / 4)
        logits = self.action_score(torch.tanh(context[:, None] + legal_tokens)).squeeze(-1)
        return logits.masked_fill(~legal, -1e9), self.value(context).squeeze(-1).tanh()


def batch(rows):
    count = len(rows)
    events = torch.zeros(count, max(len(row["history"]) for row in rows), 7, dtype=torch.long)
    past_padding = torch.ones(count, events.shape[1] + 1, dtype=torch.bool)
    past_padding[:, 0] = False
    actions = torch.zeros(count, max(len(row["actions"]) for row in rows), 6, dtype=torch.long)
    legal = torch.zeros(actions.shape[:2], dtype=torch.bool)
    for i, row in enumerate(rows):
        if row["history"]:
            length = len(row["history"])
            events[i, :length] = torch.tensor(row["history"])
            past_padding[i, 1:length + 1] = False
        length = len(row["actions"])
        actions[i, :length] = torch.tensor(row["actions"])
        legal[i, :length] = True
    return torch.tensor([row["summary"] for row in rows]), events, past_padding, actions, legal


class Experiment:
    def __init__(self, request):
        torch.set_num_threads(1)
        torch.manual_seed(request["seed"])
        self.path = Path(request["checkpoint"])
        self.plan = request["plan"]
        self.models = {"full": Policy(request["sizes"])}
        self.models["summary"] = copy.deepcopy(self.models["full"])
        self.optimizers = {arm: torch.optim.AdamW(model.parameters(), lr=0.001) for arm, model in self.models.items()}
        self.completed = 0
        if self.path.exists():
            state = torch.load(self.path, map_location="cpu", weights_only=True)
            if state["plan"] != self.plan:
                raise ValueError("Checkpoint does not match this experiment plan")
            self.completed = state["completed"]
            for arm in ARMS:
                self.models[arm].load_state_dict(state["models"][arm])
                self.optimizers[arm].load_state_dict(state["optimizers"][arm])

    @torch.no_grad()
    def predict(self, requests):
        results = [None] * len(requests)
        for arm, model in self.models.items():
            subset = [(i, row) for i, (name, row) in enumerate(requests) if name == arm]
            if subset:
                logits, _ = model(*batch([row for _, row in subset]))
                for (i, row), probs in zip(subset, logits.softmax(dim=1).tolist()):
                    results[i] = probs[:len(row["actions"])]
        return results

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
            loss_sum = 0
            for start in range(0, total, 128):
                chunk = examples[start:start + 128]
                rows = [item["row"] for item in chunk]
                logits, value = model(*batch(rows))
                log_probs = logits.log_softmax(dim=1)
                reward = torch.tensor([item["reward"] for item in chunk], dtype=torch.float32)
                if request["warmup"]:
                    teacher = torch.zeros_like(log_probs)
                    for i, item in enumerate(chunk):
                        probabilities = item["teacher"]
                        teacher[i, :len(probabilities)] = torch.tensor(probabilities)
                    policy_loss = -(teacher * log_probs).sum(dim=1)
                else:
                    picked = torch.tensor([item["choice"] for item in chunk])
                    log_choice = log_probs.gather(1, picked[:, None]).squeeze(1)
                    advantage = reward - value.detach()
                    entropy = -(log_probs.exp() * log_probs).sum(dim=1)
                    policy_loss = -log_choice * advantage - 0.01 * entropy
                loss = (policy_loss + 0.25 * (value - reward).square()).sum() / total
                loss.backward()
                loss_sum += loss.item()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            optimizer.step()
            losses[arm] = {"loss": loss_sum, "decisions": total}
        self.completed += 1
        temporary = self.path.with_suffix(".tmp")
        torch.save({"plan": self.plan, "completed": self.completed,
                    "models": {arm: model.state_dict() for arm, model in self.models.items()},
                    "optimizers": {arm: opt.state_dict() for arm, opt in self.optimizers.items()}}, temporary)
        os.replace(temporary, self.path)
        return losses


def main():
    experiment = None
    for line in sys.stdin:
        command = json.loads(line)
        kind = command["kind"]
        if kind == "init":
            experiment = Experiment(command)
            result = {"completed": experiment.completed, "torch": str(torch.__version__),
                      "parameters": sum(p.numel() for p in experiment.models["full"].parameters())}
        elif kind == "predict":
            result = experiment.predict(command["rows"])
        elif kind == "learn":
            result = experiment.learn(command)
        else:
            raise ValueError(f"Unknown instruction {kind!r}")
        print(json.dumps(result, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
