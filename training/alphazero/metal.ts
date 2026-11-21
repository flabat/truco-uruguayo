import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { Example, Network } from "./model.ts";

export function metalWorker(python: string) {
  const worker = spawn(python, ["-B", fileURLToPath(new URL("./metal.py", import.meta.url))],
    {stdio:["pipe", "pipe", "inherit"]});
  const lines = createInterface({input:worker.stdout})[Symbol.asyncIterator]();
  let failure: Error | undefined;
  const fail = (error: Error) => {
    failure = error;
  };
  worker.on("error",fail);
  worker.stdin.on("error",fail);
  async function command<T>(data: object): Promise<T> {
    if (failure) throw failure;
    worker.stdin.write(JSON.stringify(data)+"\n");
    const next = await lines.next();
    if (failure) throw failure;
    if (next.done) throw new Error("Metal learner stopped before completing its request.");
    return JSON.parse(next.value);
  }
  return {
    check: () => command<{backend:string; torch:string}>({kind:"check"}),
    update: (net: Network, shape: readonly number[], examples: Example[]) =>
      command<{net:Network; policyLoss:number; valueLoss:number; updateSeconds:number; metalBytes:number}>(
        {kind:"update",weights:net.weights,shape,examples}),
    close: () => worker.stdin.end(),
  };
}
