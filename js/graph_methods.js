function monthSeconds(year, month /* 1..12 */) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end   = new Date(Date.UTC(year, month, 1));
    return (end - start) / 1000; // segons al mes
}

function m3sToHm3(q_m3s, dt_s){ return ( (q_m3s || 0) * dt_s ) / 1e6; }
function hm3ToM3s(vol_hm3, dt_s){ return dt_s > 0 ? (vol_hm3 * 1e6) / dt_s : 0; }

const RESERVOIR_DEFAULT = {
    inNodes: new Set(['NODE_82', 'NODE_33', 'NODE_34', 'NODE_84']),
    outNode: 'DESEMBASSAT',
    storage: 0,
    capacity_hm3: 400,
    last: {inflowSum_m3s: 0, inflowVol_hm3: 0, releaseDemand_m3s: 0, released_m3s: 0, releasedVol_hm3: 0, dt_s: 0}
};

const getReservoir = function(cy){
    let r = cy.scratch('_reservoir');
    if (!r) {
        cy.scracth('_reservoir', JSON.parse(JSON.stringify(RESERVOIR_DEFAULT)));
        r = cy.scratch('_reservoir');
    }
    return r;
}

const resAddFlow = function(R, q_m3s, dt_s){
    const vol = m3sToHm3(q_m3s, dt_s);
    R.storage_hm3 = Math.min(R.storage_hm3 + vol, R.capacity_hm3)
    R.last.inflowVol_hm3 = += vol;
    R.last.inflowSum_m3s += (q_m3s || 0);
}

const resReleaseForDemand = function(R, demand_m3s, dt_s){
    const maxPossible_m3s = hm3ToM3s(R.storage_hm3, dt_s);
    const released_m3s = Math.min(Math.max(0, demand_m3s || 0), maxPossible_m3s);
    const usedVol_hm3 = m3sToHm3(released_m3s, dt_s);
    R.storage_hm3 -= usedVol_hm3;
    R.last.released_m3s = released_m3s;
    R.last.releasedVol_hm3 += usedVol_hm3;
    R.last.releaseDemand_m3s = (demand_m3s || 0);
    return released_m3s;
}

const getReservoirstatus = function(cy){
    const R = getReservoir(cy);
    return { ...R, last: {...R.last}}
}

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

const setEdgeColor = function(edge){
    return edge.data('flow') < edge.data('flowNeed') ? 'red' : '#0074D9'
}

const setNodeColor = function(node){
    if (node.incomers().length === 0) {
        return '#0074D9'; // Si no té edges entrants, és una font
    }
    return node.data('inflow') + node.data('flowChange') < 0 ? 'red' : '#0074D9'
}

const calculateFlow = function(cy, leafMaps, errorRef = null, opts = {}) {
    const R = getReservoir(cy);

    const dt_s = opts.dt_s ??
        (opts.period ? monthSeconds(opts.period.year, opts.period.month) :
                       monthSeconds(new Date().getUTCFullYear(), new Date().getUTCMonth() + 1 ));
    R.last = {inflowSum_m3s: 0, inflowVol_hm3: 0, releaseDemand_m3s: 0, released_m3s: 0, releasedVol_hm3: 0, dt_s};

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
            const flow = parseFloat(edge.data('flow')) || 0;
            inflow += flow;
        });

        // 2. Aplicar el flowChange local del node
        node.data('inflow', inflow);

        if (R.inNodes && R.inNodes.has(node.id())) {
            const add_hm3 = m3sToHm3(inflow, dt_s);
            const nouVol = Math.min((R.storage_hm3 || 0) + add_hm3, R.capacity_hm3);
            R.last.inflowSum_m3s += inflow;
            R.last.inflowVol_hm3 += nouVol - (R.storage_hm3 || 0);
            R.storage_hm3 = nouVol;

            // no propaguem cabal a través dels arcs virtuals
            node.data('outflow', 0);
            node.data('storage_after_hm3', R.storage_hm3);

            const outgoingEdges = node.outgoers('edge');
            outgoingEdges.forEach(edge => {
                edge.data('flow', 0);
                applyEdgeColorToLeaflet(edge, leafMaps)
            });
            applyNodeColorToLeaflet(node, leafMaps);
            return;
        }

        if (R.outNode && R.outNode === node.id()) {
            const demand_m3s = Math.max(0, parseFloat(node.data('flowChange')) || 0);

            // màxim que podem treure en m3/s amb el volum actual emmagatzemat
            const maxPossible_m3s = hm3ToM3s(R.storage_hm3 || 0, dt_s);
            const release_m3s = Math.min(demand_m3s, maxPossible_m3s);

            // actualitzam l'emmagatzemat
            const used_hm3 = m3sToHm3(release_m3s, dt_s)
            R.storage_hm3 = Math.max(0, (R.storage_hm3 || 0) - used_hm3);

            // registres
            R.last.releaseDemand_m3s = demand_m3s;
            R.last.released_m3s = release_m3s;
            R.last.releasedVol_hm3 += used_hm3;

            // propaga a sortints el cabal realment alliberat
            const outgoingEdges = node.outgoers('edge');
            outgoingEdges.forEach(edge => {
                edge.data('flow', release_m3s);
                applyEdgeColorToLeaflet(edge, leafMaps);
            });

            node.data('outflow', release_m3s);
            node.data('released_m3s', release_m3s);
            node.data('storage_after_hm3', R.storage_hm3);

            applyNodeColorToLeaflet(node, leafMaps);
            return;
        }

        const flowChange = parseFloat(node.data('flowChange')) || 0;
        const rawOutflow = inflow + flowChange;
        let outflow = Math.max(0, rawOutflow);
        node.data('outflow', outflow);

        // 3. Estil visual si cal
        //node.style('background-color', rawOutflow < 0 ? 'red' : '#0074D9');
        applyNodeColorToLeaflet(node, leafMaps)

        outflow = Math.round(outflow * 10) / 10; // Redondejar a 1 decimal

        // 4. Assignar aquest outflow als edges sortints
        const outgoingEdges = node.outgoers('edge');
        outgoingEdges.forEach(edge => {
            edge.data('flow', outflow);
            applyEdgeColorToLeaflet(edge, leafMaps)
        });
    }

    // Iniciar des de fulles (afluents)
    const leaves = cy.nodes().filter(n => n.outgoers('edge').length === 0);
    leaves.forEach(leaf => dfs(leaf));

    if (errorRef) errorRef.value = null;
};

const modifyFlowChange = function(cy, selectedEle, flowModified, errorMsg, leafMaps) {
    if (!selectedEle || !selectedEle.id) return;

    const node = cy.getElementById(selectedEle.id);
    if (!node || !node.isNode()) return;

    // Temporàriament posem el valor
    const previousValue = node.data('flowChange');
    node.data('flowChange', flowModified.value);

    // Torna a calcular
    calculateFlow(cy, leafMaps, errorMsg);

    // Si s’ha generat error, tornem enrere i no modifiquem l’input
    if (errorMsg.value) {
        node.data('flowChange', previousValue); // revertim
        flowModified.value = null
        calculateFlow(cy)
        return;
    }

    // Si tot correcte, actualitzem label
    node.data('label', `${node.id()} (${flowModified.value})`);
    selectedEle.flowChange = flowModified.value;
    selectedEle.flow = node.data('flow');
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

const applyNodeColorToLeaflet = (node, leafMaps) => {
    const layer = leafMaps.nodeLayerById.get(node.id());

    if (!layer) return;

    const color = setNodeColor(node);
    layer.setStyle({ color, fillColor: color }); // mantenim radius/weight actuals
};

const applyEdgeColorToLeaflet = (edge, leafMaps) => {
    const layer = leafMaps?.edgeLayerById?.get(edge.id());
    if (!layer) return;
    const color = setEdgeColor(edge);
    layer.setStyle({ color }); // mantenim weight/opacity actuals
};




export default {
    setupEleClickListener,
    calculateFlow,
    modifyFlowChange,
    setupZoomLabelControl,
    getReservoirstatus,
}
