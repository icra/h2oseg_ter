// calibration/benchmark_model.mjs
//
// Benchmark del model hidrològic executat amb Node.js.
// Col·loca aquest fitxer dins la carpeta `calibration/` del projecte.
//
// Ús:
//   node calibration/benchmark_model.mjs --years 10
//   node calibration/benchmark_model.mjs --years 1,5,10,25,50 --runs 20 --warmup 3
//   node calibration/benchmark_model.mjs --years 20 --runs 30 --json calibration/benchmark_results.json

import fs from "fs";
import path from "path";
import { performance } from "perf_hooks";
import { fileURLToPath } from "url";

import cytoscape from "cytoscape";
import gm from "../js/graph_methods.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

function parseArgs(argv) {
    const args = {
        years: [1, 5, 10, 25, 50],
        runs: 20,
        warmup: 3,
        startYear: 2024,
        initialVolume: gm.RESERVOIR?.capacity_hm3 ?? 400,
        json: null,
        headless: false
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        if (arg === "--years" && next) {
            args.years = next.split(",").map(Number);
            i++;
        } else if (arg === "--runs" && next) {
            args.runs = Number(next);
            i++;
        } else if (arg === "--warmup" && next) {
            args.warmup = Number(next);
            i++;
        } else if (arg === "--start-year" && next) {
            args.startYear = Number(next);
            i++;
        } else if (arg === "--initial-volume" && next) {
            args.initialVolume = Number(next);
            i++;
        } else if (arg === "--headless" && next){
            args.headless = Boolean(next);
            i++;
        } else if (arg === "--json" && next) {
            args.json = next;
            i++;
        } else if (arg === "--help" || arg === "-h") {
            printHelp();
            process.exit(0);
        } else if (arg.startsWith("--")) {
            throw new Error(`Argument desconegut: ${arg}`);
        }
    }

    if (!args.years.length || args.years.some(y => !Number.isInteger(y) || y < 1)) {
        throw new Error("--years ha de contenir enters positius, per exemple: 1,5,10");
    }
    if (!Number.isInteger(args.runs) || args.runs < 1) {
        throw new Error("--runs ha de ser un enter positiu");
    }
    if (!Number.isInteger(args.warmup) || args.warmup < 0) {
        throw new Error("--warmup ha de ser un enter igual o superior a 0");
    }
    if (!Number.isInteger(args.startYear)) {
        throw new Error("--start-year ha de ser un enter");
    }
    if (!Number.isFinite(args.initialVolume) || args.initialVolume < 0) {
        throw new Error("--initial-volume ha de ser un número no negatiu");
    }

    return args;
}

function printHelp() {
    console.log(`
Benchmark del model hidrològic

Opcions:
  --years <llista>         Anys de simulació, separats per comes.
                           Per defecte: 1,5,10,25,50
  --runs <n>               Repeticions mesurades. Per defecte: 20
  --warmup <n>             Repeticions d'escalfament. Per defecte: 3
  --start-year <any>       Primer any simulat. Per defecte: 2024
  --initial-volume <hm3>   Volum inicial de l'embassament
  --json <ruta>            Desa els resultats en JSON
  -h, --help               Mostra aquesta ajuda

Exemple:
  node calibration/benchmark_model.mjs --years 1,10,50 --runs 30
`);
}

function readJSON(relativePath) {
    const absolutePath = path.join(root, relativePath);
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
}

function createGraphElements() {
    const nodesGeo = readJSON("assets/nodes.geojson");
    const edgesGeo = readJSON("assets/edges.geojson");

    const nodes = nodesGeo.features.map(feature => {
        const data = { ...feature.properties };
        data.lat = feature.geometry.coordinates[1];
        data.lng = feature.geometry.coordinates[0];
        return { data };
    });

    const edges = edgesGeo.features.map(feature => ({
        data: {
            ...feature.properties,
            source: feature.properties.from,
            target: feature.properties.to,
        },
    }));

    const virtualEdges = [
        { data: { id: "v_82_res", source: "NODE_82", target: "DESEMBASSAT", virtual: true } },
        { data: { id: "v_33_res", source: "NODE_33", target: "DESEMBASSAT", virtual: true } },
        { data: { id: "v_34_res", source: "NODE_34", target: "DESEMBASSAT", virtual: true } },
        { data: { id: "v_84_res", source: "NODE_84", target: "DESEMBASSAT", virtual: true } },
    ];

    return [...nodes, ...edges, ...virtualEdges];
}

function createGraph(elements, headless_state) {
    return cytoscape({
        headless: headless_state,
        elements: structuredClone(elements),
        layout: { name: "preset" },
    });
}

function runSimulation(elements, years, startYear, initialVolume, headless_state) {
    const cy = createGraph(elements, headless_state);
    const params = structuredClone(gm.params);
    const totalSteps = years * 12;

    // Les contribucions es calculen una vegada, igual que en el worker.
    gm.calculateContribution(cy, params);
    gm.initSimulation(years, initialVolume);

    for (let step = 1; step <= totalSteps; step++) {
        const zeroBased = step - 1;
        const month = (zeroBased % 12) + 1;
        const year = startYear + Math.floor(zeroBased / 12);

        gm.calculateFlowMonth(cy, params, null, {
            period: { year, month },
            step,
        });
    }

    // Llegeix un valor final per assegurar que el motor no pugui ometre
    // el treball perquè el resultat no s'utilitza.
    const outletId = gm.RESERVOIR?.outNode ?? "DESEMBASSAT";
    const outlet = cy.getElementById(outletId);
    const finalValue = Number(outlet.data(`inflow${totalSteps}`) ?? outlet.data(`outflow${totalSteps}`) ?? 0);

    cy.destroy();
    return finalValue;
}

function percentile(sorted, p) {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    if (lower === upper) return sorted[lower];
    const fraction = index - lower;
    return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function summarize(times, years, finalValue) {
    const sorted = [...times].sort((a, b) => a - b);
    const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
    const variance = times.reduce((sum, value) => sum + (value - mean) ** 2, 0) / times.length;
    const months = years * 12;
    const median = percentile(sorted, 0.5);

    return {
        years,
        months,
        runs: times.length,
        meanMs: mean,
        medianMs: median,
        p95Ms: percentile(sorted, 0.95),
        minMs: sorted[0],
        maxMs: sorted.at(-1),
        sdMs: Math.sqrt(variance),
        medianMsPerYear: median / years,
        medianMsPerMonth: median / months,
        simulatedMonthsPerSecond: months / (median / 1000),
        finalValue,
        rawTimesMs: times,
    };
}

function formatRow(result) {
    return {
        anys: result.years,
        mesos: result.months,
        repeticions: result.runs,
        mediana_ms: result.medianMs.toFixed(3),
        mitjana_ms: result.meanMs.toFixed(3),
        p95_ms: result.p95Ms.toFixed(3),
        minim_ms: result.minMs.toFixed(3),
        maxim_ms: result.maxMs.toFixed(3),
        ms_per_mes: result.medianMsPerMonth.toFixed(5),
        mesos_per_s: result.simulatedMonthsPerSecond.toFixed(1),
    };
}

async function benchmark(elements, options) {
    const results = [];

    for (const years of options.years) {
        process.stdout.write(`Benchmark de ${years} any(s): escalfament... `);

        for (let i = 0; i < options.warmup; i++) {
            runSimulation(elements, years, options.startYear, options.initialVolume, options.headless);
        }

        console.log("mesurant");
        const times = [];
        let finalValue = null;

        for (let run = 1; run <= options.runs; run++) {
            const start = performance.now();
            finalValue = runSimulation(elements, years, options.startYear, options.initialVolume, options.headless);
            const elapsed = performance.now() - start;
            times.push(elapsed);
        }

        results.push(summarize(times, years, finalValue));
    }

    return results;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    // La lectura dels GeoJSON queda fora del temps mesurat.
    const elements = createGraphElements();

    console.log(`Node: ${process.version}`);
    console.log(`Plataforma: ${process.platform} ${process.arch}`);
    console.log(`Nodes: ${elements.filter(e => !e.data.source).length}`);
    console.log(`Arestes: ${elements.filter(e => e.data.source).length}`);
    console.log(`Anys: ${options.years.join(", ")}`);
    console.log(`Repeticions: ${options.runs}; escalfament: ${options.warmup}`);
    console.log(`Headless graph: ${options.headless}\n`)

    const results = await benchmark(elements, options);

    console.table(results.map(formatRow));

    if (options.json) {
        const outputPath = path.isAbsolute(options.json)
            ? options.json
            : path.join(root, options.json);

        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, JSON.stringify({
            generatedAt: new Date().toISOString(),
            nodeVersion: process.version,
            platform: process.platform,
            architecture: process.arch,
            options,
            results,
        }, null, 2));

        console.log(`\nResultats desats a: ${outputPath}`);
    }
}

main().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
});
