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
    const targetWeight = 1;

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

    function sseForMonth(month, mults) {
        const i = month - 1;
        const p = structuredClone(gm.params);

        // === Config multi-objectiu ===
        const EPS_LOG = 1e-6;     // prova: 1e-6 .. 1e-3
        const ALPHA = 0.5;        // 0.5 = 50% RMSE lineal + 50% RMSE log
        const USE_LOG = true;     // false => sqrt en lloc de log

        function safePosQ(x, eps = 1e-12) {
            return Math.max(0, Number(x) || 0) + eps;
        }

        function transformQ(x) {
            const q = safePosQ(x, EPS_LOG);
            return USE_LOG ? Math.log(q) : Math.sqrt(q);
        }

        p.rNeu[i] *= mults.rNeuMul;
        for (const t of Object.keys(p.gwLoss)) {
            const mul = mults.gwMulByType?.[t] ?? 1;
            p.gwLoss[t] *= mul;
        }
        for (const t of Object.keys(p.gwGain)) {
            const mul = mults.gwGainMulByType?.[t] ?? 1;
            p.gwGain[t] *= mul;
        }

        gm.calculateContribution(cy, p);
        gm.initSimulation(1, gm.RESERVOIR.capacity_hm3);
        gm.calculateFlowMonth(cy, p, null, { period: { year: 2024, month }, step: month });

        const obsMap = obsMapByMonth.get(month) || new Map();

        // RMSE lineal
        let sseLin = 0, wSumLin = 0;
        // RMSE transformada (log o sqrt)
        let sseT = 0, wSumT = 0;

        let nUsed = 0;

        for (const [code, q_obs] of obsMap.entries()) {
            const n = cy.getElementById(code);
            if (!n || !n.nonempty()) continue;
            if (!includeInCalibration(n)) continue;

            const obs = +q_obs;
            const mod = +n.data("inflow" + month) || 0;
            if (!Number.isFinite(obs) || !Number.isFinite(mod)) continue;

            // pes: RODA domina * i opcionalment cabals grans dominen
            const wStation = stationWeight(code);
            const wQ = defaultWeight(obs, 1); // posa 1 o 2 si vols |q|^2
            const w = wStation * wQ;

            // part lineal
            {
                const err = mod - obs;
                sseLin += w * err * err;
                wSumLin += w;
            }

            // part log/sqrt (mateix pes w; si vols donar més pes als petits, canvia wQ a 1 aquí)
            {
                const obsT = transformQ(obs);
                const modT = transformQ(mod);
                if (Number.isFinite(obsT) && Number.isFinite(modT)) {
                    const errT = modT - obsT;
                    sseT += w * errT * errT;
                    wSumT += w;
                }
            }

            nUsed++;
        }

        if (
            nUsed === 0 ||
            wSumLin <= 0 ||
            wSumT <= 0 ||
            !Number.isFinite(sseLin) ||
            !Number.isFinite(sseT)
        ) {
            throw new Error(`No usable observations for month ${month}`);
        }

        const rmseLin = Math.sqrt(sseLin / wSumLin);
        const rmseT = Math.sqrt(sseT / wSumT);

        // cost combinat
        const rmseCombo = ALPHA * rmseLin + (1 - ALPHA) * rmseT;

        // regularització log^2 suau per evitar valors extrems en neu i aqüífer
        const L = 0.01; // prova 0.003..0.03
        let reg = 0;
        reg += logMulPenalty(mults.rNeuMul ?? 1);
        for (const t of Object.keys(p.gwLoss)) {
            const mul = mults.gwMulByType?.[t] ?? 1;
            reg += logMulPenalty(mul);
        }
        for (const t of Object.keys(p.gwGain)) {
            const mul = mults.gwGainMulByType?.[t] ?? 1;
            reg += 2 * logMulPenalty(mul);
        }
        return rmseCombo + L * reg;
    }


    function rmseOnlyForMonth(month, mults) {
        const i = month - 1;
        const p = structuredClone(gm.params);

        // === Mateixa configuració que a sseForMonth ===
        const EPS_LOG = 1e-6;   // prova: 1e-6 .. 1e-3
        const ALPHA = 0.5;      // 0.5 = 50/50
        const USE_LOG = true;   // false => sqrt

        function safePosQ(x, eps = 1e-12) {
            return Math.max(0, Number(x) || 0) + eps;
        }

        function transformQ(x) {
            const q = safePosQ(x, EPS_LOG);
            return USE_LOG ? Math.log(q) : Math.sqrt(q);
        }

        p.rNeu[i] *= mults.rNeuMul;
        for (const t of Object.keys(p.gwLoss)) {
            const mul = mults.gwMulByType?.[t] ?? 1;
            p.gwLoss[t] *= mul;
        }
        for (const t of Object.keys(p.gwGain)) {
            const mul = mults.gwGainMulByType?.[t] ?? 1;
            p.gwGain[t] *= mul;
        }

        gm.calculateContribution(cy, p);
        gm.initSimulation(1, gm.RESERVOIR.capacity_hm3);
        gm.calculateFlowMonth(cy, p, null, { period: { year: 2024, month }, step: month });

        const obsMap = obsMapByMonth.get(month) || new Map();

        // RMSE lineal (ponderat)
        let sseLin = 0, wSumLin = 0;

        // RMSE log/sqrt (ponderat)
        let sseT = 0, wSumT = 0;

        let nUsed = 0;
        let nUsedT = 0;

        for (const [code, q_obs] of obsMap.entries()) {
            const n = cy.getElementById(code);
            if (!n || !n.nonempty()) continue;
            if (!includeInCalibration(n)) continue;

            const obs = +q_obs;
            const mod = +n.data("inflow" + month) || 0;
            if (!Number.isFinite(obs) || !Number.isFinite(mod)) continue;

            const w = stationWeight(code) * defaultWeight(obs, 1);

            // lineal
            const err = mod - obs;
            sseLin += w * err * err;
            wSumLin += w;
            nUsed++;

            // transformada
            const obsT = transformQ(obs);
            const modT = transformQ(mod);
            if (Number.isFinite(obsT) && Number.isFinite(modT)) {
                const errT = modT - obsT;
                sseT += w * errT * errT;
                wSumT += w;
                nUsedT++;
            }
        }

        if (!nUsed || wSumLin <= 0) return { ok: false, month, reason: "no-usable-linear", rmseW: Infinity };

        const rmseW = Math.sqrt(sseLin / wSumLin);

        // si per algun motiu la transformada no ha pogut computar (hauria de ser rar)
        const rmseT = (!nUsedT || wSumT <= 0) ? Infinity : Math.sqrt(sseT / wSumT);

        const rmseCombo = ALPHA * rmseW + (1 - ALPHA) * rmseT;

        return {
            ok: true,
            month,
            nUsed,
            // lineal
            rmseW,
            // log/sqrt
            rmseTrans: rmseT,
            trans: USE_LOG ? "log" : "sqrt",
            eps: EPS_LOG,
            // combinació
            alpha: ALPHA,
            rmseCombo
        };
    }


    function includeInCalibration(node) {
        return !damDownstream.has(node.id());
    }

    function stationErrorsForMonth(month, mults) {
        const m = Number(month);
        const i = m - 1;

        const p = structuredClone(gm.params);

        p.rNeu[i] *= mults.rNeuMul;
        for (const t of Object.keys(p.gwLoss)) {
            const mul = mults.gwMulByType?.[t] ?? 1;
            p.gwLoss[t] *= mul;
        }
        for (const t of Object.keys(p.gwGain)) {
            const mul = mults.gwGainMulByType?.[t] ?? 1;
            p.gwGain[t] *= mul;
        }

        gm.calculateContribution(cy, p);
        gm.initSimulation(1, gm.RESERVOIR.capacity_hm3);
        gm.calculateFlowMonth(cy, p, null, { period: { year: 2024, month: m }, step: m });

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
    const MUL_MAX = 20;
    const MUL_MAX_GAIN = 5;

    function calibrateMonth(month) {
        const obsMap = obsMapByMonth.get(month) || new Map();

        // només estacions amb node usable
        const usable = [];
        for (const [code, q] of obsMap.entries()) {
            const n = cy.getElementById(code);
            if (n && n.nonempty() && includeInCalibration(n)) usable.push(code);
        }
        if (!usable.length) throw new Error(`No usable observations for month ${month}`);

        const gwTypes = Object.keys(gm.params.gwLoss);
        const paramsList = [
            "rNeuMul",
            ...gwTypes.map(t => "gwLoss:" + t),
            ...gwTypes.map(t => "gwGain:" + t)
        ];

        // grid coarse
        const start = 0.2;
        const end = 20;
        const length = 20;

        const step = (end - start) / (length - 1);

        const grid = Array.from({ length }, (_, i) => start + i * step);

        let bestMults = {
            rNeuMul: 1,
            gwMulByType: Object.fromEntries(gwTypes.map(t => [t, 1])),
            gwGainMulByType: Object.fromEntries(gwTypes.map(t => [t, 1]))
        };

        let bestCost = sseForMonth(month, bestMults);

        const maxIters = 10;
        for (let it = 0; it < maxIters; it++) {
            let improved = false;

            for (const key of paramsList) {
                let localBest = null;
                let localBestCost = bestCost;

                for (const v of grid) {
                    const trial = structuredClone(bestMults);

                    if (key === "rNeuMul") {
                        trial.rNeuMul = clamp(v, 0, MUL_MAX);
                    } else if (key.startsWith("gwLoss:")) {
                        const t = key.slice(7);
                        trial.gwMulByType[t] = clamp(v, MUL_MIN, MUL_MAX);
                    } else if (key.startsWith("gwGain:")) {
                        const t = key.slice(7);
                        trial.gwGainMulByType[t] = clamp(v, MUL_MIN, MUL_MAX_GAIN);
                    } else {
                        throw new Error(`Unrecognized key: ${key}`);
                    }

                    const cost = sseForMonth(month, trial);
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
                    trial.rNeuMul = clamp(v,0, MUL_MAX);
                } else if (key.startsWith("gwLoss:")) {
                    const t = key.slice(7);
                    const v = trial.gwMulByType[t] * f;
                    if (v <= 1e-4) continue;
                    trial.gwMulByType[t] = clamp(v, MUL_MIN, MUL_MAX);
                } else if (key.startsWith("gwGain:")) {
                    const t = key.slice(7);
                    const v = trial.gwGainMulByType[t] * f;
                    if (v <= 1e-4) continue;
                    trial.gwGainMulByType[t] = clamp(v, MUL_MIN, MUL_MAX_GAIN);
                }

                const cost = sseForMonth(month, trial);
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

        const stations = stationErrorsForMonth(month, bestMults);
        const nUsed = stations.reduce((s, st) => s + (st.n || 0), 0);
        const metrics = rmseOnlyForMonth(month, bestMults);

        return { mes: month, ...bestMults, metrics, cost: bestCost, nUsed, stations };
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
