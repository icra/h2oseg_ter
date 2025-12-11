const inNodes = ['NODE_82', 'NODE_33', 'NODE_34', 'NODE_84']

const createMonths = function(preffix){
    return Array(12).fill().map((e, i) => String(preffix + (1 + i)))
}

const flowChangeKeys = createMonths('m')
const inflowKeys = createMonths('inflow')
const outflowKeys = createMonths('outflow')
const flowKeys = createMonths('flow')
const rKeys = createMonths('')

const lightHours = [9.3, 10.4, 11.7, 13.2, 14.4, 15, 14.8, 13.7, 12.3, 10.8, 9.6, 9]
const monthDays = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
// Kc per mes (gen ... des)

// Aigua superficial
const Kc_aigua = [
    0.90, 0.95, 1.00, 1.05, 1.15, 1.20,
    1.20, 1.15, 1.10, 1.00, 0.95, 0.90
];

// Conreu de regadiu
const Kc_regadiu = [
    0.50, 0.60, 0.85, 1.05, 1.15, 1.20,
    1.20, 1.15, 0.95, 0.80, 0.60, 0.50
];

// Conreu de secà
const Kc_seca = [
    0.35, 0.45, 0.75, 0.95, 1.00, 0.80,
    0.25, 0.25, 0.45, 0.65, 0.55, 0.35
].map(e => e * 0.7);

// Forestal
const Kc_forestal = [
    0.60, 0.70, 0.90, 1.05, 1.15, 1.20,
    1.15, 1.10, 1.00, 0.90, 0.80, 0.60
].map(e => e * 0.6);

// Prats / pastures
const Kc_prats = [
    0.50, 0.55, 0.75, 0.90, 1.00, 1.05,
    1.05, 0.95, 0.85, 0.75, 0.60, 0.50
];

// Urbà
const Kc_urba = [
    0.15, 0.15, 0.20, 0.25, 0.35, 0.40,
    0.40, 0.35, 0.30, 0.25, 0.20, 0.15
];

const r_neu = [0.18,0.20,0.23,0.28,0.35,0.40,0.40,0.35,0.30,0.22,0.20,0.18]
    .map(e => e * 0.2)

const params = {
    kc: {
        aigua: Kc_aigua,
        urba: Kc_urba,
        forestal: Kc_forestal,
        seca: Kc_seca,
        regadiu: Kc_regadiu,
        prats: Kc_prats
    },
    rNeu: r_neu
}

const rampPalette = ['#0074D9', '#2583B8', '#4B9397', '#71A476', '#97B355', '#BDC334', '#E3D414', '#E7B010', '#EC8D0D', '#F16A0A', '#F54606', '#FA2303', '#FF0000']

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
    inflowSum_m3s: {},
    inflowVol_hm3: {},
    releaseDemand_m3s: {},
    released_m3s: {},
    releasedVol_hm3: {},
    initial_storage_hm3: 0
    // last: {inflowSum_m3s: {}, inflowVol_hm3: {}, releaseDemand_m3s: {}, released_m3s: {}, releasedVol_hm3: {}, dt_s: {}}
};

const setupEleClickListener = function(cy, selectedEleRef) {
    cy.on('tap', evt => {
        const ele = evt.target;

        // Si no és ni node ni edge, és fons o un element sense interès
        if (!ele.isNode?.() && !ele.isEdge?.()) {
            selectedEleRef.value = null;
            cy.elements().removeClass('selected');
            cy.nodes().forEach(node => {
                node.style('background-color', setNodeColor(node));
            })
            cy.edges().forEach(edge => {
                edge.style('line-color', setEdgeColor(edge));
            });
            return;
        }

        console.log("selectedEle", ele.data())

        // Si és node o edge
        cy.elements().removeClass('selected');
        cy.nodes().forEach(node => {
            node.style('background-color', setNodeColor(node));
        })
        cy.edges().forEach(edge => {
            edge.style('line-color', setEdgeColor(edge));
        });
        ele.addClass('selected');
        selectedEleRef.value = ele.data();
        selectedEleRef.value.eleType = ele.isNode() ? 'punt' : 'tram';
    });
}

const setGraphColors = function(month, cy, leafMaps){
    cy.nodes().forEach(node => {
        if (month === '0'){
            const nodeFaults = rKeys.map(m => setNodeColor(node, m)).filter(e => e === rampPalette[12]).length
            applyNodeColorToLeaflet(node, '0', leafMaps, rampPalette[nodeFaults])
        } else {
            applyNodeColorToLeaflet(node, month, leafMaps)
        }
    });

    cy.edges().forEach(edge => {
        if (month === '0'){
            const edgeFaults = rKeys.map(m => setEdgeColor(edge, m)).filter(e => e === rampPalette[12]).length
            applyEdgeColorToLeaflet(edge, '0', leafMaps, rampPalette[edgeFaults])
        } else {
            applyEdgeColorToLeaflet(edge, month, leafMaps)
        }
    });
}

const applyNodeColorToLeaflet = (node, month, leafMaps, customColor = null) => {
    const layer = leafMaps.nodeLayerById.get(node.id());

    if (!layer) {
        console.error("No s'ha trobat la capa on aplicar color als nodes")
        return;
    }


    const color = customColor || setNodeColor(node, month);
    layer.setStyle({ color, fillColor: color }); // mantenim radius/weight actuals
};

const applyEdgeColorToLeaflet = (edge, month, leafMaps, customColor = null) => {
    const layer = leafMaps?.edgeLayerById?.get(edge.id());
    if (!layer) {
        if (!(/^v_\d+/.test(edge.id()))) console.error("No s'ha trobat la capa on aplicar color als trams")
        return;
    }
    const color = customColor || setEdgeColor(edge, month);
    layer.setStyle({ color }); // mantenim weight/opacity actuals
};

const setEdgeColor = function(edge, month){
    return (edge.data('flow' + month) + 0.01) < edge.data('envFlow' + month) ? rampPalette[12] : rampPalette[0]
}

const setNodeColor = function(node, month){
    if (node.incomers().length === 0) {
        return rampPalette[0]; // Si no té edges entrants, és una font
    }
    return (node.data('inflow' + month) + 0.01) + node.data('m' + month) < 0 ? rampPalette[12] : rampPalette[0]
}

// utilitat: construir un Set amb tots els ancestres (predecessors) d’un node donat
const ancestorsOf = function(cy, nodeId){
    const anc = new Set();
    const start = cy.getElementById(nodeId);
    start.predecessors('node').forEach(n => anc.add(n.id()));
    anc.add(nodeId); // incloure també el node mateix per comoditat
    return anc;
}



const calculateNodeContribution = function(node, params){
    const tmit = Object.keys(node.data())
        .filter(k => k.startsWith('tmit'))

    tmit.forEach(m => {
        node.data(m, Math.max(node.data(m), 0))
    })

    const I = tmit.reduce((sum, tmit) => sum + Math.pow(Math.max(node.data(tmit), 0) / 5, 1.514), 0)
    const a = 6.75e-7 * Math.pow(I, 3) - 771e-7 * Math.pow(I, 2) + 1792e-5 * I + 0.49239;
    const ETPsc = tmit.map(tmit => 16 * Math.pow((10 * node.data(tmit))/I, a))
    const ETP = ETPsc.map((e, i) => e * (lightHours[i] / 12) * (monthDays[i] / 30))

    const aigua = params.kc.aigua.map(kc => kc * node.data('us_aigua'))
    const regadiu = params.kc.regadiu.map(kc => kc * node.data('us_conreu_regadiu'))
    const seca = params.kc.seca.map(kc => kc * node.data('us_conreu_seca'))
    const forestal = params.kc.forestal.map(kc => kc * node.data('us_forestal'))
    const prats = params.kc.prats.map(kc => kc * node.data('us_prats'))
    const urba = params.kc.urba.map(kc => kc * node.data('us_urba'))

    const kc = aigua.map((_, i) => aigua[i] + regadiu[i] + seca[i] + forestal[i] + prats[i] + urba[i])
    const ET = ETP.map((e, i) => e * kc[i])

    const ppt = Object.keys(node.data())
        .filter(k => k.startsWith('ppt'))
        .map(p => node.data(p))

    const neu = Object.keys(node.data())
        .filter(k => k.startsWith('neu'))
        .map(n => node.data(n))

    const deltaNeu = neu.map((n, i) => {
        const lag = i === 0 ? 11 : i - 1
        return n - neu[lag]
    })

    const mmNeu = deltaNeu.map((n, i) => n * params.rNeu[i])

    const monthContrib = ppt.map((p, i) => node.data('area_m2') * (p - ET[i] - mmNeu[i]))
        .map(c => Math.max(c, 0))

    const seconds = Array(12).fill().map((e, i) => i + 1)
        .map(m => monthSeconds(2024, m))

    flowChangeKeys.forEach((k, i) => {
        node.data(k, monthContrib[i] * 0.001 / seconds[i])
    })
}

const calculateContribution = function(cy, params = params){
    cy.nodes().forEach(node => {
        if (node.data('type') === 'massa' || node.data('type') === 'comporta' || node.data('type') === 'aforament') {
            calculateNodeContribution(node, params)
        }
    })
}

const calculateFlow = function(cy, errorRef = null, opts = {}){
    const months = Array(12).fill().map((e, i) => String(i + 1));
    for (const m of months){
        calculateFlowMonth(cy, errorRef, {period: {year: 2024, month: m}});
    }
    // Calculem mitjanes anuals per tots els elements
    calculateAnnualValues(cy)
}

const calculateAnnualValues = function(cy){
    cy.nodes().forEach(node => {
        const data = node.data();

        const changesMean = flowChangeKeys.map(k => data[k])
            .reduce((a, b) => a + b, 0) / flowChangeKeys.length;
        node.data('m0', changesMean);

        const inflowMean = inflowKeys.map(k => data[k])
            .reduce((a, b) => a + b, 0) / inflowKeys.length;
        node.data('inflow0', inflowMean);

        const outflowMean = outflowKeys.map(k => data[k])
            .reduce((a, b) => a + b, 0) / inflowKeys.length;
        node.data('outflow0', outflowMean);
    })

    cy.edges().forEach(edge => {
        const data = edge.data();

        const flowMean = flowKeys.map(k => data[k])
            .reduce((a, b) => a + b, 0) / flowKeys.length;
        edge.data('flow0', flowMean);
    })


    RESERVOIR.storage_hm3['0'] = rKeys.map(k => RESERVOIR.storage_hm3[k])
        .reduce((a, b) => a + b, 0) / rKeys.length;
    RESERVOIR.inflowSum_m3s['0'] = rKeys.map(k => RESERVOIR.inflowSum_m3s[k])
        .reduce((a, b) => a + b, 0) / rKeys.length;
    RESERVOIR.released_m3s['0'] = rKeys.map(k => RESERVOIR.released_m3s[k])
        .reduce((a, b) => a + b, 0) / rKeys.length;

    console.log('RESERVOIR complete', RESERVOIR)
}

const calculateFlowMonth = function(cy, errorRef = null, opts = {}) {
    let R = RESERVOIR;

    const month = opts.period.month
    const m = Number(month)

    const dt_s = opts.period ? monthSeconds(opts.period.year, opts.period.month) : monthSeconds(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1);

    if (!opts.resetStorage) {
        R.storage_hm3[m] = m !== 1 ? R.storage_hm3[m - 1] : R.initial_storage_hm3;
    }
    R.inflowSum_m3s[m] = 0
    R.inflowVol_hm3[m] = 0
    R.releaseDemand_m3s[m] = 0
    R.released_m3s[m] = 0
    R.releasedVol_hm3[m] = 0

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
            const flow = parseFloat(edge.data('flow' + month)) || 0;
            inflow += flow;
        });

        // 2. Aplicar el flowChange local del node
        node.data('inflow' + month, inflow);
        const flowChange = parseFloat(node.data('m' + month)) || 0;
        const rawOutflow = inflow + flowChange;
        const positiveOut = Math.max(0, rawOutflow);
        let outflow = Math.max(0, rawOutflow);
        node.data('outflow' + month, outflow);
        node.data('deficit' + month, rawOutflow);

        if (R.inNodes && R.inNodes.has(node.id())) {
            const add_hm3 = m3sToHm3(positiveOut, dt_s);
            const nouVol = Math.min(R.storage_hm3[m] + add_hm3, R.capacity_hm3);
            R.inflowSum_m3s[m] += positiveOut;
            R.inflowVol_hm3[m] += m3sToHm3(R.inflowSum_m3s[m], dt_s)
            // if (month === '5') console.log("inflowVol", m, R.inflowVol_hm3[m]);
            R.storage_hm3[m] = nouVol;

            // no propaguem cabal a través dels arcs virtuals
            node.data('outflow' + month, 0);
            node.data('storage_after_hm3' + month, R.storage_hm3[m]);

            const outgoingEdges = node.outgoers('edge');
            outgoingEdges.forEach(edge => {
                edge.data('flow' + month, 0);
            });
            return;
        }

        if (R.outNode && R.outNode === node.id()) {

            node.data('outflow' + month, 0);

            // posa 0 als sortints de l'embassament perquè els successors es calculin sense aportació de l'embassament
            node.outgoers('edge').forEach(edge => edge.data('flow' + month, 0));

            node.data('storage_after_hm3' + month, R.storage_hm3[m]);

            return;
        }

        // 3. Assignar aquest outflow als edges sortints
        const outgoingEdges = node.outgoers('edge');
        outgoingEdges.forEach(edge => {
            edge.data('flow' + month, outflow);
        });
    }

    // Iniciar des de fulles (afluents)
    const leaves = cy.nodes().filter(n => n.outgoers('edge').length === 0);
    leaves.forEach(leaf => dfs(leaf));

    // Segona passada per calcular demanda de l'embassament i alliberar l'aigua

    const dam = cy.getElementById(R.outNode);
    const succNodes = dam.successors('node');
    let demanda = 0;

    succNodes.forEach(n => {
        // la demanda és el cabal que necessita menys el que li entra.
        if (n.data('m' + month) < 0) {
            const demandaNode = (n.data('m' + month)*(-1) - n.data('inflow' + month))
            demanda += Math.max(demandaNode, 0)
            // if (month === '1') console.log(n.id(), demandaNode, demanda)
        }
    });

    // Augmentem demanda un factor de seguretat
    demanda = demanda * 1.01

    const R_backup = structuredClone(R)

    // recalculem cabals sota presa
    calculateFlowDownstreamDam(cy, demanda, dam, month, dt_s)

    // Calcular demanda ambiental, és el màxim de envFlow<m> - flow
    let maxDemandaAmbiental = 0
    dam.successors('edge').forEach(edge => {
        const demandaAmbiental = edge.data('envFlow' + month) - edge.data('flow' + month)
        maxDemandaAmbiental = Math.max(maxDemandaAmbiental, demandaAmbiental)
        // if (month === '1') console.log('demanda ambiental', edge.id(), demandaAmbiental, maxDemandaAmbiental)
    })

    Object.assign(RESERVOIR, structuredClone(R_backup));

    calculateFlowDownstreamDam(cy, demanda + maxDemandaAmbiental, dam, month, dt_s)

    if (errorRef) errorRef.value = null;
};

const calculateFlowDownstreamDam = function(cy, demanda, dam, month, dt_s){
    let R = RESERVOIR
    const m = Number(month)

    // si l'embassament és ple, allibera com a mínim el cabal d'entrada
    if (R.storage_hm3[m] >= R.capacity_hm3 - 1e-6) {
        console.log("Embassament ple al mes", month)
        demanda = Math.max(demanda, R.inflowSum_m3s[m])
    }
    const maxPossible_m3s = hm3ToM3s(R.storage_hm3[m], dt_s);
    const release_m3s = Math.min(demanda, maxPossible_m3s);
    const used_hm3 = m3sToHm3(release_m3s, dt_s);
    R.storage_hm3[m] = Math.max(0, R.storage_hm3[m] - used_hm3);
    R.releaseDemand_m3s[m] = demanda;
    R.released_m3s[m] = release_m3s;
    R.releasedVol_hm3[m] = used_hm3;

    // console.log(m, "entrada", R.inflowVol_hm3[m], "maxim", maxPossible_m3s, "release", release_m3s, "demanda", demanda, "storage", R.storage_hm3[m]);

    dam.data('outflow' + month, release_m3s);
    dam.outgoers('edge').forEach(e => e.data('flow' + month, release_m3s));

    // Recalcular tot aigües avall amb el release ja aplicat
    const bfs = cy.elements().bfs({ roots: dam, directed: true });
    bfs.path.nodes().not(dam).forEach(n => {
        // 1) inflow = suma de tots els 'flow<m>' dels edges entrants
        let inflow2 = 0;
        n.incomers('edge').forEach(ed => { inflow2 += (+ed.data('flow' + month) || 0); });

        // 2) aplicar m<month> local i clamp a ≥ 0
        const mChange2 = +n.data('m' + month) || 0;
        const raw2 = inflow2 + mChange2;
        const out2 = Math.max(0, raw2);

        // 3) escriure dades del node
        n.data('inflow'  + month, inflow2);
        n.data('outflow' + month, out2);

        // 4) propagar cap avall
        n.outgoers('edge').forEach(ed => ed.data('flow' + month, out2));
    });
}

const modifyFlowChange = function(cy, selectedEle, flowModified, month, errorMsg, period) {
    if (!selectedEle || !selectedEle.id) return;

    const node = cy.getElementById(selectedEle.id);
    if (!node || !node.isNode()) return;

    // Temporàriament posem el valor
    const previousValue = node.data('m' + month);
    node.data('m' + month, flowModified.value);

    // Torna a calcular
    calculateFlowMonth(cy, errorMsg, period);

    // Si s’ha generat error, tornem enrere i no modifiquem l’input
    if (errorMsg.value) {
        node.data('m' + month, previousValue); // revertim
        flowModified.value = null
        calculateFlowMonth(cy, errorMsg, period)
        return;
    }

    // Si tot correcte, actualitzem label
    node.data('label', `${node.id()} (${flowModified.value})`);
    selectedEle['m' + month] = flowModified.value;
    selectedEle['flow' + month] = node.data('flow' + month);

    calculateAnnualValues(cy);

    selectedEle['m0'] = node.data('m0')
    selectedEle['flow0'] = node.data('flow0');
}

const setupZoomLabelControl = function(cy, leafletInstance, zoomThreshold = 10) {
    if (!leafletInstance || !leafletInstance.map) {
        console.warn('[ZoomLabel] Leaflet map no disponible');
        return;
    }

    // Listener de zoom del mapa
    leafletInstance.map.on('zoomend', () => {
        const currentZoom = leafletInstance.map.getZoom();

        if (currentZoom >= zoomThreshold) {
            cy.nodes().addClass('show-label');
            cy.edges().addClass('show-label');
        } else {
            cy.nodes().removeClass('show-label');
            cy.edges().removeClass('show-label');
        }
    });

    // Establir estat inicial
    const initialZoom = leafletInstance.map.getZoom();
    if (initialZoom >= zoomThreshold) {
        cy.nodes().addClass('show-label');
    }
}

const calculateMeanPpt = function(cy){
    let meanPpt = []
    let sumArea = 0
    cy.nodes().forEach(node => {
        if (node.data('ppt1') === undefined) return
        const ppt = Object.keys(node.data())
            .filter(k => k.startsWith('ppt'))
            .map(p => node.data(p))

        meanPpt.push(ppt.reduce((a, b) => a + b, 0) * node.data('area_m2'))
        sumArea += node.data('area_m2')
    })
    const sumPpt = meanPpt.reduce((a, b) => a + b, 0)
    return sumPpt / sumArea
}

export default {
    setupEleClickListener,
    calculateContribution,
    calculateFlow,
    modifyFlowChange,
    setupZoomLabelControl,
    setGraphColors,
    calculateMeanPpt,
    RESERVOIR,
    params,
    rampPalette
}
