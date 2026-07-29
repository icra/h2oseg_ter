library(tidyverse)
use('janitor', 'clean_names')
library(jsonlite)

path_paper <- "C:/Users/jpueyo/ICRA/H2OSEG - ICRA - General/WP4/figures"

stopifnot(dir.exists(path_paper))

cabals <- read_json("calibration/calibration_results.json") |>
  map(\(x) {
    x$stations |>
      map(\(y) as_tibble(y)) |>
      list_rbind() |>
      mutate(mes = x$mes)
  }) |>
  list_rbind()

cabals |>
  pivot_longer(c(meanObs_m3s, meanMod_m3s)) |>
  ggplot(aes(x = codi_sad, y = value, fill = name)) +
  geom_col(position = position_dodge()) +
  facet_wrap(~mes, ncol = 3) +
  scale_fill_discrete(labels = c("Estimat", "Observat")) +
  scale_x_discrete(labels = \(x) str_remove(x, "CONTROL_")) +
  labs(x = "Estació d'aforament", y = "m3/s", fill = "Valor") +
  theme(
    axis.text.x = element_text(angle = 90, hjust = 1, vjust = 0.5)
  )

cabals |>
  pivot_longer(c(meanObs_m3s, meanMod_m3s)) |>
  mutate(
    codi_sad = str_remove(codi_sad, "CONTROL_") |>
      str_replace_all("_", " ") |>
      str_to_title()
  ) |>
  mutate(name = if_else(str_detect(name, "Obs"), "Observed", "Estimated")) |>
  mutate(mes = fct(as.character(mes))) |>
  mutate(codi_sad = fct_reorder(codi_sad, desc(value))) |>
  ggplot(aes(x = mes, y = value, color = name, group = name)) +
  geom_line() +
  facet_wrap(~codi_sad, scales = "free_y") +
  labs(
    x = "Month",
    y = bquote(m^3 / s)
  ) +
  theme_minimal() +
  theme(
    legend.title = element_blank()
  )
ggsave(
  file.path(path_paper, "calibration_by_station.png"),
  width = 7,
  height = 4
)

read_json(
  "calibration/dades_h2oseg_ter_calibrades.json",
  simplifyVector = T
)$nodes$data |>
  as_tibble() |>
  select(id, starts_with('inflow')) |>
  pivot_longer(-id) |>
  mutate(name = str_extract(name, '\\d+') |> as.integer()) |>
  inner_join(cabals, by = join_by(id == codi_sad, name == mes)) |>
  select(id, value, meanMod_m3s, name)

cabals |>
  ggplot(aes(x = codi_sad, y = bias, fill = codi_sad)) +
  geom_col(position = position_dodge2(), show.legend = F) +
  labs(x = "Estació d'aforament", y = "m3/s") +
  scale_x_discrete(labels = \(x) str_remove(x, "CONTROL_"))

cabals |>
  filter(codi_sad == 'CONTROL_TER_RODA')

ordre_estacions <- c(
  "CONTROL_TER_CAMPRODON",
  "CONTROL_TER_ABADESSES",
  "CONTROL_TER_RIPOLL",
  "CONTROL_TER_VOLTREGA",
  "CONTROL_TER_RODA"
)

# Multiplicadors
read_json("calibration/calibration_results.json") |>
  map(\(x) {
    tibble(
      mes = x$mes,
      rneu = x$rNeuMul
    )
  }) |>
  list_rbind()

# Control cabals ------------------------------------

cabals |>
  filter(str_detect(codi_sad, "_TER_")) |>
  mutate(
    codi_sad = fct(
      codi_sad,
      levels = ordre_estacions
    )
  ) |>
  ggplot(aes(x = codi_sad, y = meanObs_m3s, group = mes)) +
  geom_line() +
  facet_wrap(~mes) +
  scale_x_discrete(labels = \(x) str_remove(x, "CONTROL_TER_")) +
  theme(
    axis.text.x = element_text(angle = 90, hjust = 1, vjust = 0.5)
  )

source('R/read_db.R')
source('R/load_graph.R')

data |>
  filter(
    codi_sad %in% (nodes |> filter(type == "aforament") |> pull(codi_sad))
  ) |>
  filter(str_detect(codi_sad, "_TER_")) |>
  filter(any %in% 2019:2024) |>
  mutate(nom_dada = fct_inorder(nom_dada)) |>
  mutate(
    codi_sad = fct(codi_sad, ordre_estacions)
  ) |>
  ggplot(aes(
    x = codi_sad,
    y = valor_cabal,
    color = nom_dada,
    group = nom_dada
  )) +
  geom_line() +
  facet_wrap(~any) +
  scale_x_discrete(labels = \(x) str_remove(x, "CONTROL_TER_")) +
  theme(
    axis.text.x = element_text(angle = 90, hjust = 1, vjust = 0.5)
  )


read_json("calibration/calibration_indicators.json", simplifyVector = T) |>
  pluck("perStation") |>
  mutate(across(where(is.numeric), \(x) round(x, 2))) |>
  write_excel_csv2("calibration/calibration_indicators.csv")

# cabals -----------------------------------------------------------
