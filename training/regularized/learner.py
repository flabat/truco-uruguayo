"""Aprendiz PPO regularizado para El Truco, en Metal.

Protocolo: una orden JSON por línea en stdin, una respuesta JSON por línea en stdout.
Las filas llegan como float32 crudo con el formato de training/regularized/agents.ts:
rasgos (F), rasgos del crítico (P), máscara (S), objetivo de clonación (S) y seis escalares
(ranura, log-prob del comportamiento, recompensa, fin, clonación, rival).

El actor ve solo los rasgos de su asiento. El crítico además ve las manos de todos (PerfectDou).
La pérdida suma el recorte de PPO, el valor, la entropía y KL(pi || ancla), donde el ancla es
una copia de la política que se renueva cada cierto número de iteraciones (R-NaD / MMD).
"""

import json
import math
import sys
import time
from pathlib import Path

import torch
from torch import nn
from torch.nn import functional as F_


def mlp(sizes):
    layers = []
    for i in range(len(sizes) - 1):
        layers.append(nn.Linear(sizes[i], sizes[i + 1]))
        if i < len(sizes) - 2:
            layers.append(nn.ReLU())
    return nn.Sequential(*layers)


class Learner:
    def __init__(self, cfg):
        self.cfg = cfg
        self.device = torch.device("mps" if torch.backends.mps.is_available() and not cfg.get("cpu") else "cpu")
        torch.manual_seed(cfg.get("seed", 0))
        F, P, S = cfg["F"], cfg["P"], cfg["S"]
        self.F, self.P, self.S = F, P, S
        self.row = F + P + 2 * S + 6
        hidden = cfg.get("hidden", [256, 256])
        self.actor = mlp([F, *hidden, S]).to(self.device)
        self.critic = mlp([F + P, *cfg.get("critic_hidden", [256, 256]), 1]).to(self.device)
        with torch.no_grad():
            self.actor[-1].weight.mul_(0.01)
            self.actor[-1].bias.zero_()
        self.magnet = mlp([F, *hidden, S]).to(self.device)
        self.magnet.load_state_dict(self.actor.state_dict())
        for p in self.magnet.parameters():
            p.requires_grad_(False)
        self.opt_actor = torch.optim.Adam(self.actor.parameters(), lr=cfg.get("lr", 3e-4))
        self.opt_critic = torch.optim.Adam(self.critic.parameters(), lr=cfg.get("critic_lr", 1e-3))
        self.iteration = 0

    # --- datos -----------------------------------------------------------------
    def load(self, path):
        raw = Path(path).read_bytes()
        data = torch.frombuffer(bytearray(raw), dtype=torch.float32).view(-1, self.row)
        F, P, S = self.F, self.P, self.S
        o = F + P + 2 * S
        return {
            "x": data[:, :F],
            "priv": data[:, F:F + P],
            "mask": data[:, F + P:F + P + S] > 0.5,
            "target": data[:, F + P + S:F + P + 2 * S],
            "slot": data[:, o].long(),
            "logp": data[:, o + 1],
            "reward": data[:, o + 2],
            "done": data[:, o + 3] > 0.5,
            "teacher": data[:, o + 4] > 0.5,
            "opponent": data[:, o + 5].long(),
        }

    def masked_logits(self, net, x, mask):
        return net(x).masked_fill(~mask, -1e9)

    def values(self, x, priv):
        out = []
        with torch.no_grad():
            for i in range(0, x.shape[0], 16384):
                xi = x[i:i + 16384].to(self.device)
                pi = priv[i:i + 16384].to(self.device)
                out.append(torch.tanh(self.critic(torch.cat([xi, pi], 1))).squeeze(1).cpu())
        return torch.cat(out)

    def advantages(self, batch, lam):
        v = self.values(batch["x"], batch["priv"]).tolist()
        reward = batch["reward"].tolist()
        done = batch["done"].tolist()
        n = len(v)
        adv = [0.0] * n
        nxt = 0.0
        for t in range(n - 1, -1, -1):
            # Con recompensas moldeadas por mano, r_t puede ser distinto de cero antes del final.
            if done[t]:
                delta = reward[t] - v[t]
                nxt = delta
            else:
                delta = reward[t] + v[t + 1] - v[t]
                nxt = delta + lam * nxt
            adv[t] = nxt
        adv = torch.tensor(adv)
        returns = adv + torch.tensor(v)
        return adv, returns

    def monte_carlo(self, batch):
        """Resultado final del chico para cada fila de su trayectoria."""
        reward = batch["reward"].tolist()
        done = batch["done"].tolist()
        out = [0.0] * len(reward)
        z = 0.0
        for t in range(len(reward) - 1, -1, -1):
            z = reward[t] if done[t] else reward[t] + z
            out[t] = z
        return torch.tensor(out)

    # --- clonación ---------------------------------------------------------------
    def clone(self, paths, epochs, batch_size=4096):
        batches = [self.load(p) for p in paths]
        data = {k: torch.cat([b[k] for b in batches]) for k in batches[0]}
        data["z"] = torch.cat([self.monte_carlo(b) for b in batches])
        n = data["x"].shape[0]
        metrics = []
        for _ in range(epochs):
            perm = torch.randperm(n)
            for i in range(0, n, batch_size):
                idx = perm[i:i + batch_size]
                x = data["x"][idx].to(self.device)
                mask = data["mask"][idx].to(self.device)
                target = data["target"][idx].to(self.device)
                logp = F_.log_softmax(self.masked_logits(self.actor, x, mask), 1)
                loss = -(target * logp).sum(1).mean()
                self.opt_actor.zero_grad()
                loss.backward()
                self.opt_actor.step()
                v = torch.tanh(self.critic(torch.cat([x, data["priv"][idx].to(self.device)], 1))).squeeze(1)
                vloss = (v - data["z"][idx].to(self.device)).square().mean()
                self.opt_critic.zero_grad()
                vloss.backward()
                self.opt_critic.step()
                metrics.append((loss.item(), vloss.item()))
        self.magnet.load_state_dict(self.actor.state_dict())
        k = max(1, len(metrics) // 10)
        tail = metrics[-k:]
        return {"rows": n, "ce": sum(m[0] for m in tail) / len(tail), "value": sum(m[1] for m in tail) / len(tail)}

    # --- PPO regularizado ----------------------------------------------------------
    def train(self, path, cfg):
        started = time.perf_counter()
        batch = self.load(path)
        keep = ~batch["teacher"]
        batch = {k: v[keep] for k, v in batch.items()}
        adv, returns = self.advantages(batch, cfg.get("lambda", 0.95))
        n = batch["x"].shape[0]
        dev = self.device
        x_all = batch["x"].to(dev)
        priv_all = batch["priv"].to(dev)
        mask_all = batch["mask"].to(dev)
        slot_all = batch["slot"].to(dev)
        old_all = batch["logp"].to(dev)
        adv_all = adv.to(dev)
        ret_all = returns.to(dev)
        adv_all = (adv_all - adv_all.mean()) / (adv_all.std() + 1e-8)
        clip = cfg.get("clip", 0.2)
        eta = cfg.get("eta", 0.05)
        ent_coef = cfg.get("entropy", 0.005)
        bs = cfg.get("batch", 4096)
        stats = {"policy": 0.0, "value": 0.0, "kl_magnet": 0.0, "entropy": 0.0, "approx_kl": 0.0, "clipfrac": 0.0}
        steps = 0
        for _ in range(cfg.get("epochs", 2)):
            perm = torch.randperm(n, device=dev)
            for i in range(0, n, bs):
                idx = perm[i:i + bs]
                x, mask = x_all[idx], mask_all[idx]
                logits = self.masked_logits(self.actor, x, mask)
                logp_all = F_.log_softmax(logits, 1)
                p_all = logp_all.exp()
                logp = logp_all.gather(1, slot_all[idx].unsqueeze(1)).squeeze(1)
                ratio = (logp - old_all[idx]).exp()
                a = adv_all[idx]
                surrogate = torch.min(ratio * a, ratio.clamp(1 - clip, 1 + clip) * a).mean()
                with torch.no_grad():
                    mag = F_.log_softmax(self.masked_logits(self.magnet, x, mask), 1)
                legal = mask.float()
                kl = (p_all * (logp_all - mag) * legal).sum(1).mean()
                entropy = -(p_all * logp_all * legal).sum(1).mean()
                loss = -surrogate + eta * kl - ent_coef * entropy
                self.opt_actor.zero_grad()
                loss.backward()
                nn.utils.clip_grad_norm_(self.actor.parameters(), 1.0)
                self.opt_actor.step()
                v = torch.tanh(self.critic(torch.cat([x, priv_all[idx]], 1))).squeeze(1)
                vloss = (v - ret_all[idx]).square().mean()
                self.opt_critic.zero_grad()
                vloss.backward()
                nn.utils.clip_grad_norm_(self.critic.parameters(), 1.0)
                self.opt_critic.step()
                with torch.no_grad():
                    stats["policy"] += surrogate.item()
                    stats["value"] += vloss.item()
                    stats["kl_magnet"] += kl.item()
                    stats["entropy"] += entropy.item()
                    stats["approx_kl"] += (old_all[idx] - logp).mean().item()
                    stats["clipfrac"] += ((ratio - 1).abs() > clip).float().mean().item()
                steps += 1
        self.iteration += 1
        if cfg.get("magnet_every") and self.iteration % cfg["magnet_every"] == 0:
            self.magnet.load_state_dict(self.actor.state_dict())
            stats["magnet_updated"] = True
        for k in ["policy", "value", "kl_magnet", "entropy", "approx_kl", "clipfrac"]:
            stats[k] /= max(1, steps)
        stats.update({"rows": n, "seconds": time.perf_counter() - started, "iteration": self.iteration})
        return stats

    # --- exportación -------------------------------------------------------------
    def export(self, path):
        parts, shapes = [], []
        for layer in self.actor:
            if isinstance(layer, nn.Linear):
                w = layer.weight.detach().float().cpu()
                shapes.append([w.shape[0], w.shape[1]])
                parts.append(w.flatten())
                parts.append(layer.bias.detach().float().cpu())
        flat = torch.cat(parts).contiguous()
        Path(path).write_bytes(flat.numpy().tobytes() if hasattr(flat, "numpy") and _has_numpy() else _tobytes(flat))
        Path(path + ".json").write_text(json.dumps({"shapes": shapes}))
        return {"path": path, "shapes": shapes}

    def save(self, path):
        torch.save({"cfg": self.cfg, "actor": self.actor.state_dict(), "critic": self.critic.state_dict(),
                    "magnet": self.magnet.state_dict(), "opt_actor": self.opt_actor.state_dict(),
                    "opt_critic": self.opt_critic.state_dict(), "iteration": self.iteration}, path)
        return {"path": path}

    def restore(self, path, optimizers=True):
        state = torch.load(path, map_location=self.device)
        self.actor.load_state_dict(state["actor"])
        self.critic.load_state_dict(state["critic"])
        self.magnet.load_state_dict(state["magnet"])
        if optimizers:
            self.opt_actor.load_state_dict(state["opt_actor"])
            self.opt_critic.load_state_dict(state["opt_critic"])
            self.iteration = state["iteration"]
        return {"iteration": self.iteration}


def _has_numpy():
    try:
        import numpy  # noqa: F401
        return True
    except ImportError:
        return False


def _tobytes(t):
    import struct
    values = t.tolist()
    return struct.pack("<%df" % len(values), *values)


def main():
    learner = None
    for line in sys.stdin:
        request = json.loads(line)
        cmd = request["cmd"]
        try:
            if cmd == "init":
                learner = Learner(request["cfg"])
                result = {"device": str(learner.device), "torch": torch.__version__}
            elif cmd == "clone":
                result = learner.clone(request["paths"], request.get("epochs", 3))
            elif cmd == "train":
                result = learner.train(request["path"], request.get("cfg", {}))
            elif cmd == "export":
                result = learner.export(request["path"])
            elif cmd == "save":
                result = learner.save(request["path"])
            elif cmd == "restore":
                result = learner.restore(request["path"], request.get("optimizers", True))
            elif cmd == "magnet":
                learner.magnet.load_state_dict(learner.actor.state_dict())
                result = {"ok": True}
            elif cmd == "lr":
                for g in learner.opt_actor.param_groups:
                    g["lr"] = request["lr"]
                result = {"ok": True}
            else:
                raise ValueError("orden desconocida: " + cmd)
            print(json.dumps({"ok": True, **result}, allow_nan=False), flush=True)
        except Exception as error:  # noqa: BLE001
            import traceback
            print(json.dumps({"ok": False, "error": traceback.format_exc()}), flush=True)


if __name__ == "__main__":
    main()
