u <- c(
  u_herba = 0.2,
  u_bosc = 0.3,
  u_urba = 0.05,
  u_conreu = 0.4
)

a <- c(
  a_herba = 2,
  a_bosc = 2500,
  a_urba = 2,
  a_conreu = 250
)

a_total <- sum(a)

p <- a / a_total

pluja <- 100

(pluja - pluja * sum(p * u)) * a_total
