// calibration/worker_month.mjs
import {parentPort, workerData} from "worker_threads";
import fs from "fs";
import path from "path";
import {fileURLToPath} from "url";

import cytoscape from "cytoscape";
import gm from "../js/graph_methods.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, "..");

function readJSON(relPath) {
    const p = path.join(root, relPath);
    return JSON.parse(fs.readFileSync(p, "utf8"));
}

function buildContext() {
    const obs = readJSON("calibration/cabals_aforament.json").filter(r => Number.isFinite(+r.cabal_m3s));

    const obsByMonth = new Map();
    for (const r of obs) {
        const m = +r.mes;
        if (!obsByMonth.has(m)) obsByMonth.set(m, []);
        obsByMonth.get(m).push({codi_sad: r.codi_sad, q: +r.cabal_m3s});
    }

    const obsMapByMonth = new Map();
    for (const [m, arr] of obsByMonth.entries()) {
        const mp = new Map();
        for (const r of arr) mp.set(String(r.codi_sad), +r.q);
        obsMapByMonth.set(m, mp);
    }

    const nodesGeo = readJSON("assets/nodes.geojson");
    const edgesGeo = readJSON("assets/edges.geojson");

    const cyNodes = nodesGeo.features.map((f) => {
        const data = {...f.properties};
        data.lat = f.geometry.coordinates[1];
        data.lng = f.geometry.coordinates[0];
        return {data};
    });

    const cyEdges = edgesGeo.features.map((f) => {
        const data = {...f.properties};
        data.source = f.properties.from;
        data.target = f.properties.to;
        return {data};
    });

    const virtualEdges = [
        {data: {id: "v_82_res", source: "NODE_82", target: "DESEMBASSAT", virtual: true}},
        {data: {id: "v_33_res", source: "NODE_33", target: "DESEMBASSAT", virtual: true}},
        {data: {id: "v_34_res", source: "NODE_34", target: "DESEMBASSAT", virtual: true}},
        {data: {id: "v_84_res", source: "NODE_84", target: "DESEMBASSAT", virtual: true}},
    ];

    const cy = cytoscape({elements: [...cyNodes, ...cyEdges, ...virtualEdges], layout: {name: "preset"}});

    const damId = gm.RESERVOIR?.outNode ?? "DESEMBASSAT";
    const dam = cy.getElementById(damId);
    const damDownstream = new Set(dam.successors("node").toArray().map(n => n.id()));
    damDownstream.add(damId);

    const TARGET_STATION = "CONTROL_TER_RODA";
    const targetWeight = 50;

// pesos per estació (RODA domina)
    function stationWeight(code) {
        if (code === TARGET_STATION) return targetWeight;   // ajusta (10, 50, 100...)
        return 1;
    }

    function clamp(x, lo, hi) {
        return Math.max(lo, Math.min(hi, x));
    }

    function logMulPenalty(mul, eps = 1e-12) {
        // penalitza log(mul)^2
        const m = Math.max(eps, mul);
        const l = Math.log(m);
        return l * l;
    }

// Pes “grans cabals dominen”: w = |q_obs| (o |q_obs|^p)
    function defaultWeight(q_obs, p = 1, eps = 1e-6) {
        return Math.pow(Math.max(Math.abs(q_obs), eps), p);
    }

    function sseForMonth_byUse(month, mults) {
        const i = month - 1;
        const p = structuredClone(gm.params);

        // kc per ús (només mes i)
        for (const k of Object.keys(p.kc)) {
            const mul = mults.kcMulByUse?.[k] ?? 1;
            p.kc[k][i] *= mul;
        }
        p.rNeu[i] *= mults.rNeuMul;

        gm.calculateContribution(cy, p);

        cy.nodes().forEach(n => {
            n.data('inflow' + month, 0);
            n.data('outflow' + month, 0);
            n.data('deficit' + month, 0);
        });
        cy.edges().forEach(e => {
            e.data('flow' + month, 0);
        });

        gm.RESERVOIR.storage_hm3[month] =
            (month !== 1 ? gm.RESERVOIR.storage_hm3[month - 1] : gm.RESERVOIR.initial_storage_hm3);

        gm.calculateFlowMonth(cy, gm.params,null, { period: { year: 2024, month }, resetStorage: true });

        const obsMap = obsMapByMonth.get(month) || new Map();

        let sseW = 0, wSum = 0, nUsed = 0;

        for (const [code, q_obs] of obsMap.entries()) {
            const n = cy.getElementById(code);
            if (!n || !n.nonempty()) continue;
            if (!includeInCalibration(n)) continue;

            const obs = +q_obs;
            const mod = +n.data("inflow" + month) || 0;
            if (!Number.isFinite(obs) || !Number.isFinite(mod)) continue;

            const err = mod - obs;

            // pes: RODA domina * i opcionalment cabals grans dominen
            const wStation = stationWeight(code);
            const wQ = defaultWeight(obs, 1); // posa 1 o 2 si vols |q|^2
            const w = wStation * wQ;

            sseW += w * err * err;
            wSum += w;
            nUsed++;
        }

        if (nUsed === 0 || wSum <= 0 || !Number.isFinite(sseW)) {
            throw new Error(`No usable observations for month ${month}`);
        }

        const rmseW = Math.sqrt(sseW / wSum);

        // regularització log^2 suau per evitar límits (per ús + neu)
        const L = 0.01; // prova 0.003..0.03
        let reg = 0;
        for (const k of Object.keys(p.kc)) {
            const mul = mults.kcMulByUse?.[k] ?? 1;
            reg += logMulPenalty(mul);
        }
        reg += logMulPenalty(mults.rNeuMul ?? 1);

        return rmseW + L * reg;
    }

    function rmseOnlyForMonth_byUse(month, mults) {
        const i = month - 1;
        const p = structuredClone(gm.params);

        for (const k of Object.keys(p.kc)) {
            const mul = mults.kcMulByUse?.[k] ?? 1;
            p.kc[k][i] *= mul;
        }
        p.rNeu[i] *= mults.rNeuMul;

        gm.calculateContribution(cy, p);
        gm.calculateFlow(cy, gm.params,null, {period: {year: 2024, month}});

        const obsMap = obsMapByMonth.get(month) || new Map();

        let sseW = 0, wSum = 0, nUsed = 0;

        for (const [code, q_obs] of obsMap.entries()) {
            const n = cy.getElementById(code);
            if (!n || !n.nonempty()) continue;
            if (!includeInCalibration(n)) continue;

            const obs = +q_obs;
            const mod = +n.data("inflow" + month) || 0;
            if (!Number.isFinite(obs) || !Number.isFinite(mod)) continue;

            const err = mod - obs;
            const w = stationWeight(code) * defaultWeight(obs, 1);
            sseW += w * err * err;
            wSum += w;
            nUsed++;
        }

        if (!nUsed || wSum <= 0) return Infinity;
        return Math.sqrt(sseW / wSum);
    }

    function includeInCalibration(node) {
        return !damDownstream.has(node.id());
    }

    function stationErrorsForMonth_byUse(month, mults) {
        const m = Number(month);
        const i = m - 1;

        const p = structuredClone(gm.params);
        for (const k of Object.keys(p.kc)) {
            const mul = mults.kcMulByUse?.[k] ?? 1;
            p.kc[k][i] *= mul;
        }
        p.rNeu[i] *= mults.rNeuMul;

        gm.calculateContribution(cy, p);
        gm.calculateFlow(cy, gm.paramsnull, { period: { year: 2024, month: m } });

        const obsMap = obsMapByMonth.get(m) || new Map();

        const stations = [];
        for (const [code, q_obs] of obsMap.entries()) {
            const n = cy.getElementById(code);
            if (!n || !n.nonempty()) continue;
            if (!includeInCalibration(n)) continue;

            const obs = +q_obs;
            const mod = +n.data("inflow" + m) || 0;
            if (!Number.isFinite(obs) || !Number.isFinite(mod)) continue;

            const err = mod - obs;

            stations.push({
                codi_sad: code,
                n: 1,
                rmse: Math.abs(err),
                mae: Math.abs(err),
                bias: err,
                meanObs_m3s: obs,
                meanMod_m3s: mod,
                points: [{ mes: m, q_obs_m3s: obs, q_mod_m3s: mod, err_m3s: err }]
            });
        }
        return stations;
    }

    const MUL_MIN = 0.2;
    const MUL_MAX = 8.0;

    function calibrateMonth(month) {
        const obsMap = obsMapByMonth.get(month) || new Map();

        // només estacions amb node usable
        const usable = [];
        for (const [code, q] of obsMap.entries()) {
            const n = cy.getElementById(code);
            if (n && n.nonempty() && includeInCalibration(n)) usable.push(code);
        }
        if (!usable.length) throw new Error(`No usable observations for month ${month}`);

        const uses = Object.keys(gm.params.kc); // ["aigua","urba","forestal","seca","regadiu","prats"] etc
        const paramsList = [...uses.map(u => "kc:" + u), "rNeuMul"];

        // grid coarse
        const start = 0;
        const end = 20;
        const length = 20;

        const step = (end - start) / (length - 1);

        const grid = Array.from({ length }, (_, i) => start + i * step);

        let bestMults = {
            kcMulByUse: Object.fromEntries(uses.map(u => [u, 1])),
            rNeuMul: 1
        };

        let bestCost = sseForMonth_byUse(month, bestMults);

        const maxIters = 10;
        for (let it = 0; it < maxIters; it++) {
            let improved = false;

            for (const key of paramsList) {
                let localBest = null;
                let localBestCost = bestCost;

                for (const v of grid) {
                    const trial = structuredClone(bestMults);

                    if (key === "rNeuMul") {
                        trial.rNeuMul = v;
                    } else {
                        const use = key.slice(3); // "kc:<use>"
                        trial.kcMulByUse[use] = v;
                    }

                    const cost = sseForMonth_byUse(month, trial);
                    if (cost < localBestCost) {
                        localBestCost = cost;
                        localBest = trial;
                    }
                }

                if (localBest && localBestCost < bestCost) {
                    bestCost = localBestCost;
                    bestMults = localBest;
                    improved = true;
                }
            }

            if (!improved) break;
        }

        // refinament local multiplicatiu
        // refinament local multiplicatiu
        const refineSteps = [0.9, 0.95, 1.0, 1.05, 1.1];
        for (const key of paramsList) {
            let localBest = null;
            let localBestCost = bestCost;

            for (const f of refineSteps) {
                const trial = structuredClone(bestMults);

                if (key === "rNeuMul") {
                    const v = trial.rNeuMul * f;
                    if (v <= 1e-4) continue;
                    trial.rNeuMul = clamp(v, MUL_MIN, MUL_MAX);
                } else {
                    const use = key.slice(3);
                    const v = trial.kcMulByUse[use] * f;
                    if (v <= 1e-4) continue;
                    trial.kcMulByUse[use] = clamp(v, MUL_MIN, MUL_MAX);
                }

                const cost = sseForMonth_byUse(month, trial);
                if (cost < localBestCost) {
                    localBestCost = cost;
                    localBest = trial;
                }
            }

            if (localBest && localBestCost < bestCost) {
                bestCost = localBestCost;
                bestMults = localBest;
            }
        }

        const rmseW = rmseOnlyForMonth_byUse(month, bestMults);
        const stations = stationErrorsForMonth_byUse(month, bestMults);
        const nUsed = stations.reduce((s, st) => s + st.n, 0);

        return { mes: month, ...bestMults, rmseW, cost: bestCost, nUsed, stations };
    }

    return {calibrateMonth};
}

const {month} = workerData;
const {calibrateMonth} = buildContext();

try {
    const result = calibrateMonth(month);
    parentPort.postMessage({ok: true, result});
} catch (err) {
    parentPort.postMessage({ok: false, error: String(err?.stack || err)});
}
