library(tidyverse)
use('janitor', 'clean_names')
library(terra)
library(sf)
library(meteocat)
library(stars)
source("R/model_neu.R")

months <- c(paste0("m0", 1:9), paste0("m", 10:12))

gruixos_rf <- read_rds("data_raw/gruixos_rf.rds") |>
  mutate(across(everything(), \(x) x$.pred))

gruixos_kr <- read_rds("data_raw/gruixos_kriging.rds")

for (i in seq_along(months)) {
  if (all(is.na(gruixos_kr[[i]]))) {
    next
  }
  gruixos_rf[[months[[i]]]] <- gruixos_rf[[months[[i]]]] +
    if_else(is.na(gruixos_kr[[i]]), 0, gruixos_kr[[i]])
}

gruixos_rf <- gruixos_rf |>
  mutate(across(everything(), \(x) if_else(x < 0, 0, x)))

for (m in months) {
  rasterize_grid(grid, m, template, gruixos_rf) |>
    write_stars(file.path("data_raw", "gruixos_neu", paste0(m, ".tif")))
}
