import {SIM, monthOfStep} from './graph_methods.js'

const rampPalette = ['#0074D9', '#2583B8', '#4B9397', '#71A476', '#97B355', '#BDC334', '#E3D414', '#E7B010', '#EC8D0D', '#F16A0A', '#F54606', '#FA2303', '#FF0000']

const setupEleClickListener = function(cy, selectedEleRef, k) {
    cy.on('tap', evt => {
        const ele = evt.target;

        // Si no és ni node ni edge, és fons o un element sense interès
        if (!ele.isNode?.() && !ele.isEdge?.()) {
            selectedEleRef.value = null;
            cy.elements().removeClass('selected');
            return;
        }

        console.log("selectedEle", ele.data())

        // Si és node o edge
        cy.elements().removeClass('selected');
        ele.addClass('selected');
        selectedEleRef.value = ele.data();
        selectedEleRef.value.eleType = ele.isNode() ? 'punt' : 'tram';
    });
}

const getNodeDisplayColor = function(node, selK) {
    if (Number(selK) === 0) {
        const nodeFaults = SIM.r
            .map(k => setNodeColor(node, k))
            .filter(c => c === rampPalette[12])
            .length

        const idx = Math.round(12 * nodeFaults / SIM.r.length)
        return rampPalette[idx]
    }

    return setNodeColor(node, selK)
}

const setGraphColors = function(selK, cy, leafMaps){
    cy.nodes().forEach(node => {
        const color = getNodeDisplayColor(node, selK)
        applyNodeColorToLeaflet(node, selK, leafMaps, color)

    });

    cy.edges().forEach(edge => {
        if (selK === 0){
            const edgeFaults = SIM.r.map(m => setEdgeColor(edge, m)).filter(e => e === rampPalette[12]).length
            const idx = Math.round(12 * edgeFaults / SIM.r.length)
            applyEdgeColorToLeaflet(edge, '0', leafMaps, rampPalette[idx])
        } else {
            applyEdgeColorToLeaflet(edge, selK, leafMaps)
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
    const selected = leafMaps.currentSel?.id === node.id() && leafMaps.currentSel?.kind === 'node';
    layer.setIcon(nodeIcon(leafMaps.L, node.data('type'), color, selected)); // mantenim radius/weight actuals
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

const setEdgeColor = function(edge, k){
    const month = monthOfStep(k)
    return (edge.data('flow' + k) + 0.01) < edge.data('envFlow' + month) ? rampPalette[12] : rampPalette[0]
}

const setNodeColor = function(node, k){
    const month = monthOfStep(k)
    if (node.incomers().length === 0) {
        return rampPalette[0]; // Si no té edges entrants, és una font
    }
    return (node.data('inflow' + k) + 0.01) + node.data('m' + month) < 0 ? rampPalette[12] : rampPalette[0]
}

const nodeTypeSymbols = [
    {
        label: 'Àrea de drenatge',
        shape: 'circle',
        types: ['massa']
    },
    {
        label: 'Captació',
        shape: 'triangle',
        types: ['ETAP', 'ATL', 'Comunitat de regants', 'Cabal ambiental']
    },
    {
        label: 'Retorn',
        shape: 'square',
        types: ['EDAR', 'comporta', 'entrada']
    },
    {
        label: "Estació d'aforament",
        shape: 'diamond',
        types: ['aforament']
    }
]

const nodeShapeByType = function(type) {
    return nodeTypeSymbols.find(group => group.types.includes(type))?.shape ?? 'circle'
}

const nodeSymbolSVG = function(shape, color = '#999', selected = false, withStroke = true) {
    const size = selected ? 16 : 12
    const stroke = withStroke ? (selected ? 3 : 2) : 0
    const half = size / 2
    const strokeAttr = withStroke ? `stroke="#222" stroke-width="${stroke}"` : `stroke="none"`

    if (shape === 'circle') {
        return `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <circle
                    cx="${half}"
                    cy="${half}"
                    r="${half - stroke / 2}"
                    fill="${color}"
                    ${strokeAttr}
                />
            </svg>
        `
    }

    if (shape === 'square') {
        return `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <rect
                    x="${stroke / 2}"
                    y="${stroke / 2}"
                    width="${size - stroke}"
                    height="${size - stroke}"
                    fill="${color}"
                    ${strokeAttr}
                />
            </svg>
        `
    }

    if (shape === 'triangle') {
        return `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <polygon
                    points="${half},${stroke / 2} ${size - stroke / 2},${size - stroke / 2} ${stroke / 2},${size - stroke / 2}"
                    fill="${color}"
                    ${strokeAttr}
                    stroke-linejoin="round"
                />
            </svg>
        `
    }

    if (shape === 'diamond') {
        return `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <polygon
                    points="${half},${stroke / 2} ${size - stroke / 2},${half} ${half},${size - stroke / 2} ${stroke / 2},${half}"
                    fill="${color}"
                    ${strokeAttr}
                    stroke-linejoin="round"
                />
            </svg>
        `
    }

    return nodeSymbolSVG('circle', color, selected)
}

const nodeIcon = function(L, type, color, selected = false) {
    const shape = nodeShapeByType(type)
    const size = selected ? 18 : 14
    const half = size / 2

    return L.divIcon({
        className: 'node-symbol',
        html: nodeSymbolSVG(shape, color, selected),
        iconSize: [size, size],
        iconAnchor: [half, half]
    })
}




export default {
    rampPalette,
    setupEleClickListener,
    setGraphColors,
    nodeIcon,
    getNodeDisplayColor,
    nodeTypeSymbols,
    nodeSymbolSVG,
}