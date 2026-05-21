library(tidyverse)
use('janitor', 'clean_names')
library(jsonlite)
library(sfnetworks)
library(igraph)
library(sf)

xarxa <- sfnetwork(
  st_read("assets/nodes.geojson") |> select(-name) |> rename(name = id),
  st_read("assets/edges.geojson"),
  directed = TRUE
)

data <- read_json(
  "calibration/dades_h2oseg_ter_sense_neu.json",
  simplifyVector = T
)

crea_taula <- function(aforament) {
  ges_ups <- bfs(xarxa, aforament, mode = "in", unreachable = F)$order

  clima <- data$nodes$data |>
    as_tibble() |>
    filter(id %in% attr(ges_ups, "names")) |>
    select(
      id,
      starts_with("ppt"),
      starts_with("et"),
      starts_with("tmit"),
      area_m2
    ) |>
    filter_out(is.na(ppt1)) |>
    pivot_longer(-c(id, area_m2)) |>
    mutate(variable = str_extract(name, "[a-z]+")) |>
    mutate(mes = str_extract(name, "\\d+") |> as.integer()) |>
    filter_out(mes == 0) |>
    summarize(
      value = mean(value),
      area_km2 = sum(area_m2) / 1e6,
      .by = c(variable, mes)
    ) |>
    # summarize(
    #   value = sum(value),
    #   area_km2 = mean(area_km2),
    #   .by = variable
    # ) |>
    pivot_wider(names_from = variable, values_from = value) |>
    # mutate(tmit = tmit / 12) |>
    mutate(conca = aforament, .before = everything()) |>
    mutate(ratio_et_ppt = et / ppt)

  cabal <- data$nodes$data |>
    as_tibble() |>
    filter(id == aforament) |>
    select(starts_with("inflow")) |>
    pivot_longer(everything(), values_to = "cabal_m3s") |>
    mutate(mes = str_extract(name, "\\d+") |> as.integer()) |>
    filter_out(mes == 0) |>
    select(-name)

  inner_join(clima, cabal, by = "mes")
}

bind_rows(
  crea_taula("CONTROL_GES"),
  crea_taula("CONTROL_LLEMENA"),
  crea_taula("CONTROL_GURRI")
) |>
  mutate(across(where(is.numeric), \(x) round(x, 1))) |>
  write_excel_csv2("calibration/taula_climatiques.csv")
