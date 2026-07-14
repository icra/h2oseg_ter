BENCHMARK REAL DE L'APP H2OSEG TER
====================================

Aquest benchmark no reimplementa el model en Node. Obre l'app real en Chromium,
canvia el nombre d'anys, prem el botó "Aplica" i mesura fins que:

1. desapareix l'overlay de càrrega;
2. passen dos frames addicionals de renderització.

Per tant, inclou:
- model hidrològic;
- Vue;
- Cytoscape renderitzat;
- cytoscape-leaf i Leaflet;
- actualització de colors i interfície;
- renderització del navegador.

No cal modificar index.html ni app.js.

INSTAL·LACIÓ
------------

A la carpeta on guardis benchmark_browser.mjs:

    npm install -D playwright
    npx playwright install chromium

SERVIR L'APP
------------

Executa-ho des de l'arrel del projecte:

    python -m http.server 8000

L'app hauria d'obrir-se a:

    http://localhost:8000

EXECUCIÓ
--------

Un any:

    node benchmark_browser.mjs --url http://localhost:8000 --years 1

Diverses durades:

    node benchmark_browser.mjs --url http://localhost:8000 --years 1,5,10 --runs 5 --warmup 1

Veient el navegador:

    node benchmark_browser.mjs --url http://localhost:8000 --years 1 --headed

Desant JSON:

    node benchmark_browser.mjs --url http://localhost:8000 --years 1,5,10 --runs 5 --json benchmark_results.json

EXECUCIONS CALENTES I FREDES
----------------------------

Per defecte reutilitza la mateixa pàgina. Això representa un usuari que prem
"Aplica" repetidament i evita comptar la càrrega inicial de l'app.

Per recarregar completament abans de cada repetició:

    node benchmark_browser.mjs --url http://localhost:8000 --years 1 --reload-each-run

Aquesta segona opció també inclou l'efecte de reinicialitzar l'app, però el
cronòmetre continua començant just abans de prémer "Aplica"; la càrrega de la
pàgina no entra al temps mesurat.
