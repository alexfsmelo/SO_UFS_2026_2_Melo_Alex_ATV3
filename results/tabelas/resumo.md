# Parte C: resumo gerado por lab/resumo.py

Checksum de referencia: 098953c3ffd76aa3 (N=40000000, recalculado no host em 5.68s)

## Execucoes (ordem real, ABBA)

| ordem | cond. | rep | valida | wall (s) | CPU proc. (s) | trabalho/s (M it/s) | cpu.max | periodos | throttled | throttled (s) | RSS (KiB) | memory.peak* (KiB) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | C1 | 1 | sim | 24.792 | 12.394 | 1.613 | 50000 100000 | 248 | 248 | 12.390 | 17440 | 11436 |
| 2 | C2 | 1 | sim | 12.342 | 12.334 | 3.241 | 100000 100000 | 123 | 6 | 0.003 | 17312 | 11428 |
| 3 | C2 | 2 | sim | 11.935 | 11.934 | 3.352 | 100000 100000 | 119 | 0 | 0.000 | 17432 | 11288 |
| 4 | C1 | 2 | sim | 25.069 | 12.517 | 1.596 | 50000 100000 | 251 | 251 | 12.544 | 17372 | 11424 |
| 5 | C1 | 3 | sim | 25.335 | 12.682 | 1.579 | 50000 100000 | 253 | 253 | 12.645 | 17316 | 11436 |
| 6 | C2 | 3 | sim | 12.297 | 12.297 | 3.253 | 100000 100000 | 123 | 0 | 0.000 | 17368 | 11420 |

## Por condicao (n = 3 repeticoes validas)

| cond. | --cpus | cpu.max efetivo | wall mediana (s) | trabalho/s mediana (M it/s) | min-max (M it/s) | amplitude | CPU efetiva media (CPUs) | periodos throttled | throttled mediano (s) |
|---|---|---|---|---|---|---|---|---|---|
| C1 | 0.5 | 50000 100000 | 25.069 | 1.596 | 1.579-1.613 | 2.2% | 0.500 | 100% | 12.544 |
| C2 | 1.0 | 100000 100000 | 12.297 | 3.253 | 3.241-3.352 | 3.4% | 1.000 | 0% | 0.000 |

Razao das medianas de trabalho/s (C2/C1): 2.039

*memory.peak lido diretamente do cgroup v2 (pico desde a criacao do cgroup).
