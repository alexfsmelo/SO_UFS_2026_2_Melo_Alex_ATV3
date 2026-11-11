#!/usr/bin/env python3
"""Experimento complementar da Parte C: linha do tempo do throttling (Atividade 3, SO UFS 2026.2).

Roda a mesma carga de carga_cpu.py em C1 (--cpus 0.5) e em C2 (--cpus 1.0), uma vez cada, e,
enquanto o conteiner executa, le o cpu.stat do cgroup dele PELO HOST a cada INTERVALO segundos.
Assim a leitura nao gasta CPU do proprio conteiner. O caminho do cgroup vem de /proc/<PID>/cgroup,
que qualquer usuario pode ler (cgroup v2; em v1 usa as hierarquias cpu e cpuacct).

Saida em results/linha_do_tempo/:
  <cond>.csv       t_s, usage_usec, nr_periods, nr_throttled, throttled_usec
  <cond>.json      resultado da carga (checksum, tempos) e metadados (cgroup, cpu.max lido)
Uso: export IMAGEM_LAB=...; python3 lab/linha_do_tempo.py [--n 40000000] [--intervalo 0.02]
Seguranca: os mesmos limites e flags de run_experimentos.sh; timeout de 90 s por conteiner.
"""
import argparse
import csv
import json
import os
import subprocess
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
CONDICOES = [("C1", "0.5"), ("C2", "1.0")]


def sh(*cmd, check=True):
    r = subprocess.run(cmd, capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)}: {r.stderr.strip()}")
    return r.stdout.strip()


def caminho_cgroup(pid):
    linhas = open(f"/proc/{pid}/cgroup").read().splitlines()
    v2 = [l.split(":", 2)[2] for l in linhas if l.startswith("0::")]
    if os.path.exists("/sys/fs/cgroup/cgroup.controllers") and v2:
        return {"versao": 2, "dir": "/sys/fs/cgroup" + v2[0]}
    d = {}
    for l in linhas:
        _, ctrls, p = l.split(":", 2)
        for c in ctrls.split(","):
            d[c] = p
    return {"versao": 1, "cpu": "/sys/fs/cgroup/cpu" + d.get("cpu", ""), "cpuacct": "/sys/fs/cgroup/cpuacct" + d.get("cpuacct", "")}


def ler(cg):
    if cg["versao"] == 2:
        st = dict(l.split() for l in open(cg["dir"] + "/cpu.stat").read().splitlines())
        return int(st["usage_usec"]), int(st["nr_periods"]), int(st["nr_throttled"]), int(st["throttled_usec"])
    st = dict(l.split() for l in open(cg["cpu"] + "/cpu.stat").read().splitlines())
    uso = int(open(cg["cpuacct"] + "/cpuacct.usage").read()) // 1000
    return uso, int(st["nr_periods"]), int(st["nr_throttled"]), int(st["throttled_time"]) // 1000


def cpu_max(cg):
    if cg["versao"] == 2:
        return open(cg["dir"] + "/cpu.max").read().strip()
    q = open(cg["cpu"] + "/cpu.cfs_quota_us").read().strip()
    p = open(cg["cpu"] + "/cpu.cfs_period_us").read().strip()
    return f"{'max' if q == '-1' else q} {p}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=40_000_000)
    ap.add_argument("--intervalo", type=float, default=0.02)
    ap.add_argument("--saida", default=os.path.join(RAIZ, "results", "linha_do_tempo"))
    a = ap.parse_args()
    imagem = os.environ.get("IMAGEM_LAB") or sys.exit("defina IMAGEM_LAB com a imagem fixada por digest/ID")
    os.makedirs(a.saida, exist_ok=True)

    for cond, cpus in CONDICOES:
        nome = f"lab3_lt_{cond}_{os.getpid()}"
        print(f"{cond}: --cpus {cpus}, N={a.n}, leitura a cada {a.intervalo * 1000:.0f} ms")
        sh("docker", "run", "-d", "--name", nome, "--label", "lab3=atv3", "--network", "none",
           "--cpus", cpus, "--memory", "256m", "--memory-swap", "256m", "--pids-limit", "64",
           "--user", "65534:65534", "--cap-drop", "ALL", "--security-opt", "no-new-privileges",
           "-v", f"{AQUI}/carga_cpu.py:/lab/carga_cpu.py:ro",
           imagem, "python3", "/lab/carga_cpu.py", "--n", str(a.n), "--condicao", cond, "--rep", "lt")
        try:
            pid = sh("docker", "inspect", "--format", "{{.State.Pid}}", nome)
            amostras, cg, cmax = [], None, None
            t0 = time.perf_counter()
            while time.perf_counter() - t0 < 90 and pid != "0" and os.path.exists(f"/proc/{pid}"):
                try:
                    if cg is None:
                        cg = caminho_cgroup(pid)
                        cmax = cpu_max(cg)
                    amostras.append((round(time.perf_counter() - t0, 4), *ler(cg)))
                except (OSError, ValueError, KeyError):
                    break  # o conteiner terminou entre uma leitura e outra
                time.sleep(a.intervalo)
            sh("docker", "wait", nome, check=False)
            saida = sh("docker", "logs", nome, check=False).splitlines()
            resultado = json.loads(saida[-1]) if saida else {}
        finally:
            sh("docker", "rm", "-f", nome, check=False)
        with open(os.path.join(a.saida, f"{cond}.csv"), "w", newline="") as f:
            w = csv.writer(f)
            w.writerow(["t_s", "usage_usec", "nr_periods", "nr_throttled", "throttled_usec"])
            w.writerows(amostras)
        meta = {"condicao": cond, "cpus": cpus, "n": a.n, "intervalo_s": a.intervalo, "imagem": imagem,
                "cgroup": cg, "cpu_max_lido_no_host": cmax, "amostras": len(amostras),
                "carga": {k: resultado.get(k) for k in ("status", "checksum", "wall_s", "cpu_proc_s", "trabalho_por_s")}}
        json.dump(meta, open(os.path.join(a.saida, f"{cond}.json"), "w"), ensure_ascii=False, indent=1)
        print(f"  {len(amostras)} amostras, cpu.max={cmax}, status={resultado.get('status')}, parede={resultado.get('wall_s')} s")
    print(f"Concluido: {a.saida}")


if __name__ == "__main__":
    main()
