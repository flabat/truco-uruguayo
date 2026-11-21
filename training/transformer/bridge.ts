import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import type { Encoded } from "./features.ts";

export type Arm = "full" | "summary";
type NeuralPolicy = Arm | "small";

export class Worker {
  private child;
  private requests = [] as { resolve: (result: any) => void; reject: (error: Error) => void }[];
  private predictions = [] as { arm: NeuralPolicy; row: Encoded; resolve: (result: number[]) => void; reject: (error: Error) => void }[];
  private failure?: Error;

  constructor(python: string) {
    this.child = spawn(python, ["-B", fileURLToPath(new URL("./model.py", import.meta.url))], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    const fail = (error: Error) => {
      this.failure = error;
      for (const request of this.requests.splice(0)) request.reject(error);
    };
    this.child.on("error", fail);
    this.child.stdin.on("error", fail);
    this.child.on("close", code => fail(new Error("PyTorch worker stopped with code " + code)));
    createInterface({input: this.child.stdout}).on("line", line => {
      const request = this.requests.shift();
      if (!request) return fail(new Error("Unexpected response from PyTorch"));
      try {
        request.resolve(JSON.parse(line));
      } catch (error) {
        request.reject(error as Error);
      }
    });
  }

  command<T>(request: object): Promise<T> {
    if (this.failure) return Promise.reject(this.failure);
    return new Promise((resolve, reject) => {
      this.requests.push({resolve, reject});
      this.child.stdin.write(JSON.stringify(request) + "\n");
    });
  }

  predict(arm: NeuralPolicy, row: Encoded): Promise<number[]> {
    return new Promise((resolve, reject) => {
      if (!this.predictions.length) setImmediate(() => void this.flush());
      this.predictions.push({arm, row, resolve, reject});
    });
  }

  private async flush() {
    const jobs = this.predictions.splice(0);
    try {
      const values = await this.command<number[][]>({kind:"predict", rows:jobs.map(({arm, row}) => [arm, row])});
      if (values.length !== jobs.length) throw new Error("Incomplete PyTorch response");
      jobs.forEach((job, i) => job.resolve(values[i]));
    } catch (error) {
      jobs.forEach(job => job.reject(error as Error));
    }
  }

  close() {
    this.child.stdin.end();
  }
}
