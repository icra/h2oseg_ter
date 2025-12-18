import os from "os";
import path from "path";
import fs from "fs";
import { Worker } from "worker_threads";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

const workerPath = path.join(__dirname, "worker_month.mjs");
const months = Array.from({ length: 12 }, (_, i) => i + 1);

// limita concurrència (p.ex. #cores - 1)
const maxWorkers = 6 //Math.max(1, os.cpus().length - 1);

function runMonth(month) {
    return new Promise((resolve, reject) => {
        const w = new Worker(workerPath, { workerData: { month } });
        w.on("message", (msg) => (msg.ok ? resolve(msg.result) : reject(new Error(msg.error))));
        w.on("error", reject);
        w.on("exit", (code) => { if (code !== 0) reject(new Error(`Worker exit ${code}`)); });
    });
}

async function main() {
    const results = [];
    const queue = [...months];
    const running = new Set();

    async function launchNext() {
        if (!queue.length) return;
        const m = queue.shift();
        const p = runMonth(m)
            .then(r => { results.push(r); console.log("Mes", m, "->", r); })
            .finally(() => running.delete(p));
        running.add(p);
    }

    while (queue.length || running.size) {
        while (queue.length && running.size < maxWorkers) await launchNext();
        await Promise.race([...running]);
    }

    results.sort((a,b) => a.mes - b.mes);

    const outPath = path.join(root, "calibration", "calibration_results.json");
    fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
    console.log("Saved:", outPath);
}

main().catch(e => { console.error(e); process.exit(1); });
