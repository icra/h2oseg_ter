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
    capacity_hm3: 400,
    inflowSum_m3s: {},
    inflowVol_hm3: {},
    releaseDemand_m3s: {},
    released_m3s: {},
    releasedVol_hm3: {}
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
        R.storage_hm3[m] = R.storage_hm3[m - 1] || 0;
    }
    R.inflowSum_m3s[m] = 0
    R.inflowVol_hm3[m] = 0
    R.releaseDemand_m3s[m] = 0
    R.released_m3s[m] = 0
    R.releasedVol_hm3[m] = 0

    let visited = new Set();

    function dfs(node) {
        if (visited.has(node.id())) return;
        visited.add(node.id());

        // Primer processar els nodes aigües amunt (fonts)
        const upstreamNodes = node.predecessors('node');
        upstreamNodes.forEach(pre => dfs(pre));

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

        if (R.inNodes && R.inNodes.has(node.id())) {
            const add_hm3 = m3sToHm3(positiveOut, dt_s);
            const nouVol = Math.min(R.storage_hm3[m] + add_hm3, R.capacity_hm3);
            R.inflowSum_m3s[m] += positiveOut;
            R.inflowVol_hm3[m] += nouVol - R.storage_hm3[m];
            R.storage_hm3[m] = nouVol;

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
            // Això és el que cal canviar per ajusatar-ho a la demanda real, ara agafa les dades del node però cal sumar totes les demandes aigües avall i restar-hi les contribucions.
            // Cal assegurar que els cabals dels afluents ja estiguin calculats en aquest moment
            const demand_m3s = Math.max(0, parseFloat(node.data('m' + month)) || 0);

            // màxim que podem treure en m3/s amb el volum actual emmagatzemat
            const maxPossible_m3s = hm3ToM3s(R.storage_hm3[m] || 0, dt_s);
            const release_m3s = Math.min(demand_m3s, maxPossible_m3s);

            // actualitzam l'emmagatzemat
            const used_hm3 = m3sToHm3(release_m3s, dt_s)
            R.storage_hm3[m] = Math.max(0, R.storage_hm3[m] - used_hm3);

            // registres
            R.releaseDemand_m3s[m] = demand_m3s;
            R.released_m3s[m] = release_m3s;
            R.releasedVol_hm3[m] += used_hm3;

            // propaga a sortints el cabal realment alliberat
            const outgoingEdges = node.outgoers('edge');
            outgoingEdges.forEach(edge => {
                edge.data('flow' + month, release_m3s);
            });

            node.data('outflow' + month, release_m3s);
            node.data('storage_after_hm3' + month, R.storage_hm3[m]);

            return;
        }

        let outflow = Math.max(0, rawOutflow);
        node.data('outflow' + month, outflow);

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
