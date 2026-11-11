# Parte C: resumo gerado por lab/resumo.py

Checksum de referencia: 098953c3ffd76aa3 (N=40000000, cache)

## Execucoes (ordem real, ABBA)

| ordem | cond. | rep | valida | wall (s) | CPU proc. (s) | trabalho/s (M it/s) | cpu.max | periodos | throttled | throttled (s) | RSS (KiB) | memory.peak* (KiB) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | C1 | 1 | sim | 15.625 | 7.826 | 2.560 | 50000 100000 | 157 | 157 | 7.611 | 12980 | 6412 |
| 2 | C2 | 1 | sim | 7.278 | 7.208 | 5.496 | 100000 100000 | 72 | 0 | 0.000 | 13072 | 6660 |
| 3 | C2 | 2 | sim | 7.049 | 6.971 | 5.675 | 100000 100000 | 71 | 0 | 0.000 | 13068 | 6548 |
| 4 | C1 | 2 | sim | 14.633 | 7.334 | 2.734 | 50000 100000 | 146 | 146 | 7.183 | 13028 | 6300 |
| 5 | C1 | 3 | sim | 15.383 | 7.689 | 2.600 | 50000 100000 | 154 | 154 | 7.520 | 13048 | 6324 |
| 6 | C2 | 3 | sim | 7.200 | 7.158 | 5.555 | 100000 100000 | 72 | 0 | 0.000 | 13040 | 6584 |

## Por condicao (n = 3 repeticoes validas)

| cond. | --cpus | cpu.max efetivo | wall mediana (s) | trabalho/s mediana (M it/s) | min-max (M it/s) | amplitude | CPU efetiva media (CPUs) | periodos throttled | throttled mediano (s) |
|---|---|---|---|---|---|---|---|---|---|
| C1 | 0.5 | 50000 100000 | 15.383 | 2.600 | 2.560-2.734 | 6.7% | 0.501 | 100% | 7.520 |
| C2 | 1.0 | 100000 100000 | 7.200 | 5.555 | 5.496-5.675 | 3.2% | 0.991 | 0% | 0.000 |

Razao das medianas de trabalho/s (C2/C1): 2.136

*Em cgroup v1, memory.peak corresponde a memory.max_usage_in_bytes (pico desde a criacao do cgroup).
