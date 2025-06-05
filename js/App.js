import { setupNodeClickListener } from './graph_methods.js'

const { createApp, onMounted, ref } = Vue

createApp({
    setup() {
        const cy = ref(null)
        const leaf = ref(null)
        const selectedNode = ref(null)

        onMounted(async () => {
            const response = await fetch('assets/test.json')
            const network = await response.json()

            cy.value = cytoscape({
                container: document.getElementById('cy'),
                elements: network,
                style: [
                    {
                        selector: 'node',
                        style: {
                            'background-color': '#0074D9',
                            label: 'data(id)',
                            color: '#fff',
                            'text-valign': 'center',
                            'text-halign': 'center',
                            'font-size': '10px'
                        }
                    },
                    {
                        selector: 'edge',
                        style: {
                            width: 2,
                            'line-color': '#999'
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

            setupNodeClickListener(cy.value, selectedNode)
        })

        return {
            cy,
            leaf,
            selectedNode
        }
    }
}).mount('#app')
