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
            const response = await fetch('assets/test.json')
            let network = await response.json()

            network = network.map(element => {
                if (element.data && element.data.id) {
                    return {
                        ...element,
                        data: {
                            ...element.data,
                            label: `${element.data.id} (${element.data.flowChange || ''})`,
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
                            label: 'data(label)',
                            color: '#fff',
                            'text-valign': 'center',
                            'text-halign': 'center',
                            'font-size': '10px'
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            label: 'data(flow)',
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
                            'color': 'black',
                            'transition-property': 'background-color, line-color',
                            'transition-duration': '250ms'
                        }
                    }
                ],
                layout: { name: 'preset' }
            })

            leaf.value = cy.value.leaflet({
                container: document.getElementById('cy-leaflet'),
                latitude: 'lat',
                longitude: 'lng'
            })
            const map = leaf.value.map
            L.control.zoom().addTo(map)

            leaf.value.fit()
            gm.calculateFlow(cy.value)

            gm.setupEleClickListener(cy.value, selectedEle)
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
