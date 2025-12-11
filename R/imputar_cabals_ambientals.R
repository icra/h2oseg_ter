source("R/load_graph.R")
library(sfnetworks)
library(igraph)
library(tmap)
tmap_mode('view')
library(units)

mant_raw <- read_sf("data_raw/CABALS_MANTENIMENT.gpkg") |>
  clean_names()

mant <- mant_raw |>
  st_drop_geometry() |>
  mutate(across(gen:des, \(x) as.numeric(x))) |>
  mutate(
    nom_reparat = if_else(str_detect(nom_comu, "rupit"), "rupit", nom_comu)
  ) |>
  filter(if_all(gen:des, \(x) !is.na(x))) |>
  summarize(across(gen:des, \(x) mean(x)), .by = nom_reparat)

edges <- edges |>
  left_join(mant, by = join_by(NOM_COMU == nom_reparat))

xarxa <- sfnetwork(nodes, edges, node_key = "codi_sad")

# --- extreure arestes i nodes
edges_tbl <- xarxa %>%
  activate(edges) %>%
  as_tibble()

qtm(
  edges_tbl,
  col = "gen",
  lwd = 2,
  col.scale = tm_scale_continuous(
    values = "matplotlib.viridis",
    value.na = "red"
  )
)

# Model per capçaleres en funció de la llargada del riu ----------------------------------------

capcaleres <- edges_tbl |>
  st_drop_geometry() |>
  filter(!(from %in% to)) |>
  filter(from != 126)

capcaleres |>
  arrange(desc(gen)) |>
  pivot_longer(gen:des) |>
  ggplot(aes(x = river_length, y = value, color = name)) +
  geom_point() +
  geom_smooth(method = 'lm', formula = y ~ x + 0)

predict_cabal <- function(mes) {
  formula <- paste(mes, '~ river_length + 0')
  model <- lm(formula, capcaleres) |> summary()
  beta <- model$coefficients[1, 1]
  pvalue <- model$coefficients[1, 4]
  r2 <- model$r.squared
  tibble(mes, beta, pvalue, r2)
}

month_cols <- capcaleres |>
  st_drop_geometry() |>
  select(gen:des) |>
  names()

models <- month_cols |>
  map(predict_cabal) |>
  list_rbind()

stopifnot(all(
  edges_tbl[
    which(edges_tbl$nom_correlatiu %in% capcaleres$nom_correlatiu),
    "nom_correlatiu",
    drop = TRUE
  ] ==
    capcaleres$nom_correlatiu
))

for (m in models$mes) {
  edges_tbl[
    which(edges_tbl$nom_correlatiu %in% capcaleres$nom_correlatiu),
    m
  ] <- if_else(
    is.na(capcaleres[[m]]),
    models |>
      filter(mes == m) |>
      pull(beta) *
      as.numeric(capcaleres$river_length),
    capcaleres[[m]]
  )
}

qtm(
  edges_tbl,
  col = "gen",
  lwd = 2,
  col.scale = tm_scale_continuous(
    values = "matplotlib.viridis",
    value.na = "red"
  )
)


# --- sumar arestes entrants per node destí (to) i mes

topo <- topo_sort(xarxa, mode = "out") |> as.integer()

for (v in topo) {
  inc_idx <- which(edges_tbl$to == v)
  out_idx <- which(edges_tbl$from == v)

  if (length(out_idx) == 0 || length(inc_idx) == 0) {
    next
  }

  for (col in month_cols) {
    na_edges <- out_idx[is.na(edges_tbl[out_idx, col, drop = TRUE])]

    if (length(na_edges) == 0) {
      next
    }

    inc_vals <- edges_tbl[inc_idx, col, drop = TRUE]

    if (any(is.na(inc_vals))) {
      rlang::abort("Valors NA en els incomers")
    }

    flow_in <- sum(inc_vals)
    if (is.na(flow_in)) {
      rlang::abort("flow_inc missing")
    }
    edges_tbl[na_edges, col] <- flow_in
  }
}

stopifnot(
  edges_tbl |>
    filter(if_any(gen:des, \(x) is.na(x))) |>
    nrow() ==
    0
)

edges_tbl |>
  st_drop_geometry() |>
  select(nom_correlatiu, gen:des) |>
  rowwise() |>
  mutate(envFlow0 = mean(c_across(gen:des))) |>
  ungroup() |>
  rename_with(\(x) paste0("envFlow", 1:12), .cols = gen:des) |>
  write_rds("data_raw/cabals_ambientals.rds")
