library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(lwgeom)
library(tmap)
library(sfnetworks)
library(igraph)
tmap_mode('view')

masses <- read_sf("assets/masses_aigua_ter.gpkg")

nodes <- read_sf("assets/nodes.gpkg") |> 
  mutate(name = as.character(node_id))
edges <- readxl::read_excel("assets/edges.xlsx") |> 
  mutate(across(from:to, \(x) as.character(x)))
xarxa <- sfnetwork(nodes, edges, node_key = "name", directed = T)

subcomponent(xarxa, "71", mode = "in")
is_connected(xarxa, "strong")
count_components(xarxa, "weak")

path <- st_network_paths(xarxa, from = "9", to = "71") |> 
  unnest_longer(node_paths) |> 
  pull(node_paths)

keys[path]

p1 = st_point(c(1, 1))
p2 = st_point(c(3, 1))
p3 = st_point(c(2, 2))
p4 = st_point(c(2, 3))
nodes = st_as_sf(st_sfc(p1, p2, p3, p4, crs = 4326)) |> 
  mutate(name = letters[1:4])

edges <- tribble(
  ~from, ~to,
  "a", "c",
  "b", "c",
  "c", "d"
)

net <- sfnetwork(nodes, edges, node_key = "name")

is_connected(net, "strong")
st_network_paths(net, from = "a", to = "d") |> 
  unnest_longer(node_paths)
