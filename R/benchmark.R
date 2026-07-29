#!/usr/bin/env Rscript

# benchmark_selenium.R
#
# Benchmark end-to-end de l'app H2OSEG Ter amb R + Selenium/Chromium.
# No cal modificar index.html ni app.js.
#
# Instal·lació:
#   install.packages(c("RSelenium", "jsonlite"))
#
# Ús bàsic:
#   Rscript benchmark_selenium.R --url http://localhost:8000 --years 1
#
# Diverses durades:
#   Rscript benchmark_selenium.R \
#     --url http://localhost:8000 \
#     --years 1,5,10 \
#     --runs 5 \
#     --warmup 1
#
# Mostrar el navegador:
#   Rscript benchmark_selenium.R --years 1 --headed
#
# Exportar resultats:
#   Rscript benchmark_selenium.R \
#     --years 1,5,10 \
#     --json benchmark_results.json
#
# Per defecte, el script intenta iniciar ChromeDriver/Selenium mitjançant
# RSelenium::rsDriver(). Alternativament, pots connectar-lo a un servidor
# Selenium ja en marxa:
#
#   Rscript benchmark_selenium.R \
#     --remote \
#     --selenium-host localhost \
#     --selenium-port 4444 \
#     --years 1,5,10

suppressPackageStartupMessages({
  library(RSelenium)
  library(jsonlite)
})

`%||%` <- function(x, y) {
  if (is.null(x) || length(x) == 0L || is.na(x)) y else x
}

print_help <- function() {
  cat(
"Benchmark end-to-end de l'app H2OSEG Ter amb Selenium.

Opcions:
  --url <url>               URL de l'app.
                            Per defecte: http://localhost:8000
  --years <llista>          Anys separats per comes.
                            Per defecte: 1
  --runs <n>                Repeticions mesurades.
                            Per defecte: 5
  --warmup <n>              Repeticions d'escalfament.
                            Per defecte: 1
  --timeout <ms>            Temps màxim per execució.
                            Per defecte: 120000
  --headed                   Mostra la finestra de Chromium.
  --reload-each-run         Recarrega l'app abans de cada repetició.
  --json <fitxer>           Desa els resultats complets en JSON.
  --remote                   No inicia Selenium; connecta a un servidor existent.
  --selenium-host <host>    Host del servidor Selenium.
                            Per defecte: localhost
  --selenium-port <port>    Port del servidor Selenium.
                            Per defecte: 4444
  --driver-port <port>      Port usat per RSelenium::rsDriver().
                            Per defecte: 4567
  -h, --help                Mostra aquesta ajuda.

Exemple:
  Rscript benchmark_selenium.R \\
    --url http://localhost:8000 \\
    --years 1,5,10 \\
    --runs 5 \\
    --warmup 1 \\
    --headed
"
  )
}

parse_args <- function(args) {
  options <- list(
    url = "http://localhost:8000",
    years = 1L,
    runs = 5L,
    warmup = 1L,
    timeout_ms = 120000L,
    headed = FALSE,
    reload_each_run = FALSE,
    json = NULL,
    remote = FALSE,
    selenium_host = "localhost",
    selenium_port = 4444L,
    driver_port = 4567L
  )

  i <- 1L

  while (i <= length(args)) {
    arg <- args[[i]]

    require_value <- function(name) {
      if (i + 1L > length(args)) {
        stop(sprintf("Falta el valor de %s", name), call. = FALSE)
      }
      args[[i + 1L]]
    }

    if (arg %in% c("-h", "--help")) {
      print_help()
      quit(status = 0L)
    } else if (arg == "--url") {
      options$url <- require_value(arg)
      i <- i + 1L
    } else if (arg == "--years") {
      value <- require_value(arg)
      options$years <- as.integer(strsplit(value, ",", fixed = TRUE)[[1L]])
      i <- i + 1L
    } else if (arg == "--runs") {
      options$runs <- as.integer(require_value(arg))
      i <- i + 1L
    } else if (arg == "--warmup") {
      options$warmup <- as.integer(require_value(arg))
      i <- i + 1L
    } else if (arg == "--timeout") {
      options$timeout_ms <- as.integer(require_value(arg))
      i <- i + 1L
    } else if (arg == "--json") {
      options$json <- require_value(arg)
      i <- i + 1L
    } else if (arg == "--headed") {
      options$headed <- TRUE
    } else if (arg == "--reload-each-run") {
      options$reload_each_run <- TRUE
    } else if (arg == "--remote") {
      options$remote <- TRUE
    } else if (arg == "--selenium-host") {
      options$selenium_host <- require_value(arg)
      i <- i + 1L
    } else if (arg == "--selenium-port") {
      options$selenium_port <- as.integer(require_value(arg))
      i <- i + 1L
    } else if (arg == "--driver-port") {
      options$driver_port <- as.integer(require_value(arg))
      i <- i + 1L
    } else if (startsWith(arg, "--")) {
      stop(sprintf("Argument desconegut: %s", arg), call. = FALSE)
    }

    i <- i + 1L
  }

  if (
    length(options$years) == 0L ||
    anyNA(options$years) ||
    any(options$years < 1L)
  ) {
    stop(
      "--years ha de ser una llista d'enters positius, per exemple 1,5,10",
      call. = FALSE
    )
  }

  if (is.na(options$runs) || options$runs < 1L) {
    stop("--runs ha de ser un enter positiu", call. = FALSE)
  }

  if (is.na(options$warmup) || options$warmup < 0L) {
    stop("--warmup ha de ser un enter igual o superior a 0", call. = FALSE)
  }

  if (is.na(options$timeout_ms) || options$timeout_ms < 1L) {
    stop("--timeout ha de ser un enter positiu", call. = FALSE)
  }

  options
}

js_scalar <- function(result) {
  value <- result$value

  if (is.list(value) && length(value) == 1L) {
    value <- value[[1L]]
  }

  value
}

wait_until <- function(test, timeout_ms, poll_ms = 50L, message = "Timeout") {
  started <- Sys.time()

  repeat {
    result <- tryCatch(test(), error = function(e) FALSE)

    if (isTRUE(result)) {
      return(invisible(TRUE))
    }

    elapsed_ms <- as.numeric(
      difftime(Sys.time(), started, units = "secs")
    ) * 1000

    if (elapsed_ms >= timeout_ms) {
      stop(message, call. = FALSE)
    }

    Sys.sleep(poll_ms / 1000)
  }
}

element_exists <- function(rem_dr, selector) {
  result <- rem_dr$executeScript(
    "
    return document.querySelector(arguments[0]) !== null;
    ",
    args = list(selector)
  )

  isTRUE(js_scalar(result))
}

element_visible <- function(rem_dr, selector) {
  result <- rem_dr$executeScript(
    "
    const element = document.querySelector(arguments[0]);

    if (!element) return false;

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || 1) !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
    ",
    args = list(selector)
  )

  isTRUE(js_scalar(result))
}

wait_until_app_ready <- function(rem_dr, url, timeout_ms) {
  rem_dr$navigate(url)

  wait_until(
    function() {
      ready <- rem_dr$executeScript(
        "return document.readyState === 'complete';"
      )

      isTRUE(js_scalar(ready)) &&
        element_exists(rem_dr, "#nYears") &&
        element_visible(rem_dr, "#nYears") &&
        element_exists(rem_dr, "#cy-leaflet")
    },
    timeout_ms = timeout_ms,
    poll_ms = 100L,
    message = sprintf(
      "L'app no ha quedat preparada dins de %d ms: %s",
      timeout_ms,
      url
    )
  )

  # Temps addicional per completar la inicialització inicial de Vue,
  # Cytoscape, cytoscape-leaf i Leaflet.
  Sys.sleep(0.5)

  invisible(TRUE)
}

set_years <- function(rem_dr, years) {
  input <- rem_dr$findElement(using = "css selector", value = "#nYears")

  input$clickElement()
  input$clearElement()
  input$sendKeysToElement(list(as.character(years)))

  # Dispara explícitament els esdeveniments que Vue escolta amb v-model.
  rem_dr$executeScript(
    "
    const input = document.querySelector('#nYears');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    ",
    args = list()
  )

  invisible(TRUE)
}

click_apply <- function(rem_dr) {
  button <- rem_dr$findElement(
    using = "css selector",
    value = ".time-row-secondary button.btn-primary"
  )

  button$clickElement()
  invisible(TRUE)
}

wait_two_animation_frames <- function(rem_dr, start_ms) {
  result <- rem_dr$executeAsyncScript(
    "
    const startTime = arguments[0];
    const done = arguments[arguments.length - 1];

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        done(performance.now() - startTime);
      });
    });
    ",
    args = list(start_ms)
  )

  as.numeric(js_scalar(result))
}

run_apply <- function(rem_dr, years, timeout_ms) {
  set_years(rem_dr, years)

  start_result <- rem_dr$executeScript(
    "return performance.now();",
    args = list()
  )
  start_ms <- as.numeric(js_scalar(start_result))

  click_apply(rem_dr)

  # Espera tolerant que aparegui l'overlay. Si el càlcul fos molt ràpid,
  # podria aparèixer i desaparèixer abans que Selenium el detectés.
  visible_timeout <- min(3000L, timeout_ms)

  try(
    wait_until(
      function() element_visible(rem_dr, ".loading-overlay"),
      timeout_ms = visible_timeout,
      poll_ms = 20L,
      message = "L'overlay no ha arribat a ser visible"
    ),
    silent = TRUE
  )

  # Espera fins que l'overlay ja no existeixi o no sigui visible.
  wait_until(
    function() !element_visible(rem_dr, ".loading-overlay"),
    timeout_ms = timeout_ms,
    poll_ms = 20L,
    message = sprintf(
      "La simulació no ha acabat dins de %d ms",
      timeout_ms
    )
  )

  wait_two_animation_frames(rem_dr, start_ms)
}

summarize_times <- function(times_ms, years) {
  data.frame(
    years = as.integer(years),
    months = as.integer(years * 12L),
    runs = length(times_ms),
    mean_ms = mean(times_ms),
    median_ms = median(times_ms),
    p95_ms = as.numeric(
      stats::quantile(times_ms, probs = 0.95, names = FALSE, type = 7)
    ),
    min_ms = min(times_ms),
    max_ms = max(times_ms),
    sd_ms = stats::sd(times_ms),
    stringsAsFactors = FALSE
  )
}

format_summary <- function(summary_df) {
  data.frame(
    anys = summary_df$years,
    mesos = summary_df$months,
    repeticions = summary_df$runs,
    mitjana_s = sprintf("%.3f", summary_df$mean_ms / 1000),
    mediana_s = sprintf("%.3f", summary_df$median_ms / 1000),
    p95_s = sprintf("%.3f", summary_df$p95_ms / 1000),
    minim_s = sprintf("%.3f", summary_df$min_ms / 1000),
    maxim_s = sprintf("%.3f", summary_df$max_ms / 1000),
    stringsAsFactors = FALSE
  )
}

start_browser <- function(options) {
  chrome_args <- c(
    "--window-size=1440,1000",
    "--disable-dev-shm-usage",
    "--no-sandbox"
  )

  if (!options$headed) {
    chrome_args <- c(
      chrome_args,
      "--headless=new",
      "--disable-gpu"
    )
  }

  capabilities <- list(
    "goog:chromeOptions" = list(
      args = chrome_args
    )
  )

  if (options$remote) {
    rem_dr <- RSelenium::remoteDriver(
      remoteServerAddr = options$selenium_host,
      port = options$selenium_port,
      browserName = "chrome",
      extraCapabilities = capabilities
    )

    rem_dr$open(silent = TRUE)

    return(list(
      client = rem_dr,
      server = NULL,
      managed = FALSE
    ))
  }

  driver <- RSelenium::rsDriver(
    browser = "chrome",
    port = options$driver_port,
    verbose = FALSE,
    extraCapabilities = capabilities
  )

  list(
    client = driver$client,
    server = driver$server,
    managed = TRUE
  )
}

close_browser <- function(browser) {
  try(browser$client$close(), silent = TRUE)

  if (isTRUE(browser$managed) && !is.null(browser$server)) {
    try(browser$server$stop(), silent = TRUE)
  }

  invisible(TRUE)
}

main <- function() {
  options <- parse_args(commandArgs(trailingOnly = TRUE))
  browser <- start_browser(options)
  on.exit(close_browser(browser), add = TRUE)

  rem_dr <- browser$client

  rem_dr$setTimeout(
    type = "script",
    milliseconds = options$timeout_ms
  )

  rem_dr$setTimeout(
    type = "page load",
    milliseconds = options$timeout_ms
  )

  wait_until_app_ready(
    rem_dr = rem_dr,
    url = options$url,
    timeout_ms = options$timeout_ms
  )

  user_agent_result <- rem_dr$executeScript(
    "return navigator.userAgent;",
    args = list()
  )
  user_agent <- as.character(js_scalar(user_agent_result))

  cat(sprintf("URL: %s\n", options$url))
  cat(sprintf("Navegador: %s\n", user_agent))
  cat(sprintf("Anys: %s\n", paste(options$years, collapse = ", ")))
  cat(sprintf(
    "Repeticions: %d; escalfament: %d\n",
    options$runs,
    options$warmup
  ))
  cat(sprintf(
    "Recarregar cada repetició: %s\n\n",
    if (options$reload_each_run) "sí" else "no"
  ))

  summaries <- list()
  raw_results <- list()

  for (years in options$years) {
    cat(sprintf("%d any(s): escalfament... ", years))
    flush.console()

    if (options$warmup > 0L) {
      for (i in seq_len(options$warmup)) {
        if (options$reload_each_run || i == 1L) {
          wait_until_app_ready(
            rem_dr,
            options$url,
            options$timeout_ms
          )
        }

        invisible(run_apply(
          rem_dr,
          years,
          options$timeout_ms
        ))
      }
    }

    cat("mesurant\n")

    times_ms <- numeric(options$runs)

    for (run in seq_len(options$runs)) {
      if (options$reload_each_run) {
        wait_until_app_ready(
          rem_dr,
          options$url,
          options$timeout_ms
        )
      }

      elapsed_ms <- run_apply(
        rem_dr,
        years,
        options$timeout_ms
      )

      times_ms[[run]] <- elapsed_ms

      cat(sprintf(
        "  execució %d/%d: %.3f s\n",
        run,
        options$runs,
        elapsed_ms / 1000
      ))
      flush.console()
    }

    summaries[[as.character(years)]] <- summarize_times(
      times_ms,
      years
    )

    raw_results[[as.character(years)]] <- list(
      years = years,
      months = years * 12L,
      times_ms = unname(times_ms)
    )
  }

  summary_df <- do.call(rbind, summaries)
  rownames(summary_df) <- NULL

  cat("\n")
  print(format_summary(summary_df), row.names = FALSE)

  if (!is.null(options$json)) {
    output_path <- normalizePath(
      options$json,
      winslash = "/",
      mustWork = FALSE
    )

    payload <- list(
      generated_at = format(
        Sys.time(),
        "%Y-%m-%dT%H:%M:%S%z"
      ),
      options = options,
      browser_user_agent = user_agent,
      summary = summary_df,
      results = raw_results
    )

    jsonlite::write_json(
      payload,
      path = output_path,
      pretty = TRUE,
      auto_unbox = TRUE,
      digits = NA
    )

    cat(sprintf("\nResultats desats a: %s\n", output_path))
  }

  invisible(summary_df)
}

tryCatch(
  main(),
  error = function(error) {
    message("Error: ", conditionMessage(error))
    quit(status = 1L)
  }
)
