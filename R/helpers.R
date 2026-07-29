library(tidyverse)

months_rasters <- c(
  "gener",
  "febrer",
  "marc",
  "abril",
  "maig",
  "juny",
  "juliol",
  "agost",
  "setembre",
  "octubre",
  "novembre",
  "desembre"
)

create_month_index <- function(file, preffix, months = months_rasters) {
  case_when(
    stringr::str_detect(file, months[[1]]) ~ paste0(preffix, 1),
    stringr::str_detect(file, months[[2]]) ~ paste0(preffix, 2),
    stringr::str_detect(file, months[[3]]) ~ paste0(preffix, 3),
    stringr::str_detect(file, months[[4]]) ~ paste0(preffix, 4),
    stringr::str_detect(file, months[[5]]) ~ paste0(preffix, 5),
    stringr::str_detect(file, months[[6]]) ~ paste0(preffix, 6),
    stringr::str_detect(file, months[[7]]) ~ paste0(preffix, 7),
    stringr::str_detect(file, months[[8]]) ~ paste0(preffix, 8),
    stringr::str_detect(file, months[[9]]) ~ paste0(preffix, 9),
    stringr::str_detect(file, months[[10]]) ~ paste0(preffix, 10),
    stringr::str_detect(file, months[[11]]) ~ paste0(preffix, 11),
    stringr::str_detect(file, months[[12]]) ~ paste0(preffix, 12),
    .default = "error"
  )
}
