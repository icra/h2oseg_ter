library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(tmap)
tmap_mode("view")
source("R/read_db.R")

stop(
  "Després de córrer l'script cal modificar EDAR_BINGRAU i EDAR_STBOI perquè no solapin amb nodes naturals"
)

nodes <- read_sf("data_raw/nodes_natural_antropic_20260120.gpkg") |>
  select(-c(flow_change, node_id, ma, nearest_node))
masses <- read_sf(
  "data_raw/MASSES_AIGUA_BE.gpkg",
  layer = "retall_embassament"
)

edars <- data |>
  filter(str_starts(codi_sad, "EDAR")) |>
  select(
    codi_sad,
    nom = metadata_codi_sad_nom_comu_punt,
    x = metadata_codi_sad_x_coor,
    y = metadata_codi_sad_y_coor
  ) |>
  distinct() |>
  filter(!(codi_sad %in% nodes$codi_sad)) |>
  filter(!(if_any(c(x, y), \(x) is.na(x)))) |>
  mutate(across(c(x, y), \(x) str_replace(x, ",", ".") |> as.numeric())) |>
  st_as_sf(coords = c("x", "y"), crs = 25831)

nrst <- st_nearest_feature(edars, masses)
far <- st_distance(edars, masses[nrst, ], by_element = T) >
  units::set_units(1000, "m")

edars_on_river <- edars |>
  filter(!far) |>
  mutate(type = "EDAR") |>
  rename(geom = geometry)

edars_on_river <- st_snap(edars_on_river, masses, tolerance = 1)

nrst <- st_nearest_feature(edars_on_river, masses)
stopifnot(
  !any(
    st_distance(edars_on_river, masses[nrst, ], by_element = T) >
      units::set_units(0, "m")
  )
)

edars_on_river |>
  st_filter(nodes)

bind_rows(nodes, edars_on_river) |>
  st_write("data_raw/nodes_natural_antropic.gpkg", delete_dsn = T)
