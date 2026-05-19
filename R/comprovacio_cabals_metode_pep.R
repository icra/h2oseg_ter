library(tidyverse)
use('janitor', 'clean_names')
library(jsonlite)

afor <- read_json("calibration/cabals_aforament.json", simplifyVector = T)

get_nodes_afor <- function(json_path) {
  dades <- read_json(json_path, simplifyVector = T)

  nodes <- dades$nodes$data |> as_tibble()

  nodes |>
    filter(id %in% afor$codi_sad) |>
    select(id, starts_with("inflow"), -inflow0) |>
    pivot_longer(-id) |>
    mutate(name = str_extract(name, "\\d+") |> as.integer())
}

amb_neu <- get_nodes_afor("calibration/dades_h2oseg_ter_amb_neu.json")
sense_neu <- get_nodes_afor("calibration/dades_h2oseg_ter_sense_neu.json")
infilt_20 <- get_nodes_afor("calibration/dades_h2oseg_ter_20_infil.json")

afor |>
  inner_join(
    amb_neu,
    by = join_by(codi_sad == id, mes == name),
    suffix = c("", "_amb_neu")
  ) |>
  inner_join(
    sense_neu,
    by = join_by(codi_sad == id, mes == name),
    suffix = c("_amb_neu", "_sense_neu")
  ) |>
  as_tibble() |>
  rename(
    observat = cabal_m3s,
    estimat_amb_neu = value_amb_neu,
    estimat_sense_neu = value_sense_neu
  ) %>%
  assertr::verify(nrow(.) == nrow(afor)) |>
  pivot_longer(starts_with("estimat")) |>
  mutate(diff = value - observat) |>
  summarize(mean(diff), .by = name)
# ens quedem amb els cabals sense considerar la neu perquè ajusten millor
filter(name == "estimat_sense_neu") |>
  mutate(mes = fct(as.character(mes), levels = as.character(1:12))) |>
  ggplot(aes(mes, diff, fill = diff > 0)) +
  geom_col(position = position_dodge2(), show.legend = F) +
  geom_line(aes(y = observat, color = "Cabal observat", group = 1)) +
  labs(y = "Estimat - observat (m3/s)") +
  ggtitle(
    "Diferència entre cabals estimats i observats sense considerar la interacció amb l'aqüífer"
  ) +
  scale_color_manual(values = c("Cabal observat" = "black")) +
  facet_wrap(~codi_sad, scales = "free_y") +
  theme(
    legend.position = c(0.5, 0.1),
    legend.title = element_blank()
  )

sense_neu_com <- afor |>
  inner_join(
    sense_neu,
    by = join_by(codi_sad == id, mes == name)
  ) |>
  as_tibble() |>
  rename(
    observat = cabal_m3s,
    estimat = value
  ) %>%
  assertr::verify(nrow(.) == nrow(afor)) |>
  mutate(diff = estimat - observat) |>
  mutate(mes = fct(as.character(mes), levels = as.character(1:12)))

sense_neu_com |>
  ggplot(aes(mes, diff, fill = diff > 0)) +
  geom_col(position = position_dodge2(), show.legend = F) +
  geom_line(aes(y = observat, color = "Cabal observat", group = 1)) +
  labs(y = "Estimat - observat (m3/s)") +
  ggtitle(
    "Diferència entre cabals estimats i observats sense considerar la interacció amb l'aqüífer"
  ) +
  scale_color_manual(values = c("Cabal observat" = "black")) +
  facet_wrap(~codi_sad, scales = "free_y") +
  theme(
    legend.position = "bottom",
    legend.title = element_blank()
  )

sense_neu_com |>
  pivot_longer(c(observat, estimat)) |>
  ggplot(aes(mes, value, color = name, group = name)) +
  geom_line() +
  facet_wrap(~codi_sad, scales = "free_y")


dades <- read_json(
  "calibration/dades_h2oseg_ter_sense_neu.json",
  simplifyVector = T
)

nodes <- dades$nodes$data |> as_tibble()

nodes |>
  select(id, starts_with("et"), starts_with("tmit"), starts_with("ppt")) |>
  filter_out(is.na(ppt1)) |>
  pivot_longer(-id) |>
  mutate(variable = str_extract(name, "^[a-z]+")) |>
  mutate(mes = str_extract(name, "\\d+$") |> fct_inorder()) |>
  summarize(value = mean(value), .by = c(variable, mes)) |>
  ggplot(aes(x = mes, y = value, color = variable, group = variable)) +
  geom_line()
