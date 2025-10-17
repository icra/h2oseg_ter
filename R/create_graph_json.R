library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(lwgeom)
library(jsonlite)
library(tmap)
tmap_mode("view")
set.seed(4)

nodes <- read_sf("data_raw/nodes_natural_antropic.gpkg") |> 
  mutate(codi_sad = if_else(is.na(codi_sad), paste('NODE', node_id, sep = "_"), codi_sad))

masses <- read_sf("data_raw/MASSES_AIGUA_BE.gpkg", layer = "retall_embassament")

# Comprova que tots els nodes estan sobre els arcs
stopifnot(all(nodes |> st_intersects(masses, sparse = FALSE) |> rowSums() > 0))

# Divideix les línies segons els nodes, calcula la distància i dona noms correlatius als trams partits
edges <- st_split(masses, nodes) |> 
  st_collection_extract("LINESTRING") %>% 
  mutate(river_length = st_length(.)) |> 
  mutate(nom = str_remove_all(NOM_COMU, " \\d$"), .before = 1) |> 
  mutate(numero = row_number(), .by = nom, .after = nom) |> 
  mutate(n = n(), .by = nom, .after = numero) |> 
  mutate(nom_correlatiu = if_else(n == 1, nom, paste(nom, numero)), .before = everything()) |> 
  select(-c(nom, numero, n))

tm_shape(edges) +
  tm_lines() +
  tm_shape(nodes) +
  tm_symbols()

  
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

stopifnot(all(edges$from %in% nodes$codi_sad) && all(edges$to %in% nodes$codi_sad))

# tots les nodes tenen un arc sortint excepte el node final (63)
stopifnot(length(which(nodes$codi_sad %in% edges$from)) == (nrow(nodes) - 5))
stopifnot(nodes$codi_sad[which(!(nodes$codi_sad %in% edges$from))] == c("NODE_33", "NODE_34", "NODE_63", "NODE_82", "NODE_84"))

# Atribuïm valors random ----------------------------------------------------------------

edges$flow_need <- sample(2:10, nrow(edges), replace = T)

nodes |> 
  select(-c(node_id, nearest_node, ma)) |> 
  rename(name = nom, node_id = codi_sad, flowChange = flow_change) |> 
  st_transform(4326) |> 
  st_write("assets/nodes.geojson", delete_dsn = TRUE)

edges |> 
  rename(nomComu = nom_correlatiu, flowNeed = flow_need, lengthRiver = river_length, codiMassa = EUMSPFCOD) |> 
  mutate(id = paste(from, to, sep = "->"), .before = everything()) |> 
  mutate(nomComu = str_to_title(nomComu)) |> 
  st_transform(4326) |> 
  st_write("assets/edges.geojson", delete_dsn = TRUE)


# nodes_coord <- nodes |> 
#   st_transform(4326) |> 
#   st_coordinates() |> 
#   as_tibble()

# elements <- list()
# for (i in 1:nrow(nodes)){
#   elements[[i]] <- list(
#     data = list(
#       id = nodes$node_id[[i]], 
#       lat = nodes_coord$Y[[i]], 
#       lng = nodes_coord$X[[i]],
#       flowChange = nodes$flow_change[[i]],
#       type = nodes$type[[i]],
#       name = nodes$nom[[i]]
#     )
#   )
# }

# j <- length(elements)
# for (i in 1:nrow(edges)){
#   elements[[i + j]] <- list(
#     data = list(
#       id = paste(edges$from[[i]], edges$to[[i]], sep = "."), 
#       source = edges$from[[i]], 
#       target = edges$to[[i]],
#       flowNeed = edges$flow_need[[i]],
#       flow = NULL,
#       # codi_massa = edges$codi[[i]],
#       lengthRiver = edges$massa_length[[i]]
#     )
#   )
# }

# write_json(elements, "assets/test_nodes.json", auto_unbox = T)
  