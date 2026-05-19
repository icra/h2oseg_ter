// noinspection JSVoidFunctionReturnValueUsed

import gm from './graph_methods.js'

const {createApp, onMounted, ref, shallowRef, watch} = Vue

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
function nodeTooltipHTML(n, month, k) {
    console.log('k tooltip', k)
    if (n.id() === 'DESEMBASSAT') {
        return `
            <div>
              <div><strong>${n.data('name') ?? n.data('id') ?? ''}</strong></div>
              <div>Tipus: ${n.data('type') ?? '—'}</div>
              <div>Cabal desembassat: ${fmt(n.data('outflow' + k))}</div>
              ${month === '0' ? '<div>Total anual: ' + Hm3ToM3(n.data('outflow' + k)) + ' Hm<sup>3</sup></div>' : ''}
            </div>
        `
    }
    return `
        <div>
          <div><strong>${n.data('name') ?? n.data('id') ?? ''}</strong></div>
          <div>Tipus: ${n.data('type') ?? '—'}</div>
          <div>Cabal entrant: ${fmt(n.data('inflow' + k))}</div>
          <div>${n.data('m' + month) > 0 ? 'Aportació' : 'Extracció'}: ${fmt(n.data('m' + month), 2)}</div>
          <div>Cabal sortint: ${fmt(n.data('outflow' + k))}</div>
          ${month === '0' ? '<div>' + (n.data('m' + month) > 0 ? "Aportació" : "Extracció total") + ': ' + Hm3ToM3(n.data('m' + month)) + ' Hm<sup>3</sup></div>' : ''}
        </div>
  `
}

function edgeTooltipHTML(e, month, k) {
    return `
    <div>
      <div><strong>${e.data('nomComu') ?? ''}</strong></div>
      <div>${e.data('codiMassa')}</div>
      <div>Cabal mitjà: ${fmt(e.data('flow' + k))}</div>
      <div>Cabal ambiental: ${fmt(e.data('envFlow' + month))}</div>
      <div>Llargada tram: ${+e.data('lengthRiver').toFixed(0)} m</div>
    </div>
  `
}

function embTooltipHTML(k) {
    return `
    <div>
        <div><strong>Sistema Sau-Susqueda-Pasteral</strong></div>
        <div>Volum al sistema: ${fmt(gm.RESERVOIR.storage_hm3[k])} Hm<sup>3</sup></div>
        <div>Cabal mitjà d'entrada: ${fmt(gm.RESERVOIR.inflowSum_m3s[k])} m<sup>3</sup>s</div>
        <div>Cabal mitjà desembassat: ${fmt(gm.RESERVOIR.released_m3s[k])} m<sup>3</sup>s</div>
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
        const baseMonths = [
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
        const monthSelector = Vue.computed(() => {
            if (nYears.value === 1){
                return [{value: '0', label: "Total anual"}, ...baseMonths]
            }
            return baseMonths
        })
        const nYears = ref(1)
        const nYearsDraft = ref(1)
        const simYear = ref('1')
        const yearSelector = Vue.computed(() => {
            const N = Math.max(1, Math.min(10, Number(nYears.value) || 1))
            const options = Array.from({length: N}, (_, i) => ({
                value: String(i+1),
                label: `Any ${i+1}`
            }))
            options.push({value: '0', label: 'Total'})
            return options
        })
        const yearsDirty = Vue.computed(() => {
            const d = Math.max(1, Math.min(10, Number(nYearsDraft.value) || 1))
            const a = Math.max(1, Math.min(10, Number(nYears.value) || 1))
            return d !== a
        })
        const selK = Vue.computed(() => {
            return Number(simYear.value) === 0 ? 0 : (simYear.value - 1) * 12 + Number(month.value)
        })
        const applyYears = async () => {
            const newN = Math.max(1, Math.min(10, Number(nYearsDraft.value) || 1))
            nYears.value = newN
            if (newN > 1 && month.value === '0') month.value = '1'

            if (newN > 1){
                simYear.value = '0'
            } else {
                simYear.value = '1'
                month.value = '0'
            }

            loadingYear.value = 1
            loading.value = true
            await sleep(1)
            await gm.calculateContribution(cy.value, params.value)
            await gm.calculateFlow(cy.value, params.value, nYears.value, errorMsg, {}, loadingYear, volumEmb.value); // mesos de l'1 al 12
            await gm.setGraphColors(selK.value, cy.value, {nodeLayerById, edgeLayerById});
            tick.value++

            loading.value = false
        }
        const loadingYear = ref(1)
        const params = shallowRef(null)
        const editMode = ref('annual')
        const annualVolume = ref(null)
        const openModal = ref(false)
        const scenarios = ref({
            rainReduction: {
                name: "Reducció de pluja",
                value: '0',
                units: "%",
                active: false
            },
            temperatureIncrease: {
                name: "Increment de temperatura",
                value: '0',
                units: "ºC",
                active: false
            }
        })
        const pptMean = ref(null)
        const tmitMean = ref(null)
        const volumEmb = ref(400)
        const tick = ref(0)

        const downloadData = function() {
            if (!cy.value) {
                console.error("Cytoscape no està inicialitzat");
                return;
            }

            const dades = {
                nodes: cy.value.nodes().map(node => ({
                    data: node.data(),
                    position: node.position()
                })),
                edges: cy.value.edges().map(edge => ({
                    data: edge.data()
                }))
            };

            const jsonString = JSON.stringify(dades, null, 2);
            const blob = new Blob([jsonString], {type: "application/json"});
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = "dades_h2oseg_ter.json";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
        }

        const applyFlowChanges = async function () {
            loadingYear.value = 1
            loading.value = true
            await sleep(1)

            // IMPORTANT: només mesos 1..12, no '0'
            const changes = {}
            for (let mo = 1; mo <= 12; mo++) {
                changes[String(mo)] = flowModifiedByMonth.value[String(mo)]
            }
            await gm.modifyFlowChange(
                cy.value,
                selectedEle.value,
                changes,
                errorMsg,
                params.value,
                { nYears: nYears.value },
                loadingYear,
                volumEmb.value
            )

            await gm.setGraphColors(selK.value, cy.value, {nodeLayerById, edgeLayerById})
            tick.value++

            loading.value = false
        }
        const applyAnnualChange = async function (ele) {
            loadingYear.value = 1
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
            await applyFlowChanges()

            loading.value = false
        }
        const applyScenariosChanges = async function () {
            openModal.value = false
            loadingYear.value = 1
            loading.value = true
            await sleep(1)
            if (scenarios.value.rainReduction.active === false && scenarios.value.rainReduction.value !== '0') {
                scenarios.value.rainReduction.value = '0'
                await rainReduction()
            } else if (scenarios.value.rainReduction.active) {
                await rainReduction()
            }
            if (scenarios.value.temperatureIncrease.active === false && scenarios.value.temperatureIncrease.value !== '0') {
                scenarios.value.temperatureIncrease.value = '0'
                await temperatureIncrease()
            } else if (scenarios.value.temperatureIncrease.active) {
                await temperatureIncrease()
            }

            await gm.calculateContribution(cy.value, params.value)
            await gm.calculateFlow(cy.value, params.value, nYears.value, errorMsg, {}, loadingYear, volumEmb.value);
            await gm.setGraphColors(selK.value, cy.value, {nodeLayerById, edgeLayerById});
            tick.value++

            loading.value = false
        }
        const rainReduction = async function () {
            if (!cy) {
                console.error("cy not loaded")
                return
            }
            const reduction = (100 + Number(scenarios.value.rainReduction.value)) / 100
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
                if (n.data('ppt1') === undefined) return
                for (const i in ppt) {
                    const newRain = n.data(refppt[i]) * reduction
                    n.data(ppt[i], newRain)
                }
            })
        }
        const temperatureIncrease = async function () {
            if (!cy) {
                console.error("cy not loaded")
                return
            }

            const tmit = Array(12).fill().map((e, i) => String('tmit' + (i + 1)))
            const reftmit = Array(12).fill().map((e, i) => String('reftmit' + (i + 1)))

            if (cy.value.getElementById('NODE_1').data('reftmit1') === undefined) {
                cy.value.nodes().forEach(n => {
                    for (const i in reftmit) {
                        n.data(reftmit[i], n.data(tmit[i]))
                    }
                })
                console.log("reftmit created")
            }

            cy.value.nodes().forEach(n => {
                if (n.data('tmit1') === undefined) return
                for (const i in tmit) {
                    const newTmit = n.data(reftmit[i]) + Number(scenarios.value.temperatureIncrease.value)
                    n.data(tmit[i], newTmit)
                }
            })
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
                params.value = gm.buildCalibratedParams(gm.params, calibResults);



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
                        const html = nodeTooltipHTML(cn, month.value, selK.value)
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
                            const html = edgeTooltipHTML(ce, month.value, selK.value)
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
                                if (tt) tt.setContent(embTooltipHTML(selK.value)); // passa la feature si ho necessites
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
                pptMean.value = gm.calculateMeanCy(cy.value, 'ppt', 'sum')
                tmitMean.value = gm.calculateMeanCy(cy.value, 'tmit', 'mean')
                await gm.initSimulation(nYears.value, volumEmb.value)
                await gm.calculateContribution(cy.value, params.value)
                await gm.calculateFlow(cy.value, params.value, nYears.value, errorMsg, {period: {year: 2024, month: 8}}, loadingYear, volumEmb.value); // mesos de l'1 al 12
                gm.setGraphColors(selK.value, cy.value, {nodeLayerById, edgeLayerById});
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

        watch(selK, (k) => {
            gm.setGraphColors(k, cy.value, {nodeLayerById, edgeLayerById})
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
            baseMonths,
            monthSelector,
            nYears,
            nYearsDraft,
            yearsDirty,
            yearSelector,
            simYear,
            applyYears,
            loadingYear,
            selK,
            loading,
            fmt,
            openModal,
            scenarios,
            applyScenariosChanges,
            pptMean,
            tmitMean,
            Hm3ToM3,
            rampPalette: gm.rampPalette,
            volumEmb,
            tick,
            downloadData
        }
    }
}).mount('#app')
