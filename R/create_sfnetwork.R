library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(lwgeom)
library(tmap)
library(sfnetworks)
library(igraph)
tmap_mode('view')

masses <- read_sf("data_raw/masses_aigua_ter.gpkg")

nodes <- read_sf("data_raw/nodes_natural_antropic.gpkg") |>
  mutate(name = as.character(node_id))

xarxa <- sfnetwork(edges = masses)

subcomponent(xarxa, "71", mode = "in")

edges <- edges_raw

for (i in 1:nrow(edges)) {
  from <- edges$from[i]
  to <- edges$to[i]
  line <- rbind(
    st_coordinates(nodes[nodes$node_id == from, ]),
    st_coordinates(nodes[nodes$node_id == to, ])
  ) |>
    st_linestring()
  edges$geom[i] <- st_sfc(line)
}

edges_sf <- edges |>
  st_as_sf(crs = 25831)

edges_sf$codi <- masses$EUMSPFCOD[st_nearest_feature(
  st_centroid(edges_sf),
  masses
)]

nodes_join <- nodes |>
  st_join(masses |> select(EUMSPFCOD)) |>
  st_drop_geometry() |>
  mutate(node_id = as.character(node_id))

incorrect_edges <- edges_sf |>
  left_join(nodes_join, by = join_by(from == node_id)) |>
  left_join(nodes_join, by = join_by(to == node_id)) |>
  clean_names() |>
  filter(codi != eumspfcod_x & codi != eumspfcod_y) |>
  distinct(from, to, geom, codi)


tm_shape(masses) +
  tm_lines(hover = "EUMSPFCOD", col = "blue", lwd = 3) +
  tm_shape(incorrect_edges) +
  tm_lines(hover = "codi", col = "red", lwd = 3) +
  tm_shape(st_centroid(incorrect_edges)) +
  tm_symbols(fill = "red")


edges_sf <- edges_sf |>
  mutate(
    codi = case_when(
      from == "59" & to == "57" ~ "ES100MSPF2000340",
      .default = codi
    )
  )

edges_sf |>
  st_drop_geometry() |>
  write_csv("data_raw/edges.csv")

# Dades per en Pepe Barquín -------------------------------------

nodes |>
  select(-c(node_id)) |>
  left_join(edges_raw, by = join_by(name == from)) |>
  left_join(edges_raw, by = join_by(name == to)) |>
  rename(name_downstream = to, name_upstream = from) |>
  summarize(
    name_upstream = paste(name_upstream, collapse = ","),
    .by = c(name, name_downstream),
    across(geometry, st_union)
  ) |>
  arrange(as.integer(name)) |>
  st_write("data_raw/nodos_cuenca_ter.gpkg")


nodes_snap = st_snap(nodes, masses, tol = 1e-9)
parts = st_collection_extract(st_split(masses, nodes_snap), "LINESTRING")


plot(st_geometry(masses))
plot(nodes_snap, col = "red", add = T)

st_sf(geometry = parts) |>
  st_filter(nodes_snap) |>
  plot()


# REPREX -------------------------------

p1 <- st_point(c(1, 4))
p2 <- st_point(c(4, 4))
p3 <- st_point(c(2.5, 0))
c <- st_point(c(2.5, 2))

# Defineix cada línia com una línia individual
l1 <- st_linestring(rbind(c, c(2, 3), p1)) # línia cap a l'esquerra
l2 <- st_linestring(rbind(c, c(3, 3), p2)) # línia cap a la dreta
l3 <- st_linestring(rbind(c, c(1, 1), p3)) # línia cap avall

# Agrupa les línies com una multilínia
multi <- st_multilinestring(list(
  l1,
  l2,
  l3
))

# Converteix-ho en un objecte sf
multi_sf <- st_sf(id = "Multilínia Y", geometry = st_sfc(multi, crs = 4326))

# Mostra la multilínia
print(multi_sf)

# Dibuixa la multilínia
plot(
  st_geometry(multi_sf),
  col = "blue",
  lwd = 2,
  main = "Multilínia en forma de Y"
)

pts <- st_sfc(p1, p2, p3, c, crs = 4326)
pts_sf <- st_sf(id = 1:4, geometry = pts)
points(st_geometry(pts_sf), col = "red", pch = 19)

st_collection_extract(st_split(multi_sf, pts_sf), "LINESTRING") |> plot()

# REPREX 2 --------------------------------------------------------------------

library(sf)
library(lwgeom)

# get data
devtools::source_gist("58981fcd1ebad69274c30b70331718a4")

split <- st_split(lines, points)

st_collection_extract(split, "LINESTRING")

plot(split, col = 1:45)
plot(st_collection_extract(split, "LINESTRING"), col = 1:1900)
