#!/usr/bin/env python3
"""Consolida a Parte C (Atividade 3, SO UFS 2026.2).

Le results/raw/execucoes/indice.csv e os JSON de cada execucao, confere a
correcao do trabalho recalculando o checksum FORA do conteiner (no host, sem
limites) para o mesmo N, e gera:

  results/tabelas/execucoes.csv         uma linha por tentativa (validas e invalidas)
  results/tabelas/resumo_condicoes.csv  mediana, minimo, maximo e amplitude por condicao
  results/tabelas/resumo.md             as mesmas tabelas em Markdown
  results/figuras/c1_c2.png             grafico comparativo (n = 3 por condicao)

Nenhum numero e digitado a mao: tudo vem dos JSON brutos.
Uso: python3 lab/resumo.py [--sem-verificacao]
"""
import argparse
import csv
import json
import os
import statistics as st
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, AQUI)
import carga_cpu  # noqa: E402

RAW = os.path.join(RAIZ, "results", "raw", "execucoes")
TAB = os.path.join(RAIZ, "results", "tabelas")
FIG = os.path.join(RAIZ, "results", "figuras")
MIB = 1024 * 1024


def ler_indice():
    with open(os.path.join(RAW, "indice.csv")) as f:
        return list(csv.DictReader(f))


def checksum_referencia(n, pular):
    cache = os.path.join(TAB, f"checksum_referencia_N{n}.txt")
    if os.path.exists(cache):
        return open(cache).read().split()[0], "cache"
    if pular:
        return None, "nao verificado"
    t0 = time.perf_counter()
    chk, feitas, ok = carga_cpu.trabalho(n, limite_s=3600)
    dt = time.perf_counter() - t0
    if not ok or feitas != n:
        raise SystemExit("referencia nao concluiu")
    with open(cache, "w") as f:
        f.write(f"{chk} N={n} calculado_no_host_sem_limites em {dt:.2f}s python={sys.version.split()[0]}\n")
    return chk, f"recalculado no host em {dt:.2f}s"


def mib(v):
    return round(v / MIB, 2) if isinstance(v, int) and v < 2**62 else ("sem_limite" if isinstance(v, int) else v)


def linha_execucao(idx, ref):
    arq = os.path.join(RAW, idx["arquivo"])
    base = {
        "ordem": int(idx["ordem"]), "condicao": idx["condicao"], "rep": int(idx["rep"]),
        "tentativa": int(idx["tentativa"]), "cpus_pedidos": float(idx["cpus"]),
        "n": int(idx["iteracoes"]), "rc": int(idx["rc"]), "arquivo": idx["arquivo"],
    }
    try:
        d = json.loads(open(arq).read())
    except (OSError, ValueError) as e:
        base.update(status="saida_invalida", valida=False, motivo=f"JSON ausente/invalido: {e.__class__.__name__}")
        return base
    dep = d.get("cgroup_depois") or {}
    dl = d.get("cgroup_deltas") or {}
    wall = d["wall_s"]
    usage = dl.get("usage_usec")
    periods = dl.get("nr_periods")
    thr = dl.get("nr_throttled")
    chk_ok = (ref is None) or (d["checksum"] == ref)
    valida = base["rc"] == 0 and d["status"] == "ok" and d["feitas"] == base["n"] and chk_ok
    base.update(
        status=d["status"], checksum=d["checksum"], checksum_ok=chk_ok, valida=valida,
        motivo="" if valida else "rc/status/checksum",
        wall_s=wall, cpu_proc_s=d["cpu_proc_s"], trabalho_por_s=d["trabalho_por_s"],
        cg_versao=dep.get("cg_versao"), cpu_max=dep.get("cpu_max"),
        d_usage_usec=usage, d_nr_periods=periods, d_nr_throttled=thr,
        d_throttled_usec=dl.get("throttled_usec"),
        frac_periodos_throttled=round(thr / periods, 3) if periods else None,
        cpu_efetiva_media=round(usage / 1e6 / wall, 3) if usage is not None and wall else None,
        memory_max_mib=mib(dep.get("memory_max")),
        memsw_max_mib=mib(dep.get("memsw_max")) if "memsw_max" in dep else "",
        memory_swap_max=dep.get("memory_swap_max", ""),
        pids_max=dep.get("pids_max"), pids_current=dep.get("pids_current"),
        rss_kib=d["memoria_processo"]["rss_kib"], hwm_kib=d["memoria_processo"]["hwm_kib"],
        memory_current_kib=(dep.get("memory_current") or 0) // 1024,
        memory_peak_kib=(dep.get("memory_peak") or 0) // 1024 if dep.get("memory_peak") is not None else None,
        uid=d["uid"], pid_interno=d["pid_interno"],
    )
    return base


def resumir(linhas):
    out = []
    for cond in ("C1", "C2"):
        v = [l for l in linhas if l["condicao"] == cond and l["valida"]]
        if not v:
            continue

        def agg(campo, nd=3):
            xs = [l[campo] for l in v if isinstance(l.get(campo), (int, float))]
            if not xs:
                return {}
            med = st.median(xs)
            return {
                f"{campo}_mediana": round(med, nd), f"{campo}_min": round(min(xs), nd),
                f"{campo}_max": round(max(xs), nd),
                f"{campo}_amplitude_pct": round(100 * (max(xs) - min(xs)) / med, 2) if med else None,
            }

        r = {"condicao": cond, "cpus_pedidos": v[0]["cpus_pedidos"], "cpu_max": v[0]["cpu_max"],
             "n_validas": len(v), "n_tentativas": len([l for l in linhas if l["condicao"] == cond]),
             "n": v[0]["n"]}
        for campo in ("wall_s", "cpu_proc_s", "trabalho_por_s", "cpu_efetiva_media",
                      "d_throttled_usec", "d_nr_throttled", "d_nr_periods", "frac_periodos_throttled",
                      "rss_kib", "memory_peak_kib", "memory_current_kib"):
            r.update(agg(campo, 1 if campo == "trabalho_por_s" else 3))
        r["desvio_padrao_trabalho_por_s"] = round(st.stdev([l["trabalho_por_s"] for l in v]), 1) if len(v) > 1 else None
        out.append(r)
    if len(out) == 2:
        out[1]["razao_trabalho_por_s_C2_sobre_C1"] = round(
            out[1]["trabalho_por_s_mediana"] / out[0]["trabalho_por_s_mediana"], 3)
    return out


def escrever_csv(caminho, linhas):
    chaves = []
    for l in linhas:
        for k in l:
            if k not in chaves:
                chaves.append(k)
    with open(caminho, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=chaves)
        w.writeheader()
        w.writerows(linhas)


def markdown(linhas, resumo, ref_info):
    m = ["# Parte C: resumo gerado por lab/resumo.py", "",
         f"Checksum de referencia: {ref_info}", "",
         "## Execucoes (ordem real, ABBA)", "",
         "| ordem | cond. | rep | valida | wall (s) | CPU proc. (s) | trabalho/s (M it/s) | cpu.max | periodos | throttled | throttled (s) | RSS (KiB) | memory.peak* (KiB) |",
         "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for l in sorted(linhas, key=lambda x: x["ordem"]):
        if "wall_s" not in l:
            m.append(f"| {l['ordem']} | {l['condicao']} | {l['rep']} | nao ({l['motivo']}) | | | | | | | | | |")
            continue
        m.append(f"| {l['ordem']} | {l['condicao']} | {l['rep']} | {'sim' if l['valida'] else 'nao'} | "
                 f"{l['wall_s']:.3f} | {l['cpu_proc_s']:.3f} | {l['trabalho_por_s']/1e6:.3f} | {l['cpu_max']} | "
                 f"{l['d_nr_periods']} | {l['d_nr_throttled']} | {l['d_throttled_usec']/1e6:.3f} | "
                 f"{l['rss_kib']} | {l['memory_peak_kib']} |")
    m += ["", "## Por condicao (n = 3 repeticoes validas)", "",
          "| cond. | --cpus | cpu.max efetivo | wall mediana (s) | trabalho/s mediana (M it/s) | min-max (M it/s) | amplitude | CPU efetiva media (CPUs) | periodos throttled | throttled mediano (s) |",
          "|---|---|---|---|---|---|---|---|---|---|"]
    for r in resumo:
        m.append(f"| {r['condicao']} | {r['cpus_pedidos']} | {r['cpu_max']} | {r['wall_s_mediana']:.3f} | "
                 f"{r['trabalho_por_s_mediana']/1e6:.3f} | {r['trabalho_por_s_min']/1e6:.3f}-{r['trabalho_por_s_max']/1e6:.3f} | "
                 f"{r['trabalho_por_s_amplitude_pct']:.1f}% | {r['cpu_efetiva_media_mediana']:.3f} | "
                 f"{r['frac_periodos_throttled_mediana']*100:.0f}% | {r['d_throttled_usec_mediana']/1e6:.3f} |")
    if len(resumo) == 2:
        m += ["", f"Razao das medianas de trabalho/s (C2/C1): {resumo[1]['razao_trabalho_por_s_C2_sobre_C1']:.3f}"]
    versoes = {l.get("cg_versao") for l in linhas if l.get("cg_versao")}
    if 1 in versoes:
        m += ["", "*Em cgroup v1, memory.peak corresponde a memory.max_usage_in_bytes (pico desde a criacao do cgroup)."]
    else:
        m += ["", "*memory.peak lido diretamente do cgroup v2 (pico desde a criacao do cgroup)."]
    return "\n".join(m) + "\n"


def grafico(linhas, resumo, caminho):
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
    except ImportError:
        print("matplotlib ausente: grafico nao gerado (pip install matplotlib)")
        return
    cores = {"C1": "#2a78d6", "C2": "#eb6834"}
    tinta, tinta2, grade = "#0b0b0b", "#52514e", "#e4e3df"
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": grade,
                         "axes.labelcolor": tinta2, "xtick.color": tinta2, "ytick.color": tinta2})
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.6), gridspec_kw={"width_ratios": [1, 1.5]})
    fig.patch.set_facecolor("#fcfcfb")
    validas = [l for l in linhas if l["valida"]]

    # (a) trabalho concluido por segundo: pontos por repeticao + mediana
    for j, r in enumerate(resumo):
        i = j * 1.5  # afasta as condicoes para os rotulos nao se tocarem
        c = r["condicao"]
        ys = [l["trabalho_por_s"] / 1e6 for l in validas if l["condicao"] == c]
        xs = [i + d for d in (-0.1, 0, 0.1)][: len(ys)]
        a1.scatter(xs, ys, s=46, color=cores[c], edgecolor="#fcfcfb", linewidth=2, zorder=3)
        med = r["trabalho_por_s_mediana"] / 1e6
        a1.hlines(med, i - 0.25, i + 0.25, color=tinta, linewidth=1.5, zorder=2)
        a1.text(i + 0.3, med, f"mediana {med:.2f}".replace(".", ","), va="center", color=tinta, fontsize=9)
    a1.set_xticks([j * 1.5 for j in range(len(resumo))])
    def rot(r):
        q, per = (r["cpu_max"] or "? ?").split()
        return (f"{r['condicao']}: --cpus {r['cpus_pedidos']}".replace(".", ",")
                + f"\ncpu.max {q}/{per}\n({int(q)//1000} ms a cada {int(per)//1000} ms)")
    a1.set_xticklabels([rot(r) for r in resumo], fontsize=9)
    a1.set_xlim(-0.75, (len(resumo) - 1) * 1.5 + 1.0)
    a1.set_ylim(0, max(l["trabalho_por_s"] for l in validas) / 1e6 * 1.18)
    a1.set_ylabel("trabalho concluído (milhões de iterações/s)")
    a1.set_title("(a) Vazão por condição, n = 3 repetições", loc="left", color=tinta, fontsize=11)
    a1.grid(axis="y", color=grade, linewidth=0.8)
    a1.set_axisbelow(True)
    for s in ("top", "right"):
        a1.spines[s].set_visible(False)

    # (b) decomposicao do tempo de parede: CPU consumida (usage) + espera por throttling
    ordem = sorted(validas, key=lambda l: (l["condicao"], l["rep"]))
    x = range(len(ordem))
    uso = [l["d_usage_usec"] / 1e6 for l in ordem]
    thr = [l["d_throttled_usec"] / 1e6 for l in ordem]
    wall = [l["wall_s"] for l in ordem]
    a2.bar(x, uso, width=0.62, color=[cores[l["condicao"]] for l in ordem], label="CPU consumida pelo cgroup (Δ usage)")
    a2.bar(x, thr, width=0.62, bottom=[u + 0.08 for u in uso], color="#fcfcfb",
           edgecolor=tinta2, hatch="////", linewidth=0.8, label="tempo em throttling (Δ throttled)")
    a2.scatter(x, wall, marker="_", s=420, color=tinta, linewidth=2, zorder=4, label="tempo de parede medido")
    for xi, w in zip(x, wall):
        a2.text(xi, w + 0.35, f"{w:.1f} s".replace(".", ","), ha="center", color=tinta, fontsize=8.5)
    a2.set_xticks(list(x))
    a2.set_xticklabels([f"{l['condicao']} r{l['rep']}" for l in ordem])
    a2.set_ylabel("segundos")
    a2.set_ylim(0, max(wall) * 1.2)
    a2.set_title("(b) Tempo de parede = CPU usada + espera imposta pela quota", loc="left", color=tinta, fontsize=11)
    a2.grid(axis="y", color=grade, linewidth=0.8)
    a2.set_axisbelow(True)
    for s in ("top", "right"):
        a2.spines[s].set_visible(False)
    a2.legend(frameon=False, fontsize=8.5, loc="upper right")

    n = resumo[0]["n"]
    fig.suptitle(f"Mesmo trabalho fixo (N = {n:,} iterações) sob duas quotas de CPU".replace(",", "."),
                 x=0.01, ha="left", color=tinta, fontsize=12.5, fontweight="bold")
    fig.text(0.01, 0.005, "Fonte: results/raw/execucoes (cgroup lido de dentro do contêiner). Cores: C1 azul, C2 laranja.",
             color=tinta2, fontsize=8)
    from matplotlib.ticker import FuncFormatter
    virgula = FuncFormatter(lambda v, _: f"{v:g}".replace(".", ","))
    a1.yaxis.set_major_formatter(virgula)
    a2.yaxis.set_major_formatter(virgula)
    fig.tight_layout(rect=(0, 0.03, 1, 0.97))
    fig.savefig(caminho, dpi=200, facecolor=fig.get_facecolor())
    plt.close(fig)
    print(f"grafico: {caminho}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sem-verificacao", action="store_true", help="nao recalcular o checksum no host")
    args = ap.parse_args()
    os.makedirs(TAB, exist_ok=True)
    os.makedirs(FIG, exist_ok=True)
    idx = ler_indice()
    ns = {int(i["iteracoes"]) for i in idx}
    if len(ns) != 1:
        print(f"AVISO: mais de um N no indice: {sorted(ns)}")
    n = max(ns)
    ref, ref_info = checksum_referencia(n, args.sem_verificacao)
    ref_texto = f"{ref} (N={n}, {ref_info})"
    linhas = [linha_execucao(i, ref) for i in idx]
    resumo = resumir(linhas)
    escrever_csv(os.path.join(TAB, "execucoes.csv"), linhas)
    escrever_csv(os.path.join(TAB, "resumo_condicoes.csv"), resumo)
    with open(os.path.join(TAB, "resumo.md"), "w") as f:
        f.write(markdown(linhas, resumo, ref_texto))
    grafico(linhas, resumo, os.path.join(FIG, "c1_c2.png"))
    print(open(os.path.join(TAB, "resumo.md")).read())
    validas = sum(1 for l in linhas if l["valida"])
    print(f"execucoes validas: {validas} de {len(linhas)} tentativas")
    return 0 if validas >= 6 else 1


if __name__ == "__main__":
    sys.exit(main())
