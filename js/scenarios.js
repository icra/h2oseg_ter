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

    const deltaByMonth = Array.isArray(deltaTmit) ? deltaTmit.map(Number) : Array(12).fill(Number(deltaTmit))

    if (deltaByMonth.length !== 12 || deltaByMonth.some(v => !Number.isFinite(v))) {
        console.error("tmit i deltaTmit no tenen la mateixa llargada")
        return
    }

    cy.nodes().forEach(n => {
        if (n.data('tmit1') == null) return
        for (const i in tmit) {
            const newTmit = n.data(reftmit[i]) + Number(deltaByMonth[i])
            n.data(tmit[i], newTmit)
        }
    })
}

const modifyDemand = async function(cy, deltaUrbanDemand, types) {
    if (!cy) {
        console.error("cy not loaded")
        return
    }
    const reduction = (100 + Number(deltaUrbanDemand)) / 100
    const flow = Array(12).fill().map((e, i) => String('m' + (i + 1)))
    const refFlow = Array(12).fill().map((e, i) => String('refFlow' + (i + 1)))

    const refNode = cy.nodes()
        .filter(n => types.includes(n.data('type')))
        .first()

    if (refNode.nonempty() && refNode.data('refFlow1') === undefined) {
        console.log("refFlow created for ", types.toString())
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

const modifyForest = async function(cy, deltaForest){
    if (!cy) {
        console.error("cy not loaded")
        return
    }
    const change = (100 + Number(deltaForest)) / 100

    const forestKey = 'us_forestal'
    const dryKey = 'us_conreu_seca'
    const grassKey = 'us_prats'

    cy.nodes().forEach(n => {
        if (n.data(forestKey) == null) return

        let forest = Number(n.data(forestKey)) || 0
        let dry = Number(n.data(dryKey)) || 0
        let grass = Number(n.data(grassKey)) || 0

        // Guardem valors de referència la primera vegada
        if (n.data('ref_' + forestKey) == null) {
            n.data('ref_' + forestKey, forest)
            n.data('ref_' + dryKey, dry)
            n.data('ref_' + grassKey, grass)
        }

        // Treballem sempre sobre els valors de referència,
        // no sobre valors ja modificats per escenaris previs
        forest = Number(n.data('ref_' + forestKey)) || 0
        dry = Number(n.data('ref_' + dryKey)) || 0
        grass = Number(n.data('ref_' + grassKey)) || 0

        let newForest = forest
        let newDry = dry
        let newGrass = grass

        if (change > 1) {
            // Augment de bosc: convertim secà i prats a bosc
            const targetForest = forest * change
            const maxForest = forest + dry + grass

            newForest = Math.min(targetForest, maxForest)

            const addedForest = newForest - forest
            const available = dry + grass

            if (available > 0 && addedForest > 0) {
                const dryShare = dry / available
                const grassShare = grass / available

                newDry = dry - addedForest * dryShare
                newGrass = grass - addedForest * grassShare
            }

        } else if (change < 1) {
            // Reducció de bosc: convertim bosc a secà i prats
            newForest = Math.max(0, forest * change)

            const removedForest = forest - newForest
            const receiverTotal = dry + grass

            if (removedForest > 0) {
                if (receiverTotal > 0) {
                    const dryShare = dry / receiverTotal
                    const grassShare = grass / receiverTotal

                    newDry = dry + removedForest * dryShare
                    newGrass = grass + removedForest * grassShare
                } else {
                    // Si no hi havia ni secà ni prats, repartim 50/50
                    newDry = dry + removedForest * 0.5
                    newGrass = grass + removedForest * 0.5
                }
            }
        }

        // Evitar petits errors numèrics
        newForest = Math.max(0, newForest)
        newDry = Math.max(0, newDry)
        newGrass = Math.max(0, newGrass)

        // Com que només redistribuïm entre aquests tres usos,
        // la suma total dels usos del node es manté constant.
        n.data(forestKey, newForest)
        n.data(dryKey, newDry)
        n.data(grassKey, newGrass)
    })
}



export default {
    rainReduction,
    temperatureIncrease,
    modifyDemand,
    modifyForest
}