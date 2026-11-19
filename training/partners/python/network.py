"""Optimizer for the decentralized actors. Only the training critic sees all four hands."""
import json
import sys
import torch

torch.set_num_threads(1)
ACTOR_KEYS = ("event", "recurrent", "moves", "gestures")


def prepare(rows, device):
    count = len(rows)
    steps = max(len(row["history"]) for row in rows)
    width = max(len(row["actions"]) for row in rows)
    history = torch.zeros(count, steps, 9)
    actions = torch.zeros(count, width, 2, dtype=torch.long)
    for i, row in enumerate(rows):
        if row["history"]:
            history[i, :len(row["history"])] = torch.tensor(row["history"])
        actions[i, :len(row["actions"])] = torch.tensor(row["actions"])
    batch = dict(
        history=history, lengths=torch.tensor([len(row["history"]) for row in rows]),
        actions=actions, widths=torch.tensor([len(row["actions"]) for row in rows]),
        current=torch.tensor([row["current"] for row in rows], dtype=torch.float32),
        critic=torch.tensor([row["critic"] for row in rows], dtype=torch.float32),
        seat=torch.tensor([row["seat"] for row in rows]),
        choice=torch.tensor([row["choice"] for row in rows]),
        reward=torch.tensor([row["reward"] for row in rows], dtype=torch.float32),
    )
    return {key: tensor.to(device) for key, tensor in batch.items()}


def build(state, device):
    params = {key: torch.nn.Parameter(torch.tensor([a[key] for a in state["networks"]], device=device))
              for key in ACTOR_KEYS}
    params["critic"] = torch.nn.Parameter(torch.tensor(state["critic"], dtype=torch.float32, device=device))
    optimizer = torch.optim.SGD(params.values(), lr=state["rate"], momentum=0.7)
    for key, data in state["velocity"].items():
        optimizer.state[params[key]]["momentum_buffer"] = torch.tensor(data, device=device)
    return params, optimizer


def distribution(params, b):
    seat = b["seat"]
    hidden = b["current"].new_zeros((len(seat), 6))
    event, recurrent = params["event"][seat], params["recurrent"][seat]
    for t in range(b["history"].shape[1]):
        stimulus = event.bmm(b["history"][:, t].unsqueeze(-1))
        memory = recurrent.bmm(hidden.unsqueeze(-1))
        hidden = torch.where((b["lengths"] > t)[:, None], (stimulus + memory).squeeze(-1).tanh(), hidden)
    features = torch.cat((b["current"], hidden), dim=1).unsqueeze(-1)
    moves = params["moves"][seat].bmm(features).squeeze(-1)
    gestures = params["gestures"][seat].bmm(features).squeeze(-1)
    scores = moves.gather(1, b["actions"][:, :, 0]) + gestures.gather(1, b["actions"][:, :, 1])
    columns = torch.arange(scores.shape[1], device=scores.device)
    return scores.masked_fill(columns[None, :] >= b["widths"][:, None], float("-inf")).log_softmax(1)


def train_step(params, optimizer, batch):
    optimizer.zero_grad(set_to_none=True)
    logp = distribution(params, batch).gather(1, batch["choice"][:, None]).squeeze(1)
    prediction = (batch["critic"] @ params["critic"]).tanh()
    advantage = batch["reward"] - prediction
    loss = -(advantage.detach() * logp).mean() + 0.5 * advantage.square().mean()
    loss.backward()
    torch.nn.utils.clip_grad_norm_(list(params.values()), 1.0)
    optimizer.step()
    return loss.detach()


def fit(request):
    device = request["device"]
    params, optimizer = build(request["state"], device)
    batch = prepare(request["rows"], device)
    with torch.no_grad():
        reference = distribution(params, batch)[0, :len(request["rows"][0]["actions"])].exp().cpu().tolist()
    loss = train_step(params, optimizer, batch)
    matrices = {k: params[k].detach().cpu().tolist() for k in ACTOR_KEYS}
    return {
        "networks": [{k: matrices[k][s] for k in ACTOR_KEYS} for s in range(4)],
        "critic": params["critic"].detach().cpu().tolist(),
        "velocity": {k: optimizer.state[p]["momentum_buffer"].cpu().tolist() for k, p in params.items()},
        "rate": request["state"]["rate"], "loss": loss.item(), "reference": reference,
    }


if __name__ == "__main__":
    for line in sys.stdin:
        print(json.dumps(fit(json.loads(line)), allow_nan=False, separators=(",", ":")), flush=True)
