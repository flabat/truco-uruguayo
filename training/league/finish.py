"""Finish the preregistered local decision from validated stage snapshots."""
import argparse
import concurrent.futures
import fcntl
import json
from pathlib import Path
import subprocess
import time
from monitor import FORMATS, require_training_plan, timed_stage, write


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--run",type=Path,required=True)
    parser.add_argument("--runtime",type=Path,required=True)
    parser.add_argument("--registry",type=Path)
    args=parser.parse_args()
    run=args.run.resolve()
    repo=Path(__file__).resolve().parents[2]
    plan=json.loads((run/"plan.json").read_text())
    require_training_plan(plan)
    expected=subprocess.check_output(["git","-C",args.runtime,"rev-parse","HEAD"],text=True).strip()
    if expected!=plan["revision"]:
        raise RuntimeError("La revisión de entrenamiento cambió.")
    logs=run/"finish-stdout.log"

    def call(script,fmt,*opts):
        with logs.open("a") as out:
            subprocess.run(["node","training/league/"+script+".ts","--run",run,"--format",fmt,*opts],
                           cwd=repo,stdout=out,stderr=out,check=True)

    def matrix(stage,fmt):
        if not (run/"development"/fmt/(stage+".json")).exists():
            call("development",fmt,"--stage",stage)
        if stage!="early":
            call("evidence",fmt,"--stage",stage)

    def bundle(fmt,stage):
        if stage=="pilot":
            call("variation",fmt)
        opts=["--stage",stage,"--counterMatches","1024"]
        if args.registry:
            opts.extend(["--registry",args.registry.resolve()])
        if not (run/"championship-input"/fmt/"bundle.json").exists():
            call("freeze",fmt,*opts)

    def overnight(selected):
        timed_stage(run, "overnight", args.runtime, plan, selected)
        for fmt in selected:
            matrix("overnight",fmt)
            bundle(fmt,"overnight")

    with (run/"finish.lock").open("a") as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        while not (run/"snapshots"/"pilot"/"index.json").exists():
            time.sleep(20)
        passing=[]
        for fmt in FORMATS:
            for stage in ("early","profile","pilot"):
                matrix(stage,fmt)
            call("profile-counter",fmt)
            call("freeze",fmt,"--stage","pilot","--decision-only")
            decision=json.loads((run/"development"/fmt/"pilot-decision.json").read_text())
            if decision["extendOvernight"]:
                passing.append(fmt)
        write(run/"resource-decision.json",{"formats":{fmt: ("extend-local-overnight" if fmt in passing else
              "plateau-test-and-freeze") for fmt in FORMATS},"cloud":"Sin gasto ni propuesta; el piloto mide el hardware local."})
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            future=pool.submit(overnight,passing) if passing else None
            for fmt in FORMATS:
                if fmt not in passing:
                    bundle(fmt,"pilot")
            if future:
                future.result()
        write(run/"championship-input"/"index.json",{fmt:fmt+"/bundle.json" for fmt in FORMATS})
        subprocess.run(["node","training/league/report.ts","--run",run,"--output",run/"public-summary.json"],
                       cwd=repo,check=True)


if __name__=="__main__":
    main()
