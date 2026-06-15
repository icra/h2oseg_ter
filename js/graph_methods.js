const inNodes = ['NODE_82', 'NODE_33', 'NODE_34', 'NODE_84']

const createMonths = function(preffix, K){
    return Array(K).fill().map((e, i) => String(preffix + (1 + i)))
}

const monthOfStep = (k) => ((k - 1) % 12) + 1;

const sortBySuffixNumber = (keys, prefix) =>
    keys.slice().sort((a, b) => {
        const na = Number(a.slice(prefix.length));
        const nb = Number(b.slice(prefix.length));
        return na - nb;
    });

let SIM = {
    K: 12,
    m: [], inflow: [], outflow: [], flow: [], r: []
};



const initSimulation = function(nYears, initialVolume){
    SIM.K = Number(nYears) * 12 || 12;

    let initVolume = Number(initialVolume) || RESERVOIR.capacity_hm3

    SIM.m      = createMonths('m',      SIM.K);
    SIM.inflow = createMonths('inflow', SIM.K);
    SIM.outflow= createMonths('outflow',SIM.K);
    SIM.flow   = createMonths('flow',   SIM.K);
    SIM.r      = createMonths('',       SIM.K);

    // si tens RESERVOIR amb sèries, reseteja aquí
    RESERVOIR.storage_hm3 = {};
    RESERVOIR.inflowSum_m3s = {};
    RESERVOIR.released_m3s = {};
    RESERVOIR.initial_storage = initVolume
    RESERVOIR.overflowSum_m3s = {}

}

const lightHours = [9.3, 10.4, 11.7, 13.2, 14.4, 15, 14.8, 13.7, 12.3, 10.8, 9.6, 9]
const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const w = {
    us_conreu_seca: 0.75,
    us_conreu_regadiu: 1.5,
    us_prats: 1,
    us_forestal: 1.75,
    us_urba: 0,
    us_aigua: 0
}

const params = {
    rNeu: [0.18,0.20,0.23,0.28,0.35,0.40,0.40,0.35,0.30,0.22,0.20,0.18],
    gwLoss: {
        low: 1e-6,
        mid: 3e-6,
        high: 8e-6,
    },
    gwGain: {
        low: 0.002,
        mid: 0.005,
        high: 0.01
    }
};

function buildCalibratedParams(baseParams, calibResults) {
    // index per mes: 1..12
    const byMonth = new Map(calibResults.map(r => [+r.mes, r]));

    const p = structuredClone(baseParams);

    // rNeu: array (12)
    p.rNeu = p.rNeu.map((base, i) => {
        const month = i + 1;
        const r = byMonth.get(month);
        const mul = r?.rNeuMul ?? 1;
        return base * mul;
    });

    // gwLoss: tu el tens escalar; el convertim a array (12) perquè puguis aplicar mul mensual
    for (const t of Object.keys(p.gwLoss)) {
        const baseK = p.gwLoss[t]; // escalar
        p.gwLoss[t] = Array.from({ length: 12 }, (_, i) => {
            const month = i + 1;
            const r = byMonth.get(month);
            const mul = r?.gwMulByType?.[t] ?? 1;
            return baseK * mul;
        });
    }

    // gwGain -> array mensual
    for (const t of Object.keys(p.gwGain)) {
        const baseG = p.gwGain[t]; // m3/s per km (escalar)
        p.gwGain[t] = Array.from({ length: 12 }, (_, i) => {
            const month = i + 1;
            const r = byMonth.get(month);
            const mul = r?.gwGainMulByType?.[t] ?? 1;
            return baseG * mul;
        });
    }


    return p;
}

function monthSeconds(year, month /* 1..12 */) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end   = new Date(Date.UTC(year, month, 1));
    return (end - start) / 1000; // segons al mes
}

function m3sToHm3(q_m3s, dt_s){ return ( (q_m3s || 0) * dt_s ) / 1e6; }
function hm3ToM3s(vol_hm3, dt_s){ return dt_s > 0 ? (vol_hm3 * 1e6) / dt_s : 0; }

let RESERVOIR = {
    inNodes: new Set(inNodes),
    outNode: 'DESEMBASSAT',
    storage_hm3: {},
    capacity_hm3: 400,
    maxSurface_ha: 967,
    inflowSum_m3s: {},
    inflowVol_hm3: {},
    overflowSum_m3s: {},
    overflowVol_hm3: {},
    releaseDemand_m3s: {},
    released_m3s: {},
    releasedVol_hm3: {},
    customRelease_m3s: {}
    // last: {inflowSum_m3s: {}, inflowVol_hm3: {}, releaseDemand_m3s: {}, released_m3s: {}, releasedVol_hm3: {}, dt_s: {}}
};

// utilitat: construir un Set amb tots els ancestres (predecessors) d’un node donat
const ancestorsOf = function(cy, nodeId){
    const anc = new Set();
    const start = cy.getElementById(nodeId);
    start.predecessors('node').forEach(n => anc.add(n.id()));
    anc.add(nodeId); // incloure també el node mateix per comoditat
    return anc;
}

const calculateNodeContribution = function(node, params) {
    // mean temperature
    const tmit = sortBySuffixNumber(
        Object.keys(node.data())
            .filter(k => k.startsWith('tmit')),
        'tmit')

    tmit.forEach(m => {
        node.data(m, Math.max(node.data(m), 0))
    })

    const ppt = sortBySuffixNumber(
        Object.keys(node.data())
            .filter(k => k.startsWith('ppt')),
        'ppt'
    )
        .map(p => node.data(p))

    // ETP Thornwaite
    const I = tmit.reduce((sum, tmit) => sum + Math.pow(Math.max(node.data(tmit), 0) / 5, 1.514), 0)
    const a = 6.75e-7 * Math.pow(I, 3) - 771e-7 * Math.pow(I, 2) + 1792e-5 * I + 0.49239;
    const ETPsc = tmit.map(tmit => 16 * Math.pow((10 * node.data(tmit)) / I, a))
    const ETP = ETPsc.map((e, i) => e * (lightHours[i] / 12) * (monthDays[i] / 30))

    createMonths('etp', 12).forEach((k, i) => {
        node.data(k, ETP[i])
    })


    // Equació de Zhang et al 2021 amb valors de w segons el 3r informe de canvi climàtic (pp 172-173)
    const ET = ETP.map((etp, i) => {
        if (ppt[i] <= 0) return 0;
        const ai = etp / ppt[i]
        const inv_ai = ai ** -1

        return Object.keys(w).map(us => node.data(us) * ppt[i] * (1 + w[us] * ai) / (1 + w[us] * ai + inv_ai))
            .reduce((a, b) => a + b, 0)
    })

    createMonths('et', 12).forEach((k, i) => {
        node.data(k, ET[i])
    })


    const neu = sortBySuffixNumber(
        Object.keys(node.data())
            .filter(k => k.startsWith('neu')),
        'neu'
    )
        .map(n => node.data(n))

    const deltaNeu = neu.map((n, i) => {
        const lag = i === 0 ? 11 : i - 1
        return n - neu[lag]
    })

    const mmNeu = deltaNeu.map((n, i) => n * params.rNeu[i])

    // contribution = Area * (PPT - ET - Snowpack) - INFILTRATION (10%)
    const monthContrib = ppt.map((p, i) => node.data('area_m2') * (p - ET[i] - mmNeu[i]) * 0.9)

    const seconds = Array(12).fill().map((e, i) => i + 1)
        .map(m => monthSeconds(2025, m))

    createMonths('m', 12).forEach((k, i) => {
        node.data(k, Math.max(monthContrib[i] * 0.001 / seconds[i], 0))
    })
}

const calculateContribution = function(cy, params){
    if (!params) throw new Error('parameters required')

    cy.nodes().forEach(node => {
        if ((node.data('type') === 'massa' || node.data('type') === 'comporta' || node.data('type') === 'aforament') && node.data('area_m2') > 0) {
            calculateNodeContribution(node, params)
        }
    })
}

const applyGwLossToEdge = function(q_in, edge, month, params){
    if (params === null) {
        console.error("Params is null")
        return q_in
    }

    const L_km = edge.data('lengthRiver');
    const L_m = edge.data('lengthRiver') * 1000;
    const type = edge.data('gwType');

    // LOSS (exponencial)
    let k = params.gwLoss[type];
    if (Array.isArray(k)) k = k[month - 1]
    k = Number(k) || 0;

    let q_after = q_in;

    if (L_m > 0 && k > 0 && q_after > 0) {
        q_after = q_after * Math.exp(-k * L_m);
    }

    // GAIN (additiu)
    let g = params.gwGain[type]; // m3/s per km
    if (Array.isArray(g)) g = g[month - 1];
    g = Number(g) || 0;

    // guany proporcional a longitud (km)
    const q_gain = g * L_km

    // q_out = q_in * exp(-k L)
    return Math.max(0, q_after + q_gain);
}

const calculateFlow = async function(cy, params, nYears = 1, errorRef = null, opts = {}, loadingYear, initialVolume){
    if (!params) throw new Error('parameters required')
    initSimulation(nYears, initialVolume)

    const K = Number(nYears) * 12 || 12

    for (let k = 1; k <= K; k++){
        if (loadingYear) loadingYear.value = Math.ceil(k / 12)

        const mo = monthOfStep(k); // 1..12
        calculateFlowMonth(cy, params, errorRef, {
            period: { year: 2025, month: mo },
            step: k
        });

        if (k % 12 === 0) {
            await new Promise(requestAnimationFrame)
        }
    }
    // Calculem mitjanes anuals per tots els elements
    calculateAnnualValues(cy)
}

const calculateAnnualValues = function(cy){
    cy.nodes().forEach(node => {
        const data = node.data();

        const m = createMonths('m', 12)

        const changesMean = m.map(k => data[k])
            .reduce((a, b) => a + b, 0) / m.length;
        node.data('m0', changesMean);

        const inflowMean = SIM.inflow.map(k => data[k])
            .reduce((a, b) => a + b, 0) / SIM.inflow.length;
        node.data('inflow0', inflowMean);

        const outflowMean = SIM.outflow.map(k => data[k])
            .reduce((a, b) => a + b, 0) / SIM.inflow.length;
        node.data('outflow0', outflowMean);
    })

    cy.edges().forEach(edge => {
        const data = edge.data();

        const flowMean = SIM.flow.map(k => data[k])
            .reduce((a, b) => a + b, 0) / SIM.flow.length;
        edge.data('flow0', flowMean);
    })


    RESERVOIR.storage_hm3['0'] = SIM.r.map(k => RESERVOIR.storage_hm3[k])
        .reduce((a, b) => a + b, 0) / SIM.r.length;
    RESERVOIR.inflowSum_m3s['0'] = SIM.r.map(k => RESERVOIR.inflowSum_m3s[k])
        .reduce((a, b) => a + b, 0) / SIM.r.length;
    RESERVOIR.released_m3s['0'] = SIM.r.map(k => RESERVOIR.released_m3s[k])
        .reduce((a, b) => a + b, 0) / SIM.r.length;
    RESERVOIR.releasedVol_hm3.total = SIM.r.map(k => RESERVOIR.releasedVol_hm3[k])
        .reduce((a, b) => a + b, 0)

}

const modifyFlowChange = async function(
    cy,
    selectedEle,          // selectedEle.value (té .id)
    flowModifiedByMonth,  // objecte amb claus '1'..'12'
    errorMsg,
    params,
    opts = {},
    loadingYear,
    initialVolume
){
    if (!selectedEle?.id) return;
    if (!Number(opts.nYears)) console.error('opts.nYears required as a number');

    const node = cy.getElementById(selectedEle.id);
    if (!node?.isNode?.()) return;

    // backup per si hi ha error (opcional però recomanat)
    const prev = {};
    for (let mo = 1; mo <= 12; mo++) prev[mo] = node.data('m' + mo);

    // 1) aplicar TOTS els mesos (sense recalcular encara)
    for (let mo = 1; mo <= 12; mo++) {
        const v = Number(flowModifiedByMonth?.[String(mo)]);
        if (!Number.isFinite(v)) {
            errorMsg.value = `Introdueix un valor numèric (mes ${mo})`;
            return;
        }
        node.data('m' + mo, v);
    }

    // 2) recalcular un sol cop (tots els anys)
    try {
        errorMsg.value = null;

        const nYears = opts.nYears || 1;

        await calculateFlow(cy, params, nYears, errorMsg, {}, loadingYear, initialVolume)

        if (errorMsg.value) {
            // revert si hi ha error
            for (let mo = 1; mo <= 12; mo++) node.data('m' + mo, prev[mo]);

            await calculateFlow(cy, params, nYears, errorMsg, {}, loadingYear, initialVolume)
        }

        // refresca selectedEle (sidebar) amb els nous inputs
        for (let mo = 1; mo <= 12; mo++) {
            selectedEle['m' + mo] = node.data('m' + mo);
        }
        selectedEle.m0 = node.data('m0'); // per si mostres volum anual

    } catch (e) {
        console.error(e);
        // revert en cas d’excepció
        for (let mo = 1; mo <= 12; mo++) node.data('m' + mo, prev[mo]);
        errorMsg.value = "Error recalculant la simulació";
    }
};

const calculateFlowMonth = function(cy, params, errorRef = null, opts = {}) {
    let R = RESERVOIR;

    const month = opts.period.month
    const k = opts.step

    if (!k) throw new Error('Missing opts.step')

    const dt_s = opts.period ? monthSeconds(opts.period.year, opts.period.month) : monthSeconds(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1);
    if (R.storage_hm3[k] == null) {
        const init = Number(R.initial_storage ?? 0)
        const prev = Number(R.storage_hm3[k - 1])
        R.storage_hm3[k] = Number.isFinite(prev) ? prev : init
    }
    R.inflowSum_m3s[k] = 0
    R.inflowVol_hm3[k] = 0
    R.overflowSum_m3s[k] = 0
    R.overflowVol_hm3[k] = 0
    R.releaseDemand_m3s[k] = 0
    R.released_m3s[k] = 0
    R.releasedVol_hm3[k] = 0

    const damAncestors = ancestorsOf(cy, R.outNode);

    let visited = new Set();

    function dfs(node) {
        if (visited.has(node.id())) return;
        visited.add(node.id());

        // Primer processar els nodes aigües amunt (fonts) i primer els afluents aigües avall de l'embassament
        const upstreamNodes = node.predecessors('node');
        const ordered = upstreamNodes.sort((a, b) => {
            const aIsAnc = damAncestors.has(a.id());
            const bIsAnc = damAncestors.has(b.id());
            if (aIsAnc === bIsAnc) return 0;
            return aIsAnc ? 1 : -1; // els NO ancestres primer
        });
        ordered.forEach(pre => dfs(pre));

        // 1. Sumar el flux que REALMENT arriba per cada edge entrant
        const incomingEdges = node.incomers('edge');
        let inflow = 0;
        incomingEdges.forEach(edge => {
            const flow = parseFloat(edge.data('flow' + k)) || 0;
            inflow += flow;
        });

        // 2. Aplicar el flowChange local del node
        node.data('inflow' + k, inflow);
        const flowChange = parseFloat(node.data('m' + month)) || 0;
        const rawOutflow = inflow + flowChange;
        const positiveOut = Math.max(0, rawOutflow);
        let outflow = Math.max(0, rawOutflow);
        node.data('outflow' + k, outflow);
        node.data('deficit' + k, rawOutflow);

        if (R.inNodes && R.inNodes.has(node.id())) {
            const add_hm3 = m3sToHm3(positiveOut, dt_s);

            R.inflowSum_m3s[k] += positiveOut;
            R.inflowVol_hm3[k] += add_hm3

            // no propaguem cabal a través dels arcs virtuals
            node.data('outflow' + k, 0);
            // node.data('storage_after_hm3' + k, R.storage_hm3[k]);

            const outgoingEdges = node.outgoers('edge');
            outgoingEdges.forEach(edge => {
                edge.data('flow' + k, 0);
            });
            return;
        }

        if (R.outNode && R.outNode === node.id()) {
            const customRelease = R.customRelease_m3s[month]
            const localContribution_m3s = Math.max(0, flowChange)

            let outflowR

            if (customRelease !== undefined) {
                const etp = node.data('etp' + month)
                outflowR = applyCustomTotalRelease(customRelease, localContribution_m3s, etp, k, dt_s)
            } else {
                outflowR = localContribution_m3s;
            }

            node.data('outflow' + k, outflowR)
            node.outgoers('edge').forEach(edge => {
                const q = applyGwLossToEdge(outflowR, edge, month, params)
                edge.data('flow' + k, q)
            })

            return
        }

        // 3. Assignar aquest outflow als edges sortints
        const outgoingEdges = node.outgoers('edge');
        outgoingEdges.forEach(edge => {
            const qOutEdge = applyGwLossToEdge(outflow, edge, month, params)
            edge.data('flow' + k, qOutEdge);
        });
    }

    // Iniciar des de fulles (afluents)
    const leaves = cy.nodes().filter(n => n.outgoers('edge').length === 0);
    leaves.forEach(leaf => dfs(leaf));

    // Segona passada per calcular demanda de l'embassament i alliberar l'aigua si no hi ha valor d'usuari
    if (R.customRelease_m3s[month] === undefined){
        const dam = cy.getElementById(R.outNode);
        const succNodes = dam.successors('node');
        let demanda = 0;

        succNodes.forEach(n => {
            // la demanda és el cabal que necessita menys el que li entra.
            if (n.data('m' + month) < 0) {
                const demandaNode = (n.data('m' + month)*(-1) - n.data('inflow' + k))
                demanda += Math.max(demandaNode, 0)
            }
        });

        // Augmentem demanda un factor de seguretat
        demanda = demanda * 1.01

        const R_backup = structuredClone(R)

        // Calcular demanda ambiental, és el màxim de envFlow<m> - flow
        let demandaTotal = demanda
        const tol = 1e-4
        const maxIter = 10

        for (let iter = 0; iter < maxIter; iter++) {
            Object.assign(RESERVOIR, structuredClone(R_backup))

            calculateFlowDownstreamDam(
                cy,
                demandaTotal,
                dam,
                month,
                k,
                dt_s,
                params
            )

            let maxDeficitAmbiental = 0

            dam.successors('edge').forEach(edge => {
                const env = Number(edge.data('envFlow' + month)) || 0
                const flow = Number(edge.data('flow' + k)) || 0
                const deficit = env - flow

                if (deficit > maxDeficitAmbiental) {
                    maxDeficitAmbiental = deficit
                }
            })

            if (maxDeficitAmbiental <= tol) {
                break
            }

            const available_hm3 = R_backup.storage_hm3[k] + R_backup.inflowVol_hm3[k]
            const maxPossible_m3s = hm3ToM3s(available_hm3, dt_s)
            const alreadyAtLimit = demandaTotal >= maxPossible_m3s - tol

            if (alreadyAtLimit) {
                break
            }

            // Factor de seguretat perquè si hi ha pèrdues en trams intermedis,
            // no ens quedem curts.
            demandaTotal += maxDeficitAmbiental * 1.05
        }
    }


    if (errorRef) errorRef.value = null;
};

const calculateFlowDownstreamDam = function(cy, demanda, dam, month, k, dt_s, params){
    let R = RESERVOIR

    const localContribution_m3s = Math.max(0, Number(dam.data('m' + month)) || 0)

    const etp = dam.data('etp' + month)

    const totalOutflow_m3s = applyReservoirRelease(demanda, localContribution_m3s, etp, k, dt_s)

    dam.data('outflow' + k, totalOutflow_m3s);
    dam.outgoers('edge').forEach(e => {
        const q = applyGwLossToEdge(totalOutflow_m3s, e, month, params)
        e.data('flow' + k, q)
    })

    // Recalcular tot aigües avall amb el release ja aplicat
    const bfs = cy.elements().bfs({ roots: dam, directed: true });
    bfs.path.nodes().not(dam).forEach(n => {
        // 1) inflow = suma de tots els 'flow<m>' dels edges entrants
        let inflow2 = 0;
        n.incomers('edge').forEach(ed => { inflow2 += (+ed.data('flow' + k) || 0); });

        // 2) aplicar m<month> local i clamp a ≥ 0
        const mChange2 = +n.data('m' + month) || 0;
        const raw2 = inflow2 + mChange2;
        const out2 = Math.max(0, raw2);

        // 3) escriure dades del node
        n.data('inflow'  + k, inflow2);
        n.data('outflow' + k, out2);

        // 4) propagar cap avall
        n.outgoers('edge').forEach(ed => {
            const q = applyGwLossToEdge(out2, ed, month, params)
            ed.data('flow' + k, q)
        });
    });
}

const applyReservoirRelease = function(controlledRelease_m3s, nodeContribution, etp, k, dt_s) {
    const R = RESERVOIR

    const controlled = Math.max(0, Number(controlledRelease_m3s) || 0)

    const storageStart_hm3 = Number(R.storage_hm3[k]) || 0
    const inflowVol_hm3 = Number(R.inflowVol_hm3[k]) || 0

    const evap_hm3 = calculateEvaporation(k, etp)
    const available_hm3 = Math.max(storageStart_hm3 + inflowVol_hm3 - evap_hm3, 0)
    const maxControlledRelease_m3s = hm3ToM3s(available_hm3, dt_s)

    const actualControlledRelease_m3s = Math.min(controlled, maxControlledRelease_m3s)
    const controlledReleaseVol_hm3 = m3sToHm3(actualControlledRelease_m3s, dt_s)

    const storageAfterRelease_hm3 = Math.max(0, available_hm3 - controlledReleaseVol_hm3)
    const overflowVol_hm3 = Math.max(0, storageAfterRelease_hm3 - R.capacity_hm3)
    const overFlow_m3s = hm3ToM3s(overflowVol_hm3, dt_s)
    const storageEnd_hm3 = Math.min(storageAfterRelease_hm3, R.capacity_hm3)
    const reservoirRelease_m3s = actualControlledRelease_m3s + overFlow_m3s
    const totalOutflow_m3s = reservoirRelease_m3s + nodeContribution

    R.storage_hm3[k] = storageEnd_hm3

    R.overflowVol_hm3[k] = overflowVol_hm3
    R.overflowSum_m3s[k] = overFlow_m3s

    R.releaseDemand_m3s[k] = controlled
    R.released_m3s[k] = reservoirRelease_m3s
    R.releasedVol_hm3[k] = m3sToHm3(reservoirRelease_m3s, dt_s)

    return totalOutflow_m3s
}

const applyCustomTotalRelease = function(requestedTotalRelease_m3s, nodeContribution_m3s, etp, k, dt_s){
    const R = RESERVOIR
    const requestedTotal = Math.max(0, Number(requestedTotalRelease_m3s) || 0)
    const nodeContribution = Math.max(0, Number(nodeContribution_m3s) || 0)

    const storageStart_hm3 = Number(R.storage_hm3[k]) || 0
    const inflowVol_hm3 = Number(R.inflowVol_hm3[k]) || 0
    const available_hm3 = storageStart_hm3 + inflowVol_hm3

    const requestedTotal_hm3 = m3sToHm3(requestedTotal, dt_s)

    // Sobreeiximent inevitable si no es desembassa res
    const minSpill_hm3 = Math.max(0, available_hm3 - R.capacity_hm3)


    let controlledRelease_hm3

    if (requestedTotal_hm3 <= minSpill_hm3) {
        // No cal desembassar controladament:
        // el mínim físic ja és superior al que demana l'usuari.
        controlledRelease_hm3 = 0
    } else {
        // Per assolir un total superior al sobreeiximent inevitable,
        // desembassem aquest volum controladament.
        controlledRelease_hm3 = Math.min(requestedTotal_hm3, available_hm3)
    }


    const controlledRelease_m3s = hm3ToM3s(controlledRelease_hm3, dt_s)

    return applyReservoirRelease(
        controlledRelease_m3s,
        nodeContribution,
        etp,
        k,
        dt_s
    )
}


const calculateMonthlyMeanCy = function (cy, varPrefix) {
    const sumWeighted = Array(12).fill(0)
    const sumArea = Array(12).fill(0)

    cy.nodes().forEach(node => {
        const area = Number(node.data("area_m2")) || 0
        if (!area) return

        for (let mo = 1; mo <= 12; mo++) {
            const key = varPrefix + mo
            const value = Number(node.data(key))

            if (!Number.isFinite(value)) continue

            sumWeighted[mo - 1] += value * area
            sumArea[mo - 1] += area
        }
    })

    return sumWeighted.map((v, i) => {
        if (sumArea[i] === 0) return null
        return v / sumArea[i]
    })
}

const calculateMeanCy = function (cy, varPrefix, mode = "sum") {
    let sumWeighted = 0;
    let sumArea = 0;

    cy.nodes().forEach((node) => {
        if (node.data(varPrefix + '1') === undefined) return
        const area = Number(node.data("area_m2")) || 0;
        if (!area) return;

        const keys = Object.keys(node.data()).filter((k) => k.startsWith(varPrefix));

        const values = keys
            .map((k) => Number(node.data(k)))
            .filter((v) => Number.isFinite(v));

        if (values.length === 0) return;

        const sumMonths = values.reduce((a, b) => a + b, 0);

        const nodeValue =
            mode === "mean" ? (sumMonths / values.length) : sumMonths; // mean=temperatura, sum=pluja

        sumWeighted += nodeValue * area;
        sumArea += area;
    });

    if (sumArea === 0) {
        console.error('calculateMeanCy: no valid nodes found for prefix', varPrefix);
        return null;
    }
    return sumWeighted / sumArea;
};

const calculateDemand = function(cy, types){
    const demandaAnual = cy.nodes()
            .filter(n => types.includes(n.data('type')))
            .reduce((sumNodes, n) => {
                const nodeAnnualHm3 = Array.from({length: 12}, (_, i) => {
                    const month = i + 1
                    const q = Number(n.data('m' + month)) || 0
                    const dt_s = monthSeconds(2025, month)

                    // Si les demandes són negatives, les convertim a volum positiu
                    const demanda = m3sToHm3(-q, dt_s)
                    return demanda
                }).reduce((a, b) => a + b, 0)

                return sumNodes + nodeAnnualHm3
            }, 0)
    return demandaAnual
}

const calculateSurface = function(cy, us){
    if (!cy) {
        console.error("cy not loaded")
        return 0
    }

    return cy.nodes()
        .filter(n => n.data(us) != null)
        .map((n) => n.data('area_m2') * n.data(us) / 1000000)
        .reduce((a, b) => a + b, 0)
}

const calculateEvaporation = function(k, etp){
    const maxSurface  = RESERVOIR.maxSurface_ha
    const maxSurfaceSau = 443
    const maxSurfaceSus = 526

    // Volum repartit Sau 0.4 i Susqueda 0.6 a partir de la capacitat màxima de cada embassament
    const partSau = 0.4
    const partSus = 0.6
    const volum_m3 = RESERVOIR.storage_hm3[k] * 1e6
    const volSau = volum_m3 * partSau
    const volSus = volum_m3 * partSus

    // Capacitat Sau: 155, capacitat Susqueda 233 hm3
    const areaSau = (volSau / 155e6) * maxSurfaceSau
    const areaSus = (volSus / 233e6) * maxSurfaceSus
    const areaEmb_m2 = (areaSau + areaSus) * 1e4

    // Evaporació basat en el model calibrat en R a partir de evaporació de Penman FAO56
    const et = (etp * 1.11 + 16.76) // l/m2
    const evaporacio_hm3 = ((et / 1000) * areaEmb_m2) / 1e6 // hm3 mensuals
    // console.log('evaporació', 'volum:', RESERVOIR.storage_hm3[k], 'evaporat:', evaporacio_hm3, "percentatge:", evaporacio_hm3 / RESERVOIR.storage_hm3[k] * 100)
    return evaporacio_hm3
}

const accumulateUpstream = function(cy, id, variable, operand = 'mean') {
    const node = cy.getElementById(id)

    if (!node || node.empty()) {
        console.error('Node not found:', id)
        return null
    }

    // predecessors no inclou el node actual; l'afegim si vols tota l'àrea drenada fins al node
    const upstream = node
        .predecessors('node')
        .union(node)
        .filter(n => Number.isFinite(Number(n.data('area_m2'))) && Number(n.data('area_m2')) > 0)

    if (upstream.empty()) return null

    if (variable === 'area_m2' && operand === 'sum') {
        return upstream
            .map(n => Number(n.data('area_m2')) || 0)
            .reduce((a, b) => a + b, 0)
    }

    const varNames = createMonths(variable, 12)

    if (operand === 'mean') {
        const areaTotal = upstream
            .map(n => Number(n.data('area_m2')) || 0)
            .reduce((a, b) => a + b, 0)

        if (areaTotal <= 0) return null

        const monthlyMeans = varNames.map(v => {
            const weightedSum = upstream
                .map(n => {
                    const value = Number(n.data(v))
                    const area = Number(n.data('area_m2')) || 0

                    if (!Number.isFinite(value)) return 0

                    return value * area
                })
                .reduce((a, b) => a + b, 0)

            return weightedSum / areaTotal
        })

        // Retorna les 12 mitjanes mensuals
        return monthlyMeans
    }

    if (operand === 'sum') {
        return varNames
            .map(v => {
                return upstream
                    .map(n => Number(n.data(v)) || 0)
                    .reduce((a, b) => a + b, 0)
            })
            .reduce((a, b) => a + b, 0)
    }

    return null
}

export const isHeadwaterNode = function(n) {
    const hasAncestors = n.predecessors('node').nonempty()
    return n.data('type') === 'massa' && !hasAncestors
}

export {SIM, monthOfStep}

export default {
    initSimulation,
    calculateContribution,
    calculateFlow,
    calculateFlowMonth,
    modifyFlowChange,
    calculateMeanCy,
    calculateMonthlyMeanCy,
    calculateDemand,
    calculateSurface,
    RESERVOIR,
    params,
    buildCalibratedParams,
    isHeadwaterNode,
    accumulateUpstream,
    m3sToHm3,
    hm3ToM3s,
    monthSeconds,
    monthOfStep
}
