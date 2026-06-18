const messages = {
    ca: {
        modalScenarios: {
            title: "Configuració d'escenaris",
            rainModification: "Modificació de la pluja anual",
            rainDescription: "Aplica una modificació proporcional a la precipitació mitjana anual",
            initialValue: "valor inicial",
            watershedMean: "de mitjana a la conca",
            newValue: "Nou valor",
            change: "Canvi",
            tempModification: "Modificació de la temperatura mitjana anual",
            tempDescription: "Aplica una modificació uniforme a la temperatura mitjana anual",
            monthlyTemp: "Modificació de la temperatura mitjana mes a mes",
            urbanModification: "Modificació de la demanda urbana",
            urbanDescription: "Augmenta proporcionalment totes les captacions per a ús urbà",
            agriDemandModification: 'Modificació de la demanda agrícola',
            agriDescription: "Augmenta proporcionalment totes les captacions per a ús agrícola",
            forestSurfaceModification: 'Modificació de la superfície forestal',
            forestDescription: "Substitueix proporcionalment boscos per conreus de secà i prats i a la inversa",
            approxNewValue: 'Nou valor aproximat',
            hm3Annual: 'Hm³ anuals'
        },
        errors: {
            validNumber: "Introdueix un número vàlid al mes {m}",
            validVolume: "Introdueix un volum vàlid"
        },
        sb: {
            initialVol: "Volum inicial del sistema Sau-Susqueda",
            validVol: "El volum ha de ser entre 0 i 400 hm³",
            simYears: "Anys de simulació",
            pushApply: "Prem \"Aplica\" per calcular la simulació"
        },
        sel: {
            ssSystem: "Sistema Sau-Susqueda",
            node: "Punt de la xarxa",
            edge: "Tram de la xarxa",
            element: "Element de la xarxa",
            releasedFlow: "El cabal mitjà desembassat és ",
            resVol: "El volum a l'embassament és de ",
            moreInfo: "Més informació",
            modifyVol: "Modifica el volum desembassat",
            annualVol: "Volum anual (Hm³)",
            monthlyVol: "Volum mes a mes (Hm³)",
            currentVol: "Volum actual",
            newVol: "Nou volum",
            applyAll: "Aplica tots els canvis",
            nodeFlow: "En aquest punt de la xarxa arriben {inflow} i en surten {outflow}.",
            catchmentArea: "L'àrea de drenatge d'aquest punt aporta {contribution} de cabal.",
            wwtpOutflow: "L'efluent de l'EDAR aporta {flow} a la xarxa fluvial.",
            posFlow: "En aquest punt entren {flow} a la xarxa fluvial.",
            negFlow: "En aquest punt s'extreuen {flow} de la xarxa fluvial.",
            modifyFlow: "Modifica el cabal",
            monthlyFlow: "Cabal mes a mes (m³/s)",
            currentFlow: "Cabal actual",
            newFlow: "Nou cabal",
            edgeFlow: "En aquest tram de la xarxa fluvial hi circulen {flow} i té una llargada de {length} km.",
            envFlow: "El cabal mínim per garantir un bon estat ecològic són {envFlow}.",
            riverCode: "El tram correspon a la massa d'aigua {code}.",
            noSel: "Fes clic sobre un element per veure’n les dades.",
        },
        scen: {
            title: "Escenaris de simulació",
            monthly: "mensual",
            setup: "Configura"
        },
        reservoir: {
            title: "Informació del sistema Sau-Susqueda",
            final: "final",
            avgFlows: "Cabals mitjans del període simulat",
            inflow: "Entrant",
            outflow: "Sortint"
        },
        modalInfo: {
            informationOf: 'Informació del',
            section: 'tram',
            point: 'punt',
            sauSusquedaSystemInfo: 'Informació del sistema Sau-Susqueda',

            flow: 'Cabal',

            drainageArea: 'Àrea de drenatge',
            meanPrecipitation: 'Precipitació mitjana',
            meanTemperature: 'Temperatura mitjana',
            meanETP: 'ETP mitjana',
            meanET: 'ET mitjana',

            storedVolume: 'Volum embassat',

            inflowFlow: "Cabal d'entrada",
            releasedFlow: 'Cabal desembassat',

            inflowVolume: "Volum d'entrada",
            releasedVolume: 'Volum desembassat',

            contributedFlow: 'Cabal aportat',
            outgoingFlow: 'Cabal sortint',

            proportion: 'Proporció'
        },
        cancel: "Cancel·la",
        apply: "Aplica",
        applyChanges: "Aplica canvis",
        close: 'Tanca',
        month: 'Mes | mesos',
        year: 'Any',
        initialValues: "Valors d'inici",
        downloadData: "Descarrega dades",
        documentation: "Documentació",
        resetConfirmation: "Segur que vols reiniciar el model?",
        map: {
            legend: "Llegenda",
            pointType: "Tipus de punt",
            incompliment: "Incompliment cabal ambiental",
            state: "Estat",
            satisfiedFlow: "Compleix el cabal ambiental",
            notSatisfiedFlow: "No compleix el cabal ambiental",
            satisfiedDemand: "Demanda satisfeta",
            notSatisfiedDemand: "Demanda no satisfeta"

        },
        tt: {
            type: "Tipus",
            releasedFlow: "Cabal desembassat",
            yearTotal: "Total anual",
            incomeFlow: "Cabal entrant",
            contribution: "Contribució",
            extraction: "Extracció",
            volume: "Volum",
            meanFlow: "Cabal mitjà",
            envFlow: "Cabal ambiental",
            length: "Llargada del tram",
            system: "Sistema",
            systemVolume: "Volum al sistema",
            meanIncomeFlow: "Cabal mitjà d'entrada",
            meanReleasedFlow: "Cabal mitjà desembassat",
        },
        months: {
            0: "Total anual",
            1: "Gener",
            2: "Febrer",
            3: "Març",
            4: "Abril",
            5: "Maig",
            6: "Juny",
            7: "Juliol",
            8: "Agost",
            9: "Setembre",
            10: "Octubre",
            11: "Novembre",
            12: "Desembre"
        }

    },
    en: {
        resetConfirmation: "Are you sure to reset the model?",
        modalScenarios: {
            title: "Scenario setup",
            rainModification: "Annual rainfall modification",
            rainDescription: "Apply a proportional change to mean annual rainfall"
        },
        tt: {
            type: "Type",
        },
        sel: {
            nodeFlow: "Here it arrives {inflow} and leaves {outflow}."
        }
    }

}

export default messages