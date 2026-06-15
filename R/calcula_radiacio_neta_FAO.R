Rn_FAO <- function(Rs, Tmax, Tmin, ea, lat, J, z) {
  
  # Constants
  sigma <- 4.903e-9  # Stefan-Boltzmann (MJ K⁻⁴ m⁻² day⁻¹)
  alpha <- 0.23
  
  # --- 1. Conversió temperatura a Kelvin
  TmaxK <- Tmax + 273.16
  TminK <- Tmin + 273.16
  
  # --- 2. Radiació extraterrestre (Ra)
  dr <- 1 + 0.033 * cos(2 * pi / 365 * J)
  delta <- 0.409 * sin(2 * pi / 365 * J - 1.39)
  ws <- acos(-tan(lat) * tan(delta))
  
  Ra <- (24 * 60 / pi) * 0.0820 * dr * (
    ws * sin(lat) * sin(delta) +
      cos(lat) * cos(delta) * sin(ws)
  )
  
  # --- 3. Clear-sky radiation
  Rso <- (0.75 + 2e-5 * z) * Ra  # z=0 si no tens altitud
  
  # --- 4. Shortwave net
  Rns <- (1 - alpha) * Rs
  
  # --- 5. Longwave net
  Rnl <- sigma * ((TmaxK^4 + TminK^4) / 2) *
    (0.34 - 0.14 * sqrt(ea)) *
    (1.35 * (Rs / Rso) - 0.35)
  
  # --- 6. Net radiation
  Rn <- Rns - Rnl
  return(Rn)
}
