"""Observe local league process trees and bound the complete pilot by an absolute wall deadline."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import shutil
import subprocess
import time

FORMATS = ("duel", "pairs", "pairs-senas")


def write(path, obj):
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj) + "\n")
    os.replace(tmp, path)


def processes():
    text = subprocess.check_output(["ps", "-axo", "pid=,ppid=,rss=,command="], text=True)
    result = {}
    for line in text.splitlines():
        fields = line.strip().split(None, 3)
        if len(fields) == 4:
            pid, parent, rss, cmd = fields
            result[int(pid)] = (int(parent), int(rss), cmd)
    return result


def sample(tree, pid, run):
    def total_rss(root):
        return tree[root][1] + sum(total_rss(child) for child, row in tree.items() if row[0] == root)
    usage = {}
    for child, (parent, _, cmd) in tree.items():
        if parent != pid:
            continue
        for fmt in FORMATS:
            prefix = str(run / fmt) + "/"
            if prefix in cmd:
                usage[fmt] = {"rssKiB": total_rss(child), "seed": cmd.split(prefix)[1].split("/")[0].split()[0]}
    return usage


def watch(run, phase, pid, deadline=None, child=None):
    log = run / (phase+"-telemetry.jsonl")
    with log.open("a") as out:
        while True:
            tree = processes()
            if (child is not None and child.poll() is not None) or pid not in tree:
                return False
            if deadline is not None and time.time() >= deadline:
                # This group is created solely for this pilot. Children write checkpoints atomically.
                if os.getpgid(pid) != pid:
                    raise RuntimeError("No se puede detener en grupo una ejecución ajena.")
                os.killpg(pid, signal.SIGTERM)
                child.wait(timeout=30) if child is not None else None
                return True
            record = {"utc":time.time(), "seeds":sample(tree,pid,run)}
            out.write(json.dumps(record)+"\n")
            out.flush()
            time.sleep(min(5, max(0,deadline-time.time())) if deadline else 5)


def freeze(run, phase, seeds):
    stage = run / "snapshots" / phase
    files = []
    for fmt in FORMATS:
        for seed in seeds:
            source = run / fmt / str(seed)
            dest = stage / fmt / str(seed)
            dest.mkdir(parents=True, exist_ok=True)
            names = ["actor.json", "checkpoint", "manifest.json" if fmt == "duel" else "training.json"]
            if fmt != "duel":
                names.append("mc-actor.json")
            for name in names:
                target = dest / name
                if not target.exists():
                    shutil.copyfile(source / name,target)
                data = target.read_bytes()
                files.append({"format":fmt,"seed":seed,"file":str(target.relative_to(run)),
                              "sha256":hashlib.sha256(data).hexdigest(),"bytes":len(data)})
    write(stage / "index.json", files)


def validate_profile(run, plan):
    for fmt in FORMATS:
        report=json.loads((run / ("profile-"+fmt+".json")).read_text())
        for seed in plan["seeds"]:
            seconds=sum(s["seconds"] for s in report["samples"] if s["seed"]==seed)
            if seconds < plan["budgets"]["profile"]/len(plan["seeds"]):
                raise RuntimeError(f"Perfil interrumpido: {fmt} {seed} {seconds}s")


def main():
    cli=argparse.ArgumentParser()
    cli.add_argument("--run",type=Path,required=True)
    cli.add_argument("--runtime",type=Path,required=True)
    cli.add_argument("--attach-profile",type=int)
    args=cli.parse_args()
    run=args.run.resolve()
    plan=json.loads((run/"plan.json").read_text())
    revision=subprocess.check_output(["git","-C",args.runtime,"rev-parse","HEAD"],text=True).strip()
    if plan["revision"] != revision:
        raise RuntimeError("Se requiere el checkout fijado en el manifiesto.")
    with (run/"pilot-monitor.lock").open("a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        if args.attach_profile:
            tree=processes()
            active=tree.get(args.attach_profile)
            if active and ("training/league/cli.ts profile" not in active[2] or str(run) not in active[2]):
                raise RuntimeError("El PID no pertenece al perfil.")
            if active:
                watch(run,"profile",args.attach_profile)
        validate_profile(run,plan)
        freeze(run,"profile",plan["seeds"])
        clock=run/"pilot-clock.json"
        if not clock.exists():
            now=time.time()
            write(clock,{"startedUTC":now,"deadlineUTC":now+plan["budgets"]["pilot"],"status":"running"})
        timing=json.loads(clock.read_text())
        if timing["status"]=="running" and time.time() < timing["deadlineUTC"]:
            signature="training/league/cli.ts pilot --run "+str(run)
            pids=[pid for pid,row in processes().items() if signature in row[2] and
                  Path(row[2].split()[0]).name=="node"]
            if len(pids)>1:
                raise RuntimeError("Hay pilotos en conflicto.")
            with (run/"pilot-process.log").open("a") as log:
                child=None if pids else subprocess.Popen(["node","training/league/cli.ts","pilot","--run",run],
                    cwd=args.runtime,stdout=log,stderr=log,start_new_session=True)
                timed=watch(run,"pilot",pids[0] if pids else child.pid,timing["deadlineUTC"],child)
                if child is not None and not timed and child.returncode != 0:
                    raise RuntimeError("El piloto falló. Revisá pilot-process.log y reanudá dentro del presupuesto.")
        timing.update(status="budget-finished",finishedUTC=time.time())
        write(clock,timing)
        # Recover the serving export of the last atomic checkpoint if the timer fired mid-batch.
        for fmt in FORMATS:
            for seed in plan["seeds"]:
                checkpoint=run/fmt/str(seed)/"checkpoint"
                state=json.loads(checkpoint.read_text())["state"]
                target=state.get("iteration",state.get("completed"))
                args_cli=["--resume",checkpoint,"--iterations" if fmt=="duel" else "--matches",str(target)]
                subprocess.run(["node","training/cli.ts",*args_cli],cwd=args.runtime,check=True,stdout=subprocess.DEVNULL)
        freeze(run,"pilot",plan["seeds"])
        print("Pilot frozen",clock,flush=True)


if __name__=="__main__":
    main()
