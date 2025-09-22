// js/app.js
// App Vue 3 + Leaflet + Cytoscape, amb selecció sempre via Leaflet (mode pan permanent)

const { createApp, ref, onMounted } = Vue

createApp({
    setup() {
        // ---- STATE UI (sidebar) ----
        const selectedEle = ref(null)
        const flowModified = ref(null)
        const errorMsg = ref('')

        // ---- CORE OBJECTS ----
        const cy = ref(null)
        const map = ref(null)

        // ---- LEAFLET LAYERS (per id) ----
        const nodeLayerById = new Map()
        const edgeLayerById = new Map()

        // ---- ESTILS LEAFLET ----
        const normalNodeStyle = { radius: 6, weight: 2, opacity: 1, fillOpacity: 1, color: '#1d4ed8', fillColor: '#1d4ed8' }
        const hiNodeStyle     = { radius: 8, weight: 3, opacity: 1, fillOpacity: 1, color: '#111827', fillColor: '#111827' }

        const normalEdgeStyle = { weight: 6, opacity: 0.8, color: '#1d4ed8' }
        const hiEdgeStyle     = { weight: 8, opacity: 1,   color: '#111827' }

        // ------------- HELPERS -------------
        function nonempty(ele) {
            // Compatibilitat: ele.nonempty() o length>0
            return ele && (typeof ele.nonempty === 'function' ? ele.nonempty() : ele.length > 0)
        }

        function numOr(data, key, fallback = 0) {
            const v = data(key)
            const n = Number(v)
            return Number.isFinite(n) ? n : (v ?? fallback)
        }

        // Construeix l'objecte per a la sidebar a partir d'un node/edge
        function buildSelected(ele) {
            const d = (k) => ele.data(k)
            if (ele.isNode()) {
                return {
                    eleType: 'punt',
                    id: ele.id(),
                    name: d('name') ?? d('nom') ?? d('nom_punt_mostreig') ?? null,
                    type: d('type') ?? d('tipus') ?? d('categoria') ?? null,
                    inflow: numOr(d, 'inflow', 0),
                    outflow: numOr(d, 'outflow', 0),
                    flowChange: numOr(d, 'flowChange', 0)
                }
            } else {
                return {
                    eleType: 'tram',
                    id: ele.id(),
                    flow: numOr(d, 'flow', 0),
                    lengthRiver: numOr(d, 'lengthRiver', 0),
                    flowNeed: numOr(d, 'flowNeed', 0),
                    codi_massa: d('codi_massa') ?? d('massa') ?? null
                }
            }
        }

        // Reflecteix la selecció a Leaflet
        function highlightOnLeaflet(id, kind) {
            // reset
            edgeLayerById.forEach(l => l.setStyle(normalEdgeStyle))
            nodeLayerById.forEach(l => l.setStyle(normalNodeStyle))

            if (kind === 'edge') {
                const l = edgeLayerById.get(id)
                if (l) l.setStyle(hiEdgeStyle)
            } else {
                const l = nodeLayerById.get(id)
                if (l) l.setStyle(hiNodeStyle)
            }
        }

        // Selecció centralitzada Leaflet → CY (+ sidebar)
        function selectById(id, kind) {
            const ele = cy.value.getElementById(id)
            if (nonempty(ele)) {
                // Si tens lògica pròpia de 'tap' (listeners globals), reutilitza-la
                if (typeof ele.trigger === 'function') {
                    try { ele.trigger('tap') } catch (_) {}
                } else if (typeof ele.emit === 'function') {
                    try { ele.emit('tap') } catch (_) {}
                }

                // Fallback: actualitza sidebar si la lògica externa no ho fa
                selectedEle.value = buildSelected(ele)

                // Reflecteix visualment a Leaflet
                highlightOnLeaflet(id, kind)
            }
        }

        // Afegeix capa Leaflet per a un node CY
        function addNodeLayer(n) {
            const lat = Number(n.data('lat'))
            const lng = Number(n.data('lng'))
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

            const layer = L.circleMarker([lat, lng], { ...normalNodeStyle, interactive: true })
            layer.on('click', () => selectById(n.id(), 'node'))
            layer.addTo(map.value)
            nodeLayerById.set(n.id(), layer)
        }

        // Obtén latlngs per a un edge CY
        function getEdgeLatLngs(e) {
            // 1) Si ja tens array guardat a data('latlngs'): usem-lo
            const ll = e.data('latlngs')
            if (Array.isArray(ll) && ll.length) return ll

            // 2) Sinó, provem de construir amb source/target
            const src = e.source()
            const tgt = e.target()
            const a = [Number(src.data('lat')), Number(src.data('lng'))]
            const b = [Number(tgt.data('lat')), Number(tgt.data('lng'))]
            if (a.every(Number.isFinite) && b.every(Number.isFinite)) return [a, b]

            // 3) Sense coords: no dibuixem
            return null
        }

        // Afegeix capa Leaflet per a un edge CY (amb hitbox)
        function addEdgeLayer(e) {
            const latlngs = getEdgeLatLngs(e)
            if (!latlngs) return

            const layer = L.polyline(latlngs, { ...normalEdgeStyle, interactive: true })
            layer.on('click', () => selectById(e.id(), 'edge'))
            layer.addTo(map.value)
            edgeLayerById.set(e.id(), layer)

            // Hitbox transparent per fer més fàcil el clic
            const hit = L.polyline(latlngs, { weight: 18, opacity: 0, interactive: true })
            hit.on('click', () => selectById(e.id(), 'edge'))
            hit.addTo(map.value)
        }

        // Crea totes les capes Leaflet a partir del CY actual
        function buildLeafletLayersFromCy() {
            // NODES
            cy.value.nodes().forEach(addNodeLayer)
            // EDGES
            cy.value.edges().forEach(addEdgeLayer)
        }

        // Opcional: si es canvia la selecció a CY per altres vies (busca, teclat...)
        function wireCySelectionReflection() {
            cy.value.on('tap', 'node,edge', (ev) => {
                const e = ev.target
                selectedEle.value = buildSelected(e)
                highlightOnLeaflet(e.id(), e.isNode() ? 'node' : 'edge')
            })
        }

        // Control del camp "flowChange" (exemple bàsic)
        function modifyFlowChange(sel, newVal) {
            errorMsg.value = ''
            if (!sel || sel.eleType !== 'punt') return
            const v = Number(newVal)
            if (!Number.isFinite(v)) {
                errorMsg.value = 'Introdueix un número vàlid.'
                return
            }
            // Actualitza el node a CY
            const n = cy.value.getElementById(sel.id)
            if (nonempty(n)) {
                n.data('flowChange', v)
                // Refresca sidebar
                selectedEle.value = buildSelected(n)
            }
        }

        // ------------- MOUNT -------------
        onMounted(() => {
            // 1) Leaflet
            map.value = L.map('cy-leaflet', {
                zoomControl: true,
                preferCanvas: true,
            }).setView([41.98, 2.82], 10)

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                maxZoom: 19,
                attribution: '&copy; OpenStreetMap contributors'
            }).addTo(map.value)

            // 2) Cytoscape
            cy.value = cytoscape({
                container: document.getElementById('cy'),
                elements: window.CY_ELEMENTS || [], // carrega el teu graf aquí (nodes amb lat/lng, edges amb latlngs o source/target)
                layout: { name: 'preset' },         // posicions “preset” (no fa falta si només fem servir Leaflet)
                wheelSensitivity: 0.2,
                boxSelectionEnabled: false,
                style: [
                    { selector: 'node', style: { 'background-color': '#1d4ed8', 'width': 10, 'height': 10 } },
                    { selector: 'edge', style: { 'line-color': '#1d4ed8', 'width': 3, 'opacity': 0.9 } },
                    // Si algun cop vols fer selecció nativa:
                    { selector: 'node:selected', style: { 'background-color': '#111827' } },
                    { selector: 'edge:selected', style: { 'line-color': '#111827', 'width': 5 } }
                ]
            })

            // 3) Important: CY transparent als clics (Leaflet governa la interacció)
            const cyDiv = document.getElementById('cy')
            cyDiv.style.pointerEvents = 'none' // sempre en pan

            // 4) Construeix capes Leaflet a partir del graf
            buildLeafletLayersFromCy()

            // 5) Reflecteix canvis de selecció de CY → Leaflet (per si hi arriben d’altres fluxos)
            wireCySelectionReflection()
        })

        return {
            // Sidebar API
            selectedEle,
            flowModified,
            errorMsg,
            modifyFlowChange,
            // (exposes for debugging in console)
            _debug: { cy, map, nodeLayerById, edgeLayerById }
        }
    }
}).mount('#app')
