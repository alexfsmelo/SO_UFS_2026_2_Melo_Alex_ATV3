#!/usr/bin/env python3
"""Carga deterministica de CPU com trabalho fixo (Atividade 3, SO UFS 2026.2).

O trabalho e uma quantidade fixa N de iteracoes de um gerador congruente
linear de 64 bits. Cada iteracao alimenta um acumulador, entao o checksum
final depende de todas as N iteracoes: se o processo pular ou repetir
trabalho, o checksum muda. O mesmo N sempre produz o mesmo checksum, o que
permite conferir a correcao fora do conteiner (resumo.py faz isso).

Alem do trabalho, o script mede:
  * tempo de parede (perf_counter) e tempo de CPU do processo (process_time);
  * memoria do processo: VmRSS e VmHWM de /proc/self/status e ru_maxrss;
  * contadores do proprio cgroup, lidos ANTES e DEPOIS do trabalho, em
    cgroup v2 (cpu.max, cpu.stat, memory.*, pids.*) ou v1 (cpu.cfs_*,
    cpuacct.usage, memory.*_in_bytes, pids.*). Os nomes v1 sao convertidos
    para os nomes v2 equivalentes, e os valores brutos tambem sao gravados.

Seguranca: limite interno de 60 s de parede. Se estourar, o laco para,
o status vira "timeout_interno" e o codigo de saida e 3.

Saida: um objeto JSON em uma linha no stdout.
"""
import argparse
import json
import os
import platform
import resource
import socket
import sys
import time

VERSAO = "1.0"
LIMITE_INTERNO_S = 60.0
BLOCO = 500_000  # iteracoes entre verificacoes do limite de tempo


def trabalho(n, limite_s=LIMITE_INTERNO_S):
    """Executa n iteracoes do LCG; devolve (checksum_hex, feitas, completo)."""
    mask = (1 << 64) - 1
    a = 6364136223846793005
    c = 1442695040888963407
    x = 0x9E3779B97F4A7C15
    acc = 0
    feitas = 0
    t0 = time.perf_counter()
    while feitas < n:
        m = min(BLOCO, n - feitas)
        for _ in range(m):
            x = (x * a + c) & mask
            acc = (acc + (x >> 29)) & mask
        feitas += m
        if time.perf_counter() - t0 > limite_s:
            return f"{acc:016x}", feitas, False
    return f"{acc:016x}", feitas, True


def _ler(caminho):
    try:
        with open(caminho) as f:
            return f.read().strip()
    except OSError:
        return None


def _kv(texto):
    d = {}
    if not texto:
        return d
    for linha in texto.splitlines():
        partes = linha.split()
        if len(partes) == 2:
            try:
                d[partes[0]] = int(partes[1])
            except ValueError:
                d[partes[0]] = partes[1]
    return d


def _int(texto):
    if texto is None:
        return None
    try:
        return int(texto)
    except ValueError:
        return texto  # por exemplo "max"


def snapshot_cgroup(raiz="/sys/fs/cgroup"):
    """Le os arquivos do cgroup do proprio processo (visao de dentro do conteiner)."""
    if os.path.exists(os.path.join(raiz, "cgroup.controllers")):
        stat = _kv(_ler(f"{raiz}/cpu.stat"))
        return {
            "cg_versao": 2,
            "cpu_max": _ler(f"{raiz}/cpu.max"),
            "usage_usec": stat.get("usage_usec"),
            "nr_periods": stat.get("nr_periods"),
            "nr_throttled": stat.get("nr_throttled"),
            "throttled_usec": stat.get("throttled_usec"),
            "memory_max": _int(_ler(f"{raiz}/memory.max")),
            "memory_swap_max": _int(_ler(f"{raiz}/memory.swap.max")),
            "memory_current": _int(_ler(f"{raiz}/memory.current")),
            "memory_peak": _int(_ler(f"{raiz}/memory.peak")),
            "pids_max": _int(_ler(f"{raiz}/pids.max")),
            "pids_current": _int(_ler(f"{raiz}/pids.current")),
            "brutos": {"cpu.stat": stat},
        }
    # cgroup v1: cada controlador montado em /sys/fs/cgroup/<controlador>
    quota = _int(_ler(f"{raiz}/cpu/cpu.cfs_quota_us"))
    periodo = _int(_ler(f"{raiz}/cpu/cpu.cfs_period_us"))
    stat = _kv(_ler(f"{raiz}/cpu/cpu.stat"))
    uso_ns = _int(_ler(f"{raiz}/cpuacct/cpuacct.usage"))
    thr_ns = stat.get("throttled_time")
    cpu_max = None
    if periodo is not None:
        cpu_max = f"{'max' if quota in (None, -1) else quota} {periodo}"
    return {
        "cg_versao": 1,
        "cpu_max": cpu_max,  # equivalente v2 de cfs_quota_us/cfs_period_us
        "usage_usec": None if uso_ns is None else uso_ns // 1000,
        "nr_periods": stat.get("nr_periods"),
        "nr_throttled": stat.get("nr_throttled"),
        "throttled_usec": None if thr_ns is None else thr_ns // 1000,
        "memory_max": _int(_ler(f"{raiz}/memory/memory.limit_in_bytes")),
        # v1 limita memoria+swap juntas; v2 limita so a swap (memory.swap.max)
        "memsw_max": _int(_ler(f"{raiz}/memory/memory.memsw.limit_in_bytes")),
        "memory_current": _int(_ler(f"{raiz}/memory/memory.usage_in_bytes")),
        "memory_peak": _int(_ler(f"{raiz}/memory/memory.max_usage_in_bytes")),
        "pids_max": _int(_ler(f"{raiz}/pids/pids.max")),
        "pids_current": _int(_ler(f"{raiz}/pids/pids.current")),
        "brutos": {
            "cpu.cfs_quota_us": quota,
            "cpu.cfs_period_us": periodo,
            "cpu.stat": stat,
            "cpuacct.usage_ns": uso_ns,
        },
    }


def memoria_processo():
    status = _ler("/proc/self/status") or ""
    d = {}
    for linha in status.splitlines():
        if linha.startswith(("VmRSS:", "VmHWM:")):
            chave, valor = linha.split(":", 1)
            d[chave] = int(valor.split()[0])  # kB
    return {
        "rss_kib": d.get("VmRSS"),
        "hwm_kib": d.get("VmHWM"),
        "ru_maxrss_kib": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss,
    }


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--n", type=int, required=True, help="quantidade fixa de iteracoes")
    p.add_argument("--condicao", default="")
    p.add_argument("--rep", default="")
    p.add_argument("--sem-cgroup", action="store_true", help="nao ler /sys/fs/cgroup")
    args = p.parse_args()

    antes = None if args.sem_cgroup else snapshot_cgroup()
    inicio_epoch = time.time()
    t0 = time.perf_counter()
    c0 = time.process_time()
    checksum, feitas, completo = trabalho(args.n)
    c1 = time.process_time()
    t1 = time.perf_counter()
    depois = None if args.sem_cgroup else snapshot_cgroup()
    mem = memoria_processo()

    deltas = {}
    if antes and depois:
        for k in ("usage_usec", "nr_periods", "nr_throttled", "throttled_usec"):
            if isinstance(antes.get(k), int) and isinstance(depois.get(k), int):
                deltas[k] = depois[k] - antes[k]
            else:
                deltas[k] = None

    wall = t1 - t0
    saida = {
        "versao_carga": VERSAO,
        "condicao": args.condicao,
        "rep": args.rep,
        "n": args.n,
        "feitas": feitas,
        "checksum": checksum,
        "status": "ok" if completo else "timeout_interno",
        "inicio_epoch": round(inicio_epoch, 3),
        "wall_s": round(wall, 6),
        "cpu_proc_s": round(c1 - c0, 6),
        "trabalho_por_s": round(feitas / wall, 1) if wall > 0 else None,
        "pid_interno": os.getpid(),
        "uid": os.getuid(),
        "hostname": socket.gethostname(),
        "python": platform.python_version(),
        "memoria_processo": mem,
        "cgroup_antes": antes,
        "cgroup_depois": depois,
        "cgroup_deltas": deltas,
    }
    print(json.dumps(saida, ensure_ascii=False))
    return 0 if completo else 3


if __name__ == "__main__":
    sys.exit(main())
