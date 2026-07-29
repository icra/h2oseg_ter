library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(jsonlite)
library(tmap)
tmap_mode('view')
library(sfnetworks)

noms <- read_table(
  "data_raw/swat/TxtInOut_Ter_2007_2022/channel_sd_mon.txt",
  skip = 1
) |>
  colnames()

flow <- sym('flo_in')

channel_sd_mon <- read_table(
  "data_raw/swat/TxtInOut_Ter_2007_2022/channel_sd_mon.txt",
  col_names = noms,
  skip = 3
) |>
  select(mon, yr, gis_id, !!flow) |>
  summarize(flo_in = mean(!!flow, na.rm = T), .by = c(gis_id, mon))

channels <- read_sf("data_raw/swat/swat_channels/rivs1.shp") |>
  clean_names() |>
  select(channel)

stopifnot(
  anti_join(channel_sd_mon, channels, by = join_by(gis_id == channel)) |>
    nrow() ==
    0
)

# Temperatura mitjana SWAT: 13.12ºC
# Precipitació mitjana: 762 mm

nodes <- read_sf("assets/nodes.geojson") |>
  st_transform(25831) |>
  select(type, id) |>
  filter(type == "massa")

xarxa <- sfnetwork(
  st_read("assets/nodes.geojson") |> select(-name) |> rename(name = id),
  st_read("assets/edges.geojson"),
  directed = TRUE
)

downstream_panta <- igraph::subcomponent(xarxa, 'DESEMBASSAT', "out")

nodes <- nodes |>
  filter_out(id %in% attr(downstream_panta, 'names'))

nearest <- st_nearest_feature(nodes, channels)
ls <- st_nearest_points(nodes, channels[nearest, ], pairwise = T)
nodes$dist_to_channel <- st_distance(
  nodes,
  channels[nearest, ],
  by_element = T
) |>
  as.numeric()
nodes$channel <- channels$channel[nearest]

if (FALSE) {
  plot(st_geometry(channels))
  plot(st_geometry(nodes), col = 'red', add = T)
  plot(ls, col = 'green', add = T)
}

flow_col <- 'inflow'

found_nodes <- nodes |>
  filter_out(dist_to_channel > 1000)

cabals_sad <- read_json(
  "data_raw/swat/swat_dades_h2oseg_ter.json",
  simplifyVector = TRUE
) |>
  pluck("nodes") |>
  pluck("data") |>
  as_tibble() |>
  select(id, starts_with(flow_col), -!!sym(paste0(flow_col, 0))) |>
  inner_join(st_drop_geometry(found_nodes), by = 'id') |>
  pivot_longer(starts_with(flow_col)) |>
  filter_out(value == 0 | is.na(value)) |>
  mutate(mes = str_extract(name, '\\d+$') |> as.integer())

validacio <- cabals_sad |>
  left_join(channel_sd_mon, by = join_by(channel == gis_id, mes == mon)) |>
  mutate(diff = flo_in - value) |>
  mutate(percent_diff = (diff / value) * 100)

diff_node <- validacio |>
  summarize(
    sad = mean(value),
    swat = mean(flo_in),
    error = mean(abs(diff)),
    error_percentual = mean(abs(percent_diff)),
    .by = id
  ) |>
  filter_out(is.na(swat))


summary(diff_node$error_percentual)
summary(diff_node$error)

if (FALSE) {
  tm_shape(read_sf("assets/nodes.geojson")) +
    tm_symbols() +
    tm_shape(channels) +
    tm_lines() +
    tm_shape(nodes |> inner_join(diff_node)) +
    tm_symbols(fill = "error")
}

diff_node |>
  mutate(id = fct_reorder(id, desc(sad))) |>
  pivot_longer(c(sad, swat)) |>
  ggplot(aes(x = id, y = value, color = name, group = name)) +
  geom_line() +
  theme(
    axis.text.x = element_text(angle = 90)
  )

diff_node |>
  filter(error > 3)
