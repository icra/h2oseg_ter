source("R/read_db.R")
source("R/load_graph.R")

# Guardem la xarxa a assets -----------------------------------------------------

data |>
  filter(
    codi_sad %in% (nodes |> filter(type == "aforament") |> pull(codi_sad))
  ) |>
  summarize(
    cabal_m3s = mean(valor_cabal, na.rm = TRUE),
    .by = c(codi_sad, nom_dada)
  ) |>
  mutate(mes = 1:12, .by = codi_sad) |>
  select(codi_sad, mes, cabal_m3s) |>
  write_json("calibration/cabals_aforament.json")

nodes |>
  rename(name = nom, id = codi_sad) |>
  st_transform(4326) |>
  st_write("assets/nodes.geojson", delete_dsn = TRUE)

edges |>
  # Uneix cabals ambientals
  left_join(
    read_rds("data_raw/cabals_ambientals.rds"),
    by = "nom_correlatiu"
  ) |>
  verify(not_na(envFlow1)) |>
  verify(not_na(envFlow0)) |>
  rename(
    nomComu = nom_correlatiu,
    lengthRiver = river_length,
    codiMassa = EUMSPFCOD
  ) |>
  mutate(id = paste(from, to, sep = "->"), .before = everything()) |>
  mutate(nomComu = str_to_title(nomComu)) |>
  st_transform(4326) |>
  st_write("assets/edges.geojson", delete_dsn = TRUE)
