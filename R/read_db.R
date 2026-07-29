source('R/helpers.R')
library(tidyverse)
use('janitor', 'clean_names')
use('assertr', c('verify', 'not_na'))
library(jsonlite)
library(sf)

db <- fromJSON("https://h2oseg.icradev.cat/db/api.php")

data <- fromJSON(db$text) |>
  flatten() |>
  as_tibble() |>
  clean_names() |>
  mutate(valor_cabal = as.numeric(valor_cabal)) |>
  mutate(
    codi_sad = recode_values(
      codi_sad,
      "ABASTAMENT_ATL" ~ "ATL",
      "ETAP_MONTFULLA" ~ "ETAP_MONFULLA",
      "EDAR_STJOANABADESSES" ~ "EDAR_STJOAN",
      "EDAR_PLANESHOSTOLES" ~ "EDAR_HOSTOLES",
      "EDAR_GESTORELLO" ~ "EDAR_TORELLO",
      default = codi_sad
    )
  )


nodes <- read_sf("data_raw/nodes_natural_antropic.gpkg")

codis_db <- data$codi_sad |> unique()

stopifnot(
  nodes |>
    filter(!(type %in% c('massa', 'entrada'))) |>
    filter(!(codi_sad %in% codis_db)) |>
    nrow() ==
    0
)

data |>
  mutate(
    valor_cabal = if_else(
      metadata_codi_sad_entrada_sortida_control == 'S',
      -valor_cabal,
      valor_cabal
    )
  ) |>
  summarize(
    valor_cabal = mean(valor_cabal, na.rm = T),
    .by = c(codi_sad, nom_dada)
  ) |>
  mutate(mes_dada = create_month_index(str_to_lower(nom_dada), "m")) |>
  select(-nom_dada) |>
  pivot_wider(names_from = mes_dada, values_from = valor_cabal) |>
  mutate(across(m1:m12, \(x) if_else(codi_sad == "CR_MONAR", x - 3, x))) |>
  add_row(
    codi_sad = "SEQUIA_MONAR"
  ) |>
  mutate(across(m1:m12, \(x) if_else(codi_sad == 'SEQUIA_MONAR', 3, x))) |>
  write_rds("data_raw/cabals_antropic.rds")
