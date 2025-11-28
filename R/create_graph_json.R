source("R/read_db.R")
source("R/load_graph.R")

# Guardem la xarxa a assets -----------------------------------------------------

nodes |>
  rename(name = nom, id = codi_sad) |>
  st_transform(4326) |>
  st_write("assets/nodes.geojson", delete_dsn = TRUE)

edges |>
  rename(
    nomComu = nom_correlatiu,
    lengthRiver = river_length,
    codiMassa = EUMSPFCOD
  ) |>
  mutate(id = paste(from, to, sep = "->"), .before = everything()) |>
  mutate(nomComu = str_to_title(nomComu)) |>
  st_transform(4326) |>
  st_write("assets/edges.geojson", delete_dsn = TRUE)
