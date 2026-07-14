// benchmark_browser.mjs
//
// Benchmark end-to-end de l'app H2OSEG Ter en un navegador Chromium real.
// No cal modificar index.html ni app.js.
//
// Requisits:
//   npm install -D playwright
//   npx playwright install chromium
//
// Cal servir l'app per HTTP, per exemple:
//   python -m http.server 8000
//
// Ús:
//   node benchmark_browser.mjs --url http://localhost:8000 --years 1
//   node benchmark_browser.mjs --url http://localhost:8000 --years 1,5,10 --runs 5 --warmup 1
//   node benchmark_browser.mjs --url http://localhost:8000 --years 1,5,10 --runs 5 --json benchmark_results.json
//
// Per defecte reutilitza la mateixa pàgina entre repeticions, de manera semblant
// a un usuari que prem diverses vegades "Aplica". Amb --reload-each-run, recarrega
// l'app abans de cada repetició.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

function parseArgs(argv) {
    const options = {
        url: "http://localhost:8000",
        years: [1],
        runs: 5,
        warmup: 1,
        timeoutMs: 120_000,
        headed: false,
        reloadEachRun: false,
        json: null,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];

        switch (arg) {
            case "--url":
                options.url = next;
                i++;
                break;
            case "--years":
                options.years = next.split(",").map(Number);
                i++;
                break;
            case "--runs":
                options.runs = Number(next);
                i++;
                break;
            case "--warmup":
                options.warmup = Number(next);
                i++;
                break;
            case "--timeout":
                options.timeoutMs = Number(next);
                i++;
                break;
            case "--json":
                options.json = next;
                i++;
                break;
            case "--headed":
                options.headed = true;
                break;
            case "--reload-each-run":
                options.reloadEachRun = true;
                break;
            case "--help":
            case "-h":
                printHelp();
                process.exit(0);
            default:
                if (arg.startsWith("--")) {
                    throw new Error(`Argument desconegut: ${arg}`);
                }
        }
    }

    if (!options.years.length ||
        options.years.some(y => !Number.isInteger(y) || y < 1)) {
        throw new Error("--years ha de ser una llista d'enters positius, per exemple 1,5,10");
    }

    if (!Number.isInteger(options.runs) || options.runs < 1) {
        throw new Error("--runs ha de ser un enter positiu");
    }

    if (!Number.isInteger(options.warmup) || options.warmup < 0) {
        throw new Error("--warmup ha de ser un enter igual o superior a 0");
    }

    return options;
}

function printHelp() {
    console.log(`
Benchmark end-to-end de l'app en Chromium.

Opcions:
  --url <url>              URL de l'app. Per defecte: http://localhost:8000
  --years <llista>         Anys separats per comes. Per defecte: 1
  --runs <n>               Repeticions mesurades. Per defecte: 5
  --warmup <n>             Repeticions d'escalfament. Per defecte: 1
  --timeout <ms>           Temps màxim per execució. Per defecte: 120000
  --headed                  Mostra la finestra del navegador
  --reload-each-run        Recarrega l'app abans de cada repetició
  --json <fitxer>          Desa els resultats complets en JSON
  -h, --help               Mostra aquesta ajuda

Exemple:
  node benchmark_browser.mjs \
    --url http://localhost:8000 \
    --years 1,5,10 \
    --runs 5 \
    --warmup 1 \
    --headed
`);
}

function percentile(sorted, p) {
    if (!sorted.length) return null;
    const index = (sorted.length - 1) * p;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);

    if (lower === upper) return sorted[lower];

    const fraction = index - lower;
    return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function summarize(times, years) {
    const sorted = [...times].sort((a, b) => a - b);
    const mean = times.reduce((sum, value) => sum + value, 0) / times.length;
    const variance = times.reduce(
        (sum, value) => sum + (value - mean) ** 2,
        0
    ) / times.length;

    return {
        years,
        months: years * 12,
        runs: times.length,
        meanMs: mean,
        medianMs: percentile(sorted, 0.5),
        p95Ms: percentile(sorted, 0.95),
        minMs: sorted[0],
        maxMs: sorted.at(-1),
        sdMs: Math.sqrt(variance),
        rawTimesMs: times,
    };
}

function formatRow(result) {
    return {
        anys: result.years,
        mesos: result.months,
        repeticions: result.runs,
        mitjana_s: (result.meanMs / 1000).toFixed(3),
        mediana_s: (result.medianMs / 1000).toFixed(3),
        p95_s: (result.p95Ms / 1000).toFixed(3),
        minim_s: (result.minMs / 1000).toFixed(3),
        maxim_s: (result.maxMs / 1000).toFixed(3),
    };
}

async function waitUntilAppReady(page, timeoutMs) {
    await page.goto(page._benchmarkUrl, {
        waitUntil: "networkidle",
        timeout: timeoutMs,
    });

    await page.locator("#nYears").waitFor({
        state: "visible",
        timeout: timeoutMs,
    });

    await page.locator("#cy-leaflet").waitFor({
        state: "attached",
        timeout: timeoutMs,
    });

    // Dona temps perquè acabin la inicialització de Cytoscape/Leaflet i
    // la primera renderització de Vue.
    await page.waitForTimeout(500);
}

async function runApply(page, years, timeoutMs) {
    const yearsInput = page.locator("#nYears");
    const applyButton = page.locator(
        ".time-row-secondary button.btn-primary"
    );

    await yearsInput.fill(String(years));

    // Mesura des de just abans del click fins que:
    // 1. l'overlay ha aparegut, i
    // 2. ha desaparegut,
    // 3. s'han completat dos frames de renderització.
    const start = await page.evaluate(() => performance.now());

    await applyButton.click();

    const overlay = page.locator(".loading-overlay");

    // Si el càlcul és molt ràpid, l'overlay podria aparèixer i desaparèixer
    // abans que Playwright el detecti. En aquesta app normalment dura prou,
    // però fem una espera curta tolerant.
    try {
        await overlay.waitFor({
            state: "visible",
            timeout: Math.min(3000, timeoutMs),
        });
    } catch {
        // Continuem i esperem simplement que no sigui visible.
    }

    await overlay.waitFor({
        state: "hidden",
        timeout: timeoutMs,
    });

    // Espera dos frames perquè Vue, Cytoscape i Leaflet acabin de pintar.
    const elapsed = await page.evaluate(async startTime => {
        await new Promise(resolve =>
            requestAnimationFrame(() =>
                requestAnimationFrame(resolve)
            )
        );

        return performance.now() - startTime;
    }, start);

    return elapsed;
}

async function main() {
    const options = parseArgs(process.argv.slice(2));

    const browser = await chromium.launch({
        headless: !options.headed,
    });

    const context = await browser.newContext({
        viewport: { width: 1440, height: 1000 },
        deviceScaleFactor: 1,
    });

    const page = await context.newPage();
    page._benchmarkUrl = options.url;

    page.on("console", message => {
        if (message.type() === "error") {
            console.error(`[browser console] ${message.text()}`);
        }
    });

    page.on("pageerror", error => {
        console.error(`[browser error] ${error.message}`);
    });

    const userAgent = await page.evaluate(() => navigator.userAgent);
    const results = [];

    try {
        await waitUntilAppReady(page, options.timeoutMs);

        console.log(`URL: ${options.url}`);
        console.log(`Navegador: ${userAgent}`);
        console.log(`Anys: ${options.years.join(", ")}`);
        console.log(
            `Repeticions: ${options.runs}; escalfament: ${options.warmup}`
        );
        console.log(
            `Recarregar cada repetició: ${options.reloadEachRun ? "sí" : "no"}\n`
        );

        for (const years of options.years) {
            process.stdout.write(
                `${years} any(s): escalfament... `
            );

            for (let i = 0; i < options.warmup; i++) {
                if (options.reloadEachRun || i === 0) {
                    await waitUntilAppReady(page, options.timeoutMs);
                }

                await runApply(page, years, options.timeoutMs);
            }

            console.log("mesurant");

            const times = [];

            for (let run = 1; run <= options.runs; run++) {
                if (options.reloadEachRun) {
                    await waitUntilAppReady(page, options.timeoutMs);
                }

                const elapsed = await runApply(
                    page,
                    years,
                    options.timeoutMs
                );

                times.push(elapsed);

                console.log(
                    `  execució ${run}/${options.runs}: ` +
                    `${(elapsed / 1000).toFixed(3)} s`
                );
            }

            results.push(summarize(times, years));
        }

        console.log("");
        console.table(results.map(formatRow));

        if (options.json) {
            const outputPath = path.resolve(options.json);

            fs.writeFileSync(
                outputPath,
                JSON.stringify({
                    generatedAt: new Date().toISOString(),
                    options,
                    browserUserAgent: userAgent,
                    results,
                }, null, 2)
            );

            console.log(`Resultats desats a: ${outputPath}`);
        }
    } finally {
        await browser.close();
    }
}

main().catch(error => {
    console.error(error?.stack || error);
    process.exitCode = 1;
});
