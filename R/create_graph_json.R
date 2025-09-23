library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(jsonlite)
set.seed(4)

# stop("Cal corregir topologia a QGIS")

nodes <- read_sf("data_raw/nodes_natural_antropic.gpkg") |> 
  mutate(codi_sad = if_else(is.na(codi_sad), paste('NODE', node_id, sep = "_"), codi_sad))

edges <- read_csv2("data_raw/edges_natural_antropic.csv") |> 
  left_join(nodes |> st_drop_geometry() |> select(node_id, codi_sad), by = join_by(from == node_id)) |> 
  rename(from_id = from, from = codi_sad) |> 
  left_join(nodes |> st_drop_geometry() |> select(node_id, codi_sad), by = join_by(to == node_id)) |> 
  rename(to_id = to, to = codi_sad)


## Per quan tinguem edges amb geom ------------------------------

# froms <- st_startpoint(edges_geom) |> 
#   st_as_sf() |> 
#   st_join(nodes) |> 
#   pull(node_id)

# tos <- st_endpoint(edges_geom) |> 
#   st_as_sf() |> 
#   st_join(nodes) |> 
#   pull(node_id)

# edges_geom$from <- froms
# edges_geom$to <- tos


# Comprovacions ----------------------------------------------------

if (any(duplicated(edges$from))) {
  rlang::abort("Hi ha duplicats a from dels arcs")
}

stopifnot(all(edges$from %in% nodes$codi_sad) && all(edges$to %in% nodes$codi_sad))

# tots les nodes tenen un arc sortint excepte el node final (63)
stopifnot(length(which(nodes$codi_sad %in% edges$from)) == (nrow(nodes) - 1))
stopifnot(which(!(nodes$codi_sad %in% edges$from)) == 63)

# Atribuïm valors random ----------------------------------------------------------------

edges$flow_need <- sample(2:10, nrow(edges), replace = T)


# Calculem gis-length ---------------------------------------------------------------

od_matrix <- qgisprocess::qgis_run_algorithm(
  "qneat3:OdMatrixFromPointsAsTable",
  INPUT = "data_raw/masses_aigua_ter.gpkg",
  POINTS = nodes,
  ID_FIELD = 'codi_sad',
  ENTRY_COST_CALCULATION_METHOD = 1,
  DEFAULT_DIRECTION = 2
)$OUTPUT |> read_sf()

edges <- edges |> 
  left_join(od_matrix, by = join_by(from == origin_id, to == destination_id)) |> 
  assertr::verify(assertr::not_na(total_cost)) |> 
  select(-c(entry_cost, network_cost, exit_cost)) |> 
  rename(massa_length = total_cost)

nodes |> 
  select(-c(node_id, nearest_node, ma)) |> 
  rename(name = nom, node_id = codi_sad, flowChange = flow_change) |> 
  st_transform(4326) |> 
  st_write("assets/nodes.geojson", delete_dsn = TRUE)

lines <- list()
for (i in 1:nrow(edges)){
  from <- edges[i, "from", drop = TRUE]
  to <- edges[i, "to", drop = TRUE]

  from_point <- st_coordinates(nodes |> filter(codi_sad == from)) |> st_point()
  to_point <- st_coordinates(nodes |> filter(codi_sad == to)) |> st_point()
  lines[[i]] <- st_linestring(c(from_point, to_point))
}
lines_sfc <- st_sfc(lines)

edges_sf <- edges |> 
  mutate(geom = lines_sfc) |> 
  st_as_sf(crs = 25831)

edges_sf |> 
  rename(flowNeed = flow_need, lengthRiver = massa_length) |> 
  select(-c(from_id, to_id)) |> 
  mutate(id = paste(from, to, sep = "->"), .before = everything()) |> 
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
