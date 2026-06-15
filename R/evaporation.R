library(tidyverse)
use('janitor', 'clean_names')
library(sf)
library(meteocat)
library(tmap)
tmap_mode('view')
use('assertr', c('verify', 'not_na'))
source("R/calcula_radiacio_neta_FAO.R")

xema <- download_stations()

est_sau <- xema |>
  filter(str_detect(nom, "Sau"))

codes <- download_code_variables("diaris")

# E = (m * Rn + y * 6.43 * (1 + 0.536 * U2) * de) / (gamma * (m + y))
# Rn: radiància neta (MJ/m2/dia) -> radiació extraterrestre + hores de sol segons Allen et al 1998

est <- "XO"
any <- '2024'

tmit <- download_daily_year('1000', est, any)

rad_global <- download_daily_year('1400', est, any)

tmx <- download_daily_year('1001', est, any)
tmn <- download_daily_year('1002', est, any)

HR <- download_daily_year('1100', est, any)

e_s <- 0.6108 * exp((17.27 * tmit$valor) / (tmit$valor + 237.3))
e_a <- e_s * (HR$valor / 100)

lat_rad <- xema |>
  filter(id_station == est) |>
  st_transform(4326) |>
  st_coordinates() |>
  as_tibble() |>
  mutate(y_rad = Y * pi / 180) |>
  pull(y_rad)

Rn <- Rn_FAO(
  rad_global$valor,
  tmx$valor,
  tmn$valor,
  e_a,
  lat_rad,
  1:nrow(rad_global),
  500
)


u10 <- download_daily_year('1503', est, any)

u2 <- tibble(
  data = seq.Date("2024-01-01", "2024-12-31")
) |>
  left_join(u10, by = "data") |>
  fill(valor) |>
  verify(not_na(valor))

P_atm <- 101.3 * ((293 - 0.0065 * 500) / 293)^5.26
const_psico <- 0.665 * 1e-3 * P_atm

pendent <- (4098 * 0.6108 * exp((17.27 * tmit$valor) / (tmit$valor + 237.3))) /
  ((tmit$valor + 237.3)^2)

E0 <- ((pendent *
  Rn +
  const_psico * 6.43 * (1 + 0.536 * u2$valor) * (e_s - e_a)) /
  (2.45 * (pendent + const_psico)))

E0 <- tibble(
  data = u2$data,
  E0 = E0
)

write_rds(E0, "data_raw/evaporacio_FAO.rds")

# ETP -------------------------------------------------------------------

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

etp_mensual <- tmit |>
  mutate(mes = month(data)) |>
  summarize(tmit = mean(valor), .by = mes) |>
  mutate(etp = calc_etp(tmit, mes))

e0_mensual <- E0 |>
  mutate(mes = month(data)) |>
  summarize(E0 = sum(E0), .by = mes) |>
  inner_join(etp_mensual, by = "mes") |>
  inner_join(ppt_mensual, by = "mes")


e0_mensual |>
  pivot_longer(c(E0, etp)) |>
  ggplot(aes(mes, value, color = name)) +
  geom_line()

mod <- lm(E0 ~ etp, e0_mensual)

summary(mod)

et_mensual <- e0_mensual |>
  mutate(et = etp * mod$coefficients[[2]] + mod$coefficients[[1]])

et_mensual |>
  pivot_longer(c(E0, et, etp)) |>
  ggplot(aes(mes, value, color = name)) +
  geom_line()

mean(sqrt((et_mensual$E0 - et_mensual$etp)^2))
mean(sqrt((et_mensual$E0 - et_mensual$et)^2))

# Corba cota - superficie -------------------------------------------

## Ajustar un model de regressió -----------------------------------

volums <- read_csv2("data_raw/nivell_volum_sau_susqueda.csv") |>
  clean_names() |>
  filter(nivell_absolut_msnm > 200) |>
  mutate(volum_m3 = volum_embassat_hm3 * 1e6)

volums |>
  ggplot(aes(nivell_absolut_msnm, volum_m3, color = estacio)) +
  geom_point()

sau <- volums |>
  filter(str_detect(estacio, "Sau"))

mod_sau <- lm(
  nivell_absolut_msnm ~ poly(volum_m3, 2, raw = TRUE),
  sau
)
summary(mod_sau)

sauA <- mod_sau$coefficients[[3]]
sauB <- mod_sau$coefficients[[2]]

sau <- sau |>
  mutate(area = 1 / (2 * sauA * volum_m3 + sauB))

summary(sau$area)

sau |>
  ggplot(aes(area / 1e4, volum_embassat_hm3)) +
  geom_point()

sus <- volums |>
  filter(str_detect(estacio, "Susqueda"))

mod_sus <- lm(
  nivell_absolut_msnm ~ poly(volum_m3, 2, raw = TRUE),
  sus
)
summary(mod_sus)

susA <- mod_sus$coefficients[[3]]
susB <- mod_sus$coefficients[[2]]

sus_area <- sus |>
  mutate(area = 1 / (2 * susA * volum_m3 + susB))

summary(sus_area$area)

sus_area |>
  ggplot(aes(area / 1e4, volum_embassat_hm3)) +
  geom_point()

## Interpolació -----------------------------------------------------------

sau_area <- sau |>
  mutate(area = c(diff(volum_m3) / diff(nivell_absolut_msnm), NA)) |>
  filter(is.finite(area))
