library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(lwgeom)
library(terra)
library(elevatr)
library(tmap)
tmap_mode("view")

masses <- read_sf("data_raw/MASSES_AIGUA_BE.gpkg", layer = "direccions_correctes")

st_write(masses, "data_raw/MASSES_AIGUA_BE.gpkg", layer = "")

inicis <- st_startpoint(masses) |> 
  st_as_sf() |> 
  mutate(tipus = "inici") |> 
  mutate(id = row_number())

finals <- st_endpoint(masses) |> 
  st_as_sf() |> 
  mutate(tipus = "final") |> 
  mutate(id = row_number())

duplicated(inicis)

tots <- bind_rows(inicis, finals)

elev_points <- get_elev_point(tots, src = "aws")

compara <- function(elev_points, i){
  cota_start <- elev_points |> 
    filter(id == i, tipus == "inici") |> 
    pull(elevation)
  cota_end <- elev_points |> 
      filter(id == i, tipus == "final") |> 
      pull(elevation)
  if(cota_start == cota_end) cat(masses$NOM_COMU[[i]], "\n")
  
  # torna TRUE si incorrecta
  return(cota_start < cota_end)
}

incorrecta <- map_lgl(1:84, \(i) compara(elev_points, i))

masses_new <- masses

for (i in 1:length(st_geometry(masses_new))){
  if (incorrecta[[i]] || masses_new$NOM_COMU[[i]] %in% c(
    "verneda gotarra benaula", 
    "pasteral girona 5", 
    "ter entre freser i vallfogona 2", 
    "ter entre el gurri i sau",
    "ter entre vallfogona i ges 1"
    )){
    cat(masses_new$NOM_COMU[i], "\n")
    line1 <- st_geometry(masses_new)[[i]]
    masses_new$geom[i] <- st_geometry((st_linestring(line1[rev(seq_len(nrow(line1))),])))
  }
}

which(duplicated(st_startpoint(masses_new)))

masses_new[duplicated(st_startpoint(masses_new)), "NOM_COMU", drop = T]


st_write(masses_new, "data_raw/MASSES_AIGUA_BE.gpkg", layer = "intent_3")




