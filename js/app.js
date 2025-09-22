// noinspection JSVoidFunctionReturnValueUsed

import gm from './graph_methods.js'

const { createApp, onMounted, ref } = Vue

createApp({
    setup() {
        const cy = ref(null)
        const leaf = ref(null)
        const selectedEle = ref(null)
        const flowModified = ref(null)
        const errorMsg = ref(null)

        const currentSel = { id: null, kind: null } // kind: 'node' | 'edge'

        const edgeLayerById = new Map()
        const nodeLayerById = new Map()

        onMounted(async () => {
            const [nodesResp, edgesResp] = await Promise.all([
                fetch('assets/nodes.geojson'),
                fetch('assets/edges.geojson')
            ])
            const nodesGeo = await nodesResp.json()
            const edgesGeo = await edgesResp.json()

            const cyNodes = nodesGeo.features.map(n => {
                return {
                    data: {
                        id: n.properties.node_id,
                        name: n.properties.nom,
                        type: n.properties.type,
                        lat: n.geometry.coordinates[1],
                        lng: n.geometry.coordinates[0],
                        flowChange: n.properties.flow_change
                    }
                }
            })

            const cyEdges = edgesGeo.features.map(f => {
                return {
                    data: {
                        id: f.properties.id,
                        source: f.properties.from,
                        target: f.properties.to,
                        flowNeed: f.properties.flow_need,
                        lengthRiver: f.properties.massa_length
                    }
                }
            })

            console.log("cy", [...cyNodes, ...cyEdges])

            cytoscape.use(cytoscapePopper)

            cy.value = cytoscape({
                container: document.getElementById('cy'),
                elements: [...cyNodes, ...cyEdges],
                style: [
                    {
                        selector: 'node',
                        style: {
                            'opacity': 0,
                            'events': 'no',
                            'grabbable': false
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            opacity: 0,
                            events: 'no'
                        }
                    }
                ],
                layout: { name: 'preset' }
            })

            cy.value.autoungrabify(true);

            leaf.value = cy.value.leaflet({
                container: document.getElementById('cy-leaflet'),
                latitude: 'lat',
                longitude: 'lng',
            })

            function highlightOnLeaflet(id, kind){
                // reseteja estil
                currentSel.id = id
                currentSel.kind = kind

                edgeLayerById.forEach(l => l.setStyle(edgeNormalStyle))
                nodeLayerById.forEach(l => l.setStyle(nodeNormalStyle))

                // aplica ressaltat
                if (kind === 'edge') {
                    const l = edgeLayerById.get(id)
                    if (l) l.setStyle(edgeHiStyle)
                } else {
                    const l = nodeLayerById.get(id)
                    if (l) l.setStyle(nodeHiStyle)
                }
            }

            function selectById(id, kind){
                const ele = cy.value.getElementById(id)
                if (ele.nonempty()) {
                    // 1) Reutilitza la teva lògica existent
                    ele.trigger('tap')     // això ja actualitza sidebar, classes, etc.

                    // 2) Reflecteix a Leaflet (resaltat visual)
                    highlightOnLeaflet(id, kind)
                }
            }

            const map = leaf.value.map

            L.control.zoom().addTo(map)

            // Crear un control personalitzat
            const homeControl = L.Control.extend({
                options: { position: 'topleft' },

                onAdd: function () {
                    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control leaflet-control-custom');

                    // Crea un rectangle amb vora discontínua via CSS
                    container.innerHTML = `
                        <svg viewBox="0 0 22 22" width="18" height="18" style="margin: 6px;">
                            <path d="M4 9V4h5M4 4l6 6M20 9V4h-5M20 4l-6 6M4 15v5h5M4 20l6-6M20 15v5h-5M20 20l-6-6"
                                  stroke="#333" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    `;

                    container.style.backgroundColor = 'white';
                    container.style.width = '30px';
                    container.style.height = '30px';
                    container.style.display = 'flex';
                    container.style.alignItems = 'center';
                    container.style.justifyContent = 'center';
                    container.style.cursor = 'pointer';
                    container.title = 'Restableix la vista';

                    L.DomEvent.disableClickPropagation(container);

                    container.onclick = () => {
                        if (leaf.value && typeof leaf.value.fit === 'function') {
                            leaf.value.fit();
                        }
                    };

                    return container;
                }
            });

            // Afegir-lo al mapa
            map.addControl(new homeControl());

            leaf.value.fit()
            gm.calculateFlow(cy.value)

            gm.setupEleClickListener(cy.value, selectedEle)
            gm.setupZoomLabelControl(cy.value, leaf.value, 12);
            gm.placeLabels(cy.value)

            const edgePane = map.createPane('edgePane')
            edgePane.style.zIndex = 650
            edgePane.style.pointerEvents = 'auto'

            const nodePane = map.createPane('nodePane')
            nodePane.style.zIndex = 660   // per SOBRE dels edges
            nodePane.style.pointerEvents = 'auto'

            const edgeNormalStyle = { color: '#0074D9', weight: 3, opacity: 0.9 }
            const edgeHiStyle     = { color: 'orange',  weight: 5, opacity: 1.0 }
            const nodeNormalStyle = { color: '#0074D9', radius: 4, weight: 2, opacity: 1, fillOpacity: 1 }
            const nodeHiStyle     = { color: 'orange', radius: 6, weight: 3, opacity: 1, fillOpacity: 1 }

            const addNodeLayer = function(n){
                const ll = [ n.data('lat'), n.data('lng') ]
                const layer = L.circleMarker(ll, { ...nodeNormalStyle, pane: 'nodePane' })
                layer.on('click', () => selectById(n.id(), 'node'))
                layer.on('mouseover', ()=> { layer.setStyle(nodeHiStyle) })
                layer.on('mouseout',  () => {
                    if (currentSel.id === n.id() && currentSel.kind === 'node') {
                        layer.setStyle(nodeHiStyle)
                    } else {
                        layer.setStyle(nodeNormalStyle)
                    }
                })
                layer.addTo(map)
                nodeLayerById.set(n.id(), layer)
            }

            cy.value.nodes().forEach(addNodeLayer)

            const arcsLayer = L.geoJSON(edgesGeo, {
                pane: 'edgePane',
                style: f => edgeNormalStyle,
                onEachFeature: (f, layer) => {
                    const eid = f.properties.id
                    edgeLayerById.set(eid, layer)

                    layer.on('click', () => selectById(eid,'edge'))
                    layer.on('mouseover', ()=> layer.setStyle(edgeHiStyle))
                    layer.on('mouseout',  () => {
                        if (currentSel.id === eid && currentSel.kind === 'edge') {
                            layer.setStyle(edgeHiStyle)
                        } else {
                            layer.setStyle(edgeNormalStyle)
                        }
                    })
                }
            }).addTo(map)
        })

        return {
            cy,
            leaf,
            selectedEle,
            flowModified,
            modifyFlowChange: () => gm.modifyFlowChange(cy.value, selectedEle.value, flowModified, errorMsg),
            errorMsg,
        }
    }
}).mount('#app')
