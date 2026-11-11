#!/usr/bin/env bash
# Partes B e D: evidencias de namespaces e teste de montagem somente leitura
# (Atividade 3, SO UFS 2026.2).
#
# Parte B: sobe dois conteineres independentes da mesma imagem, coleta o PID
#   informado por `docker inspect`, o processo PID 1 interno e os handles de
#   /proc/1/ns/{pid,mnt,net} (mais uts, ipc e cgroup como extra), e, quando o
#   daemon roda no mesmo Linux deste terminal, confere os mesmos handles pelo
#   /proc do host.
# Parte D: monta um diretorio sintetico como /dados:ro e tenta ler e escrever
#   em tres casos (usuario nao root restrito, root, e controle rw sem permissao).
#
# Encerra SOMENTE os conteineres que ele mesmo criou (nome com sufixo do PID
# deste script e label lab3=atv3). Nao usa --privileged, nao monta /, home,
# socket do Docker nem diretorios sigilosos.
#
# Uso: export IMAGEM_LAB=...; bash lab/evidencia_ns_mount.sh
set -u -o pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(dirname "$AQUI")"
IMAGEM_LAB="${IMAGEM_LAB:?defina IMAGEM_LAB com a imagem fixada por digest/ID}"
OUT_NS="${OUT_NS:-$RAIZ/results/namespaces}"
OUT_MNT="${OUT_MNT:-$RAIZ/results/mount}"
mkdir -p "$OUT_NS" "$OUT_MNT"

SUF="$$"
CRIADOS=()
limpar() {
  for c in "${CRIADOS[@]}"; do docker rm -f "$c" >/dev/null 2>&1; done
}
trap limpar EXIT

# ---------------------------------------------------------------- Parte B
A="lab3_ns_a_$SUF"
B="lab3_ns_b_$SUF"
for nome in "$A" "$B"; do
  docker run -d --name "$nome" --label lab3=atv3 --network none \
    --memory 64m --pids-limit 16 --cap-drop ALL --security-opt no-new-privileges \
    "$IMAGEM_LAB" sleep 300 >/dev/null || { echo "falha ao criar $nome" >&2; exit 1; }
  CRIADOS+=("$nome")
done
sleep 1

ns_host_self() { readlink "/proc/self/ns/$1" 2>/dev/null || echo "indisponivel"; }

declare -A H
for rot in A B; do
  nome="${!rot}"
  arq="$OUT_NS/registro_${rot}.txt"
  pid_host="$(docker inspect --format '{{.State.Pid}}' "$nome")"
  H[$rot,pid_host]="$pid_host"
  {
    echo "# Registro do conteiner $rot"
    echo "data_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "nome=$nome"
    echo "id=$(docker inspect --format '{{.Id}}' "$nome" | cut -c1-12)"
    echo "imagem=$(docker inspect --format '{{.Image}}' "$nome")"
    echo "PID_host=$pid_host"
    echo "pid1_comm=$(docker exec "$nome" sh -c 'cat /proc/1/comm')"
    echo "pid1_cmdline=$(docker exec "$nome" sh -c 'tr "\0" " " < /proc/1/cmdline')"
    for ns in pid mnt net uts ipc cgroup; do
      v="$(docker exec "$nome" readlink "/proc/1/ns/$ns" 2>/dev/null || echo indisponivel)"
      echo "ns_$ns=$v"
      H[$rot,$ns]="$v"
    done
    echo "hostname_interno=$(docker exec "$nome" cat /proc/sys/kernel/hostname)"
    echo "pids_visiveis_dentro=$(docker exec "$nome" sh -c 'ls /proc | grep -E "^[0-9]+$" | tr "\n" " "')"
    echo "processos_visiveis_dentro:"
    docker exec "$nome" sh -c 'for p in /proc/[0-9]*; do printf "  pid=%s comm=%s\n" "${p#/proc/}" "$(cat $p/comm 2>/dev/null)"; done'
    echo "interfaces_rede_dentro=$(docker exec "$nome" sh -c "tail -n +3 /proc/1/net/dev | cut -d: -f1 | tr -d ' ' | tr '\n' ' '")"
    echo "raiz_do_mount_ns=$(docker exec "$nome" sh -c "awk '\$5==\"/\" {for(i=7;i<=NF;i++) if(\$i==\"-\") {print \"ponto=/ opcoes=\" \$6 \" fstype=\" \$(i+1); exit}}' /proc/1/mountinfo")"
    echo "total_mounts_dentro=$(docker exec "$nome" sh -c 'wc -l < /proc/1/mountinfo')"
    echo
    echo "# Visao do host do daemon (somente se o PID $pid_host existir neste /proc)"
    # /proc/<pid>/status e legivel por qualquer usuario; os links /proc/<pid>/ns/* exigem
    # permissao sobre o processo (root, no caso de conteineres do Docker).
    if [[ -r "/proc/$pid_host/status" ]] && grep -qE '^NSpid:.*[[:space:]]1$' "/proc/$pid_host/status"; then
      echo "host_local_confirmado=sim"
      echo "host_comm_de_PID_host=$(cat "/proc/$pid_host/comm")"
      echo "host_NSpid=$(grep NSpid "/proc/$pid_host/status" | cut -f2- | tr '\t' ' ')"
      for ns in pid mnt net; do
        v="$(readlink "/proc/$pid_host/ns/$ns" 2>/dev/null)"
        echo "host_ns_${ns}_de_PID_host=${v:-sem permissao para ler (execute o script como root)}"
      done
    else
      echo "host_local_confirmado=nao (o PID $pid_host nao existe neste /proc: daemon remoto ou Docker Desktop)"
    fi
  } > "$arq"
  echo "registro salvo: $arq"
done

# handles do proprio terminal, para comparar com os conteineres
{
  echo "# Handles do processo do terminal (host do daemon quando local)"
  for ns in pid mnt net uts ipc cgroup; do echo "ns_$ns=$(ns_host_self "$ns")"; done
  echo "interfaces_rede_host=$(tail -n +3 /proc/net/dev | cut -d: -f1 | tr -d ' ' | tr '\n' ' ')"
  echo "processos_visiveis_host=$(ls /proc | grep -cE '^[0-9]+$')"
} > "$OUT_NS/registro_host.txt"

{
  echo "recurso,handle_A,handle_B,iguais,handle_terminal"
  for ns in pid mnt net uts ipc cgroup; do
    a="${H[A,$ns]}"; b="${H[B,$ns]}"
    [[ "$a" == "$b" ]] && ig="sim" || ig="nao"
    echo "$ns,$a,$b,$ig,$(ns_host_self "$ns")"
  done
} > "$OUT_NS/namespaces.csv"
echo "tabela salva: $OUT_NS/namespaces.csv"
cat "$OUT_NS/namespaces.csv"

# ---------------------------------------------------------------- Parte D
DEMO="$RAIZ/dados_demo"
CTRL="$RAIZ/dados_demo_rw_controle"
mkdir -p "$DEMO" "$CTRL"
printf '%s\n' 'Documento sintetico' > "$DEMO/texto.txt"
chmod 0755 "$DEMO" "$CTRL"
chmod 0644 "$DEMO/texto.txt"

TESTE_PY='
import errno, os, sys
alvo = sys.argv[1]
leitura = sys.argv[2] if len(sys.argv) > 2 else ""
st = {}
for l in open("/proc/self/status"):
    if l.startswith(("Uid:", "CapEff:", "NoNewPrivs:", "Seccomp:")):
        k, v = l.split(":", 1); st[k] = v.split()[0]
print("uid=%s capeff=%s no_new_privs=%s seccomp=%s" % (st.get("Uid"), st.get("CapEff"), st.get("NoNewPrivs"), st.get("Seccomp")))
for l in open("/proc/self/mountinfo"):
    c = l.split()
    if c[4] == os.path.dirname(alvo):
        print("mountinfo: ponto=%s opcoes_mount=%s" % (c[4], c[5]))
if leitura:
    try:
        print("leitura=ok conteudo=%r" % open(leitura).read().strip())
    except OSError as e:
        print("leitura=falhou errno=%s (%s)" % (errno.errorcode.get(e.errno), e.strerror))
try:
    with open(alvo, "x") as f:
        f.write("nao deveria existir\n")
    print("escrita=PERMITIDA (arquivo criado)")
except OSError as e:
    print("escrita=negada errno=%d %s (%s)" % (e.errno, errno.errorcode.get(e.errno), e.strerror))
'

# caso <rotulo> <descricao das flags> <args do docker run...>
caso() {
  local rotulo="$1" desc="$2"; shift 2
  local nome="lab3_mnt_${rotulo}_$SUF"
  CRIADOS+=("$nome")
  echo "== caso $rotulo"
  echo "flags: --network none $desc"
  docker run --name "$nome" --label lab3=atv3 --network none "$@" 2>&1
  echo "rc_conteiner=$?"
  docker rm -f "$nome" >/dev/null 2>&1
  echo
}

{
  echo "# Parte D: montagem somente leitura e menor privilegio"
  echo "data_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "seguranca_daemon=$(docker info --format '{{.SecurityOptions}}')"
  echo "permissoes_host: $(cd "$RAIZ" && stat -c '%A %u:%g %n' dados_demo dados_demo/texto.txt dados_demo_rw_controle | tr '\n' ';')"
  echo
  caso D1_nao_root_ro "--user 65534:65534 --cap-drop ALL --security-opt no-new-privileges -v <repo>/dados_demo:/dados:ro" \
    --user 65534:65534 --cap-drop ALL --security-opt no-new-privileges \
    -v "$DEMO:/dados:ro" "$IMAGEM_LAB" python3 -c "$TESTE_PY" /dados/novo.txt /dados/texto.txt
  caso D2_root_ro "(usuario root, capabilities padrao, sem --privileged) -v <repo>/dados_demo:/dados:ro" \
    -v "$DEMO:/dados:ro" "$IMAGEM_LAB" python3 -c "$TESTE_PY" /dados/novo.txt /dados/texto.txt
  caso D3_nao_root_rw_sem_permissao "--user 65534:65534 --cap-drop ALL --security-opt no-new-privileges -v <repo>/dados_demo_rw_controle:/controle (rw)" \
    --user 65534:65534 --cap-drop ALL --security-opt no-new-privileges \
    -v "$CTRL:/controle" "$IMAGEM_LAB" python3 -c "$TESTE_PY" /controle/novo.txt
  echo "# Conferencia no host depois dos testes"
  echo "conteudo_dados_demo=$(ls -A "$DEMO" | tr '\n' ' ')"
  echo "conteudo_controle=$(ls -A "$CTRL" | tr '\n' ' ')"
} > "$OUT_MNT/readonly.txt"
echo "registro salvo: $OUT_MNT/readonly.txt"
cat "$OUT_MNT/readonly.txt"
