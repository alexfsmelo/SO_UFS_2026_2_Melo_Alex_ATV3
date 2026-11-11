#!/usr/bin/env python3
"""Graficos complementares da Parte C (Atividade 3, SO UFS 2026.2).

Gera, a partir dos dados brutos ja consolidados por resumo.py:
  results/figuras/cpu_x_quota.png       CPU efetiva de cada execucao contra a quota pedida
  results/figuras/notebook_x_nuvem.png  vazao e razao C2/C1 no notebook e na execucao preliminar
  results/figuras/linha_do_tempo.png    CPU acumulada ao longo do tempo (se results/linha_do_tempo existir)
Uso: python3 lab/graficos_extras.py
"""
import csv
import json
import os

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
from matplotlib.ticker import FuncFormatter  # noqa: E402

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = lambda *p: os.path.join(RAIZ, *p)  # noqa: E731
FIG = R("results", "figuras")
COR = {"C1": "#2a78d6", "C2": "#eb6834"}
TINTA, TINTA2, GRADE, FUNDO = "#0b0b0b", "#52514e", "#e4e3df", "#fcfcfb"
virg = lambda v, _=None: f"{v:g}".replace(".", ",")  # noqa: E731
plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 10, "axes.edgecolor": GRADE,
                     "axes.labelcolor": TINTA2, "xtick.color": TINTA2, "ytick.color": TINTA2})


def ler_csv(p):
    with open(p) as f:
        return list(csv.DictReader(f))


def estilo(ax):
    ax.grid(axis="y", color=GRADE, linewidth=0.8)
    ax.set_axisbelow(True)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    ax.yaxis.set_major_formatter(FuncFormatter(virg))


def rodape(fig, texto):
    fig.text(0.01, 0.01, texto, color=TINTA2, fontsize=8)


def cpu_x_quota():
    ex = [r for r in ler_csv(R("results/tabelas/execucoes.csv")) if r["valida"] == "True"]
    ex.sort(key=lambda r: (r["condicao"], int(r["rep"])))
    fig, ax = plt.subplots(figsize=(9, 4.2))
    fig.patch.set_facecolor(FUNDO)
    for cond, quota, x0 in (("C1", 0.5, 0), ("C2", 1.0, 4)):
        xs = [x0 + i for i in range(3)]
        ys = [float(r["cpu_efetiva_media"]) for r in ex if r["condicao"] == cond]
        ax.hlines(quota, x0 - 0.5, x0 + 2.5, color=TINTA, linestyle="--", linewidth=1.2, zorder=2)
        ax.text(x0 + 2.55, quota, f"quota {cond} = {quota:.1f}".replace(".", ","), va="center", color=TINTA, fontsize=9)
        ax.scatter(xs, ys, s=90, color=COR[cond], edgecolor=FUNDO, linewidth=2, zorder=3)
        for x, y in zip(xs, ys):
            ax.text(x, y + 0.045, f"{y:.3f}".replace(".", ","), ha="center", color=TINTA, fontsize=9)
    ax.set_xticks([0, 1, 2, 4, 5, 6])
    ax.set_xticklabels([f"C1 r{i}" for i in (1, 2, 3)] + [f"C2 r{i}" for i in (1, 2, 3)])
    ax.set_xlim(-0.7, 8.2)
    ax.set_ylim(0, 1.2)
    ax.set_ylabel("CPU efetiva (CPUs) = Δ usage_usec / tempo de parede")
    estilo(ax)
    ax.set_title("CPU usada por execução contra a quota pedida (n = 3 por condição)", loc="left", color=TINTA, fontsize=11.5, fontweight="bold")
    rodape(fig, "Fonte: results/tabelas/execucoes.csv (cpu.stat lido de dentro do contêiner, notebook com WSL2 e cgroup v2).")
    fig.tight_layout(rect=(0, 0.04, 1, 1))
    fig.savefig(os.path.join(FIG, "cpu_x_quota.png"), dpi=200, facecolor=FUNDO)
    plt.close(fig)


def notebook_x_nuvem():
    amb = {"Notebook\n(WSL2, cgroup v2)": R("results/tabelas/resumo_condicoes.csv"),
           "Nuvem, preliminar\n(VM, cgroup v1)": R("results_vm_nuvem/tabelas/resumo_condicoes.csv")}
    dados = {k: {r["condicao"]: r for r in ler_csv(v)} for k, v in amb.items()}
    nomes = list(dados)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.4), gridspec_kw={"width_ratios": [1.5, 1]})
    fig.patch.set_facecolor(FUNDO)
    larg = 0.36
    for j, cond in enumerate(("C1", "C2")):
        xs = [i + (j - 0.5) * (larg + 0.04) for i in range(len(nomes))]
        ys = [float(dados[n][cond]["trabalho_por_s_mediana"]) / 1e6 for n in nomes]
        a1.bar(xs, ys, width=larg, color=COR[cond], label=f"{cond} (--cpus {'0,5' if cond == 'C1' else '1,0'})")
        for x, y in zip(xs, ys):
            a1.text(x, y + 0.08, f"{y:.2f}".replace(".", ","), ha="center", color=TINTA, fontsize=9)
    a1.set_xticks(range(len(nomes)))
    a1.set_xticklabels(nomes)
    a1.set_ylabel("trabalho concluído (milhões de iterações/s)")
    a1.set_title("(a) Vazão mediana por condição", loc="left", color=TINTA, fontsize=11)
    a1.legend(frameon=False, fontsize=9, loc="upper left")
    a1.set_ylim(0, max(float(dados[n]["C2"]["trabalho_por_s_mediana"]) for n in nomes) / 1e6 * 1.2)
    estilo(a1)
    raz = [float(dados[n]["C2"]["razao_trabalho_por_s_C2_sobre_C1"]) for n in nomes]
    extra = [(float(dados[n]["C1"]["cpu_proc_s_mediana"]) / float(dados[n]["C2"]["cpu_proc_s_mediana"]) - 1) * 100 for n in nomes]
    a2.bar(range(len(nomes)), raz, width=0.62, color="#6b6a66")
    a2.axhline(2.0, color=TINTA, linestyle="--", linewidth=1.2)
    a2.text(len(nomes) - 0.12, 1.95, "esperado\n2,0", ha="right", va="top", color=TINTA, fontsize=8.5)
    for i, (r, e) in enumerate(zip(raz, extra)):
        a2.text(i, r + 0.05, f"{r:.2f}".replace(".", ","), ha="center", color=TINTA, fontsize=10, fontweight="bold")
        a2.text(i, 0.9, f"C1 usou\n+{e:.1f}%\nde CPU".replace(".", ","), ha="center", va="center", color="#fcfcfb", fontsize=9)
    a2.set_xticks(range(len(nomes)))
    a2.set_xticklabels(nomes)
    a2.set_xlim(-0.6, len(nomes) - 0.1)
    a2.set_ylim(0, 2.6)
    a2.set_title("(b) Razão das vazões C2 / C1", loc="left", color=TINTA, fontsize=11)
    estilo(a2)
    fig.suptitle("Mesmo trabalho (N = 40.000.000) em dois ambientes", x=0.01, ha="left", color=TINTA, fontsize=12.5, fontweight="bold")
    rodape(fig, "Fonte: results/tabelas e results_vm_nuvem/tabelas (medianas de 3 repetições por condição em cada ambiente).")
    fig.tight_layout(rect=(0, 0.04, 1, 0.95))
    fig.savefig(os.path.join(FIG, "notebook_x_nuvem.png"), dpi=200, facecolor=FUNDO)
    plt.close(fig)


def linha_do_tempo():
    pasta = R("results/linha_do_tempo")
    if not os.path.exists(os.path.join(pasta, "C1.csv")):
        print("results/linha_do_tempo ausente: grafico da linha do tempo nao gerado")
        return
    series = {}
    for cond in ("C1", "C2"):
        rows = ler_csv(os.path.join(pasta, f"{cond}.csv"))
        t = [float(r["t_s"]) for r in rows]
        u = [int(r["usage_usec"]) / 1e6 for r in rows]
        thr = [int(r["nr_throttled"]) for r in rows]
        per = [int(r["nr_periods"]) for r in rows]
        series[cond] = (t, u, thr, per, json.load(open(os.path.join(pasta, f"{cond}.json"))))
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(11, 4.4), gridspec_kw={"width_ratios": [1.2, 1]})
    fig.patch.set_facecolor(FUNDO)
    for cond, (t, u, thr, per, meta) in series.items():
        a1.plot(t, u, color=COR[cond], linewidth=2, label=f"{cond}: cpu.max {meta['cpu_max_lido_no_host']} ({meta['carga']['wall_s']:.1f} s)".replace(".", ",", 1) if False else f"{cond}: cpu.max {meta['cpu_max_lido_no_host']}, " + f"{meta['carga']['wall_s']:.1f} s".replace(".", ","))
    tmax = max(series["C1"][0])
    a1.plot([0, tmax], [0, 0.5 * tmax], color=TINTA2, linestyle=":", linewidth=1)
    a1.plot([0, 17], [0, 17], color=TINTA2, linestyle=":", linewidth=1)
    a1.text(20, 0.5 * 20 - 1.6, "inclinação 0,5", color=TINTA2, fontsize=8.5, ha="left")
    a1.text(9.5, 9.5 + 0.8, "inclinação 1,0", color=TINTA2, fontsize=8.5, ha="right")
    a1.set_xlabel("tempo de parede desde o início (s)")
    a1.set_ylabel("CPU acumulada pelo cgroup (s)")
    a1.set_title("(a) CPU acumulada ao longo da execução", loc="left", color=TINTA, fontsize=11)
    a1.legend(frameon=False, fontsize=9, loc="upper left")
    estilo(a1)
    a1.xaxis.set_major_formatter(FuncFormatter(virg))
    # (b) zoom de 1 s no meio de C1: degraus de 50 ms a cada 100 ms
    t, u, thr, per, meta = series["C1"]
    meio = t[len(t) // 2]
    idx = [i for i, x in enumerate(t) if meio <= x <= meio + 1.0]
    tz = [(t[i] - t[idx[0]]) * 1000 for i in idx]
    uz = [(u[i] - u[idx[0]]) * 1000 for i in idx]
    a2.step(tz, uz, where="post", color=COR["C1"], linewidth=2, label="C1: CPU usada (ms)")
    a2.plot([0, 1000], [0, 500], color=TINTA2, linestyle=":", linewidth=1)
    a2.text(990, 120, "pontilhado: referência\nde 0,5 CPU", color=TINTA2, fontsize=8.5, ha="right", va="top")
    for k in range(0, 1001, 100):
        a2.axvline(k, color=GRADE, linewidth=0.8, zorder=0)
    a2.set_xlim(0, 1000)
    a2.set_xlabel("1 s no meio da execução de C1 (ms); grade a cada 100 ms")
    a2.set_ylabel("CPU usada desde o início da janela (ms)")
    a2.set_title("(b) Zoom em C1: cerca de 50 ms de CPU a cada 100 ms", loc="left", color=TINTA, fontsize=11)
    estilo(a2)
    a2.xaxis.set_major_formatter(FuncFormatter(virg))
    d_thr = thr[idx[-1]] - thr[idx[0]]
    d_per = per[idx[-1]] - per[idx[0]]
    a2.text(20, max(uz) * 0.95, f"{d_thr} de {d_per} períodos com throttling nesta janela", color=TINTA, fontsize=9, va="top")
    fig.suptitle(f"Linha do tempo do throttling (cpu.stat lido pelo host a cada {meta['intervalo_s'] * 1000:.0f} ms)", x=0.01, ha="left", color=TINTA, fontsize=12.5, fontweight="bold")
    rodape(fig, "Fonte: results/linha_do_tempo (uma execução por condição, mesmo N = 40.000.000, notebook com WSL2 e cgroup v2).")
    fig.tight_layout(rect=(0, 0.04, 1, 0.95))
    fig.savefig(os.path.join(FIG, "linha_do_tempo.png"), dpi=200, facecolor=FUNDO)
    plt.close(fig)


if __name__ == "__main__":
    os.makedirs(FIG, exist_ok=True)
    cpu_x_quota()
    notebook_x_nuvem()
    linha_do_tempo()
    print("graficos em", FIG)
