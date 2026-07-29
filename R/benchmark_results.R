library(tidyverse)
use('janitor', 'clean_names')
library(jsonlite)

times <- read_json(
  "data_raw/benchmark_results.json",
  simplifyVector = T
)$results |>
  as_tibble() |>
  select(-c(months, runs, rawTimesMs)) |>
  clean_names() |>
  mutate(across(where(is.double), \(x) x / 1000)) |>
  rename_with(\(x) str_remove(x, "_?ms$")) |>
  mutate(years = fct(as.character(years))) |>
  mutate(benchmark = 'Browser')

attr(times, "units") <- "seconds"

times_4 <- read_json(
  "data_raw/benchmark_4_years.json",
  simplifyVector = T
)$results |>
  as_tibble() |>
  select(-c(months, runs, rawTimesMs)) |>
  clean_names() |>
  mutate(across(where(is.double), \(x) x / 1000)) |>
  rename_with(\(x) str_remove(x, "_?ms$"))

times_5 <- read_json(
  "data_raw/benchmark_5_years.json",
  simplifyVector = T
)$results |>
  as_tibble() |>
  select(-c(months, runs, rawTimesMs)) |>
  clean_names() |>
  mutate(across(where(is.double), \(x) x / 1000)) |>
  rename_with(\(x) str_remove(x, "_?ms$"))

only_model <- read_json(
  "data_raw/benchmark_only_model.json",
  simplifyVector = T
)$results |>
  as_tibble() |>
  select(-c(months, runs, rawTimesMs)) |>
  clean_names() |>
  mutate(across(where(is.double), \(x) x / 1000)) |>
  rename_with(\(x) str_remove(x, "_?ms$")) |>
  mutate(years = fct(as.character(years))) |>
  select(years, mean, sd) |>
  mutate(benchmark = 'Model-only')

browser <- times |>
  mutate(across(c(mean, sd), \(x) {
    case_when(
      years == 4 ~ times_4[[cur_column()]],
      years == 5 ~ times_5[[cur_column()]],
      .default = x
    )
  })) |>
  select(years, mean, sd, benchmark)


bind_rows(browser, only_model) |>
  ggplot(aes(years, mean, group = benchmark)) +
  geom_ribbon(
    aes(ymin = mean - sd, ymax = mean + sd),
    alpha = 0.5,
    fill = "grey80"
  ) +
  geom_line(aes(color = benchmark)) +
  labs(
    x = "Simulated years",
    y = "Seconds",
    color = "Benchmark"
  ) +
  scale_y_log10() +
  theme_minimal()
ggsave(
  "C:/Users/jpueyo/ICRA/H2OSEG - ICRA - General/WP4/figures/benchmark.png",
  width = 7,
  height = 4
)
