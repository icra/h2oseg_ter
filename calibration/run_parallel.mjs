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
    const assetPath = path.join(root, "assets", "calibration_results.json");
    fs.writeFileSync(assetPath, JSON.stringify(results, null, 2));

    // Calcula indicadors ------------------------------------------------------------------

    function mean(arr, w=null){
        if (!arr.length) return null;
        if (!w){
            return arr.reduce((a,b)=>a+b,0)/arr.length;
        }
        let sw=0, s=0;
        for (let i=0;i<arr.length;i++){ s += w[i]*arr[i]; sw += w[i]; }
        return sw>0 ? s/sw : null;
    }

    function variance(arr, w=null){
        const m = mean(arr, w);
        if (m === null) return null;
        if (!w){
            return arr.reduce((s,x)=>s+(x-m)*(x-m),0);
        }
        let s=0;
        for (let i=0;i<arr.length;i++) s += w[i]*(arr[i]-m)*(arr[i]-m);
        return s;
    }

    function rmse(obs, mod, w=null){
        const n = obs.length;
        if (n===0) return null;
        if (!w){
            let s=0; for (let i=0;i<n;i++){ const e=mod[i]-obs[i]; s+=e*e; }
            return Math.sqrt(s/n);
        }
        let sw=0, s=0;
        for (let i=0;i<n;i++){ const e=mod[i]-obs[i]; s += w[i]*e*e; sw += w[i]; }
        return sw>0 ? Math.sqrt(s/sw) : null;
    }

    function mae(obs, mod, w=null){
        const n = obs.length;
        if (n===0) return null;
        if (!w){
            let s=0; for (let i=0;i<n;i++) s += Math.abs(mod[i]-obs[i]);
            return s/n;
        }
        let sw=0, s=0;
        for (let i=0;i<n;i++){ s += w[i]*Math.abs(mod[i]-obs[i]); sw += w[i]; }
        return sw>0 ? s/sw : null;
    }

    function pbias(obs, mod, w=null){
        // 100 * (sum(mod-obs)/sum(obs))
        const n = obs.length;
        if (n===0) return null;
        if (!w){
            const so = obs.reduce((a,b)=>a+b,0);
            if (so===0) return null;
            const sm = mod.reduce((a,b)=>a+b,0);
            return 100*(sm-so)/so;
        }
        let swObs=0, sObs=0, sMod=0;
        for (let i=0;i<n;i++){
            const wi=w[i];
            sObs += wi*obs[i];
            sMod += wi*mod[i];
            swObs += wi;
        }
        if (sObs===0) return null;
        return 100*(sMod - sObs)/sObs;
    }

    function nse(obs, mod, w=null){
        const n = obs.length;
        if (n<2) return null;
        const m = mean(obs, w);
        if (m===null) return null;

        let num=0, den=0, sw=0;
        for (let i=0;i<n;i++){
            const wi = w ? w[i] : 1;
            const e = mod[i]-obs[i];
            num += wi*e*e;
            const d = obs[i]-m;
            den += wi*d*d;
            sw += wi;
        }
        if (den===0) return null;
        return 1 - (num/den);
    }

    function corr(obs, mod, w=null){
        const n = obs.length;
        if (n<2) return null;
        const mx = mean(obs, w), my = mean(mod, w);
        let sxy=0, sx=0, sy=0, sw=0;
        for (let i=0;i<n;i++){
            const wi = w ? w[i] : 1;
            const dx = obs[i]-mx;
            const dy = mod[i]-my;
            sxy += wi*dx*dy;
            sx  += wi*dx*dx;
            sy  += wi*dy*dy;
            sw += wi;
        }
        if (sx<=0 || sy<=0) return null;
        return sxy / Math.sqrt(sx*sy);
    }

    function kge(obs, mod, w=null){
        const r = corr(obs, mod, w);
        if (r===null) return null;
        const mo = mean(obs, w);
        const mm = mean(mod, w);
        if (mo===null || mm===null || mo===0) return null;

        // sd ponderada (sqrt de var/ sum(w) no cal, perquè en ràtio es cancel·la; fem sqrt(var))
        const vo = variance(obs, w);
        const vm = variance(mod, w);
        if (vo===null || vm===null || vo<=0) return null;

        const so = Math.sqrt(vo);
        const sm = Math.sqrt(vm);

        const beta = mm / mo;
        const gamma = (sm/mm) / (so/mo); // CV ratio

        // KGE (Gupta 2009): 1 - sqrt( (r-1)^2 + (beta-1)^2 + (gamma-1)^2 )
        return 1 - Math.sqrt((r-1)**2 + (beta-1)**2 + (gamma-1)**2);
    }

// transforms per baixos cabals
    function nseLog(obs, mod, w=null, eps=1e-6){
        const o = obs.map(x => Math.log(Math.max(eps, x)));
        const m = mod.map(x => Math.log(Math.max(eps, x)));
        return nse(o, m, w);
    }
    function nseSqrt(obs, mod, w=null){
        const o = obs.map(x => Math.sqrt(Math.max(0, x)));
        const m = mod.map(x => Math.sqrt(Math.max(0, x)));
        return nse(o, m, w);
    }

// --- pesos (com abans) ---
    const TARGET_STATION = "CONTROL_TER_RODA";
    const targetWeight = 1;
    function stationWeight(code){ return code===TARGET_STATION ? targetWeight : 1; }
    function defaultWeight(q_obs, p=1, eps=1e-6){ return Math.pow(Math.max(Math.abs(q_obs), eps), p); }

// --- construir vectors globals ---
    function collectPairs(obsRows, cy, includeInCalibration){
        const O=[], M=[], W=[], meta=[];
        for (const r of obsRows){
            const code = String(r.codi_sad);
            const month = +r.mes;
            const q_obs = +r.cabal_m3s;

            const n = cy.getElementById(code);
            if (!n || !n.nonempty()) continue;
            if (includeInCalibration && !includeInCalibration(n)) continue;

            const q_mod = +n.data("inflow" + month);
            if (!Number.isFinite(q_obs) || !Number.isFinite(q_mod)) continue;

            const w = stationWeight(code) * defaultWeight(q_obs, 1);
            O.push(q_obs); M.push(q_mod); W.push(w);
            meta.push({code, month});
        }
        return {O,M,W,meta};
    }

// --- per estació (12 mesos) ---
    function collectPairsByStation(obsRows, cy, includeInCalibration){
        const by = new Map();
        for (const r of obsRows){
            const code = String(r.codi_sad);
            const month = +r.mes;
            const q_obs = +r.cabal_m3s;

            const n = cy.getElementById(code);
            if (!n || !n.nonempty()) continue;
            if (includeInCalibration && !includeInCalibration(n)) continue;

            const q_mod = +n.data("inflow" + month);
            if (!Number.isFinite(q_obs) || !Number.isFinite(q_mod)) continue;

            if (!by.has(code)) by.set(code, {O:[], M:[], W:[], months:[]});
            const w = defaultWeight(q_obs, 1); // aquí pots NO ponderar per cabal si vols “just”
            by.get(code).O.push(q_obs);
            by.get(code).M.push(q_mod);
            by.get(code).W.push(w);
            by.get(code).months.push(month);
        }
        return by;
    }

// ======= USO =======

// 1) Després de recalcular cy amb params finals (gm.calculateContribution + gm.calculateFlow o loop months):
// 2) Agafa obs (ja els tens carregats)

// POOLING GLOBAL
    const O = [], M = [], W = [], meta = [];
    for (const monthRes of results) {
        for (const st of (monthRes.stations ?? [])) {
            const code = String(st.codi_sad);
            for (const pt of (st.points ?? [])) {
                const q_obs = +pt.q_obs_m3s;
                const q_mod = +pt.q_mod_m3s;
                if (!Number.isFinite(q_obs) || !Number.isFinite(q_mod)) continue;

                const w = stationWeight(code) * defaultWeight(q_obs, 1);
                O.push(q_obs); M.push(q_mod); W.push(w);
                meta.push({ code, month: +pt.mes });
            }
        }
    }

    const global = {
        n: O.length,
        RMSE: rmse(O,M,W),
        MAE: mae(O,M,W),
        PBIAS_pct: pbias(O,M,W),
        NSE: nse(O,M,W),
        NSE_sqrt: nseSqrt(O,M,W),
        NSE_log: nseLog(O,M,W, 1e-6),
        KGE_pooled: kge(O,M,W),
        r: corr(O,M,W),
    };

    console.log("Global (pooling, weighted):", global);

// PER ESTACIÓ
// ---- per estació des de results (sense obs/cy) ----
    const byStation = new Map();

    for (const monthRes of results) {
        for (const st of (monthRes.stations ?? [])) {
            const code = String(st.codi_sad);
            if (!byStation.has(code)) byStation.set(code, { O: [], M: [], W: [], months: [] });

            for (const pt of (st.points ?? [])) {
                const q_obs = +pt.q_obs_m3s;
                const q_mod = +pt.q_mod_m3s;
                if (!Number.isFinite(q_obs) || !Number.isFinite(q_mod)) continue;

                byStation.get(code).O.push(q_obs);
                byStation.get(code).M.push(q_mod);
                // Si vols pesos per estació, posa'ls aquí (o deixa-ho a null després)
                byStation.get(code).W.push(defaultWeight(q_obs, 1));
                byStation.get(code).months.push(+pt.mes);
            }
        }
    }

    const perStation = [];
    for (const [code, s] of byStation.entries()){
        perStation.push({
            code,
            n: s.O.length,
            RMSE: rmse(s.O,s.M,null),
            MAE: mae(s.O,s.M,null),
            PBIAS_pct: pbias(s.O,s.M,null),
            NSE: nse(s.O,s.M,null),
            KGE: kge(s.O,s.M,null),
            r: corr(s.O,s.M,null),
        });
    }
    perStation.sort((a,b)=>(b.NSE??-1e9)-(a.NSE??-1e9));
    console.table(perStation);

    const outPath2 = path.join(root, "calibration", "calibration_indicators.json");
    fs.writeFileSync(outPath2, JSON.stringify({global: global, perStation: perStation}, null, 2));
    console.log("Saved:", outPath2);
}

main().catch(e => { console.error(e); process.exit(1); });
