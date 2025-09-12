library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(jsonlite)
library(lwgeom)
library(sfnetworks)
set.seed(4)

# [
#   {data: {id: 'a', name: 'Node A'}},
#   {data: {id: 'b', name: 'Node B'}},
#   {data: {id: 'ab', source: 'a', target: 'b'}}
# ]


# Creem els nodes -------------------------------------------------------------

natural <- read_sf("data_raw/nodes.gpkg") |> 
  mutate(node_id2 = row_number())

edges <- read_csv("data_raw/edges.csv")

edges_natural <- edges |> 
  left_join(st_drop_geometry(natural), by = join_by(from == node_id)) |> 
  left_join(st_drop_geometry(natural), by = join_by(to == node_id)) |> 
  select(from = node_id2.x, to = node_id2.y, codi) |> 
  write_excel_csv2("data_raw/edges_natural.csv")

antropic <- read_sf("data_raw/edars_snapped.gpkg") |>
  select(e_s, any, codi_sad, nom, ma, diaritzat_ago) |> 
  summarize(flow_change = mean(diaritzat_ago), .by = -c(any, diaritzat_ago)) |> 
  mutate(flow_change = if_else(e_s == "S", -flow_change, flow_change)) |> 
  mutate(type = case_when(
    str_starts(codi_sad, "C_AMBIEN") ~ "Cabal ambiental",
    str_starts(codi_sad, "CR_") ~ "Comunitat de regants",
    .default = str_extract(codi_sad, "^[^_]+")
  )) |> 
  select(-e_s) |> 
  st_as_sf()
  
nodes <- natural |> 
  select(-node_id) |> 
  mutate(flow_change = sample(c(1, 2, 3), n(), replace = T)) |> 
  rename(geom = geometry, node_id = node_id2) |> 
  bind_rows(antropic) |> 
  mutate(node_id = if_else(is.na(node_id), row_number(), node_id))

stopifnot(!all(duplicated(nodes$node_id)))

nodes_coord <- nodes |> 
  st_transform(4326) |> 
  st_coordinates() |> 
  as_tibble()

# Creem els edges -----------------------------------------

nodes$nearest_node <- st_nearest_feature(nodes)

nodes |> 
  filter(type != "massa")




edges$flow_need <- sample(2:10, nrow(edges), replace = T)

elements <- list()
for (i in 1:nrow(nodes)){
  elements[[i]] <- list(
    data = list(
      id = nodes$node_id[[i]], 
      lat = nodes_coord$Y[[i]], 
      lng = nodes_coord$X[[i]],
      flowChange = nodes$flow_change[[i]]
    )
  )
}

j <- length(elements)
for (i in 1:nrow(edges)){
  elements[[i + j]] <- list(
    data = list(
      id = paste(edges$from[[i]], edges$to[[i]], sep = "."), 
      source = edges$from[[i]], 
      target = edges$to[[i]],
      flowNeed = edges$flow_need[[i]],
      flow = NULL,
      codi_massa = edges$codi[[i]]
    )
  )
}

write_json(elements, "assets/ter_graph.json", auto_unbox = T)
