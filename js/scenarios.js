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
        if (n.data('ppt1') === undefined) return
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
        if (n.data('tmit1') === undefined) return
        for (const i in tmit) {
            const newTmit = n.data(reftmit[i]) + Number(deltaTmit)
            n.data(tmit[i], newTmit)
        }
    })
}

export default {
    rainReduction,
    temperatureIncrease
}