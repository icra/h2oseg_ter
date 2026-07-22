// noinspection JSVoidFunctionReturnValueUsed

import gm from './graph_methods.js'
import int from './interface.js'
import scen from './scenarios.js'
import mes from './messagesi18n.js'

const {createApp, onMounted, ref, shallowRef, watch, nextTick} = Vue
const { createI18n } = VueI18n;

const i18n = createI18n({
    legacy: false,
    locale: 'ca',
    fallbackLocale: 'ca',
    messages: mes
});

const t = i18n.global.t.bind(i18n.global)

const TT_OPTS = {direction: 'auto', sticky: true, opacity: 0.95, className: 'cytt', offset: [10, 0], pane: 'tipPane'}

const waitForPaint = async function () {
    await nextTick()
    await new Promise(resolve => requestAnimationFrame(resolve))
    await new Promise(resolve => requestAnimationFrame(resolve))
}

const fmt = (v, result = 'string', returnUnit = true, convert = 'auto') => {

    v = Number(v)

    if (!Number.isFinite(+v)) return '-'

    let unit = 'm³/s'
    let d = 2

    if (convert === 'always' || (convert === 'auto' && Math.abs(v) < 0.1)) {
        unit = 'l/s'
        v = v * 1000
        d = 0
    }

    if (result === 'object') return {v: v, d: d, u: unit}

    if (!returnUnit) {
        unit = ''
    }

    return v.toFixed(d) + (returnUnit ? ' ' + unit : '')
}

const fmtConstant = function(v, v0) {
    // mirem quines unitats torna amb la mitjana anual
    let convert = fmt(v0, 'object').u === 'l/s' ? 'always' : 'never'
    if (v0 < 0) v = v * -1
    return fmt(v, 'string', false, convert)
}

const safeRatio = function(num, den) {
    const p = Math.abs(Number(num) / Number(den))
    return Number.isFinite(p) ? p.toPrecision(1) : '-'
}

const fmtHm3 = v => Number.isFinite(+v) ? (+v).toFixed(1) + ' Hm³' : '—'

const Hm3ToM3 = function (m3s) {
    const s = 365 * 24 * 3600
    return (+m3s * s / 1000000).toFixed(1)
}

const urbanDemandTypes = ['ATL', 'ETAP']
const agriDemandTypes = ['Comunitat de regants']

// HTML dels tooltips
function nodeTooltipHTML(n, month, k) {
    return `
        <div>
          <div><strong>${n.data('name') ?? n.data('id') ?? ''}</strong></div>
          <div>${t('tt.type')}: ${n.data('type') ?? '—'}</div>
          <div>${t('tt.incomeFlow')}: ${fmt(n.data('inflow' + k))}</div>
          <div>${n.data('m' + month) >= 0 ? t('tt.contribution') : t('tt.extraction')}: ${fmt(n.data('m' + month))}</div>
          <div>${t('tt.outflow')}: ${Number(n.data('m'+ month)  || 0) === 0 ? fmt(n.data('inflow' + k)) : fmt(n.data('outflow' + k))}</div>
          ${month === '0' ? '<div>' + t('tt.volume') + ': ' + Hm3ToM3(n.data('m' + month)) + ' Hm<sup>3</sup></div>' : ''}
        </div>
  `
}

function edgeTooltipHTML(e, month, k) {
    return `
    <div>
      <div><strong>${e.data('nomComu') ?? ''}</strong></div>
      <div>${e.data('codiMassa')}</div>
      <div>${t('tt.meanFlow')}: ${fmt(e.data('flow' + k))}</div>
      <div>${t('tt.envFlow')}: ${fmt(e.data('envFlow' + month))}</div>
      <div>${t('tt.length')}: ${+e.data('lengthRiver').toFixed(0)} km</div>
    </div>
  `
}

function embTooltipHTML(k) {
    return `
    <div>
        <div><strong>${t('tt.system')} Sau-Susqueda-Pasteral</strong></div>
        <div>${t('tt.systemVolume')}: ${fmtHm3(gm.RESERVOIR.storage_hm3[k === 0 ? nYears.value * 12 : k])}</div>
        <div>${t('tt.meanIncomeFlow')}: ${fmt(gm.RESERVOIR.inflowSum_m3s[k])}</div>
        <div>${t('tt.meanReleasedFlow')}: ${fmt(gm.RESERVOIR.released_m3s[k])}</div>
    </div>
    `
}

function canalsTooltipHTML(n, c, month) {
    return `
    <div>
        <div><strong>${c.nom}</strong></div>
        <div>${t('tt.meanFlow')}: ${fmt(Math.abs(n.data('m' + month)))}</div>
    </div>
    `
}

const reset = function () {
    window.confirm(`${t('resetConfirmation')}`) && window.location.reload()
}

async function loadCalibResults() {
    const res = await fetch("/assets/calibration_results.json");
    if (!res.ok) throw new Error(`Cannot load calibration results: ${res.status}`);
    return await res.json();
}

createApp({
    setup() {
        const cy = ref(null)
        const leaf = shallowRef(null)
        const loading = ref(true)
        const selectedEle = ref(null)
        const flowModified = ref(null)
        const flowModifiedByMonth = ref(null)
        const customRelease = ref({})
        const calculatingLoading = ref('loading.calculatingFlows')
        const localeLabels = {
            ca: 'Català',
            es: 'Español',
            en: 'English'
        }
        const errorMsg = ref(null)
        const month = ref('0')
        const baseMonths = [
            {value: '1', label: "months.1"},
            {value: '2', label: "months.2"},
            {value: '3', label: "months.3"},
            {value: '4', label: "months.4"},
            {value: '5', label: "months.5"},
            {value: '6', label: "months.6"},
            {value: '7', label: "months.7"},
            {value: '8', label: "months.8"},
            {value: '9', label: "months.9"},
            {value: '10', label: "months.10"},
            {value: '11', label: "months.11"},
            {value: '12', label: "months.12"},
        ]
        const monthSelector = Vue.computed(() => {
            const months = Array.from({ length: 12 }, (_, i) => ({
                value: String(i + 1),
                label: t(`months.${i + 1}`)
            }))

            return nYears.value === 1
                ? [{ value: '0', label: t('months.0') }, ...months]
                : months
        })
        const nYears = ref(1)
        const nYearsDraft = ref(1)
        const simYear = ref('1')
        const volumEmb = ref(400)
        const yearSelector = Vue.computed(() => {
            const N = Math.max(1, Math.min(10, Number(nYears.value) || 1))
            const options = Array.from({length: N}, (_, i) => ({
                value: String(i+1),
                label: `${t('year')} ${i+1}`
            }))
            options.push({value: '0', label: t('time.total')})
            return options
        })
        const yearsDirty = Vue.computed(() => {
            const d = Math.max(1, Math.min(10, Number(nYearsDraft.value) || 1))
            const a = Math.max(1, Math.min(10, Number(nYears.value) || 1))
            return d !== a
        })
        const initialVolumeInvalid = Vue.computed(() => {
            const v = Number(volumEmb.value)
            return volumEmb.value === null
                || volumEmb.value === ''
                || !Number.isFinite(v)
                || v > 400
                || v < 0
        })
        const selK = Vue.computed(() => {
            return Number(simYear.value) === 0 ? 0 : (simYear.value - 1) * 12 + Number(month.value)
        })
        const applyTimeInputs = function () {
            const newN = Math.max(1, Math.min(10, Number(nYearsDraft.value) || 1))
            nYears.value = newN
            nYearsDraft.value = newN
            if (newN > 1 && month.value === '0') month.value = '1'

            if (newN > 1){
                simYear.value = '0'
            } else {
                simYear.value = '1'
                month.value = '0'
            }
        }
        const loadingYear = ref(1)
        const params = shallowRef(null)
        const editMode = ref('annual')
        const annualVolume = ref(null)
        const selectedEditDirtyMode = ref(null)
        const selectedFormSnapshot = ref(null)
        const markAnnualDirty = function () {
            selectedEditDirtyMode.value = 'annual'
        }
        const markMonthlyDirty = function () {
            selectedEditDirtyMode.value = 'monthly'
        }
        const sameNumber = function (a, b, decimals = 6) {
            const na = Number(a)
            const nb = Number(b)
            if (!Number.isFinite(na) || !Number.isFinite(nb)) return false
            return Math.abs(na - nb) < Math.pow(10, -decimals)
        }
        const monthlyValuesChanged = function (values, snapshot) {
            if (!values || !snapshot) return false
            return Array.from({ length: 12 }, (_, i) => String(i + 1))
                .some(m => !sameNumber(values[m], snapshot[m], 6))
        }
        const selectedInputsChanged = function () {
            const snap = selectedFormSnapshot.value
            if (!selectedEle.value || !snap || snap.id !== selectedEle.value.id) return selectedEditDirtyMode.value !== null
            if (selectedEditDirtyMode.value !== null) return true
            if (editMode.value === 'annual') return !sameNumber(annualVolume.value, snap.annualVolume, 6)
            const values = selectedEle.value.id === 'DESEMBASSAT' ? customRelease.value : flowModifiedByMonth.value
            return monthlyValuesChanged(values, snap.monthlyValues)
        }
        const updateSelectedFormSnapshot = function (val) {
            if (!val?.id) {
                selectedFormSnapshot.value = null
                return
            }
            const values = val.id === 'DESEMBASSAT' ? customRelease.value : flowModifiedByMonth.value
            selectedFormSnapshot.value = {
                id: val.id,
                annualVolume: annualVolume.value,
                monthlyValues: Object.fromEntries(
                    Array.from({ length: 12 }, (_, i) => {
                        const key = String(i + 1)
                        return [key, values?.[key]]
                    })
                )
            }
        }
        const openModalScenarios = ref(false)
        const openModalInfo = ref(false)
        const scenarios = ref({
            rainReduction: {
                name: 'modalScenarios.rainModification',
                value: '100',
                units: "%",
                description: 'modalScenarios.rainDescription',
                active: false,
                monthly: false,
                monthlyValue: Array(12).fill(100)
            },
            temperatureIncrease: {
                name: "modalScenarios.tempModification",
                value: '0',
                units: "ºC",
                description: "modalScenarios.tempDescription",
                active: false,
                monthly: false,
                monthlyValue: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
            },
            urbanDemand: {
                name: "modalScenarios.urbanModification",
                value: '100',
                units: "%",
                description: "modalScenarios.urbanDescription",
                active: false
            },
            agriDemand: {
                name: "modalScenarios.agriDemandModification",
                value: '100',
                units: "%",
                description: 'modalScenarios.agriDescription',
                active: false
            },
            forestSurface: {
                name: "modalScenarios.forestSurfaceModification",
                value: '100',
                units: "%",
                description: "modalScenarios.forestDescription",
                active: false
            }
        })
        const pptMean = ref({
            annual: 0,
            monthly: Array(12).fill(0)
        })
        const tmitMean = ref({
            annual: 0,
            monthly: Array(12).fill(0)
        })
        const urbanDemandMean = ref(null)
        const agriDemandMean = ref(null)
        const forestSurface = ref(null)
        const tick = ref(0)
        const legendCollapsed = ref(true)
        const downloadData = function() {
            if (!cy.value) {
                console.error("Cytoscape no està inicialitzat");
                return;
            }

            const dades = {
                nodes: cy.value.nodes().map(node => ({
                    data: node.data(),
                    position: node.position()
                })),
                edges: cy.value.edges().map(edge => ({
                    data: edge.data()
                })),
                reservoir: gm.RESERVOIR
            };

            const jsonString = JSON.stringify(dades, null, 2);
            const blob = new Blob([jsonString], {type: "application/json"});
            const url = URL.createObjectURL(blob);

            const link = document.createElement("a");
            link.href = url;
            link.download = "h2oseg_ter.json";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            URL.revokeObjectURL(url);
        }
        const applySelectedMonthlyInputs = async function (ele) {
            if (ele.id === 'DESEMBASSAT') {
                errorMsg.value = null
                for (let mo = 1; mo <= 12; mo++) {
                    const v = Number(customRelease.value[mo])
                    if (!Number.isFinite(v)) {
                        errorMsg.value = `${t('errors.validNumber', {m: mo})}`
                        return false
                    }
                }
                for (const [key, value] of Object.entries(customRelease.value)) {
                    const dt_s = gm.monthSeconds(2025, Number(key))
                    gm.RESERVOIR.customRelease_m3s[key] = gm.hm3ToM3s(Number(value), dt_s)
                }
                annualVolume.value = Object.values(customRelease.value).reduce((sum, v) => sum + Number(v), 0)
                return true
            }

            const node = cy.value.getElementById(ele.id)
            if (!node?.isNode?.()) return true
            for (let mo = 1; mo <= 12; mo++) {
                const v = Number(flowModifiedByMonth.value?.[String(mo)])
                if (!Number.isFinite(v)) {
                    errorMsg.value = `${t('errors.validNumber', {m: mo})}`
                    return false
                }
            }
            for (let mo = 1; mo <= 12; mo++) {
                const key = String(mo)
                const v = Number(flowModifiedByMonth.value[key])
                node.data('m' + key, v)
                ele['m' + key] = v
            }
            ele.m0 = Array.from({ length: 12 }, (_, i) => Number(ele['m' + (i + 1)]) || 0)
                .reduce((sum, v) => sum + v, 0) / 12
            return true
        }
        const applySelectedAnnualInputs = async function (ele) {
            if (annualVolume.value === '' || isNaN(annualVolume.value) || annualVolume.value === null) {
                errorMsg.value = t('errors.validVolume')
                annualVolume.value = ele.id === 'DESEMBASSAT' ? Math.round(gm.RESERVOIR.releasedVol_hm3.total / nYears.value) : Hm3ToM3(ele.m0)
                return false
            }

            const target = annualVolume.value * 1000000 / (24 * 365 * 3600)
            errorMsg.value = null

            const months = Array(12).fill().map((e, i) => String(i + 1))
            let newVals

            if (ele.id === 'DESEMBASSAT') {
                const currentAnnualHm3 = Number(gm.RESERVOIR.releasedVol_hm3.total) / nYears.value || 0

                if (currentAnnualHm3 <= 1e-6) {
                    newVals = months.map(() => target)
                } else {
                    const k = Number(annualVolume.value) / currentAnnualHm3;

                    newVals = months.map(m => {
                        const q = Number(gm.RESERVOIR.released_m3s[m]) || 0
                        return q * k
                    })
                }

                gm.RESERVOIR.customRelease_m3s = {}
                months.forEach((m, idx) => {
                    gm.RESERVOIR.customRelease_m3s[m] = Number(Number(newVals[idx]).toFixed(2))
                })
                return true
            }

            const node = cy.value.getElementById(ele.id)
            if (!node?.isNode?.()) return true
            const currentMean = months
                .map(m => Number(node.data('m' + m)) || 0)
                .reduce((sum, v) => sum + v, 0) / months.length

            if (Math.abs(currentMean) < 1e-6) {
                newVals = months.map(() => target)
            } else {
                const k = target / currentMean
                newVals = months.map(m => (Number(node.data('m' + m)) || 0) * k)
            }

            months.forEach((m, idx) => {
                const v = Number(Number(newVals[idx]).toFixed(2))
                flowModifiedByMonth.value[m] = v
                node.data('m' + m, v)
                ele['m' + m] = v
            })
            ele.m0 = newVals.reduce((sum, v) => sum + Number(v || 0), 0) / newVals.length
            return true
        }
        const applySelectedElementInputs = async function () {
            const editableSelection = selectedEle.value?.id === 'DESEMBASSAT' || selectedEle.value?.eleType === 'punt'
            if (!editableSelection || !selectedInputsChanged()) {
                return true
            }
            if (editMode.value === 'annual') {
                return applySelectedAnnualInputs(selectedEle.value)
            }
            return applySelectedMonthlyInputs(selectedEle.value)
        }
        const applyScenarioInputs = async function () {

            if (scenarios.value.rainReduction.active === false) {
                const hadAnnualChange = scenarios.value.rainReduction.value !== '100'
                const hadMonthlyChange = scenarios.value.rainReduction.monthlyValue
                    .some(v => Number(v) !== 100)

                if (hadAnnualChange || hadMonthlyChange) {
                    scenarios.value.rainReduction.value = '100'
                    scenarios.value.rainReduction.monthlyValue = Array(12).fill(100)
                    await scen.rainReduction(cy.value, 100)
                }

            } else if (scenarios.value.rainReduction.monthly === true) {
                const hadAnnualChange = scenarios.value.rainReduction.value !== '100'

                if (hadAnnualChange) {
                    scenarios.value.rainReduction.value = '100'
                }

                await scen.rainReduction(
                    cy.value,
                    scenarios.value.rainReduction.monthlyValue
                )

            } else {
                const hadMonthlyChange = scenarios.value.rainReduction.monthlyValue
                    .some(v => Number(v) !== 100)

                if (hadMonthlyChange) {
                    scenarios.value.rainReduction.monthlyValue = Array(12).fill(100)
                }

                await scen.rainReduction(
                    cy.value,
                    scenarios.value.rainReduction.value
                )
            }

            // TEMPERATURA: anual, mensual o desactivada. Només s'aplica una vegada.
            if (scenarios.value.temperatureIncrease.active === false) {
                const hadAnnualChange = scenarios.value.temperatureIncrease.value !== '0'
                const hadMonthlyChange = scenarios.value.temperatureIncrease.monthlyValue
                    .some(v => Number(v) !== 0)

                if (hadAnnualChange || hadMonthlyChange) {
                    scenarios.value.temperatureIncrease.value = '0'
                    scenarios.value.temperatureIncrease.monthlyValue = Array(12).fill(0)
                    await scen.temperatureIncrease(cy.value, 0)
                }

            } else if (scenarios.value.temperatureIncrease.monthly === true) {
                const hadAnnualChange = scenarios.value.temperatureIncrease.value !== '0'

                if (hadAnnualChange) {
                    scenarios.value.temperatureIncrease.value = '0'
                }

                await scen.temperatureIncrease(
                    cy.value,
                    scenarios.value.temperatureIncrease.monthlyValue
                )

            } else {
                const hadMonthlyChange = scenarios.value.temperatureIncrease.monthlyValue
                    .some(v => Number(v) !== 0)

                if (hadMonthlyChange) {
                    scenarios.value.temperatureIncrease.monthlyValue = Array(12).fill(0)
                }

                await scen.temperatureIncrease(
                    cy.value,
                    scenarios.value.temperatureIncrease.value
                )
            }

            if (scenarios.value.urbanDemand.active === false && scenarios.value.urbanDemand.value !== '100') {
                scenarios.value.urbanDemand.value = '100'
                await scen.modifyDemand(cy.value, scenarios.value.urbanDemand.value, urbanDemandTypes)
            } else if (scenarios.value.urbanDemand.active) {
                await scen.modifyDemand(cy.value, scenarios.value.urbanDemand.value, urbanDemandTypes)
            }

            if (scenarios.value.agriDemand.active === false && scenarios.value.agriDemand.value !== '100') {
                scenarios.value.agriDemand.value = '100'
                await scen.modifyDemand(cy.value, scenarios.value.agriDemand.value, agriDemandTypes)
            } else if (scenarios.value.agriDemand.active) {
                await scen.modifyDemand(cy.value, scenarios.value.agriDemand.value, agriDemandTypes)
            }

            if (scenarios.value.forestSurface.active === false && scenarios.value.forestSurface.value !== '100') {
                scenarios.value.forestSurface.value = '100'
                await scen.modifyForest(cy.value, scenarios.value.forestSurface.value)
            } else if (scenarios.value.forestSurface.active) {
                await scen.modifyForest(cy.value, scenarios.value.forestSurface.value)
            }
        }
        const refreshSelectedElement = function () {
            if (!selectedEle.value?.id || !cy.value) return
            const eleType = selectedEle.value.eleType
            const ele = cy.value.getElementById(selectedEle.value.id)
            if (!ele?.nonempty?.()) return
            selectedEle.value = ele.data()
            selectedEle.value.eleType = eleType
            calcSelectedEleVolumes(selectedEle.value)
        }
        const applySidebarChanges = async function () {
            openModalScenarios.value = false

            if (initialVolumeInvalid.value) {
                errorMsg.value = t('sb.validVol')
                return
            }

            try {
                applyTimeInputs()
                loadingYear.value = 1
                await nextTick()
                loading.value = true
                await waitForPaint()
                await applyScenarioInputs()
                gm.calculateContribution(cy.value, params.value)

                const reservoirAnnualChanged = selectedEle.value?.id === 'DESEMBASSAT'
                    && editMode.value === 'annual'
                    && selectedInputsChanged()
                const requestedReservoirAnnualVolume = reservoirAnnualChanged ? Number(annualVolume.value) : null

                if (reservoirAnnualChanged) {
                    if (annualVolume.value === '' || isNaN(annualVolume.value) || annualVolume.value === null) {
                        errorMsg.value = t('errors.validVolume')
                        annualVolume.value = Math.round(gm.RESERVOIR.releasedVol_hm3.total / nYears.value)
                        return
                    }
                    gm.RESERVOIR.customRelease_m3s = {}
                    calculatingLoading.value = 'loading.calculatingReservoir'
                    await gm.calculateFlow(cy.value, params.value, nYears.value, errorMsg, {}, loadingYear, volumEmb.value)
                    calculatingLoading.value = 'loading.calculatingFlows'
                    loadingYear.value = 1
                }

                const selectedApplied = await applySelectedElementInputs()
                if (!selectedApplied) return

                errorMsg.value = null
                await gm.calculateFlow(cy.value, params.value, nYears.value, errorMsg, {}, loadingYear, volumEmb.value)
                int.setGraphColors(selK.value, cy.value, { nodeLayerById, edgeLayerById, L, currentSel })

                tick.value++
                refreshSelectedElement()
                if (reservoirAnnualChanged && Number.isFinite(requestedReservoirAnnualVolume)) {
                    const actualAnnualVolume = Number(gm.RESERVOIR.releasedVol_hm3.total) / nYears.value
                    if (Math.abs(actualAnnualVolume - requestedReservoirAnnualVolume) > 0.5) {
                        annualVolume.value = requestedReservoirAnnualVolume
                        errorMsg.value = t('errors.reservoirVolumeLimited', {
                            actual: actualAnnualVolume.toFixed(0)
                        })
                    }
                }
                selectedEditDirtyMode.value = null
            } finally {
                calculatingLoading.value = 'loading.calculatingFlows'
                loading.value = false
            }
        }
        const closeModalScenarios = function () {
            openModalScenarios.value = false
        }

        const currentSel = {id: null, kind: null} // kind: 'node' | 'edge'

        const edgeLayerById = new Map()
        const nodeLayerById = new Map()

        const calcSelectedEleVolumes = function(val){
            selectedEditDirtyMode.value = null
            if (val && val.id === 'DESEMBASSAT') {
                annualVolume.value = Number(gm.RESERVOIR.releasedVol_hm3.total / nYears.value).toFixed(0);
                monthSelector.value.forEach(m => {
                    if (m.value === '0') return
                    const raw = gm.RESERVOIR.releasedVol_hm3[m.value]
                    const num = Number.isFinite(+raw) ? Number(raw) : 0
                    customRelease.value[m.value] = Number(num.toFixed(0))
                })
            }
            else if (val && val.eleType === 'punt') {
                const init = {}
                monthSelector.value.forEach(m => {
                    const raw = val['m' + m.value]
                    const num = Number.isFinite(+raw) ? Number(raw) : 0
                    init[m.value] = Number(num.toFixed(2))
                })
                flowModifiedByMonth.value = init

                const rawAnnual = Hm3ToM3(val['m0'])
                const annualNum = Number.isFinite(+rawAnnual) ? Number(rawAnnual) : 0
                annualVolume.value = Number(annualNum)
            } else {
                flowModifiedByMonth.value = {}
                annualVolume.value = null
            }
            updateSelectedFormSnapshot(val)
        }

        onMounted(async () => {
            loading.value = true
            try {
                const [nodesResp, edgesResp, embResp, canalsResp] = await Promise.all([
                    fetch('assets/nodes.geojson'),
                    fetch('assets/edges.geojson'),
                    fetch('assets/sau_susqueda.geojson'),
                    fetch('assets/canals.geojson'),
                ])
                const nodesGeo = await nodesResp.json()
                const edgesGeo = await edgesResp.json()
                const embGeo = await embResp.json()
                const canalsGeo = await canalsResp.json()

                const calibResults = await loadCalibResults();
                params.value = gm.buildCalibratedParams(gm.params, calibResults);

                const cyNodes = nodesGeo.features.map(n => {
                    const nodeData = Object.keys(n.properties).reduce((acc, key) => {
                        acc[key] = n.properties[key];
                        return acc;
                    }, {});
                    nodeData.lat = n.geometry.coordinates[1];
                    nodeData.lng = n.geometry.coordinates[0];

                    return {
                        data: nodeData
                    }
                })

                const cyEdges = edgesGeo.features.map(e => {
                    const edgeData = Object.keys(e.properties).reduce((acc, key) => {
                        acc[key] = e.properties[key];
                        return acc;
                    }, {});
                    edgeData.source = e.properties.from;
                    edgeData.target = e.properties.to;

                    return {
                        data: edgeData
                    }
                })

                const virtualEdges = [
                    {data: {id: 'v_82_res', source: 'NODE_82', target: 'DESEMBASSAT', virtual: true}},
                    {data: {id: 'v_33_res', source: 'NODE_33', target: 'DESEMBASSAT', virtual: true}},
                    {data: {id: 'v_34_res', source: 'NODE_34', target: 'DESEMBASSAT', virtual: true}},
                    {data: {id: 'v_84_res', source: 'NODE_84', target: 'DESEMBASSAT', virtual: true}},
                ]

                cy.value = cytoscape({
                    container: document.getElementById('cy'),
                    elements: [...cyNodes, ...cyEdges, ...virtualEdges],
                    style: [
                        {
                            selector: 'node',
                            style: {
                                'opacity': 0,
                                'events': 'no',
                                'grabbable': false
                            }
                        },
                        {
                            selector: 'edge',
                            style: {
                                opacity: 0,
                                events: 'no'
                            }
                        }
                    ],
                    layout: {name: 'preset'}
                })

                cy.value.userPanningEnabled(false)
                cy.value.userZoomingEnabled(false)
                cy.value.boxSelectionEnabled(false)
                cy.value.autoungrabify(true);

                cy.value.style()
                    .selector('edge[virtual = "true"]')
                    .style({'opacity': 0, 'events': 'no'})
                    .update();

                leaf.value = cy.value.leaflet({
                    container: document.getElementById('cy-leaflet'),
                    latitude: 'lat',
                    longitude: 'lng',
                })

                function highlightOnLeaflet(id, kind) {
                    // reseteja estil
                    currentSel.id = id
                    currentSel.kind = kind

                    edgeLayerById.forEach(l => l.setStyle(edgeNormalStyle))
                    nodeLayerById.forEach((layer, id) => {
                        const n = cy.value.getElementById(id)
                        const color = int.getNodeDisplayColor(n, selK.value)
                        layer.setIcon(int.nodeIcon(L, n.data('type'), color, false))
                    })

                    // aplica ressaltat
                    if (kind === 'edge') {
                        const l = edgeLayerById.get(id)
                        if (l) l.setStyle(edgeHiStyle)
                    } else {
                        const l = nodeLayerById.get(id)
                        const n = cy.value.getElementById(id)

                        if (l && n.nonempty()) {
                            const color = int.getNodeDisplayColor(n, selK.value)
                            l.setIcon(int.nodeIcon(L, n.data('type'), color, true))
                        }
                    }
                }

                function selectById(id, kind) {
                    const ele = cy.value.getElementById(id)
                    if (ele.nonempty()) {
                        // 1) Reutilitza la teva lògica existent
                        ele.trigger('tap')     // això ja actualitza sidebar, classes, etc.

                        // 2) Reflecteix a Leaflet (resaltat visual)
                        highlightOnLeaflet(id, kind)
                    }
                }

                const map = leaf.value.map

                L.control.zoom().addTo(map)

                // Crear un control personalitzat
                const homeControl = L.Control.extend({
                    options: {position: 'topleft'},

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
                        container.title = t('map.resetView');

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

                const edgePane = map.createPane('edgePane')
                edgePane.style.zIndex = 650
                edgePane.style.pointerEvents = 'auto'

                const nodePane = map.createPane('nodePane')
                nodePane.style.zIndex = 900   // per SOBRE dels edges
                nodePane.style.pointerEvents = 'auto'

                const embPane = map.createPane('embPane')
                embPane.style.zIndex = 800
                embPane.style.pointerEvents = 'auto'

                const canalsPane = map.createPane('canalsPane')
                canalsPane.style.zIndex = 500
                canalsPane.style.pointerEvents = 'auto'

                // pane per a tooltips per SOBRE dels nodes
                const tipPane = map.createPane('tipPane')
                tipPane.style.zIndex = 1000
                tipPane.style.pointerEvents = 'none' // no bloquejar clics

                const edgeNormalStyle = {weight: 3, opacity: 1}
                const edgeHiStyle = {weight: 5, opacity: 1.0}

                map.on('click', () => {
                    selectedEle.value = null;
                    currentSel.id = null;
                    currentSel.kind = null;

                    cy.value.elements().removeClass('selected');

                    edgeLayerById.forEach(l => l.setStyle(edgeNormalStyle));
                    nodeLayerById.forEach((layer, id) => {
                        const n = cy.value.getElementById(id)
                        const color = int.getNodeDisplayColor(n, selK.value)

                        layer.setIcon(
                            int.nodeIcon(L, n.data('type'), color, false)
                        )
                    })
                })

                const addNodeLayer = function (n) {
                    const ll = [n.data('lat'), n.data('lng')]
                    const color = int.getNodeDisplayColor(n, selK.value)
                    const layer = L.marker(ll, {
                        pane: 'nodePane',
                        icon: int.nodeIcon(L, n.data('type'), color, false)
                    }).bindTooltip('', TT_OPTS)
                    layer.on('click', (e) => {
                        L.DomEvent.stopPropagation(e)
                        selectById(n.id(), 'node')
                    })
                    layer.on('mouseover', () => {
                        layer.closeTooltip()
                        const cn = cy.value.getElementById(n.id())
                        const html = nodeTooltipHTML(cn, month.value, selK.value)
                        const tt = layer.getTooltip()
                        if (tt) tt.setContent(html)
                        const color = int.getNodeDisplayColor(n, selK.value)
                        layer.setIcon(int.nodeIcon(L, cn.data('type'), color, true))
                        layer.openTooltip()
                    });
                    layer.on('mouseout', () => {
                        layer.closeTooltip()
                        const cn = cy.value.getElementById(n.id())
                        const color = int.getNodeDisplayColor(cn, selK.value)

                        if (currentSel.id === n.id() && currentSel.kind === 'node') {
                            layer.setIcon(int.nodeIcon(L, cn.data('type'), color, true))
                        } else {
                            layer.setIcon(int.nodeIcon(L, cn.data('type'), color, false))
                        }
                    })
                    layer.addTo(map)
                    nodeLayerById.set(n.id(), layer)
                }

                cy.value.nodes()
                    // .filter(n => !gm.isHeadwaterNode(n))
                    .filter(n => n.id() !== 'DESEMBASSAT')
                    .forEach(addNodeLayer)

                const arcsLayer = L.geoJSON(edgesGeo, {
                    pane: 'edgePane',
                    style: f => edgeNormalStyle,
                    onEachFeature: (f, layer) => {
                        const eid = String(f.properties.id)
                        edgeLayerById.set(eid, layer)
                        layer.bindTooltip('', TT_OPTS)

                        layer.on('click', (e) => {
                            L.DomEvent.stopPropagation(e)
                            selectById(eid, 'edge')
                        })
                        layer.on('mouseover', () => {
                            layer.closeTooltip()
                            const ce = cy.value.getElementById(eid)
                            const html = edgeTooltipHTML(ce, month.value, selK.value)
                            const tt = layer.getTooltip()
                            if (tt) tt.setContent(html)
                            layer.openTooltip()
                            layer.setStyle(edgeHiStyle)
                        })
                        layer.on('mouseout', () => {
                            if (currentSel.id === eid && currentSel.kind === 'edge') {
                                layer.setStyle(edgeHiStyle)
                            } else {
                                layer.setStyle(edgeNormalStyle)
                            }
                        })
                    }
                }).addTo(map)

                const embLayer = L.geoJSON(embGeo, {
                    pane: 'embPane',
                    style: () => ({
                        color: '#0074D9',
                        weight: 1,
                        fillColor: '#0074D9',
                        fillOpacity: 1
                    }),
                    onEachFeature: (feature, layer) => {
                        // assegura interacció i tooltip
                        layer.options.interactive = true;
                        layer.bindTooltip('', TT_OPTS);

                        layer.on({
                            mouseover: (e) => {
                                const l = e.target;
                                const tt = l.getTooltip();
                                if (tt) tt.setContent(embTooltipHTML(selK.value)); // passa la feature si ho necessites
                                l.openTooltip();
                            },
                            mouseout: (e) => e.target.closeTooltip()
                        });
                        layer.on('click', (e) => {
                            L.DomEvent.stopPropagation(e)
                            selectById('DESEMBASSAT', 'node')
                        })
                    }
                }).addTo(map);

                const canalsLayer = L.geoJSON(canalsGeo, {
                    pane: 'canalsPane',
                    style: () => ({color: '#a5a5a5', weight: 2, opacity: 1}),
                    onEachFeature: (feature, layer) => {
                        // assegura interacció i tooltip
                        layer.options.interactive = true;
                        layer.bindTooltip('', TT_OPTS);

                        layer.on({
                            mouseover: (e) => {
                                const l = e.target;
                                const c = e.target.feature.properties;
                                const n = cy.value.getElementById(c.codi_sad)
                                const tt = l.getTooltip();
                                if (tt) tt.setContent(canalsTooltipHTML(n, c, month.value)); // passa la feature si ho necessites
                                l.openTooltip();
                            },
                            mouseout: (e) => e.target.closeTooltip()
                        });
                    }
                }).addTo(map);

                pptMean.value.annual = gm.calculateMeanCy(cy.value, 'ppt', 'sum')
                pptMean.value.monthly = gm.calculateMonthlyMeanCy(cy.value, 'ppt')
                tmitMean.value.annual = gm.calculateMeanCy(cy.value, 'tmit', 'mean')
                tmitMean.value.monthly = gm.calculateMonthlyMeanCy(cy.value, 'tmit')

                urbanDemandMean.value = gm.calculateDemand(cy.value, urbanDemandTypes)
                agriDemandMean.value = gm.calculateDemand(cy.value, agriDemandTypes)
                forestSurface.value = gm.calculateSurface(cy.value, 'us_forestal')

                await gm.initSimulation(nYears.value, volumEmb.value)
                await gm.calculateContribution(cy.value, params.value)
                await gm.calculateFlow(cy.value, params.value, nYears.value, errorMsg, {period: {year: 2025, month: 8}}, loadingYear, volumEmb.value); // mesos de l'1 al 12
                int.setGraphColors(selK.value, cy.value, {nodeLayerById, edgeLayerById,  L, currentSel});
                int.setupEleClickListener(cy.value, selectedEle)
            } catch (e) {
                console.error(e);
            } finally {
                loading.value = false;
            }
        })

        // Quan es selecciona un node, posa-hi el valor actual com a valor per defecte
        watch(selectedEle, (val) => {
            calcSelectedEleVolumes(val)
        }, {immediate: true});

        watch(simYear, (year) => {
            if (Number(year) === 0) {
                month.value = '0'
            } else if (nYears.value > 1 && month.value === '0') {
                month.value = '1'
            }
        });

        watch(selK, (k) => {
            int.setGraphColors(k, cy.value, {nodeLayerById, edgeLayerById, L, currentSel})
        });

        const reservoirView = Vue.computed(() => {
            tick.value
            return gm.RESERVOIR
        })

        return {
            cy,
            leaf,
            selectedEle,
            flowModified,
            flowModifiedByMonth,
            customRelease,
            localeLabels,
            applySidebarChanges,
            editMode,
            annualVolume,
            reservoir: reservoirView,
            errorMsg,
            calculatingLoading,
            reset,
            month,
            baseMonths,
            monthSelector,
            nYears,
            nYearsDraft,
            yearsDirty,
            initialVolumeInvalid,
            yearSelector,
            simYear,
            loadingYear,
            selK,
            loading,
            fmt,
            fmtConstant,
            safeRatio,
            openModalScenarios,
            closeModalScenarios,
            openModalInfo,
            scenarios,
            markAnnualDirty,
            markMonthlyDirty,
            pptMean,
            tmitMean,
            urbanDemandMean,
            agriDemandMean,
            forestSurface,
            Hm3ToM3,
            rampPalette: int.rampPalette,
            volumEmb,
            tick,
            legendCollapsed,
            downloadData,
            nodeTypeSymbols: int.nodeTypeSymbols,
            nodeSVG: int.nodeSymbolSVG,
            accumulateUpstream: gm.accumulateUpstream,
            m3sToHm3: gm.m3sToHm3,
            monthSeconds: gm.monthSeconds,
            monthOfStep: gm.monthOfStep,
        }
    }
})
    .use(i18n)
    .mount('#app')
