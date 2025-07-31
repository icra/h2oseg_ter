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

        onMounted(async () => {
            const response = await fetch('assets/ter_graph.json')
            let network = await response.json()

            network = network.map(element => {
                if (element.data && element.data.id) {
                    return {
                        ...element,
                        data: {
                            ...element.data,
                            label: `${element.data.flowChange || ''}`,
                        }
                    };
                }
                return element;
            });

            cy.value = cytoscape({
                container: document.getElementById('cy'),
                elements: network,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'background-color': '#0074D9',
                            'width': 10,
                            'height': 10,
                            // label: 'data(label)',
                            color: '#fff',
                            'text-valign': 'center',
                            'text-halign': 'center',
                            'grabbable': false
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            // label: 'data(flow)',
                            width: 2,
                            'text-background-color': '#fff',
                            'text-background-opacity': 0.8,
                            'text-background-shape': 'roundrectangle',
                        }
                    },
                    {
                        selector: '.selected',
                        style: {
                            'background-color': 'yellow',
                            'line-color': 'yellow',       // si és un edge
                            'target-arrow-color': 'yellow', // si tens fletxes
                            color: 'black',
                            'transition-property': 'background-color, line-color',
                            'transition-duration': '250ms',
                            'grabbable': false
                        }
                    },
                    {
                        selector: 'node.show-label',
                        style: {
                            'label': 'data(flowChange)',
                            color: '#ffffff',
                            width: 25,
                            height: 25
                        }
                    },
                    {
                        selector: 'edge.show-label',
                        style: {
                            'label': 'data(flow)',
                            'text-background-color': '#fff',
                            'text-background-opacity': 0.8,
                            'text-background-shape': 'roundrectangle',
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
