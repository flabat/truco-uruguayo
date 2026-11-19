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


def cpu_seconds(text):
    days, _, rest = text.rpartition("-")
    seconds = 0.0
    for segment in rest.split(":"):
        seconds = seconds * 60 + float(segment)
    return seconds + 86400 * int(days or 0)


def processes():
    text = subprocess.check_output(["ps", "-axo", "pid=,ppid=,rss=,time=,command="], text=True)
    result = {}
    for line in text.splitlines():
        fields = line.strip().split(None, 4)
        if len(fields) == 5:
            pid, parent, rss, cpu, cmd = fields
            result[int(pid)] = (int(parent), int(rss), cmd, cpu_seconds(cpu))
    return result


def sample(tree, pid, run):
    def members(root):
        result = [root]
        for child, row in tree.items():
            if row[0] == root:
                result.extend(members(child))
        return result
    usage = {}
    for child, (parent, _, cmd, _) in tree.items():
        if parent != pid:
            continue
        for fmt in FORMATS:
            prefix = str(run / fmt) + "/"
            if prefix in cmd:
                group = members(child)
                usage[fmt] = {"rssKiB": sum(tree[p][1] for p in group),
                              "cpuSecondsByPID": {str(p):tree[p][3] for p in group},
                              "seed": cmd.split(prefix)[1].split("/")[0].split()[0]}
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


def freeze(run, phase, seeds, formats=FORMATS):
    stage = run / "snapshots" / phase
    index=stage/"index.json"
    if index.exists():
        for entry in json.loads(index.read_text()):
            if hashlib.sha256((run/entry["file"]).read_bytes()).hexdigest()!=entry["sha256"]:
                raise RuntimeError("Una instantánea publicada cambió.")
        return
    files = []
    for fmt in formats:
        for seed in seeds:
            source = run / fmt / str(seed)
            dest = stage / fmt / str(seed)
            dest.mkdir(parents=True, exist_ok=True)
            names = ["actor.json", "checkpoint", "manifest.json" if fmt == "duel" else "training.json"]
            if fmt != "duel":
                names.append("mc-actor.json")
            for name in names:
                target = dest / name
                temp=dest/(name+".copy.tmp")
                shutil.copyfile(source/name,temp)
                os.replace(temp,target)
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


def timed_stage(run, phase, runtime, plan, selected):
    clock = run / (phase + "-clock.json")
    if not clock.exists():
        start = time.time()
        write(clock, {"startedUTC": start, "deadlineUTC": start + plan["budgets"][phase],
                      "formats": list(selected), "status": "running"})
    timing = json.loads(clock.read_text())
    if list(selected) != timing.get("formats", list(FORMATS)):
        raise RuntimeError("Los formatos deben coincidir al reanudar la etapa.")
    if timing["status"] == "running":
        signature = "training/league/cli.ts " + phase + " --run " + str(run)
        pids = [pid for pid, row in processes().items()
                if signature in row[2] and Path(row[2].split()[0]).name == "node"]
        if len(pids) > 1:
            raise RuntimeError("Se encontraron dos ejecuciones de la misma etapa.")
        if pids or time.time() < timing["deadlineUTC"]:
            args = ["node", "training/league/cli.ts", phase, "--run", run]
            if tuple(selected) != FORMATS:
                args.extend(["--formats", ",".join(selected)])
            with (run / (phase + "-process.log")).open("a") as out:
                child = None if pids else subprocess.Popen(args, cwd=runtime, stdout=out, stderr=out, start_new_session=True)
                pid = pids[0] if pids else child.pid
                deadline_reached = watch(run, phase, pid, timing["deadlineUTC"], child)
                if child is not None and not deadline_reached and child.returncode != 0:
                    raise RuntimeError("El entrenador falló. Revisá el log y reanudá dentro del presupuesto.")
        timing.update(status="budget-finished", finishedUTC=time.time())
        write(clock, timing)
    if not (run / "snapshots" / phase / "index.json").exists():
        for fmt in selected:
            for seed in plan["seeds"]:
                checkpoint = run / fmt / str(seed) / "checkpoint"
                state = json.loads(checkpoint.read_text())["state"]
                target = state.get("iteration", state.get("completed"))
                args = ["node", "training/cli.ts", "--resume", checkpoint,
                        "--iterations" if fmt == "duel" else "--matches", str(target)]
                subprocess.run(args, cwd=runtime, stdout=subprocess.DEVNULL, check=True)
    freeze(run, phase, plan["seeds"], selected)
    return timing


def main():
    cli=argparse.ArgumentParser()
    cli.add_argument("--run",type=Path,required=True)
    cli.add_argument("--runtime",type=Path,required=True)
    cli.add_argument("--attach-profile",type=int)
    cli.add_argument("--observe-pilot-cpu",action="store_true")
    args=cli.parse_args()
    run=args.run.resolve()
    plan=json.loads((run/"plan.json").read_text())
    revision=subprocess.check_output(["git","-C",args.runtime,"rev-parse","HEAD"],text=True).strip()
    if plan["revision"] != revision:
        raise RuntimeError("Se requiere el checkout fijado en el manifiesto.")
    if args.observe_pilot_cpu:
        signature = "training/league/cli.ts pilot --run " + str(run)
        pids = [pid for pid, row in processes().items()
                if signature in row[2] and Path(row[2].split()[0]).name == "node"]
        if len(pids) != 1:
            raise RuntimeError("Se necesita exactamente un piloto en ejecución.")
        watch(run, "pilot-cpu", pids[0])
        return
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
        timed_stage(run, "pilot", args.runtime, plan, FORMATS)
        print("Pilot frozen", run / "pilot-clock.json", flush=True)


if __name__=="__main__":
    main()
