#!/usr/bin/env bash
# Parte C: experimento de cgroups (Atividade 3, SO UFS 2026.2).
#
# Duas condicoes x REPS repeticoes, alternando C1/C2 em ordem ABBA
# (C1 C2 | C2 C1 | C1 C2) para que uma deriva lenta do host nao favoreca
# sempre a mesma condicao.
#
#   C1: --cpus 0.5 | 256 MiB | RAM+swap 256 MiB | pids-limit 64
#   C2: --cpus 1.0 | mesmos limites, imagem e trabalho
#
# Cada execucao gera, em $SAIDA:
#   <cond>_r<rep>_t<tentativa>.json     linha JSON do carga_cpu.py
#   <cond>_r<rep>_t<tentativa>.stderr   stderr do conteiner
#   <cond>_r<rep>_t<tentativa>.inspect  flags pedidas (HostConfig) e estado final
# e uma linha em $SAIDA/indice.csv. Nada e apagado: uma nova tentativa da
# mesma execucao recebe o sufixo _t2, _t3, ...
#
# Uso:
#   export IMAGEM_LAB=python@sha256:...   (imagem fixada por digest ou ID)
#   export ITERACOES=20000000             (congelar depois do piloto)
#   bash lab/run_experimentos.sh
# Piloto:
#   REPS=1 ITERACOES=2000000 SAIDA=results/raw/piloto bash lab/run_experimentos.sh
set -u -o pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(dirname "$AQUI")"

IMAGEM_LAB="${IMAGEM_LAB:?defina IMAGEM_LAB com a imagem fixada por digest/ID}"
ITERACOES="${ITERACOES:-20000000}"
REPS="${REPS:-3}"
SAIDA="${SAIDA:-$RAIZ/results/raw/execucoes}"
MEMORIA="${MEMORIA:-256m}"
MEMORIA_SWAP="${MEMORIA_SWAP:-256m}"
PIDS="${PIDS:-64}"
USUARIO="${USUARIO:-65534:65534}"
TIMEOUT_HOST_S="${TIMEOUT_HOST_S:-90}"

cpus_de() {
  case "$1" in
    C1) echo "0.5" ;;
    C2) echo "1.0" ;;
    *) echo "condicao invalida: $1" >&2; exit 2 ;;
  esac
}

# ordem ABBA: repeticao impar = C1 C2, repeticao par = C2 C1
ordem=()
for ((r = 1; r <= REPS; r++)); do
  if ((r % 2 == 1)); then ordem+=("C1:$r" "C2:$r"); else ordem+=("C2:$r" "C1:$r"); fi
done

mkdir -p "$SAIDA"
INDICE="$SAIDA/indice.csv"
[[ -f "$INDICE" ]] || echo "ordem,condicao,rep,tentativa,cpus,iteracoes,rc,inicio_utc,fim_utc,arquivo" > "$INDICE"

TEM_TIMEOUT=0
command -v timeout >/dev/null 2>&1 && TEM_TIMEOUT=1

{
  echo "data_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "imagem=$IMAGEM_LAB"
  echo "imagem_id=$(docker image inspect --format '{{.Id}}' "$IMAGEM_LAB" 2>/dev/null)"
  echo "iteracoes=$ITERACOES"
  echo "reps=$REPS"
  echo "ordem=${ordem[*]}"
  echo "memoria=$MEMORIA memoria_swap=$MEMORIA_SWAP pids=$PIDS usuario=$USUARIO"
  echo "rede=none cap_drop=ALL no_new_privileges=true"
  echo "timeout_interno_s=60 timeout_host_s=$TIMEOUT_HOST_S gnu_timeout=$TEM_TIMEOUT"
  echo "carga_sha256=$(sha256sum "$AQUI/carga_cpu.py" | cut -d' ' -f1)"
  echo "commit=$(git -C "$RAIZ" rev-parse --short HEAD 2>/dev/null || echo sem-git)"
} >> "$SAIDA/parametros.txt"

pos=0
for item in "${ordem[@]}"; do
  pos=$((pos + 1))
  cond="${item%%:*}"
  rep="${item##*:}"
  cpus="$(cpus_de "$cond")"
  t=1
  while [[ -e "$SAIDA/${cond}_r${rep}_t${t}.json" ]]; do t=$((t + 1)); done
  base="$SAIDA/${cond}_r${rep}_t${t}"
  nome="lab3_${cond}_r${rep}_t${t}_$$"

  echo "[$pos/${#ordem[@]}] $cond rep $rep tentativa $t (--cpus $cpus, N=$ITERACOES)"
  inicio="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  cmd=(docker run --name "$nome" --label lab3=atv3
       --network none
       --cpus "$cpus" --memory "$MEMORIA" --memory-swap "$MEMORIA_SWAP" --pids-limit "$PIDS"
       --user "$USUARIO" --cap-drop ALL --security-opt no-new-privileges
       -v "$AQUI/carga_cpu.py:/lab/carga_cpu.py:ro"
       "$IMAGEM_LAB" python3 /lab/carga_cpu.py --n "$ITERACOES" --condicao "$cond" --rep "$rep")
  if ((TEM_TIMEOUT)); then
    timeout "$TIMEOUT_HOST_S" "${cmd[@]}" > "$base.json" 2> "$base.stderr"
  else
    "${cmd[@]}" > "$base.json" 2> "$base.stderr"
  fi
  rc=$?
  fim="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  if ((rc == 124)); then
    echo "  timeout no host; encerrando o conteiner $nome" >&2
    docker kill "$nome" >/dev/null 2>&1
  fi
  docker inspect --format \
    'NanoCpus={{.HostConfig.NanoCpus}} CpuQuota={{.HostConfig.CpuQuota}} CpuPeriod={{.HostConfig.CpuPeriod}} Memory={{.HostConfig.Memory}} MemorySwap={{.HostConfig.MemorySwap}} PidsLimit={{.HostConfig.PidsLimit}} User={{.Config.User}} CapDrop={{.HostConfig.CapDrop}} SecurityOpt={{.HostConfig.SecurityOpt}} NetworkMode={{.HostConfig.NetworkMode}} ExitCode={{.State.ExitCode}} OOMKilled={{.State.OOMKilled}} Image={{.Image}}' \
    "$nome" > "$base.inspect" 2>&1
  docker rm -f "$nome" >/dev/null 2>&1
  echo "$pos,$cond,$rep,$t,$cpus,$ITERACOES,$rc,$inicio,$fim,$(basename "$base").json" >> "$INDICE"
  echo "  rc=$rc"
done

echo "Concluido. Indice: $INDICE"
