// noinspection JSVoidFunctionReturnValueUsed

import gm from './graph_methods.js'

const {createApp, onMounted, ref, shallowRef, watch, nextTick} = Vue

const TT_OPTS = {direction: 'auto', sticky: true, opacity: 0.95, className: 'cytt', offset: [10, 0], pane: 'tipPane'}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const fmt = (v) => {
    let unit = 'm³/s'
    let d = 2
    if (Math.abs(+v) < 0.1) {
        unit = 'l/s'
        // convertim a litres per segon
        v = +v * 1000
        d = 0
    }
    return Number.isFinite(+v) ? (+v).toFixed(d) + ' ' + unit : '—'
}

const Hm3ToM3 = function (m3s) {
    const s = 365 * 24 * 3600
    return (+m3s * s / 1000000).toFixed(1)
}

// HTML dels tooltips
function nodeTooltipHTML(n, month) {
    if (n.id() === 'DESEMBASSAT') {
        return `
            <div>
              <div><strong>${n.data('name') ?? n.data('id') ?? ''}</strong></div>
              <div>Tipus: ${n.data('type') ?? '—'}</div>
              <div>Cabal desembassat: ${fmt(n.data('outflow' + month))}</div>
              ${month === '0' ? '<div>Total anual: ' + Hm3ToM3(n.data('outflow' + month)) + ' Hm<sup>3</sup></div>' : ''}
            </div>
        `
    }
    return `
        <div>
          <div><strong>${n.data('name') ?? n.data('id') ?? ''}</strong></div>
          <div>Tipus: ${n.data('type') ?? '—'}</div>
          <div>Cabal entrant: ${fmt(n.data('inflow' + month))}</div>
          <div>${n.data('m' + month) > 0 ? 'Aportació' : 'Extracció'}: ${fmt(n.data('m' + month), 2)}</div>
          <div>Cabal sortint: ${fmt(n.data('outflow' + month))}</div>
          ${month === '0' ? '<div>' + (n.data('m' + month) > 0 ? "Aportació" : "Extracció total") + ': ' + Hm3ToM3(n.data('m' + month)) + ' Hm<sup>3</sup></div>' : ''}
          ${n.data('deficit' + month) < 0 ? '<div>Dèficit: ' + fmt(n.data('deficit' + month), 2) + '</div>' : ''}
        </div>
  `
}

function edgeTooltipHTML(e, month) {
    return `
    <div>
      <div><strong>${e.data('nomComu') ?? ''}</strong></div>
      <div>${e.data('codiMassa')}</div>
      <div>Cabal mitjà: ${fmt(e.data('flow' + month))}</div>
      <div>Cabal ambiental: ${fmt(e.data('envFlow' + month))}</div>
      <div>Llargada tram: ${+e.data('lengthRiver').toFixed(0)} m</div>
    </div>
  `
}

function embTooltipHTML(month) {
    return `
    <div>
        <div><strong>Sistema Sau-Susqueda-Pasteral</strong></div>
        <div>Volum al sistema: ${fmt(gm.RESERVOIR.storage_hm3[month])} Hm<sup>3</sup></div>
        <div>Cabal mitjà d'entrada: ${fmt(gm.RESERVOIR.inflowSum_m3s[month])} m<sup>3</sup>s</div>
        <div>Cabal mitjà desembassat: ${fmt(gm.RESERVOIR.released_m3s[month])} m<sup>3</sup>s</div>
    </div>
    `
}

function canalsTooltipHTML(n, c, month) {
    return `
    <div>
        <div><strong>${c.nom}</strong></div>
        <div>Cabal mitjà: ${fmt(Math.abs(n.data('m' + month)))}</div>
    </div>
    `
}

const reset = function () {
    window.confirm('Segur que vols reiniciar el model?') && window.location.reload()
}

async function loadCalibResults() {
    const res = await fetch("/assets/calibration_results.json");
    if (!res.ok) throw new Error(`Cannot load calibration results: ${res.status}`);
    return await res.json();
}

createApp({
    setup() {
        const cy = ref(null)
        const leaf = shallowRef(null)
        const loading = ref(true)
        const selectedEle = ref(null)
        const flowModified = ref(null)
        const flowModifiedByMonth = ref(null)
        const errorMsg = ref(null)
        const month = ref('0')
        const monthSelector = ref(
            [
                {value: '0', label: "Total anual"},
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
        const editMode = ref('annual')
        const annualVolume = ref(null)
        const openModal = ref(false)
        const activeScenarios = ref({
            rainReduction: false
        })
        const rainReductionPerc = ref(0)
        const pptMean = ref(null)
        const tick = ref(0)

        const applyFlowChanges = async function (ele) {
            loading.value = true
            await sleep(1)

            for (const m of monthSelector.value) {
                flowModified.value = Number(flowModifiedByMonth.value[m.value])

                await gm.modifyFlowChange(
                    cy.value,
                    selectedEle.value,
                    flowModified,
                    m.value,
                    errorMsg,
                    {period: {year: 2024, month: m.value}}
                )
            }

            loading.value = false
        }
        const applyAnnualChange = async function (ele) {
            loading.value = true

            if (annualVolume.value === '' || annualVolume.value === NaN || annualVolume.value === null) {
                errorMsg.value = "Introdueix un volum vàlid"
                annualVolume.value = Number(Hm3ToM3(ele.m0))
                loading.value = false
                return
            }

            const target = annualVolume.value * 1000000 / (24 * 365 * 3600)
            errorMsg.value = null

            const months = Array(12).fill().map((e, i) => String(i + 1))

            let newVals

            if (Math.abs(+ele.m0) < 1e-6) {
                newVals = months.map(() => target)
            } else {
                const k = target / ele.m0
                newVals = months.map(m => ele['m' + m] * k)
            }

            months.forEach((m, idx) => {
                flowModifiedByMonth.value[m] = newVals[idx]
            })

            await sleep(0)
            await applyFlowChanges(ele)

            loading.value = false
        }
        const applyScenariosChanges = async function () {
            openModal.value = false
            loading.value = true
            await sleep(1)
            console.log(activeScenarios.value.rainReduction, rainReductionPerc.value)
            if (activeScenarios.value.rainReduction === false && rainReductionPerc.value !== '0') {
                console.log("dins inactiu")
                rainReductionPerc.value = '0'
                await rainReduction()
            } else if (activeScenarios.value.rainReduction) {
                await rainReduction()
            }

            await gm.calculateContribution(cy.value, params)
            await gm.calculateFlow(cy.value, params, errorMsg, {period: {year: 2024, month: 8}}); // mesos de l'1 al 12
            await gm.setGraphColors(month.value, cy.value, {nodeLayerById, edgeLayerById});
            tick.value++

            loading.value = false
        }
        const rainReduction = async function () {
            if (!cy) {
                console.error("cy not loaded")
                return
            }
            console.log("rain reduction value", rainReductionPerc.value, typeof rainReductionPerc.value)
            const reduction = (100 + Number(rainReductionPerc.value)) / 100
            const ppt = Array(12).fill().map((e, i) => String('ppt' + (i + 1)))
            const refppt = Array(12).fill().map((e, i) => String('refppt' + (i + 1)))

            if (cy.value.getElementById('NODE_1').data('refppt1') === undefined) {
                console.log("refppt created")
                cy.value.nodes().forEach(n => {
                    for (const i in refppt) {
                        n.data(refppt[i], n.data(ppt[i]))
                    }
                })
            }

            cy.value.nodes().forEach(n => {
                if (n.data('ppt1') === null) return
                for (const i in ppt) {
                    const newRain = n.data(refppt[i]) * reduction
                    n.data(ppt[i], newRain)
                }
                if (n.id() === 'NODE_64') console.log("node_64", n.data())
            })
            loading.value = false
        }

        const currentSel = {id: null, kind: null} // kind: 'node' | 'edge'

        const edgeLayerById = new Map()
        const nodeLayerById = new Map()

        onMounted(async () => {
            loading.value = true
            try {
                const [nodesResp, edgesResp, embResp, canalsResp] = await Promise.all([
                    fetch('assets/nodes.geojson'),
                    fetch('assets/edges.geojson'),
                    fetch('assets/sau_susqueda.geojson'),
                    fetch('assets/canals.geojson'),
                ])
                const nodesGeo = await nodesResp.json()
                const edgesGeo = await edgesResp.json()
                const embGeo = await embResp.json()
                const canalsGeo = await canalsResp.json()

                const calibResults = await loadCalibResults();
                const params = gm.buildCalibratedParams(gm.params, calibResults);



                const cyNodes = nodesGeo.features.map(n => {
                    const nodeData = Object.keys(n.properties).reduce((acc, key) => {
                        acc[key] = n.properties[key];
                        return acc;
                    }, {});
                    nodeData.lat = n.geometry.coordinates[1];
                    nodeData.lng = n.geometry.coordinates[0];

                    return {
                        data: nodeData
                    }
                })

                const cyEdges = edgesGeo.features.map(e => {
                    const edgeData = Object.keys(e.properties).reduce((acc, key) => {
                        acc[key] = e.properties[key];
                        return acc;
                    }, {});
                    edgeData.source = e.properties.from;
                    edgeData.target = e.properties.to;

                    return {
                        data: edgeData
                    }
                })

                const virtualEdges = [
                    {data: {id: 'v_82_res', source: 'NODE_82', target: 'DESEMBASSAT', virtual: true}},
                    {data: {id: 'v_33_res', source: 'NODE_33', target: 'DESEMBASSAT', virtual: true}},
                    {data: {id: 'v_34_res', source: 'NODE_34', target: 'DESEMBASSAT', virtual: true}},
                    {data: {id: 'v_84_res', source: 'NODE_84', target: 'DESEMBASSAT', virtual: true}},
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
                    layout: {name: 'preset'}
                })

                console.log("cy", cy.value)

                cy.value.userPanningEnabled(false)
                cy.value.userZoomingEnabled(false)
                cy.value.boxSelectionEnabled(false)
                cy.value.autoungrabify(true);

                cy.value.style()
                    .selector('edge[virtual = "true"]')
                    .style({'opacity': 0, 'events': 'no'})
                    .update();

                leaf.value = cy.value.leaflet({
                    container: document.getElementById('cy-leaflet'),
                    latitude: 'lat',
                    longitude: 'lng',
                })

                function highlightOnLeaflet(id, kind) {
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

                function selectById(id, kind) {
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
                    options: {position: 'topleft'},

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

                const canalsPane = map.createPane('canalsPane')
                embPane.style.zIndex = 800
                embPane.style.pointerEvents = 'auto'

                // pane per a tooltips per SOBRE dels nodes
                const tipPane = map.createPane('tipPane')
                tipPane.style.zIndex = 1000
                tipPane.style.pointerEvents = 'none' // no bloquejar clics

                const edgeNormalStyle = {weight: 3, opacity: 1}
                const edgeHiStyle = {weight: 5, opacity: 1.0}
                const nodeNormalStyle = {radius: 4, weight: 2, opacity: 1, fillOpacity: 1}
                const nodeHiStyle = {radius: 6, weight: 3, opacity: 1, fillOpacity: 1}

                map.on('click', () => {
                    selectedEle.value = null;
                    currentSel.id = null;
                    currentSel.kind = null;

                    cy.value.elements().removeClass('selected');

                    edgeLayerById.forEach(l => l.setStyle(edgeNormalStyle));
                    nodeLayerById.forEach(l => l.setStyle(nodeNormalStyle));
                })

                const addNodeLayer = function (n) {
                    const ll = [n.data('lat'), n.data('lng')]
                    const layer = L.circleMarker(ll, {...nodeNormalStyle, pane: 'nodePane'})
                        .bindTooltip('', TT_OPTS)
                    layer.on('click', (e) => {
                        L.DomEvent.stopPropagation(e)
                        selectById(n.id(), 'node')
                    })
                    layer.on('mouseover', () => {
                        const cn = cy.value.getElementById(n.id())
                        const html = nodeTooltipHTML(cn, month.value)
                        const tt = layer.getTooltip()
                        if (tt) tt.setContent(html)
                        layer.openTooltip()
                        layer.setStyle(nodeHiStyle)
                    });
                    layer.on('mouseout', () => {
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

                        layer.on('click', (e) => {
                            L.DomEvent.stopPropagation(e)
                            selectById(eid, 'edge')
                        })
                        layer.on('mouseover', () => {
                            const ce = cy.value.getElementById(eid)
                            const html = edgeTooltipHTML(ce, month.value)
                            const tt = layer.getTooltip()
                            if (tt) tt.setContent(html)
                            layer.openTooltip()
                            layer.setStyle(edgeHiStyle)
                        })
                        layer.on('mouseout', () => {
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
                                if (tt) tt.setContent(embTooltipHTML(month.value)); // passa la feature si ho necessites
                                l.openTooltip();
                            },
                            mouseout: (e) => e.target.closeTooltip()
                        });
                    }
                }).addTo(map);

                const canalsLayer = L.geoJSON(canalsGeo, {
                    pane: 'canalsPane',
                    style: () => ({color: '#a5a5a5', weight: 2, opacity: 1}),
                    onEachFeature: (feature, layer) => {
                        // assegura interacció i tooltip
                        layer.options.interactive = true;
                        layer.bindTooltip('', TT_OPTS);

                        layer.on({
                            mouseover: (e) => {
                                const l = e.target;
                                const c = e.target.feature.properties;
                                const n = cy.value.getElementById(c.codi_sad)
                                const tt = l.getTooltip();
                                if (tt) tt.setContent(canalsTooltipHTML(n, c, month.value)); // passa la feature si ho necessites
                                l.openTooltip();
                            },
                            mouseout: (e) => e.target.closeTooltip()
                        });
                    }
                }).addTo(map);
                pptMean.value = gm.calculateMeanPpt(cy.value)
                gm.calculateContribution(cy.value, params)
                gm.calculateFlow(cy.value, params, errorMsg, {period: {year: 2024, month: 8}}); // mesos de l'1 al 12
                gm.setGraphColors(month.value, cy.value, {nodeLayerById, edgeLayerById});
                gm.setupEleClickListener(cy.value, selectedEle)
                gm.setupZoomLabelControl(cy.value, leaf.value, 12);
            } catch (e) {
                console.error(e);
            } finally {
                loading.value = false;
            }
        })

        // Quan es selecciona un node, posa-hi el valor actual com a valor per defecte
        watch(selectedEle, (val) => {
            if (val && val.eleType === 'punt') {
                const init = {}
                monthSelector.value.forEach(m => {
                    const raw = val['m' + m.value]
                    const num = Number.isFinite(+raw) ? Number(raw) : 0
                    init[m.value] = Number(num.toFixed(2))
                })
                flowModifiedByMonth.value = init

                const rawAnnual = Hm3ToM3(val['m0'])
                console.log("rawAnnual", rawAnnual)
                const annualNum = Number.isFinite(+rawAnnual) ? Number(rawAnnual) : 0
                annualVolume.value = Number(annualNum)
            } else {
                flowModifiedByMonth.value = {}
                annualVolume.value = null
            }
        }, {immediate: true});

        watch(month, (m) => {
            gm.setGraphColors(m, cy.value, {nodeLayerById, edgeLayerById})
        })

        return {
            cy,
            leaf,
            selectedEle,
            flowModified,
            flowModifiedByMonth,
            applyFlowChanges,
            applyAnnualChange,
            editMode,
            annualVolume,
            reservoir: gm.RESERVOIR,
            errorMsg,
            reset,
            month,
            monthSelector,
            loading,
            fmt,
            openModal,
            activeScenarios,
            applyScenariosChanges,
            rainReductionPerc,
            pptMean,
            Hm3ToM3,
            rampPalette: gm.rampPalette,
            tick
        }
    }
}).mount('#app')
