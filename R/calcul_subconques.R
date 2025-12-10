library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(terra)
library(whitebox)
library(tmap)
tmap_mode("view")
wbt_verbose()

# Prèvia que no funciona ---------------------------------------------------------

# if (!file.exists('data_raw/mde/mde.tif')) {
#   ter <- rast("data_raw/area_estudi.tif")
#   mde <- elevatr::get_aws_terrain(ter, z = 12, prj = crs(ter), ncpu = 6)
#   ter_rs <- resample(ter, mde)
#   mde <- crop(mde, ter_rs, mask = T)
#   writeRaster(mde, "data_raw/mde/mde.tif")
# } else {
#   mde <- rast('data_raw/mde/mde.tif')
# }

# wbt_fill_depressions(
#   dem = "data_raw/mde/mde_ter_20x.tif",
#   output = "data_raw/mde/filled.tif"
# )

# wbt_d8_pointer(
#   dem = "data_raw/mde/filled.tif",
#   output = "data_raw/mde/d8.tif"
# )

# wbt_d8_flow_accumulation(
#   input = "data_raw/mde/solo_ter_dir.tif",
#   output = "data_raw/mde/accumulation.tif"
# )

# wbt_extract_streams(
#   flow_accum = "data_raw/mde/solo_ter_acc.tif",
#   threshold = 1000,
#   output = "data_raw/mde/streams.tif"
# )

# wbt_jenson_snap_pour_points(
#   pour_pts = "C:/Users/agou/Documents/TER/nodos_cuenca_ter.shp",
#   streams = "C:/Users/agou/Documents/TER/solo_ter_streams_1000.tif",
#   output = "C:/Users/agou/Documents/TER/nodos_cuenca_ter_snapped.shp",
#   snap_dist = 1000 # en cel·les; amb 20 m -> 200 m
# )

# Calcula conques ----------------------------------------------

nodes <- read_sf("data_raw/nodes_arees_drenatge_02.gpkg") |>
  mutate(id = row_number())

vect(nodes) |>
  rasterize(rast("data_raw/mde/solo_ter_dir.tif"), field = "id") |>
  writeRaster("data_raw/mde/pour_points.tif", overwrite = T)


wbt_watershed(
  d8_pntr = "data_raw/mde/solo_ter_dir.tif",
  pour_pts = "data_raw/mde/pour_points.tif",
  output = "data_raw/mde/subconques_20m.tif"
)

whitebox::wbt_raster_to_vector_polygons(
  input = "data_raw/mde/subconques_20m.tif",
  output = "data_raw/mde/subconques_20m.shp"
)

conques <- read_sf("data_raw/mde/subconques_20m.shp") |>
  left_join(
    nodes |> st_drop_geometry() |> select(id, codi_sad),
    by = join_by(VALUE == id)
  ) |>
  st_make_valid() |>
  select(codi_sad)

st_write(conques, 'data_raw/arees_drenatge_v03.gpkg', delete_dsn = TRUE)
