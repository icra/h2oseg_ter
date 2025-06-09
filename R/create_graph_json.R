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

nodes <- read_sf("assets/test.gpkg", layer = 'nodes')
edges <- read_sf("assets/test.gpkg", layer = 'edges')

nodes_coord <- nodes |> 
  st_transform(4326) |> 
  st_coordinates() |> 
  as_tibble()

nodes <- nodes |> 
  mutate(flow_change = sample(c(-2, -1, 1, 2, 3), n(), replace = T))

nodes$flow_change[nodes$id %in% c(1, 7, 10, 13)] <- sample(1:3, 4, replace = T)

edges$flow_need <- sample(2:10, nrow(edges), replace = T)

elements <- list()
for (i in 1:nrow(nodes)){
  elements[[i]] <- list(
    data = list(
      id = nodes$id[[i]], 
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
      id = paste(edges$node_1[[i]], edges$node_2[[i]]), 
      source = edges$node_1[[i]], 
      target = edges$node_2[[i]],
      flowNeed = edges$flow_need[[i]],
      flow = NULL
    )
  )
}

write_json(elements, "assets/test.json", auto_unbox = T)
