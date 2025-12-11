library(tidyverse)
use('janitor', 'clean_names')
library(sf)

canals <- st_read("data_raw/CANALS_REALS.gpkg")

monar <- st_read("data_raw/seq_monar.gpkg") |>
  st_transform(4326) |>
  rename(nom = canal)

canals |>
  bind_rows(monar) |>
  mutate(
    codi_sad = case_match(
      nom,
      'Rec del molí o de Sentmenat' ~ "CR_SENTMENAT",
      'SEQUIA VINYALS' ~ "CR_VINYALS",
      'Canal de Sant Jordi' ~ 'CR_CERVIA',
      'REC MOLI DE PALS' ~ 'C_AMBIEN_REC_MOLI',
      'sequia monar' ~ 'SEQUIA_MONAR'
    )
  ) |>
  mutate(
    nom = case_match(
      nom,
      'Rec del molí o de Sentmenat' ~ "Rec del Molí o de Sentmenat",
      'SEQUIA VINYALS' ~ "Sèquia Vinyals",
      'REC MOLI DE PALS' ~ 'Rec del Molí de Pals',
      'sequia monar' ~ 'Sèquia Monar',
      .default = nom
    )
  ) |>
  st_write("assets/canals.geojson", delete_dsn = TRUE)
