months_days <- c(31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)

calc_etp <- function(tmean, month) {
  # https://hidrologia.usal.es/temas/Evapotransp.pdf

  if (length(tmean) != 12) {
    rlang::abort("tmean no té 12 valors")
  }
  if (!all.equal(month, 1:12)) {
    rlang::abort("mesos no ordenats")
  }

  i <- (tmean / 5)^(1.514)
  I <- sum(i, na.rm = TRUE)
  a <- 675 * (10^-9) * I^3 - 771 * 10^-7 * I^2 + 1792 * 10^-5 * I + 0.49239
  etp_sc <- 16 * (10 * tmean / I)^a
  etp_sc[is.nan(etp_sc)] <- 0
  # apendix 4 de https://hidrologia.usal.es/temas/Evapotransp.pdf
  N <- c(9.3, 10.4, 11.7, 13.2, 14.4, 15, 14.8, 13.7, 12.3, 10.8, 9.6, 9)
  etp <- etp_sc * (N / 12) * (months_days / 30)
  etp[etp < 0] <- 0
  etp
}


nodes <- read_sf("data_raw/nodes_natural_antropic.gpkg") |>
  filter(!is.na(codi_sad)) |>
  bind_rows(
    read_sf("data_raw/aforaments.gpkg") |>
      select(codi_sad, type, nom)
  ) |>
  left_join(read_rds("data_raw/conques_dades_cabal.rds"), by = 'codi_sad') |>
  left_join(read_rds("data_raw/cabals_antropic.rds"), by = 'codi_sad') |>
  filter_out(is.na(ppt1)) |>
  st_drop_geometry()

ppt <- nodes |>
  select(codi_sad, starts_with('ppt')) |>
  pivot_longer(starts_with('ppt'), names_to = "month", values_to = 'ppt') |>
  mutate(month = str_extract(month, '\\d+') |> as.numeric())

tmit <- nodes |>
  select(codi_sad, starts_with('tmit')) |>
  pivot_longer(starts_with('tmit'), names_to = "month", values_to = 'tmit') |>
  mutate(month = str_extract(month, '\\d+') |> as.numeric())

w <- tribble(
  ~us                 , ~w   ,
  "us_conreu_seca"    , 0.75 ,
  "us_conreu_regadiu" , 1.5  ,
  "us_prats"          , 1    ,
  "us_forestal"       , 1.75 ,
  "us_urba"           , 0    ,
  "us_aigua"          , 0
)

calc_et_zhang <- function(n) {
  map2_dbl(w$us, w$w, \(us, w) {
    # if (n$ppt <= 0) {
    #   return(0)
    # }

    ai <- n$etp / n$ppt

    n[[us]] *
      n$ppt *
      (1 + w * (ai)) /
      (1 + w * ai + (ai)^(-1))
  }) |>
    sum()
}

df <- ppt |>
  inner_join(tmit, by = c('codi_sad', 'month')) |>
  left_join(
    nodes |> select(codi_sad, area_m2, all_of(w$us)),
    by = 'codi_sad'
  ) |>
  mutate(etp = calc_etp(tmit, month), .by = codi_sad)

calc_et_fu <- function(etp, ppt) {
  ppt * (1 + etp / ppt - (1 + (etp / ppt)^2.56)^(1 / 2.56))
}

et <- df |>
  mutate(et_calbo = ppt * (0.7316 + 0.223 * log(etp / ppt - 0.1643))) |>
  mutate(et_fu = calc_et_fu(etp, ppt)) |>
  rowwise() |>
  mutate(et_zhang = calc_et_zhang(cur_data())) |>
  ungroup() |>
  mutate(month = fct(as.character(month)))

et |>
  ggplot(aes(x = et_zhang, y = et_fu)) +
  geom_point(aes(color = month)) +
  geom_smooth()
geom_text(aes(label = codi_sad))
