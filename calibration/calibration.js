import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import cytoscape from "cytoscape";
import gm from "../js/graph_methods.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

function readJSON(relPath) {
    const p = path.join(root, relPath);
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

// === 1) Observacions (posa el JSON en un fitxer) ===
const obs = readJSON("calibration/cabals_aforament.json").filter(r => Number.isFinite(+r.cabal_m3s));

const obsByMonth = new Map();
for (const r of obs) {
    const m = +r.mes;
    if (!obsByMonth.has(m)) obsByMonth.set(m, []);
    obsByMonth.get(m).push({ codi_sad: r.codi_sad, q: +r.cabal_m3s });
}

// 1) Carrega el mateix que carrega app.js
const nodesGeo = readJSON("assets/nodes.geojson");
const edgesGeo = readJSON("assets/edges.geojson");

// 2) Converteix a elements Cytoscape (igual que a app.js)
const cyNodes = nodesGeo.features.map((f) => {
    const data = { ...f.properties };
    data.lat = f.geometry.coordinates[1];
    data.lng = f.geometry.coordinates[0];
    return { data };
});

const cyEdges = edgesGeo.features.map((f) => {
    const data = { ...f.properties };
    data.source = f.properties.from;
    data.target = f.properties.to;
    return { data };
});

const virtualEdges = [
    { data: { id: "v_82_res", source: "NODE_82", target: "DESEMBASSAT", virtual: true } },
    { data: { id: "v_33_res", source: "NODE_33", target: "DESEMBASSAT", virtual: true } },
    { data: { id: "v_34_res", source: "NODE_34", target: "DESEMBASSAT", virtual: true } },
    { data: { id: "v_84_res", source: "NODE_84", target: "DESEMBASSAT", virtual: true } },
];

const cy = cytoscape({
    elements: [...cyNodes, ...cyEdges, ...virtualEdges],
    layout: { name: "preset" },
});

const damId = gm.RESERVOIR?.outNode ?? "DESEMBASSAT";
const dam = cy.getElementById(damId);

// const damDownstream = new Set(dam.successors("node").toArray().map(n => n.id()).toArray().concat([damId]));

const damDownstream = new Set(dam.successors('node').toArray().map(n => n.id()))

damDownstream.add(damId)

// Inclou si NO és aigües avall de la presa
function includeInCalibration(node) {
    return !damDownstream.has(node.id()); // afluents avall: inclosos; avall de presa: exclosos
}

// --------------------
// 4) Funció objectiu per mes (SSE)
//   Calibrem multiplicadors mensuals:
//     - kcMul: escala tots els kc del mes (tots usos)
//     - rNeuMul: escala rNeu del mes
// --------------------
function sseForMonth(month, mults) {
    const i = month - 1;

    const p = structuredClone(gm.params);

    // multiplica Kc per ús (només el mes i)
    p.kc.aigua[i]    *= mults.aigua;
    p.kc.urba[i]     *= mults.urba;
    p.kc.forestal[i] *= mults.forestal;
    p.kc.seca[i]     *= mults.seca;
    p.kc.regadiu[i]  *= mults.regadiu;
    p.kc.prats[i]    *= mults.prats;

    // neu
    p.rNeu[i] *= mults.rNeu;

    gm.calculateContribution(cy, p);
    gm.calculateFlow(cy, null, { period: { year: 2024, month } });

    const rows = obsByMonth.get(month) ?? [];
    let sse = 0;

    for (const r of rows) {
        const n = cy.getElementById(r.codi_sad);
        if (!n || !n.nonempty()) throw new Error(`Node not found: ${r.codi_sad}`);
        if (!includeInCalibration(n)) continue;

        const model = +n.data("inflow" + month) || 0;
        const err = model - r.q; // IMPORTANT: aquí és r.q
        sse += err * err;
    }

    if (!Number.isFinite(sse)) {
        throw new Error(`SSE not finite (month=${month})`);
    }
    return Math.sqrt(sse / rows.length) ;
}

// --------------------
// 5) Calibratge per mes (grid + refinament)
// --------------------
function calibrateMonth(month) {
    const rows = (obsByMonth.get(month) ?? []).filter(r => {
        const n = cy.getElementById(r.codi_sad);
        return n && n.nonempty() && includeInCalibration(n);
    });
    if (!rows.length) throw new Error(`No usable observations for month ${month}`);

    const paramsList = ["aigua","urba","forestal","seca","regadiu","prats","rNeu"];

    // valors a provar (coarse); després fem refinament al voltant del millor
    const grid = [1, 1.5, 2, 2.5, 3, 3,5, 4, 4.5, 5];

    let bestMults = {
        aigua: 1, urba: 1, forestal: 1, seca: 1, regadiu: 1, prats: 1, rNeu: 1
    };
    let bestSse = sseForMonth(month, bestMults);

    // iteracions de coordinate descent
    const maxIters = 6;
    for (let it = 0; it < maxIters; it++) {
        let improved = false;

        for (const key of paramsList) {
            let localBestVal = bestMults[key];
            let localBestSse = bestSse;

            for (const v of grid) {
                const trial = { ...bestMults, [key]: v };
                const sse = sseForMonth(month, trial);
                if (sse < localBestSse) {
                    localBestSse = sse;
                    localBestVal = v;
                }
            }

            if (localBestSse < bestSse) {
                bestSse = localBestSse;
                bestMults = { ...bestMults, [key]: localBestVal };
                improved = true;
            }
        }

        if (!improved) break; // convergit
    }

    // refinament local (més fi) al voltant del vector final
    const refineSteps = [0.85, 0.92, 1.0, 1.08, 1.15];
    for (const key of paramsList) {
        let localBestVal = bestMults[key];
        let localBestSse = bestSse;

        for (const f of refineSteps) {
            const v = bestMults[key] * f;
            if (v <= 0.05) continue;
            const trial = { ...bestMults, [key]: v };
            const sse = sseForMonth(month, trial);
            if (sse < localBestSse) {
                localBestSse = sse;
                localBestVal = v;
            }
        }
        if (localBestSse < bestSse) {
            bestSse = localBestSse;
            bestMults = { ...bestMults, [key]: localBestVal };
        }
    }

    return { ...bestMults, sse: bestSse };
}


// --------------------
// 6) Executa per mesos i desa resultats
// --------------------
const results = [];
for (let m = 1; m <= 12; m++) {
    const best = calibrateMonth(m);
    if (!best) continue;
    results.push({ mes: m, ...best });
    console.log("Mes", m, "->", best);
}

function NSE(obsArr, modArr) {
    // obsArr i modArr han de tenir la mateixa longitud, sense NaNs
    const n = obsArr.length;
    if (n < 2) return null;

    const meanObs = obsArr.reduce((a, b) => a + b, 0) / n;

    let num = 0; // SSE
    let den = 0; // variància obs
    for (let i = 0; i < n; i++) {
        const e = modArr[i] - obsArr[i];
        num += e * e;
        const d = obsArr[i] - meanObs;
        den += d * d;
    }
    if (den === 0) return null; // sèries constants -> NSE indefinit
    return 1 - (num / den);
}

// --- 1) Llegeix els "best" multiplicadors per mes ---
const bestByMonth = new Map(
    readJSON("calibration/calibration_results.json").map(r => [+r.mes, r])
);

// --- 2) Construeix params finals ajustant cada mes ---
const finalParams = structuredClone(gm.params);

for (let m = 1; m <= 12; m++) {
    const best = bestByMonth.get(m);
    if (!best) continue;

    const i = m - 1;
    for (const k of Object.keys(finalParams.kc)) {
        finalParams.kc[k][i] *= best.kcMul;
    }
    finalParams.rNeu[i] *= best.rNeuMul;
}

// --- 3) Recalcula el model amb params finals (1 sola vegada) ---
gm.calculateContribution(cy, finalParams);

gm.RESERVOIR.storage_hm3[month] =
    (month !== 1 ? gm.RESERVOIR.storage_hm3[month - 1] : gm.RESERVOIR.initial_storage_hm3);

cy.nodes().forEach(n => {
    n.data('inflow' + month, 0);
    n.data('outflow' + month, 0);
    n.data('deficit' + month, 0);
});
cy.edges().forEach(e => {
    e.data('flow' + month, 0);
});

gm.calculateFlowMonth(cy, null, { period: { year: 2024, month }, resetStorage: true });

// Mostra resultats
nseResults.sort((a, b) => (b.nse ?? -1e9) - (a.nse ?? -1e9));
console.log("\nNSE per estació (best monthly params):");
for (const r of nseResults) {
    console.log(`${r.code}\tNSE=${r.nse === null ? "NA" : r.nse.toFixed(3)}\tn=${r.n}`);
}


const outPath = path.join(root, "calibration", "calibration_results.json");
fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log("Saved:", outPath);

console.log("OK. Nodes:", cy.nodes().length, "Edges:", cy.edges().length);

// --- 4) Calcula NSE per estació (sèrie de 12 mesos) ---
// obs ja el tens carregat (array amb {codi_sad, mes, cabal_m3s})
const obsByStation = new Map();
for (const r of obs) {
    const code = String(r.codi_sad);
    if (!obsByStation.has(code)) obsByStation.set(code, []);
    obsByStation.get(code).push({ mes: +r.mes, q: +r.cabal_m3s });
}

// Ordena per mes i calcula NSE comparant inflow<mes>
const nseResults = [];

for (const [code, rows] of obsByStation.entries()) {
    const n = cy.getElementById(code);
    if (!n || !n.nonempty()) continue;
    if (!includeInCalibration(n)) continue; // mateix filtre que uses a calibratge

    rows.sort((a, b) => a.mes - b.mes);

    const obsArr = [];
    const modArr = [];

    for (const r of rows) {
        const m = r.mes;
        const mod = +n.data("inflow" + m);
        if (!Number.isFinite(mod) || !Number.isFinite(r.q)) continue;
        obsArr.push(r.q);
        modArr.push(mod);
    }

    const nse = NSE(obsArr, modArr);
    nseResults.push({ code, nse, n: obsArr.length });
}