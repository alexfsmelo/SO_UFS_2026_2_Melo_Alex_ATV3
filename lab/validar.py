#!/usr/bin/env python3
"""Confere a entrega da Atividade 3 sem rodar experimentos.

Verifica: arquivos obrigatorios; seis execucoes validas (3 por condicao),
ordem alternada e N constante; checksum igual a referencia; limites efetivos
(cpu.max, memoria, memoria+swap, pids) lidos do cgroup; tabela consolidada
recalculada a partir dos JSON brutos; tabela de namespaces; teste read-only;
numeros-chave presentes no PDF do relatorio; ausencia de segredos e pendencias.

Uso: python3 lab/validar.py   (saida 0 = tudo OK; avisos nao reprovam)
"""
import csv
import glob
import json
import os
import re
import statistics as st
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = lambda *p: os.path.join(RAIZ, *p)  # noqa: E731
falhas, avisos = [], []


def ok(cond, msg, aviso=False):
    if cond:
        print(f"[OK]    {msg}")
    elif aviso:
        print(f"[AVISO] {msg}")
        avisos.append(msg)
    else:
        print(f"[FALHA] {msg}")
        falhas.append(msg)


print("== 1. Arquivos obrigatorios")
for f in ["README.md", "DECLARACAO_IA.md", "CONTRIBUICAO.md", "VIDEO.md",
          "lab/carga_cpu.py", "lab/run_experimentos.sh", "lab/resumo.py", "lab/evidencia_ns_mount.sh",
          "lab/ambiente.sh", "lab/construir_imagem.sh", "dados_demo/texto.txt",
          "results/ambiente/ambiente.txt", "results/namespaces/namespaces.csv",
          "results/namespaces/registro_A.txt", "results/namespaces/registro_B.txt",
          "results/mount/readonly.txt", "results/raw/execucoes/indice.csv",
          "results/tabelas/execucoes.csv", "results/tabelas/resumo_condicoes.csv",
          "results/figuras/c1_c2.png", "docs/diagrama_camadas.png"]:
    ok(os.path.exists(R(f)), f)
pdfs = glob.glob(R("docs", "relatorio_*.pdf"))
ok(bool(pdfs), "relatorio PDF em docs/")

print("\n== 2. Execucoes da Parte C")
idx = list(csv.DictReader(open(R("results/raw/execucoes/indice.csv"))))
ref_arq = glob.glob(R("results/tabelas/checksum_referencia_N*.txt"))
ref = open(ref_arq[0]).read().split()[0] if ref_arq else None
ok(ref is not None, f"checksum de referencia calculado fora do conteiner: {ref}")
validas = []
for i in idx:
    try:
        d = json.load(open(R("results/raw/execucoes", i["arquivo"])))
    except (OSError, ValueError):
        continue
    if i["rc"] == "0" and d["status"] == "ok" and d["checksum"] == ref and d["feitas"] == int(i["iteracoes"]):
        validas.append((i, d))
por_cond = {c: [x for x in validas if x[0]["condicao"] == c] for c in ("C1", "C2")}
ok(len(por_cond["C1"]) == 3 and len(por_cond["C2"]) == 3, f"3 execucoes validas por condicao (C1={len(por_cond['C1'])}, C2={len(por_cond['C2'])})")
ok(len({i["iteracoes"] for i in idx}) == 1, f"N constante em todas as tentativas: {sorted({i['iteracoes'] for i in idx})}")
seq = [i["condicao"] for i in sorted(idx, key=lambda x: int(x["ordem"]))]
ok(all(seq[k] != seq[k + 1] or k % 2 == 1 for k in range(len(seq) - 1)) and seq[:2] != ["C1", "C1"],
   f"C1/C2 alternadas (ordem real: {' '.join(seq)})")

print("\n== 3. Limites efetivos lidos do cgroup")
esperado = {"C1": "50000 100000", "C2": "100000 100000"}
for c, lst in por_cond.items():
    for i, d in lst:
        cg = d["cgroup_depois"]
        tag = f"{c} r{i['rep']}"
        ok(cg["cpu_max"] == esperado[c], f"{tag}: cpu.max={cg['cpu_max']}")
        ok(cg["memory_max"] == 256 * 1024 * 1024, f"{tag}: memoria={cg['memory_max']} bytes")
        sw = cg.get("memsw_max", cg.get("memory_swap_max"))
        ok(sw in (256 * 1024 * 1024, 0), f"{tag}: limite de swap/memsw={sw}")
        ok(cg["pids_max"] == 64, f"{tag}: pids.max={cg['pids_max']}")
for i, d in por_cond["C1"]:
    dl = d["cgroup_deltas"]
    ok(dl["nr_throttled"] and dl["nr_throttled"] > 0, f"C1 r{i['rep']}: houve throttling ({dl['nr_throttled']} de {dl['nr_periods']} periodos)")

print("\n== 4. Tabela consolidada contra os dados brutos")
res = {r["condicao"]: r for r in csv.DictReader(open(R("results/tabelas/resumo_condicoes.csv")))}
for c, lst in por_cond.items():
    for campo in ("wall_s", "trabalho_por_s", "cpu_proc_s"):
        med = st.median(d[campo] for _, d in lst)
        tab = float(res[c][f"{campo}_mediana"])
        ok(abs(med - tab) <= max(1e-3, 1e-6 * med), f"{c}.{campo}: mediana bruta {med:.4f} = tabela {tab:.4f}")

print("\n== 5. Namespaces")
ns = {r["recurso"]: r for r in csv.DictReader(open(R("results/namespaces/namespaces.csv")))}
for rec in ("pid", "mnt", "net"):
    ok(ns[rec]["iguais"] == "nao", f"{rec}: A={ns[rec]['handle_A']} B={ns[rec]['handle_B']} (diferentes)")
for rot in "AB":
    t = open(R(f"results/namespaces/registro_{rot}.txt")).read()
    ok(re.search(r"PID_host=\d+", t) and "pid1_comm=" in t, f"registro_{rot}: PID_host e PID 1 interno presentes")
    m = re.search(r"host_NSpid=(\d+) 1", t)
    ok(bool(m), f"registro_{rot}: NSpid mostra o mesmo processo como PID {m.group(1) if m else '?'} no host e 1 no conteiner", aviso=True)

print("\n== 6. Montagem somente leitura")
t = open(R("results/mount/readonly.txt")).read()
bloco_d1 = t.split("== caso D1")[1].split("== caso")[0] if "== caso D1" in t else ""
ok("leitura=ok" in bloco_d1, "D1: leitura bem-sucedida em /dados")
ok("EROFS" in bloco_d1, "D1: escrita negada com EROFS")
ok("capeff=0000000000000000" in bloco_d1 and "no_new_privs=1" in bloco_d1 and "uid=65534" in bloco_d1,
   "D1: usuario nao root, sem capabilities, no-new-privileges")
ok("PERMITIDA" not in t, "nenhuma escrita foi permitida nos testes negativos")
ok(os.listdir(R("dados_demo")) == ["texto.txt"], "dados_demo contem apenas texto.txt")

print("\n== 7. Relatorio PDF")
if pdfs:
    try:
        txt = subprocess.run(["pdftotext", "-layout", pdfs[0], "-"], capture_output=True, text=True).stdout
        r1, r2 = res["C1"], res["C2"]
        chave = {
            "wall C1": f"{float(r1['wall_s_mediana']):.2f}".replace(".", ","),
            "wall C2": f"{float(r2['wall_s_mediana']):.2f}".replace(".", ","),
            "vazao C1": f"{float(r1['trabalho_por_s_mediana'])/1e6:.2f}".replace(".", ","),
            "vazao C2": f"{float(r2['trabalho_por_s_mediana'])/1e6:.2f}".replace(".", ","),
            "razao": f"{float(r2['razao_trabalho_por_s_C2_sobre_C1']):.2f}".replace(".", ","),
        }
        for k, v in chave.items():
            ok(v in txt, f"PDF cita {k} = {v}")
    except FileNotFoundError:
        ok(False, "pdftotext indisponivel; conferencia do PDF pulada", aviso=True)

print("\n== 8. Segredos, arquivos grandes e pendencias")
grandes, segredos, pend = [], [], []
for raiz, dirs, arqs in os.walk(RAIZ):
    dirs[:] = [d for d in dirs if d != ".git"]
    for a in arqs:
        p = os.path.join(raiz, a)
        rel = os.path.relpath(p, RAIZ)
        if os.path.getsize(p) > 5 * 1024 * 1024:
            grandes.append(rel)
        if a == ".env":
            segredos.append(rel)
        if a.endswith((".md", ".txt", ".sh", ".py", ".csv")):
            s = open(p, errors="ignore").read()
            if re.search(r"(ghp_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|BEGIN (RSA|OPENSSH) PRIVATE KEY)", s):
                segredos.append(rel)
            if "PREENCHER" in s and rel != "lab/validar.py":
                pend.append(rel)
ok(not grandes, f"nenhum arquivo > 5 MiB {grandes}")
ok(not segredos, f"nenhum segredo aparente {segredos}")
ok(not pend, f"campos PREENCHER pendentes: {pend}", aviso=True)

print(f"\nResultado: {len(falhas)} falha(s), {len(avisos)} aviso(s)")
sys.exit(1 if falhas else 0)
