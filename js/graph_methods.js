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

const countPredecessors = function(cy) {
    cy.nodes().forEach(node => {
        let predecessors = node.predecessors('node')
        let count = predecessors.length
        node.data('predecessorsCount', count)
        node.data('label', count)
    })
}

const calculateFlow = function(cy, errorRef = null) {
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
        if (!node.hasClass('selected')) {
            node.style('background-color', setNodeColor(node));
        }

        outflow = Math.round(outflow * 10) / 10; // Redondejar a 1 decimal

        // 4. Assignar aquest outflow als edges sortints
        const outgoingEdges = node.outgoers('edge');
        outgoingEdges.forEach(edge => {
            edge.data('flow', outflow);
            if (!edge.hasClass('selected')) {
                edge.style('line-color', setEdgeColor(edge))
            }
        });

        // DEBUG opcional
        if (node.id() === '3' || node.id() === '4') {
            console.log(`Node ${node.id()} inflow: ${inflow}, flowChange: ${flowChange}, outflow: ${outflow}`);
        }
    }

    // Iniciar des de fulles (afluents)
    const leaves = cy.nodes().filter(n => n.outgoers('edge').length === 0);
    leaves.forEach(leaf => dfs(leaf));

    if (errorRef) errorRef.value = null;
};

const modifyFlowChange = function(cy, selectedEle, flowModified, errorMsg) {
    if (!selectedEle || !selectedEle.id) return;

    const node = cy.getElementById(selectedEle.id);
    if (!node || !node.isNode()) return;

    // Temporàriament posem el valor
    const previousValue = node.data('flowChange');
    node.data('flowChange', flowModified.value);

    // Torna a calcular
    calculateFlow(cy, errorMsg);

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
        // console.log('[ZoomLabel] Zoom actual de Leaflet:', currentZoom);

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

const rectsOverlap = function(a, b) {
    return !(a.x2 < b.x1 || a.x1 > b.x2 || a.y2 < b.y1 || a.y1 > b.y2)
}

const labelRectFor = function(node, offX, offY) {
    const pos = node.renderedPosition();               // posicio node a pantalla
    const fs  = parseFloat(node.pstyle("font-size").pfValue); // mida lletra
    const text = node.data("label") || "";
    const approxW = text.length * (fs * 0.6); // aproximació ample
    const approxH = fs * 1.2;                 // aproximació alt

    const x1 = pos.x + offX;
    const y1 = pos.y + offY - approxH; // “top-right” per defecte
    return { x1, y1, x2: x1 + approxW, y2: y1 + approxH };
}

const placeLabels = function(cy) {
    const placed = []; // rectangles ocupats
    const candidates = [
        {halign: "right",  valign: "top",    dx:  6, dy: -6},
        {halign: "left",   valign: "top",    dx: -6, dy: -6},
        {halign: "right",  valign: "bottom", dx:  6, dy:  6},
        {halign: "left",   valign: "bottom", dx: -6, dy:  6},
    ];

    cy.batch(() => {
        cy.nodes().forEach(n => {
            let chosen = candidates[0];
            for (const c of candidates) {
                const r = labelRectFor(n, c.dx, c.dy);
                const overlap = placed.some(p => rectsOverlap(r, p));
                if (!overlap) { chosen = c; placed.push(r); break; }
            }
            n.style({
                "text-halign": chosen.halign,
                "text-valign": chosen.valign,
                "text-margin-x": chosen.dx,
                "text-margin-y": chosen.dy
            });
        });
    });
}




export default {
    setupEleClickListener,
    calculateFlow,
    modifyFlowChange,
    countPredecessors,
    setupZoomLabelControl,
    placeLabels
}
