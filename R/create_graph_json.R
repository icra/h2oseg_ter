library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(jsonlite)
set.seed(4)

# [
#   {data: {id: 'a', name: 'Node A'}},
#   {data: {id: 'b', name: 'Node B'}},
#   {data: {id: 'ab', source: 'a', target: 'b'}}
# ]

nodes <- read_sf("data_raw/nodes.gpkg")
edges <- read_csv("data_raw/edges.csv")

nodes_coord <- nodes |> 
  st_transform(4326) |> 
  st_coordinates() |> 
  as_tibble()

nodes <- nodes |> 
  mutate(flow_change = sample(c(1, 2, 3), n(), replace = T))

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
