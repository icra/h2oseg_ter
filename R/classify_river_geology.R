library(tidyverse)
use('janitor', 'clean_names')
use('assertr', c('verify', 'not_na'))
library(sf)
library(terra)
library(lwgeom)
library(tmap)
tmap_mode('view')

rivers <- read_sf("assets/edges.geojson") |>
  st_transform(25831)

amplada_buffer <- 100
buffer <- st_buffer(rivers, amplada_buffer)

st_layers(
  "C:/Users/jpueyo/OneDrive - Universitat de Girona/carto_cat/geologia-territorial-250000-geologic-v3r0-202312/geologia-territorial-250000-geologic-v3r0-202312.gpkg"
)

geologic <- read_sf(
  "data_raw/geologic_ter_25000.gpkg",
)

classify_alluvial <- function(x) {
  x0 <- str_to_lower(x)

  # Positius forts (alluvial clar)
  is_alluvial <- str_detect(
    x0,
    "(terrass)|(plana\\s*al·l|plana\\s*alluv|al·luv|alluv)|(delta)|(lev[eé]e)|(fons\\s*de\\s*vall)|(con\\s*de\\s*dejecci|abanic\\s*al·luv|alluvial\\s*fan)"
  )

  # Negatius forts (no alluvial)
  is_not <- str_detect(
    x0,
    "(duna|platg)|(llacustr)|(torb|aiguamoll)|(travert|tova\\s*calc|crostes\\s*carbon)|(morena|till)|(col·luvi|colluvi)|(evaporit|guix|sal)|(volc[aà]n|basalt|granit|gneiss|metamorf|calc[aà]ri|marg|gres|lutita|conglomerat\\b(?!.*dejecci))"
  )

  # Regla final: alluvial si és positiu i no és clarament negatiu
  is_alluvial & !is_not
}

p_aluvial <- geologic |>
  mutate(is_aluvial = classify_alluvial(Descripcio)) |>
  select(is_aluvial) |>
  st_intersection(buffer) |>
  select(is_aluvial, id) %>%
  mutate(area = st_area(.)) |>
  st_drop_geometry() |>
  mutate(
    total = sum(area),
    .by = c(id)
  ) |>
  summarize(
    p_aluvial = as.numeric(sum(area) / sum(total)),
    .by = c(id, is_aluvial)
  ) |>
  filter(is_aluvial == TRUE) |>
  select(id, p_aluvial)

agrifuturs <- "C:/Users/jpueyo/Documents/git_icra/agrifutures_cat/data"

mde <- rast(file.path(agrifuturs, "terrain/mde.tif"))

pendent <- rivers |>
  st_drop_geometry() |>
  select(id, lengthRiver) |>
  mutate(
    z_inici = extract(mde, vect(st_startpoint(rivers)))[, 2],
    z_final = extract(mde, vect(st_endpoint(rivers)))[, 2]
  ) |>
  mutate(pendent = pmax(1e-4, (z_inici - z_final) / lengthRiver)) |>
  select(id, pendent)

porositat_file <- file.path(agrifuturs, "soil/MSC250M_difftheta.gpkg")
porositat <- rasterize(vect(porositat_file), mde, "meandiftheta") |>
  crop(vect(buffer))

pedregositat_file <- file.path(agrifuturs, "soil/MSC250M_Pedregositat_v1.gpkg")
pedregositat <- rasterize(vect(pedregositat_file), mde, "pedregositat") |>
  crop(vect(buffer))

index_sol <- porositat * (1 - (pedregositat / 100))

index_sol <- rivers |>
  st_drop_geometry() |>
  select(id) |>
  mutate(index_sol = zonal(index_sol, vect(buffer), na.rm = T)[, 1])

scale_01 <- function(x) {
  r <- range(x, na.rm = TRUE)
  if (diff(r) == 0) {
    return(rep(0, length(x)))
  }
  (x - r[1]) / (r[2] - r[1])
}

rivers |>
  # st_drop_geometry() |>
  select(id) |>
  left_join(p_aluvial, by = "id") |>
  mutate(p_aluvial = replace_na(p_aluvial, 0)) |>
  qtm(col = "p_aluvial")
left_join(pendent, by = "id") |>
  verify(not_na(pendent)) |>
  left_join(index_sol, by = "id") |>
  verify(not_na(index_sol)) |>
  mutate(
    lpi = 0.5 *
      p_aluvial +
      0.3 * scale_01(index_sol) +
      0.2 * scale_01(1 / pendent)
  ) |>
  mutate(
    gwType = case_when(
      lpi < 0.33 ~ "low",
      between(lpi, 0.33, 0.66) ~ "mid",
      lpi > 0.66 ~ "high"
    )
  ) |>
  select(id, gwType) |>
  write_rds("data_raw/gwType.rds")
