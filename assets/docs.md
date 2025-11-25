La contribució de cada àrea de drenatge es calcula de la següent manera: $$
C_i = A(P_i - ETP_i\sum{Kc_jp_j} - \Delta{Nr})
$$

On *A* és l'àrea de drenatge, *P~i~* és la precipitació acumulada del mes *i*, ETP~i~ és la evapotranspiració de referència del mes *i*, *Kc~j~* és la constant de la coberta del sòl *j* i *p~j~* és la proporció de superfície ocupada per la coberta *j*. $\Delta{N}$ és la diferència en el gruix de neu respecte al mes anterior i *r* és una ràtio de conversió entre mm de neu i mm de pluja.

Els factors a calibrar son *Kc* i *r*. La calibració es realitza de manera independent aigües amunt i aigües avall de l'embassament i per cada mes.

*ET*P es calcula segons el mètode de [Thornwaite](https://hidrologia.usal.es/temas/Evapotransp.pdf):

$$
ETP_i = ETP_{sc}\frac{N_i}{12}\frac{d_i}{30}
$$

$$
ETPsc_i = 16(\frac{10t_i}{I})^a
$$

$$
I = \sum{(\frac{t_i}{5})^{1.514}}
$$

-   ETP~sc~: ETP sense corregir (mm)
-   N: número màxim d'hores de sol segons la latitud.
-   d: número de dies del mes
-   I: Índex de calor anual
-   a: *6.75x10^-7^I^3^ - 771x10^-7^I^2^ + 1792x10^-5^I + 0.49239*
-   t: temperatura mitjana del mes *i* (ºC)