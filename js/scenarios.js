const rainReduction = async function (cy, deltaPpt) {
    if (!cy) {
        console.error("cy not loaded")
        return
    }
    const reduction = (100 + Number(deltaPpt)) / 100
    const ppt = Array(12).fill().map((e, i) => String('ppt' + (i + 1)))
    const refppt = Array(12).fill().map((e, i) => String('refppt' + (i + 1)))

    if (cy.getElementById('NODE_1').data('refppt1') === undefined) {
        console.log("refppt created")
        cy.nodes().forEach(n => {
            for (const i in refppt) {
                n.data(refppt[i], n.data(ppt[i]))
            }
        })
    }

    cy.nodes().forEach(n => {
        if (n.data('ppt1') == null) return
        for (const i in ppt) {
            const newRain = n.data(refppt[i]) * reduction
            n.data(ppt[i], newRain)
        }
    })
}
const temperatureIncrease = async function (cy, deltaTmit) {
    if (!cy) {
        console.error("cy not loaded")
        return
    }

    const tmit = Array(12).fill().map((e, i) => String('tmit' + (i + 1)))
    const reftmit = Array(12).fill().map((e, i) => String('reftmit' + (i + 1)))

    if (cy.getElementById('NODE_1').data('reftmit1') === undefined) {
        cy.nodes().forEach(n => {
            for (const i in reftmit) {
                n.data(reftmit[i], n.data(tmit[i]))
            }
        })
        console.log("reftmit created")
    }

    cy.nodes().forEach(n => {
        if (n.data('tmit1') == null) return
        for (const i in tmit) {
            const newTmit = n.data(reftmit[i]) + Number(deltaTmit)
            n.data(tmit[i], newTmit)
        }
    })
}

const urbanDemand = async function(cy, deltaUrbanDemand, types) {
    if (!cy) {
        console.error("cy not loaded")
        return
    }
    const reduction = (100 + Number(deltaUrbanDemand)) / 100
    const flow = Array(12).fill().map((e, i) => String('m' + (i + 1)))
    const refFlow = Array(12).fill().map((e, i) => String('refFlow' + (i + 1)))

    if (cy.getElementById('ATL').data('refFlow1') === undefined) {
        console.log("refFlow created")
        cy.nodes().forEach(n => {
            if (!types.includes(n.data('type'))) return
            for (const i in refFlow) {
                n.data(refFlow[i], n.data(flow[i]))
            }
        })
    }

    cy.nodes().forEach(n => {
        if (!types.includes(n.data('type'))) return
        for (const i in flow) {
            const newFlow = n.data(refFlow[i]) * reduction
            n.data(flow[i], newFlow)
        }
    })


}

export default {
    rainReduction,
    temperatureIncrease,
    urbanDemand
}