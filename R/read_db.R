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
  mutate(valor_cabal = as.numeric(valor_cabal))


nodes <- read_sf("data_raw/nodes_natural_antropic.gpkg")

codis_db <- data$codi_sad |> unique()

codis_db[!(codis_db %in% nodes$codi_sad)]

data2 <- data |>
  mutate(
    codi_sad = case_match(
      codi_sad,
      "ABASTAMENT_ATL" ~ "ATL",
      "ETAP_MONTFULLA" ~ "ETAP_MONFULLA",
      "EDAR_STJOANABADESSES" ~ "EDAR_STJOAN",
      .default = codi_sad
    )
  )

codis_db <- data2$codi_sad |> unique()

codis_db[!(codis_db %in% nodes$codi_sad)]

nodes$codi_sad[!(nodes$codi_sad %in% codis_db)]

# Add monthly data fake ----------------------------------------

recode_mesos <- tibble(
  mesos = data2$nom_dada |> unique(),
  m = 1:12
)

data2 |>
  filter(codi_sad %in% nodes$codi_sad) |>
  left_join(recode_mesos, by = join_by(nom_dada == mesos)) |>
  mutate(
    valor_cabal = case_match(
      metadata_codi_sad_entrada_sortida_control,
      "S" ~ -valor_cabal,
      "E" ~ valor_cabal,
      .default = NA
    )
  ) |>
  verify(not_na(valor_cabal))
summarize()

data2$metadata_codi_sad_entrada_sortida_control
