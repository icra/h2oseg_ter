library(tidyverse)
use('janitor', 'clean_names')
library(jsonlite)

results <- read_json("calibration/calibration_results.json") |>
  imap(\(x, i) {
    x$stations |>
      map(\(y) as_tibble(y)) |>
      list_rbind() |>
      mutate(mes = i)
  }) |>
  list_rbind()

results |>
  pivot_longer(c(meanObs_m3s, meanMod_m3s)) |>
  ggplot(aes(x = codi_sad, y = value, fill = name)) +
  geom_col(position = position_dodge()) +
  facet_wrap(~mes, ncol = 3) +
  scale_fill_discrete(labels = c("Estimat", "Observat")) +
  theme(
    axis.text.x = element_text(angle = 90, hjust = 1, vjust = 0.5)
  )

results |>
  ggplot(aes(x = codi_sad, y = bias, fill = factor(mes))) +
  geom_col(position = position_dodge()) +
  scale_x_discrete(labels = \(x) str_remove(x, "CONTROL_"))

results |>
  filter(codi_sad == 'CONTROL_TER_RODA')

ordre_estacions <- c(
  "CONTROL_TER_CAMPRODON",
  "CONTROL_TER_ABADESSES",
  "CONTROL_TER_RIPOLL",
  "CONTROL_TER_VOLTREGA",
  "CONTROL_TER_RODA"
)

results |>
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
