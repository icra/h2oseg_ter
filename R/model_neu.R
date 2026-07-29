library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(tidymodels)
library(gstat)
library(meteocat)


# Prepare data --------------------------------------------------

cat("Preparant les dades...\n")

neu <- download_var("GNEUMm", 2000:2020)

xema <- download_stations() |>
  select(id_station) |>
  distinct(id_station, geometry)

if ("ZE" %in% xema$id_station) {
  xema$id_station[xema$id_station == "ZE"] <- "Z8"
}

xema_neu <- neu |>
  full_join(xema, by = "id_station") |>
  mutate(across(m01:m12, \(x) replace_na(x, 0))) |>
  st_as_sf()

folder <- "C:/Users/jpueyo/Documents/git_icra/agrifutures/data"

if (!dir.exists(folder)) {
  folder <- "~/cartocat"
}

mde <- file.path(folder, "terrain/mde.tif")
slope <- file.path(folder, "terrain/slope.tif")
aspect <- file.path(folder, "terrain/aspect.tif")
coastline <- read_sf(file.path(
  folder,
  "area_estudi/Linia_costa_Lmunicipal 5k.shp"
))

xema_features <- calculate_features(xema_neu, mde, slope, aspect, coastline)

neu_features <- xema_features |>
  inner_join(xema_neu |> st_drop_geometry(), by = "id_station")

template <- "C:/Users/jpueyo/Documents/git_icra/agrifutures/inst/template_raster.tif"
if (!file.exists(template)) {
  template <- "~/cartocat/template_raster.tif"
}

grid <- create_grid_sf(template)

grid_features <- calculate_features(grid, mde, slope, aspect, coastline) |>
  st_as_sf()

# random forest ------------------------------------------------------------------------

fit_random_forest <- function(month, neu_features, grid_features) {
  cat("Ajustant random forest...", month, "\n")

  train_test <- initial_split(
    st_drop_geometry(neu_features),
    prop = 4 / 5,
    strata = month
  )
  train <- training(train_test)
  test <- testing(train_test)

  rand_for_mod <- rand_forest(
    mtry = tune(),
    trees = 500,
    min_n = tune()
  ) |>
    set_engine("ranger") |>
    set_mode("regression")

  rand_for_grid <- grid_regular(mtry(range = c(1, 4)), min_n(), levels = 5)

  formula <- paste0(month, " ~ ", "z + slope + aspect + dist_sea + cos_lat")
  recepta <- recipe(
    formula = as.formula(formula),
    data = train
  ) |>
    step_scale(all_predictors())

  flux <- workflow() |>
    add_model(rand_for_mod) |>
    add_recipe(recepta)

  folds <- folds <- vfold_cv(train, v = 10, strata = month)

  res <- flux |>
    tune_grid(
      resamples = folds,
      grid = rand_for_grid
    )

  best <- select_best(res, metric = "rmse")

  final_wf <- flux |>
    finalize_workflow(best)

  final_model <- final_wf |>
    fit(neu_features)

  xema_pred <- final_model |>
    predict(neu_features) |>
    bind_cols(neu_features) |>
    mutate(residuals = .pred - m01)

  grid_pred <- final_model |>
    predict(st_drop_geometry(grid_features))

  list(xema_residuals = xema_pred$residuals, grid_pred = grid_pred)
}


# Kriging on the residuals ---------------------------------------------

fit_kriging <- function(xema_residuals, neu_features, grid_features) {
  cat("Fent kriging...\n")
  stopifnot(nrow(neu_features) == length(xema_residuals))

  neu_features$residuals <- xema_residuals

  vario <- variogram(residuals ~ 1, data = neu_features)
  sill_est <- max(vario$gamma)
  nugget_est <- min(vario$gamma)
  range_est <- median(vario$dist)
  vgm_init <- vgm(
    model = "Sph",
    psill = sill_est,
    range = range_est,
    nugget = nugget_est
  )
  fitted_vario <- fit.variogram(vario, vgm_init)

  krige(
    residuals ~ 1,
    neu_features,
    newdata = grid_features,
    model = fitted_vario,
    debug.level = 0,
    beta = 0
  )$var1.pred
}

# Interpolate using RF and KR --------------------------------------------

interpola_gruixos <- function(rf_pred, kr_pred) {
  kr_rf <- kr_pred + rf_pred
  kr_rf[kr_rf < 0] <- 0
  kr_rf
}
