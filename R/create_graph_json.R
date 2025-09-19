library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(jsonlite)
set.seed(4)

# stop("Cal corregir topologia a QGIS")

nodes <- read_sf("data_raw/nodes_natural_antropic.gpkg") |> 
  mutate(flow_change = signif(flow_change, 2))
edges <- read_csv2("data_raw/edges_natural_antropic.csv")

# Comprovacions

if (any(duplicated(edges$from))) {
  rlang::abort("Hi ha duplicats a from dels arcs")
}

stopifnot(all(edges$from %in% nodes$node_id) && all(edges$to %in% nodes$node_id))

# tots les nodes tenen un arc sortint excepte el node final (63)
stopifnot(length(which(nodes$node_id %in% edges$from)) == (nrow(nodes) - 1))
stopifnot(which(!(nodes$node_id %in% edges$from)) == 63)

edges$flow_need <- sample(2:10, nrow(edges), replace = T)

od_matrix <- qgisprocess::qgis_run_algorithm(
  "qneat3:OdMatrixFromPointsAsTable",
  INPUT = "data_raw/masses_aigua_ter.gpkg",
  POINTS = nodes,
  ID_FIELD = 'node_id',
  ENTRY_COST_CALCULATION_METHOD = 1,
  DEFAULT_DIRECTION = 2
)$OUTPUT |> read_sf()

edges <- edges |> 
  left_join(od_matrix, by = join_by(from == origin_id, to == destination_id)) |> 
  assertr::verify(assertr::not_na(total_cost)) |> 
  select(-c(entry_cost, network_cost, exit_cost)) |> 
  rename(massa_length = total_cost)


nodes_coord <- nodes |> 
  st_transform(4326) |> 
  st_coordinates() |> 
  as_tibble()

elements <- list()
for (i in 1:nrow(nodes)){
  elements[[i]] <- list(
    data = list(
      id = nodes$node_id[[i]], 
      lat = nodes_coord$Y[[i]], 
      lng = nodes_coord$X[[i]],
      flowChange = nodes$flow_change[[i]],
      type = nodes$type[[i]],
      name = nodes$nom[[i]]
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
      codi_massa = edges$codi[[i]],
      lengthRiver = edges$massa_length[[i]]
    )
  )
}

write_json(elements, "assets/ter_graph.json", auto_unbox = T)
