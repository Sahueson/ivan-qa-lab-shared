# api-cases: fuente única de los casos de API y rendimiento

`spec.js` define los 57 casos TC-A01..I06 (suites a-auth ... i-normas, los mismos dominios que Playwright).
Desde ahí se generan los ficheros de **qa-newman** (colección Postman), **qa-bruno** (.bru), **qa-karate** (.feature)
y **qa-jmeter** (plan.jmx + cases.json con los 16 casos de carga y sus umbrales de p95).

    # desde la carpeta que contiene los repos qa-*; ANON_FILE = fichero con la clave publicable (anon) del staging
    ANON_FILE=anon.txt node ivan-qa-lab-shared/api-cases/gen-all.js "$PWD"
    ANON_FILE=anon.txt node ivan-qa-lab-shared/api-cases/gen-jmeter.js "$PWD/qa-jmeter"

La clave anon del staging es pública (viaja en el bundle del demo). Para añadir un caso se edita `spec.js` y se regenera.
Los `check` (empty, nonEmpty, blocked, eachEq, hasValue, hasSquads...) se traducen a chai (Newman y Bruno) y a
`features/helpers/check.js` (Karate).
