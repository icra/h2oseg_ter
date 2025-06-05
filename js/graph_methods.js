export function setupNodeClickListener(cy, selectedNodeRef) {
    cy.on('tap', 'node', (evt) => {
        const node = evt.target
        console.log('node', node)
        selectedNodeRef.value = node.data()
    })
}
