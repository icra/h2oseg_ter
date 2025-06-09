const setupEleClickListener = function(cy, selectedEleRef) {
    cy.on('tap', 'node, edge', (evt) => {
        const ele = evt.target

        cy.elements().removeClass('selected')
        ele.addClass('selected')

        selectedEleRef.value = ele.data()
        selectedEleRef.value.eleType = ele.isNode() ? 'punt' : 'tram'
        console.log("Selected element: ", selectedEleRef.value)
    })
}

const countPredecessors = function(cy) {
    cy.nodes().forEach(node => {
        let predecessors = node.predecessors('node')
        let count = predecessors.length
        node.data('predecessorsCount', count)
        node.data('label', count)
    })
}

const calculateFlow = function(cy, errorRef = null){
    cy.nodes().forEach(function(node, i, nodes){
        let predecessors = node.predecessors('node')
        let sumFlow = 0;
        predecessors.forEach(pre => {
            let flowChange = parseFloat(pre.data('flowChange')) || 0
            sumFlow += flowChange;
        })
        // if ((node.data('flowChange') + sumFlow) < 0){
        //     console.error(`el Node ${node.id()} genera un cabal negatiu, flowChange = ${node.data('flowChange')} i flow = ${sumFlow}`)
        //     if (errorRef) {
        //         errorRef.value = `El cabal que arriba és ${sumFlow)}, no pots extreure ${node.data('flowChange')}, és més cabal del que arriba`
        //         return errorRef
        //     }
        // }
        node.data('flowIncome', sumFlow)
        let flowOutcome = sumFlow + node.data('flowChange')
        node.data('flowOutcome', flowOutcome)
        node.outgoers('edge').forEach((edge) => {
            edge.data('flow', flowOutcome)
            if (edge.data('flowNeed') > flowOutcome) edge.style('line-color', 'red')
            if(edge.data('flowNeed') <= flowOutcome) edge.style('line-color', '#1a9ed8')
        })
    })
}

function modifyFlowChange(cy, selectedEle, flowModified, errorMsg) {
    if (!selectedEle || !selectedEle.id) return;

    const node = cy.getElementById(selectedEle.id);
    if (!node || !node.isNode()) return;

    // Temporàriament posem el valor
    const previousValue = node.data('flowChange');
    node.data('flowChange', flowModified.value);

    // Torna a calcular
    calculateFlow(cy, errorMsg);

    // Si s’ha generat error, tornem enrere i no modifiquem l’input
    if (errorMsg.value) {
        node.data('flowChange', previousValue); // revertim
        flowModified.value = null
        calculateFlow(cy)
        return;
    }

    // Si tot correcte, actualitzem label
    node.data('label', `${node.id()} (${flowModified.value})`);
    selectedEle.flowChange = flowModified.value;
    selectedEle.flow = node.data('flow');
    flowModified.value = null;
}


export default {
    setupEleClickListener,
    calculateFlow,
    modifyFlowChange,
    countPredecessors
}
