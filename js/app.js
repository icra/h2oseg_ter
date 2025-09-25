// noinspection JSVoidFunctionReturnValueUsed

import gm from './graph_methods.js'

const { createApp, onMounted, ref, shallowRef, watch } = Vue

const TT_OPTS = { direction: 'auto', sticky: true, opacity: 0.95, className: 'cytt', offset: [10, 0], pane: 'tipPane' }

const fmt = (v, d=1) => Number.isFinite(+v) ? (+v).toFixed(d) : '—'

// HTML dels tooltips
function nodeTooltipHTML(n) {
    return `
    <div>
      <div><strong>${n.data('id') ?? ''}</strong></div>
      <div>Tipus: ${n.data('type') ?? '—'}</div>
      <div>Cabal entrant: ${fmt(n.data('inflow'))} m³/s</div>
      <div>${n.data('flowChange') > 0 ? 'Aportació' : 'Extracció'}: ${fmt(n.data('flowChange'), 2)} m³/s</div>
      <div>Cabal sortint: ${fmt(n.data('outflow'))} m³/s</div>
    </div>
  `
}

function edgeTooltipHTML(e) {
    return `
    <div>
      <div><strong>${e.data('name') ?? ''}</strong></div>
      <div>${e.data('codiMassa')}</div>
      <div>Cabal mitjà: ${fmt(e.data('flow'))} m³/s</div>
      <div>Cabal ambiental: ${fmt(e.data('flowNeed'))} m³/s</div>
      <div>Llargada tram: ${fmt(e.data('lengthRiver'), 0)} m</div>
    </div>
  `
}

const reset = function(){
    window.confirm('Segur que vols reiniciar el model?') && window.location.reload()
}

createApp({
    setup() {
        const cy = ref(null)
        const leaf = shallowRef(null)
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
                        flowChange: n.properties.flowChange
                    }
                }
            })

            const cyEdges = edgesGeo.features.map(f => {
                return {
                    data: {
                        id: f.properties.id,
                        source: f.properties.from,
                        target: f.properties.to,
                        codiMassa: f.properties.codiMassa,
                        flowNeed: f.properties.flowNeed,
                        lengthRiver: f.properties.lengthRiver,
                        name: f.properties.nomComu

                    }
                }
            })

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

            cy.value.userPanningEnabled(false)
            cy.value.userZoomingEnabled(false)
            cy.value.boxSelectionEnabled(false)
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

            const edgePane = map.createPane('edgePane')
            edgePane.style.zIndex = 650
            edgePane.style.pointerEvents = 'auto'

            const nodePane = map.createPane('nodePane')
            nodePane.style.zIndex = 660   // per SOBRE dels edges
            nodePane.style.pointerEvents = 'auto'

            // pane per a tooltips per SOBRE dels nodes
            const tipPane = map.createPane('tipPane')
            tipPane.style.zIndex = 1000
            tipPane.style.pointerEvents = 'none' // no bloquejar clics

            const edgeNormalStyle = { weight: 3, opacity: 0.9 }
            const edgeHiStyle     = { weight: 5, opacity: 1.0 }
            const nodeNormalStyle = { radius: 4, weight: 2, opacity: 1, fillOpacity: 1 }
            const nodeHiStyle     = { radius: 6, weight: 3, opacity: 1, fillOpacity: 1 }

            const addNodeLayer = function(n){
                const ll = [ n.data('lat'), n.data('lng') ]
                const layer = L.circleMarker(ll, { ...nodeNormalStyle, pane: 'nodePane' })
                    .bindTooltip('', TT_OPTS)
                layer.on('click', () => selectById(n.id(), 'node'))
                layer.on('mouseover', ()=> {
                    const cn = cy.value.getElementById(n.id())
                    const html = nodeTooltipHTML(cn)
                    const tt = layer.getTooltip()
                    if (tt) tt.setContent(html)
                    layer.openTooltip()
                    layer.setStyle(nodeHiStyle)
                });
                layer.on('mouseout',  () => {
                    layer.closeTooltip()
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
                    const eid = String(f.properties.id)
                    edgeLayerById.set(eid, layer)
                    layer.bindTooltip('', TT_OPTS)

                    layer.on('click', () => selectById(eid,'edge'))
                    layer.on('mouseover', ()=> {
                        const ce = cy.value.getElementById(eid)
                        const html = edgeTooltipHTML(ce)
                        const tt = layer.getTooltip()
                        if (tt) tt.setContent(html)
                        layer.openTooltip()
                        layer.setStyle(edgeHiStyle)
                    })
                    layer.on('mouseout',  () => {
                        if (currentSel.id === eid && currentSel.kind === 'edge') {
                            layer.setStyle(edgeHiStyle)
                        } else {
                            layer.setStyle(edgeNormalStyle)
                        }
                    })
                }
            }).addTo(map)

            gm.calculateFlow(cy.value, { nodeLayerById, edgeLayerById}, errorMsg)

            gm.setupEleClickListener(cy.value, selectedEle)
            gm.setupZoomLabelControl(cy.value, leaf.value, 12);
        })

        // Quan es selecciona un node, posa-hi el valor actual com a valor per defecte
        watch(selectedEle, (val) => {
            if (val && val.eleType === 'punt') {
                // assegura número
                flowModified.value = Number(val.flowChange).toFixed(2);
            } else {
                flowModified.value = null; // o 0, si prefereixes
            }
        }, { immediate: true });

        return {
            cy,
            leaf,
            selectedEle,
            flowModified,
            modifyFlowChange: () => gm.modifyFlowChange(cy.value, selectedEle.value, flowModified, errorMsg, { nodeLayerById, edgeLayerById }),
            errorMsg,
            reset
        }
    }
}).mount('#app')
