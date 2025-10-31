// noinspection JSVoidFunctionReturnValueUsed

import gm from './graph_methods.js'

const { createApp, onMounted, ref, shallowRef, watch } = Vue

const TT_OPTS = { direction: 'auto', sticky: true, opacity: 0.95, className: 'cytt', offset: [10, 0], pane: 'tipPane' }

const fmt = (v, d=1) => Number.isFinite(+v) ? (+v).toFixed(d) : '—'

// HTML dels tooltips
function nodeTooltipHTML(n, month) {
    return `
    <div>
      <div><strong>${n.data('id') ?? ''}</strong></div>
      <div>Tipus: ${n.data('type') ?? '—'}</div>
      <div>Cabal entrant: ${fmt(n.data('inflow' + month))} m³/s</div>
      <div>${n.data('m' + month) > 0 ? 'Aportació' : 'Extracció'}: ${fmt(n.data('m' + month), 2)} m³/s</div>
      <div>Cabal sortint: ${fmt(n.data('outflow' + month))} m³/s</div>
    </div>
  `
}

function edgeTooltipHTML(e, month) {
    return `
    <div>
      <div><strong>${e.data('name') ?? ''}</strong></div>
      <div>${e.data('codiMassa')}</div>
      <div>Cabal mitjà: ${fmt(e.data('flow' + month))} m³/s</div>
      <div>Cabal ambiental: ${fmt(e.data('flowNeed'))} m³/s</div>
      <div>Llargada tram: ${fmt(e.data('lengthRiver'), 0)} m</div>
    </div>
  `
}

function embTooltipHTML() {
    return `
    <div>
        <div><strong>Sistema Sau-Susqueda-Pasteral</strong></div>
        <div>Volum al sistema: ${gm.RESERVOIR.storage_hm3.toFixed()} Hm<sup>3</sup></div>
        <div>Cabal mitjà d'entrada: ${gm.RESERVOIR.last.inflowSum_m3s} m<sup>3</sup>s</div>
        <div>Cabal mitjà desembassat: ${gm.RESERVOIR.last.released_m3s} m<sup>3</sup>s</div>
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
        const month = ref('1')
        const monthSelector = ref(
            [
                {value: '1', label: "Gener"},
                {value: '2', label: "Febrer"},
                {value: '3', label: "Març"},
                {value: '4', label: "Abril"},
                {value: '5', label: "Maig"},
                {value: '6', label: "Juny"},
                {value: '7', label: "Juliol"},
                {value: '8', label: "Agost"},
                {value: '9', label: "Setembre"},
                {value: '10', label: "Octubre"},
                {value: '11', label: "Novembre"},
                {value: '12', label: "Desembre"},
            ]
        )

        const currentSel = { id: null, kind: null } // kind: 'node' | 'edge'

        const edgeLayerById = new Map()
        const nodeLayerById = new Map()

        onMounted(async () => {
            const [nodesResp, edgesResp, embResp] = await Promise.all([
                fetch('assets/nodes.geojson'),
                fetch('assets/edges.geojson'),
                fetch('assets/sau_susqueda.geojson')
            ])
            const nodesGeo = await nodesResp.json()
            const edgesGeo = await edgesResp.json()
            const embGeo = await embResp.json()

            const cyNodes = nodesGeo.features.map(n => {
                return {
                    data: {
                        id: n.properties.node_id,
                        name: n.properties.nom,
                        type: n.properties.type,
                        lat: n.geometry.coordinates[1],
                        lng: n.geometry.coordinates[0],
                        m1: n.properties.m1,
                        m2: n.properties.m2,
                        m3: n.properties.m3,
                        m4: n.properties.m4,
                        m5: n.properties.m5,
                        m6: n.properties.m6,
                        m7: n.properties.m7,
                        m8: n.properties.m8,
                        m9: n.properties.m9,
                        m10: n.properties.m10,
                        m11: n.properties.m11,
                        m12: n.properties.m12,
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

            const virtualEdges = [
                {data: { id: 'v_82_res', source: 'NODE_82', target: 'DESEMBASSAT', virtual: true}},
                {data: { id: 'v_33_res', source: 'NODE_33', target: 'DESEMBASSAT', virtual: true}},
                {data: { id: 'v_34_res', source: 'NODE_34', target: 'DESEMBASSAT', virtual: true}},
                {data: { id: 'v_84_res', source: 'NODE_84', target: 'DESEMBASSAT', virtual: true}},
            ]

            cy.value = cytoscape({
                container: document.getElementById('cy'),
                elements: [...cyNodes, ...cyEdges, ...virtualEdges],
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

            console.log("cy", cy.value)

            cy.value.userPanningEnabled(false)
            cy.value.userZoomingEnabled(false)
            cy.value.boxSelectionEnabled(false)
            cy.value.autoungrabify(true);

            cy.value.style()
                .selector('edge[virtual = "true"]')
                .style({ 'opacity': 0, 'events': 'no' })
                .update();

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
            console.log("month", month.value)
            leaf.value.fit()

            const edgePane = map.createPane('edgePane')
            edgePane.style.zIndex = 650
            edgePane.style.pointerEvents = 'auto'

            const nodePane = map.createPane('nodePane')
            nodePane.style.zIndex = 660   // per SOBRE dels edges
            nodePane.style.pointerEvents = 'auto'

            const embPane = map.createPane('embPane')
            embPane.style.zIndex = 800
            embPane.style.pointerEvents = 'auto'

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
                    const html = nodeTooltipHTML(cn, month.value)
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
                        const html = edgeTooltipHTML(ce, month.value)
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

            const embLayer = L.geoJSON(embGeo, {
                pane: 'embPane',
                style: () => ({
                    color: '#0074D9',
                    weight: 1,
                    fillColor: '#0074D9',
                    fillOpacity: 1
                }),
                onEachFeature: (feature, layer) => {
                    // assegura interacció i tooltip
                    layer.options.interactive = true;
                    layer.bindTooltip('', TT_OPTS);

                    layer.on({
                        mouseover: (e) => {
                            const l = e.target;
                            const tt = l.getTooltip();
                            if (tt) tt.setContent(embTooltipHTML(feature)); // passa la feature si ho necessites
                            l.openTooltip();
                        },
                        mouseout: (e) => e.target.closeTooltip()
                    });
                }
            }).addTo(map);

            gm.calculateFlow(cy.value, { nodeLayerById, edgeLayerById}, errorMsg, { period: {year: 2024, month: 8}}); // mesos de l'1 al 12

            gm.setupEleClickListener(cy.value, selectedEle)
            gm.setupZoomLabelControl(cy.value, leaf.value, 12);
        })

        // Quan es selecciona un node, posa-hi el valor actual com a valor per defecte
        watch(selectedEle, (val) => {
            if (val && val.eleType === 'punt') {
                // assegura número
                flowModified.value = Number(val['m' + month.value]).toFixed(2);
            } else {
                flowModified.value = null; // o 0, si prefereixes
            }
        }, { immediate: true });

        return {
            cy,
            leaf,
            selectedEle,
            flowModified,
            modifyFlowChange: () => gm.modifyFlowChange(cy.value, selectedEle.value, flowModified, month.value, errorMsg, { nodeLayerById, edgeLayerById }, {period: {year:2024, month:8}}),
            getReservoir: () => gm.RESERVOIR,
            errorMsg,
            reset,
            month: month,
            monthSelector
        }
    }
}).mount('#app')
