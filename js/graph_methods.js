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

const calculateFlow = function(cy, errorRef = null) {
    const visited = new Set();

    function dfs(node) {
        if (visited.has(node.id())) return;
        visited.add(node.id());

        // Processar fills primer
        const upNodes = node.predecessors('node');
        upNodes.forEach(upNode => dfs(upNode));

        // Ara calculem el flow per aquest node
        const predecessors = node.predecessors('node');
        let inflow = 0;

        predecessors.forEach(pre => {
            let flowChange =  parseFloat(pre.data('flowChange'))
            if(node.id() === '8') console.log(`Node ${node.id()} - Predecessor ${pre.id()} -  ${flowChange + pre.data('outflow') >= 0} - Flow Change: ${flowChange} - Outflow: ${pre.data('outflow')}`);
            if (flowChange + pre.data('outflow') >= 0) {
                if(node.id() === '3') console.log(`Node ${node.id()} Predecessor ${pre.id()} - Flow Change: ${pre.data('flowChange')} - Outflow: ${pre.data('outflow')}`);
                inflow += flowChange
            }
        });

        node.data('inflow', Math.max(0, inflow));

        const rawOutflow = inflow + node.data('flowChange');
        const outflow = Math.max(0, rawOutflow);
        node.data('outflow', outflow);
        node.style('background-color', rawOutflow < 0 ? 'red' : '#0074D9')
        // console.log(`Node ${node.id()} - Flow Income: ${inflow}, Flow Outcome: ${outflow}`);
        node.outgoers('edge').forEach(edge => {
            edge.data('flow', outflow);
            edge.style('line-color', edge.data('flowNeed') > outflow ? 'red' : '#1a9ed8');
        });
    }

    // Comença des de fulles → amunt
    const leaves = cy.nodes().filter(n => n.outgoers('edge').length === 0);
    console.log(leaves.length)
    leaves.forEach(leaf => dfs(leaf));

    if (errorRef) errorRef.value = null;
};


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
