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

const calculateFlow = function(cy, leafMaps, errorRef = null) {
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
    flowModified.value = null;
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
    setupZoomLabelControl
}
