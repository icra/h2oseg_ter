library(tidyverse)
use('janitor', 'clean_names')
library(meteocat)
library(sf)
library(tidymodels)
library(gstat)
library(tmap)
library(terra)
tmap_mode("view")
set.seed(2)

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

# Linear model ------------------------------------------------------------------------

mod <- lm(m01 ~ z + slope + aspect + dist_sea + cos_lat, data = neu_features)

if (interactive()) {
  summary(mod)
}

prediccio <- predict(mod)

prediccio[prediccio < 0] <- 0

if (interactive()) {
  sqrt(mean((prediccio - neu_features$m01)^2))
}


# random forest ------------------------------------------------------------------------

cat("Ajustant random forest...\n")

train_test <- initial_split(neu_features, prop = 4 / 5, strata = "m01")
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

recepta <- recipe(
  m01 ~ z + slope + aspect + dist_sea + cos_lat,
  data = train
) |>
  step_scale(all_predictors())

flux <- workflow() |>
  add_model(rand_for_mod) |>
  add_recipe(recepta)

folds <- folds <- vfold_cv(train, v = 10, strata = "m01")

res <- flux |>
  tune_grid(
    resamples = folds,
    grid = rand_for_grid
  )

if (interactive()) {
  collect_metrics(res) |>
    filter(.metric == "rmse") |>
    arrange(mean)
}

best <- select_best(res, metric = "rmse")

final_wf <- flux |>
  finalize_workflow(best)

final_fit <- final_wf |>
  last_fit(train_test)

if (interactive()) {
  final_fit |> collect_metrics()
}

final_model <- final_wf |>
  fit(neu_features)

prediction <- final_model |>
  predict(neu_features) |>
  bind_cols(neu_features) |>
  mutate(residuals = .pred - m01)

if (interactive()) {
  prediction |>
    summarize(rmse = sqrt(mean(residuals^2)))
}

# Fit the variogram on the residuals ---------------------------------------------

cat("Ajustant el variograma...\n")

stopifnot(nrow(neu_features) == length(prediction$residuals))

neu_features$residuals <- prediction$residuals

vario <- variogram(residuals ~ 1, data = neu_features)
sill_est <- max(vario$gamma) # 7–8
nugget_est <- min(vario$gamma) # 1–2 potser?
range_est <- median(vario$dist)
vgm_init <- vgm(
  model = "Sph",
  psill = sill_est,
  range = range_est,
  nugget = nugget_est # nugget > 0
)
fitted_vario <- fit.variogram(vario, vgm_init)
if (interactive()) {
  plot(vario, fitted_vario)
}

# Prediction ---------------------------------------------------------

cat("Fent kriging...\n")

template <- "C:/Users/jpueyo/Documents/git_icra/agrifutures/inst/template_raster.tif"
if (!file.exists(template)) {
  template <- "~/cartocat/template_raster.tif"
}

grid <- create_grid_sf(template)

grid_features <- calculate_features(grid, mde, slope, aspect, coastline) |>
  st_as_sf()

rf_pred <- final_model |>
  predict(grid_features)

kr_pred <- krige(
  residuals ~ 1,
  neu_features,
  newdata = grid_features,
  model = fitted_vario,
  debug.level = 4,
  beta = 0
)

write_rds(kr_pred, "data_raw/kr_pred_m01.rds")

cat("Resultat del kriging per gener guardats")

kr_pred <- read_rds("data_raw/kr_pred_m01.rds")

kr_rf <- kr_pred$var1.pred + rf_pred$.pred
kr_rf[kr_rf < 0] <- 0

gruixos <- rasterize_grid(grid, "kr_rf", template, kr_rf)
stars::write_stars(gruixos, "data_raw/gruixos_neu.tif")
