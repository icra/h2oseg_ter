library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(lwgeom)
library(jsonlite)

nodes <- read_sf("data_raw/nodes_natural_antropic.gpkg") |>
  filter(!is.na(codi_sad)) |>
  bind_rows(
    read_sf("data_raw/aforaments.gpkg") |>
      select(codi_sad, type, nom)
  ) |>
  left_join(read_rds("data_raw/conques_dades_cabal.rds"), by = 'codi_sad') |>
  left_join(read_rds("data_raw/cabals_antropic.rds"), by = 'codi_sad')

if (any(is.na(nodes$m1[nodes$type == 'EDAR'])) == TRUE) {
  rlang::abort("EDAR sense cabal")
}

final_nodes <- c("NODE_33", "NODE_34", "NODE_63", "NODE_82", "NODE_84")

stopifnot(
  all(
    nodes |>
      filter(type %in% c('massa', 'comporta', 'aforament')) |>
      filter(if_any(area_m2:neu12, \(x) is.na(x))) |>
      pull(codi_sad) ==
      final_nodes
  )
)

stopifnot(
  nodes |>
    filter(!(type %in% c('massa', 'comporta', 'aforament'))) |>
    filter(if_any(m1:m12, \(x) is.na(x))) |>
    nrow() ==
    0
)

masses <- read_sf(
  "data_raw/MASSES_AIGUA_BE.gpkg",
  layer = "retall_embassament"
)

# Comprova que tots els nodes estan sobre els arcs
stopifnot(all(nodes |> st_intersects(masses, sparse = FALSE) |> rowSums() > 0))

# Divideix les línies segons els nodes, calcula la distància i dona noms correlatius als trams partits
edges <- st_split(masses, nodes) |>
  st_collection_extract("LINESTRING") %>%
  mutate(river_length = as.numeric(st_length(.)) / 1000) |>
  mutate(nom = str_remove_all(NOM_COMU, " \\d$"), .before = 1) |>
  mutate(numero = row_number(), .by = nom, .after = nom) |>
  mutate(n = n(), .by = nom, .after = numero) |>
  mutate(
    nom_correlatiu = if_else(n == 1, nom, paste(nom, numero)),
    .before = everything()
  ) |>
  select(-c(nom, numero, n))

## Per quan tinguem edges amb geom ------------------------------

froms <- st_startpoint(edges) |>
  st_as_sf() |>
  st_join(nodes) |>
  pull(codi_sad)

stopifnot(all(!is.na(froms)))

tos <- st_endpoint(edges) |>
  st_as_sf() |>
  st_join(nodes) |>
  pull(codi_sad)

edges$from <- froms
edges$to <- tos

# Comprovacions ----------------------------------------------------

if (any(duplicated(edges$from))) {
  rlang::abort("Hi ha duplicats a from dels arcs")
}

stopifnot(
  all(edges$from %in% nodes$codi_sad) && all(edges$to %in% nodes$codi_sad)
)

# comprova que tots els nodes tenen arcs sortint excepte els finals
stopifnot(length(which(nodes$codi_sad %in% edges$from)) == (nrow(nodes) - 5))
stopifnot(
  nodes$codi_sad[which(!(nodes$codi_sad %in% edges$from))] == final_nodes
)
