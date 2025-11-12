const inNodes = ['NODE_82', 'NODE_33', 'NODE_34', 'NODE_84']
const flowChangeKeys = Array(12).fill().map((e, i) => 'm' + (1 + i))
const inflowKeys = Array(12).fill().map((e, i) => 'inflow' + (1 + i))
const outflowKeys = Array(12).fill().map((e, i) => 'outflow' + (1 + i))
const flowKeys = Array(12).fill().map((e, i) => 'flow' + (1 + i))
const rKeys = Array(12).fill().map((e, i) => String(i + 1))
console.log(rKeys)

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
    capacity_hm3: 4000,
    inflowSum_m3s: {},
    inflowVol_hm3: {},
    releaseDemand_m3s: {},
    released_m3s: {},
    releasedVol_hm3: {},
    initial_storage_hm3: 200
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
    return edge.data('flow' + month) < edge.data('flowNeed') ? rampPalette[12] : rampPalette[0]
}

const setNodeColor = function(node, month){
    if (node.incomers().length === 0) {
        return rampPalette[0]; // Si no té edges entrants, és una font
    }
    return node.data('inflow' + month) + node.data('m' + month) < 0 ? rampPalette[12] : rampPalette[0]
}

// utilitat: construir un Set amb tots els ancestres (predecessors) d’un node donat
const ancestorsOf = function(cy, nodeId){
    const anc = new Set();
    const start = cy.getElementById(nodeId);
    start.predecessors('node').forEach(n => anc.add(n.id()));
    anc.add(nodeId); // incloure també el node mateix per comoditat
    return anc;
}

const calculateFlow = function(cy, leafMaps, errorRef = null, opts = {}){
    const months = Array(12).fill().map((e, i) => String(i + 1));
    for (const m of months){
        calculateFlowMonth(cy, errorRef, {period: {year: 2024, month: m}});
        console.log("embassament a", m, RESERVOIR.storage_hm3[m])
    }
    // Calculem mitjanes anuals per tots els elements
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
}

const calculateFlowMonth = function(cy, errorRef = null, opts = {}) {
    let R = RESERVOIR;

    const month = opts.period.month
    const m = Number(month)

    const dt_s = opts.dt_s ??
        (opts.period ? monthSeconds(opts.period.year, opts.period.month) :
                       monthSeconds(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1 ));

    if (!opts.resetStorage) {
        R.storage_hm3[m] = m !== 1 ? R.storage_hm3[m - 1] : R.initial_storage_hm3;
    }
    R.inflowSum_m3s[m] = 0
    R.inflowVol_hm3[m] = 0
    R.releaseDemand_m3s[m] = 0
    R.released_m3s[m] = 0
    R.releasedVol_hm3[m] = 0

    console.log("volum al principi", month, R.storage_hm3[m], "mes anterior", R.storage_hm3[m -1])

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
            R.inflowVol_hm3[m] += m3sToHm3(R.inflowSum_m3s[m])
            R.storage_hm3[m] = nouVol;
            console.log("després de inNodes, afegit", add_hm3, "nou volum", nouVol)

            // no propaguem cabal a través dels arcs virtuals
            node.data('outflow' + month, 0);
            node.data('storage_after_hm3' + month, R.storage_hm3[m]);

            const outgoingEdges = node.outgoers('edge');
            outgoingEdges.forEach(edge => {
                edge.data('flow' + month, 0);
                // applyEdgeColorToLeaflet(edge, leafMaps)
            });
            // applyNodeColorToLeaflet(node, leafMaps);
            return;
        }

        if (R.outNode && R.outNode === node.id()) {

            node.data('outflow' + month, 0);

            // posa 0 als sortints de l'embassament perquè els successors es calculin sense aportació de l'embassament
            node.outgoers('edge').forEach(edge => edge.data('flow' + month, 0));

            node.data('storage_after_hm3' + month, R.storage_hm3[m]);

            return;
        }



        // 3. Estil visual si cal
        //node.style('background-color', rawOutflow < 0 ? rampPalette[12] : rampPalette[0]);
        // applyNodeColorToLeaflet(node, leafMaps)

        outflow = Math.round(outflow * 10) / 10; // Redondejar a 1 decimal

        // 4. Assignar aquest outflow als edges sortints
        const outgoingEdges = node.outgoers('edge');
        outgoingEdges.forEach(edge => {
            edge.data('flow' + month, outflow);
            // applyEdgeColorToLeaflet(edge, leafMaps)
        });
    }

    // Iniciar des de fulles (afluents)
    const leaves = cy.nodes().filter(n => n.outgoers('edge').length === 0);
    leaves.forEach(leaf => dfs(leaf));

    // Segona passada per calcular demanda de l'embassament i alliberar l'aigua

    const dam = cy.getElementById(R.outNode);

    const succNodes = dam.successors('node');
    const succSet = new Set();
    succNodes.forEach(node => succSet.add(node.id()));

    let demanda = 0;
    succNodes.forEach(n => {
        // la demanda és el cabal que necessita menys el que li entra.
        if (n.data('m' + month) < 0) {
            const demandaNode = (n.data('inflow' + month) + n.data('m' + month)) * -1
            demanda += Math.max(demandaNode, 0)
        }
        n.incomers('edge').forEach(e => {
            // si el tram del Ter no té el cabal ambiental, l'afegim a la demanda
           if (succSet.has(e.source().id())){
               const deficitCabal = e.data('flowNeed') - e.data('flow' + month);
               demanda += Math.max(deficitCabal, 0)
           }
        });
    })
    console.log(m, "demanda", demanda, 'inflow', R.inflowSum_m3s[m] )
    if (m !== 1)
    // si l'embassament és ple, allibera com a mínim el cabal d'entrada
    if (R.storage_hm3[m] >= R.capacity_hm3 - 1e-6) {
        console.log("is full", R.storage_hm3[m], R.capacity_hm3);
        demanda = Math.max(demanda, R.inflowSum_m3s[m])
    }
    const maxPossible_m3s = hm3ToM3s(R.storage_hm3[m], dt_s);
    const release_m3s = Math.min(demanda, maxPossible_m3s);
    const used_hm3 = m3sToHm3(release_m3s, dt_s);
    R.storage_hm3[m] = Math.max(0, R.storage_hm3[m] - used_hm3);
    R.releaseDemand_m3s[m] = demanda;
    R.released_m3s[m] = release_m3s;
    R.releasedVol_hm3[m] = used_hm3;

    console.log(m, "maxim", maxPossible_m3s, "release", release_m3s, "demanda", demanda, "storage", R.storage_hm3[m]);

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
        const outRounded = Math.round(out2 * 10) / 10;
        n.outgoers('edge').forEach(ed => ed.data('flow' + month, outRounded));
    });




    if (errorRef) errorRef.value = null;
};

const modifyFlowChange = function(cy, selectedEle, flowModified, month, errorMsg, leafMaps, period) {
    if (!selectedEle || !selectedEle.id) return;

    const node = cy.getElementById(selectedEle.id);
    if (!node || !node.isNode()) return;

    // Temporàriament posem el valor
    const previousValue = node.data('m' + month);
    node.data('m' + month, flowModified.value);

    // Torna a calcular
    calculateFlow(cy, leafMaps, errorMsg, period);

    // Si s’ha generat error, tornem enrere i no modifiquem l’input
    if (errorMsg.value) {
        node.data('m' + month, previousValue); // revertim
        flowModified.value = null
        calculateFlow(cy)
        return;
    }

    // Si tot correcte, actualitzem label
    node.data('label', `${node.id()} (${flowModified.value})`);
    selectedEle['m' + month] = flowModified.value;
    selectedEle['flow' + month] = node.data('flow' + month);
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






export default {
    setupEleClickListener,
    calculateFlow,
    modifyFlowChange,
    setupZoomLabelControl,
    setGraphColors,
    RESERVOIR
}
