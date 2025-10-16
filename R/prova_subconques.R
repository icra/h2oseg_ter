library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(terra)
library(whitebox)
library(mapview)
library(stars)
library(elevatr)

wbt_verbose()

conca_ter <- read_sf("C:/Users/jpueyo/OneDrive - Universitat de Girona/carto_cat/conques_internes.geojson") |> 
  filter(str_detect(NOM_CONCA, "TER"))

mde_file <- "data_raw/mde.tif"

if (!file.exists(mde_file)){
  mde <- get_elev_raster(conca_ter, z = 13, ncpu = 6)
  writeRaster(mde, mde_file)
} else {
  mde <- rast(mde_file)
}

wbt_breach_depressions_least_cost(
  dem = mde_file,
  output = "data_raw/mde_filled.tif",
  dist = 5000
  )

wbt_d8_pointer(
  dem = "data_raw/mde_filled.tif",
  output = "C:/Users/agou/Documents/TER/solo_ter_dir.tif"
)

wbt_d8_flow_accumulation(
  input = "C:/Users/agou/Documents/TER/solo_ter_filled.tif",
  output = "C:/Users/agou/Documents/TER/solo_ter_acc.tif"
  )

wbt_extract_streams(
  flow_accum = "C:/Users/agou/Documents/TER/solo_ter_acc.tif",
  threshold  = 5000,
  output     = "C:/Users/agou/Documents/TER/solo_ter_streams_1000.tif"
  )

wbt_jenson_snap_pour_points(
  pour_pts  = "C:/Users/agou/Documents/TER/nodos_cuenca_ter.shp",
  streams   = "C:/Users/agou/Documents/TER/solo_ter_streams_1000.tif",
  output    = "C:/Users/agou/Documents/TER/nodos_cuenca_ter_snapped.shp",
  snap_dist = 1000    # en cel·les; amb 20 m -> 200 m
)

wbt_bre               


wbt_watershed(
  d8_pntr  = "C:/Users/agou/Documents/TER/solo_ter_dir.tif",
  pour_pts = "C:/Users/agou/Documents/TER/nodos_cuenca_ter.shp",
  output   = "C:/Users/agou/Documents/TER/subconques_20m.tif"
  )

whitebox::wbt_raster_to_vector_polygons(
  input = "C:/Users/agou/Documents/TER/subconques_20m.tif",
  output = "C:/Users/agou/Documents/TER/subconques_20m.shp"
  )

subconques <- st_read("C:/Users/agou/Documents/TER/subconques_20m.shp")
mapview(subconques) + mapview(nodos) + mapview(masses_aigua_ter)


names(subconques)[names(subconques) == "FID"] <- "FID_custom"
st_write(subconques, "C:/Users/agou/Documents/TER/subconques_v1.gpkg")




nodos <- st_read("C:/Users/agou/Documents/TER/nodos_cuenca_ter.shp")

extraidos <- rast("C:/Users/agou/Documents/TER/solo_ter_streams_1000.tif")


wbt_jenson_snap_pour_points(
  pour_pts = "C:/Users/agou/Documents/TER/nodos_cuenca_ter.shp",  # punts originals
  streams  = "C:/Users/agou/Documents/TER/solo_ter_acc.tif",     # aquí va el raster d'acumulació
  output   = "C:/Users/agou/Documents/TER/nodos_cuenca_ter_snapped.shp",
  snap_dist = 100
)