source("R/model_neu.R")
library(furrr)
plan('multisession', workers = 12)
set.seed(2)


months <- colnames(xema_neu) |> keep(\(x) str_starts(x, "m"))

# gruixos <- months |>
#   future_map(\(m) {
#     cat("Ajustant", m, "...\n")
#     rf <- fit_random_forest(m, neu_features, grid_features)
#     fit_kriging(rf$xema_residuals, neu_features, grid_features)
#   },
#   .options = furrr_options(
#     seed = 2
#   )
# )

# write_rds(gruixos, "data_raw/gruixos_kriging.rds")

months |>
  future_map(
    \(m) {
      tibble(!!m := fit_random_forest(m, neu_features, grid_features)$grid_pred)
    },
    .options = furrr_options(seed = 2)
  ) |>
  list_cbind() |>
  write_rds("data_raw/gruixos_rf.rds")
