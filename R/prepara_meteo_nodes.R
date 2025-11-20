source('R/helpers.R')
library(tidyverse)
use('janitor', 'clean_names')
library(terra)
library(sf)


conques <- read_sf("data_raw/subconques_v10.gpkg")

nodes <- read_sf("data_raw/nodes_natural_antropic.gpkg")

codis_nodes <- nodes |>
  filter(type == 'massa' | type == 'comporta') |>
  pull(codi_sad)

stopifnot(all(conques$codi_sad %in% codis_nodes))
stopifnot(all(codis_nodes %in% conques$codi_sad))

conques$area_m2 <- st_area(conques) |> as.numeric()

# Usos del sòl ----------------------------------------------------------------------------

usos_file <- "data_raw/usos_sol.rds"

if (!file.exists(usos_file)) {
  download.file(
    "https://github.com/jospueyo/tmap_workshop_siglibre_2025/raw/refs/heads/main/data/usos_suelo.rds",
    "data_raw/usos_sol.rds"
  )
  download.file(
    "https://github.com/jospueyo/tmap_workshop_siglibre_2025/raw/refs/heads/main/data/tesaurus_usos.rds",
    "data_raw/tesaurus_usos.rds"
  )
}

usos <- rast(usos_file)
tesaurus_usos <- read_rds("data_raw/tesaurus_usos.rds")

class_usos <- tribble(
  ~from , ~to , ~value , ~description        ,
      1 ,   3 ,      1 , "us_aigua"          ,
      4 ,   7 ,      2 , "us_urba"           ,
      8 ,   8 ,      3 , "us_conreu_seca"    ,
      9 ,   9 ,      4 , "us_conreu_regadiu" ,
     10 ,  10 ,      3 , "us_conreu_seca"    ,
     11 ,  11 ,      4 , "us_conreu_regadiu" ,
     12 ,  12 ,      3 , "us_conreu_seca"    ,
     13 ,  13 ,      5 , "us_prats"          ,
     14 ,  14 ,      6 , "us_forestal"       ,
     15 ,  16 ,      5 , "us_prats"          ,
     17 ,  19 ,      6 , "us_forestal"       ,
     20 ,  23 ,      5 , "us_prats"          ,
     24 ,  25 ,      4 , "us_conreu_regadiu"
)

mat_class <- class_usos[, 1:3] |> as.matrix()

usos_rcl <- classify(usos, mat_class, right = NA)

usos_conques <- freq(usos_rcl, zones = vect(conques), touches = FALSE)

zone_id <- tibble(
  zone = 1:85,
  codi_sad = vect(conques)$codi_sad
)

usos_conques <- usos_conques |>
  as_tibble() |>
  mutate(area_m2 = count * 30 * 30) |>
  left_join(class_usos, by = "value", multiple = "any") |>
  left_join(zone_id, by = "zone") |>
  select(codi_sad, us = description, area_m2) |>
  pivot_wider(names_from = us, values_from = area_m2) |>
  clean_names()

conques <- conques |>
  left_join(usos_conques, by = "codi_sad") |>
  mutate(across(everything(), \(x) replace_na(x, 0))) |>
  mutate(across(starts_with("us_"), \(x) pmin(x, area_m2)))

conques_sense_us <- conques |>
  rowwise() |>
  mutate(suma_usos = sum(c_across(starts_with("us_")))) |>
  filter(suma_usos == 0)

usos_conques_sense_us <- extract(usos_rcl, vect(conques_sense_us)) |>
  as_tibble() |>
  count(ID, UsSol_2017_30m_v3) |>
  slice_max(order_by = n, n = 1, by = ID, with_ties = FALSE) |>
  left_join(class_usos, by = join_by(ID == value), multiple = "any") |>
  pull(description)

conques_sense_us_codis <- conques_sense_us |> pull(codi_sad)

for (i in seq_along(usos_conques_sense_us)) {
  conques[
    conques$codi_sad == conques_sense_us_codis[i],
    usos_conques_sense_us[i]
  ] <- 400
}

cat(
  "Error d'àrees:",
  conques |>
    summarize(
      area_m2 = sum(area_m2),
      area_usos = sum(
        us_urba +
          us_prats +
          us_forestal +
          us_conreu_seca +
          us_conreu_regadiu +
          us_aigua
      )
    ) |>
    mutate(rel_diff = (area_usos - area_m2) / area_m2 * 100) |>
    pull(rel_diff) |>
    signif(2),
  " %\n"
)

stopifnot(
  conques |>
    rowwise() |>
    mutate(area_usos = sum(c_across(starts_with("us_")))) |>
    ungroup() |>
    mutate(rel_diff = (area_usos - area_m2) / area_usos * 100) |>
    filter(rel_diff > 0.2) |>
    nrow() ==
    0
)

# Helpers rasters meteo ------------------------------------------------

zonal_month <- function(r, preffix) {
  zonal(rast(r), vect(conques), na.rm = T) |>
    as_tibble() |>
    rename_with(\(x) create_month_index(str_to_lower(x), preffix))
}

# Temperatura mitjana ----------------------------------------

tmit_files <- file.path("data_raw", "tmit", list.files("data_raw/tmit"))

cols <- paste0("tmit", 1:12)

tmit_conques <- map(tmit_files, \(r) zonal_month(r, "tmit")) |>
  list_cbind() |>
  select(all_of(cols)) |>
  mutate(codi_sad = conques$codi_sad)

conques <- conques |>
  left_join(tmit_conques, by = 'codi_sad')

# Precipitació ------------------------------------------------------------

ppt_files <- file.path("data_raw", "ppt", list.files("data_raw/ppt"))

cols <- paste0("ppt", 1:12)

ppt_conques <- map(ppt_files, \(r) zonal_month(r, "ppt")) |>
  list_cbind() |>
  select(all_of(cols)) |>
  mutate(codi_sad = conques$codi_sad)

conques <- conques |>
  left_join(ppt_conques, by = 'codi_sad')

# Gruixos neu -----------------------------------------------------------------

neu_files <- file.path(
  "data_raw",
  "gruixos_neu",
  list.files("data_raw/gruixos_neu")
)

cols <- paste0("neu", 1:12)

neu_conques <- neu_files |>
  map(\(r) {
    zonal(rast(r), vect(conques), na.rm = T) |>
      as_tibble() |>
      rename_with(\(x) paste0("neu", str_extract(x, '\\d+') |> as.numeric()))
  }) |>
  list_cbind() |>
  select(all_of(cols)) |>
  # convertim de cm a mm
  mutate(across(everything(), \(x) x * 10)) |>
  mutate(codi_sad = conques$codi_sad)

conques <- conques |>
  left_join(neu_conques, by = 'codi_sad')

# Exporta --------------------------------------------

conques |>
  st_drop_geometry() |>
  select(-c(FID_custom, VALUE)) |>
  write_rds("data_raw/conques_dades_cabal.rds")
