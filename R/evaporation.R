library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(meteocat)
library(tmap)
tmap_mode('view')
use('assertr', c('verify', 'not_na'))
library(solrad)

xema <- download_stations()

est_sau <- xema |>
  filter(str_detect(nom, "Sau"))

est_sau |>
  unnest_wider(estats)
pull(estats)

codes <- download_code_variables("diaris")

# E = (m * Rn + y * 6.43 * (1 + 0.536 * U2) * de) / (gamma * (m + y))
# Rn: radiància neta (MJ/m2/dia) -> radiació extraterrestre + hores de sol segons Allen et al 1998

est <- "XO"
any <- '2024'

tmit <- download_daily_year('1000', est, any)

rad_global <- download_daily_year('1400', est, any)

tmx <- download_daily_year('1001', est, any)
tmn <- download_daily_year('1002', est, any)

HR <- download_daily_year('1100', est, any)

e_s <- 0.6108 * exp((17.27 * tmit$valor) / (tmit$valor + 237.3))
e_a <- e_s * (HR$valor / 100)

lat_rad <- xema |>
  filter(id_station == est) |>
  st_transform(4326) |>
  st_coordinates() |>
  as_tibble() |>
  mutate(y_rad = Y * pi / 180) |>
  pull(y_rad)

Rn <- Rn_FAO(
  rad_global$valor,
  tmx$valor,
  tmn$valor,
  e_a,
  lat_rad,
  1:nrow(rad_global),
  500
)


u10 <- download_daily_year('1503', est, any)

u2 <- tibble(
  data = seq.Date("2024-01-01", "2024-12-31")
) |>
  left_join(u10, by = "data") |>
  fill(valor) |>
  verify(not_na(valor))

P_atm <- 101.3 * ((293 - 0.0065 * 500) / 293)^5.26
const_psico <- 0.665 * 1e-3 * P_atm

pendent <- (4098 * 0.6108 * exp((17.27 * tmit$valor) / (tmit$valor + 237.3))) /
  ((tmit$valor + 237.3)^2)

E0 <- ((pendent *
  Rn +
  const_psico * 6.43 * (1 + 0.536 * u2$valor) * (e_s - e_a)) /
  (2.45 * (pendent + const_psico)))

# ETP -------------------------------------------------------------------

library(jsonlite)

etp <- read_json(
  "calibration/dades_h2oseg_ter_calibrades.json",
  simplifyVector = T
) |>
  pluck('nodes') |>
  pluck('data') |>
  as_tibble() |>
  filter(id == 'DESEMBASSAT') |>
  select(starts_with('ETP')) |>
  as_vector()
