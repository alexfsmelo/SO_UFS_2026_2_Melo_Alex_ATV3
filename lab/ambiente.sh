#!/usr/bin/env bash
# Parte A: registro do ambiente do daemon e do cgroup (Atividade 3, SO UFS 2026.2).
# Grava results/ambiente/ambiente.txt sem hostname, usuario ou credenciais
# (usa campos formatados de `docker info`, nunca a saida integral).
# Uso: export IMAGEM_LAB=...; bash lab/ambiente.sh
set -u -o pipefail

AQUI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAIZ="$(dirname "$AQUI")"
OUT="${OUT:-$RAIZ/results/ambiente}"
mkdir -p "$OUT"
IMAGEM_LAB="${IMAGEM_LAB:-}"

{
  echo "# Ambiente da Atividade 3"
  echo "data_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "## Kernel e distribuicao (Linux onde o terminal roda)"
  echo "uname=$(uname -srvmo)"
  grep -E '^(PRETTY_NAME|VERSION_ID)=' /etc/os-release
  echo "nproc=$(nproc)"
  echo "cpu_modelo=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2- | sed 's/^ //')"
  echo "ram_total=$(grep MemTotal /proc/meminfo | awk '{printf "%.1f GiB", $2/1048576}')"
  echo "swap_total=$(grep SwapTotal /proc/meminfo | awk '{print $2 " kB"}')"
  echo
  echo "## Virtualizacao"
  echo "flag_hypervisor_cpuinfo=$(grep -c -w hypervisor /proc/cpuinfo)"
  v="$(systemd-detect-virt 2>/dev/null)"; echo "systemd_detect_virt=${v:-indisponivel}"
  v="$(systemd-detect-virt --vm 2>/dev/null)"; echo "systemd_detect_virt_vm=${v:-indisponivel}"
  echo "pid1_do_linux=$(cat /proc/1/comm 2>/dev/null)"
  echo "marcador_/.dockerenv=$([[ -e /.dockerenv ]] && echo existe || echo ausente)"
  v="$(dmesg 2>/dev/null | grep -o 'Hypervisor detected: .*' | head -1)"; echo "dmesg_hypervisor=${v:-indisponivel}"
  if grep -qi microsoft /proc/version; then echo "wsl=sim ($(grep -o 'microsoft[^ ]*' /proc/version | head -1))"; else echo "wsl=nao"; fi
  cmdline_kernel="$(cat /proc/cmdline 2>/dev/null)"
  [[ "$cmdline_kernel" == *firecracker* ]] && echo "vmm=Firecracker (citado na linha de comando do kernel)"
  echo
  echo "## Docker"
  docker version --format 'docker_cliente={{.Client.Version}} docker_servidor={{.Server.Version}} api={{.Server.APIVersion}}' 2>&1
  echo "compose=$(docker compose version --short 2>/dev/null || echo indisponivel)"
  docker info --format 'daemon_sistema={{.OperatingSystem}}
daemon_kernel={{.KernelVersion}}
daemon_ncpu={{.NCPU}}
daemon_mem_bytes={{.MemTotal}}
Cgroup={{.CgroupVersion}} Driver={{.CgroupDriver}}
storage={{.Driver}}
runtime_padrao={{.DefaultRuntime}}
seguranca={{.SecurityOptions}}
rootless={{if .SecurityOptions}}{{range .SecurityOptions}}{{if eq . "name=rootless"}}sim{{end}}{{end}}{{end}}' 2>&1
  echo
  echo "## cgroup visto pelo terminal"
  tipo="$(stat -fc %T /sys/fs/cgroup)"
  echo "tipo_fs_/sys/fs/cgroup=$tipo"
  if [[ "$tipo" == "cgroup2fs" ]]; then
    echo "versao=v2 (unificado)"
    echo "controladores_raiz=$(cat /sys/fs/cgroup/cgroup.controllers)"
    echo "subtree_control_raiz=$(cat /sys/fs/cgroup/cgroup.subtree_control)"
    for d in /sys/fs/cgroup/system.slice /sys/fs/cgroup/docker; do
      [[ -d "$d" ]] && echo "ancestral $d: cpu.max=$(cat $d/cpu.max 2>/dev/null) memory.max=$(cat $d/memory.max 2>/dev/null) pids.max=$(cat $d/pids.max 2>/dev/null)"
    done
  else
    echo "versao=v1 (hierarquias separadas por controlador; /sys/fs/cgroup/unified existe=$([[ -d /sys/fs/cgroup/unified ]] && echo sim || echo nao))"
    echo "hierarquias_v1:"
    awk 'NR>1 && $4==1 {printf "  %s (hierarquia %s)\n", $1, $2}' /proc/cgroups
    for c in cpu memory pids; do
      for d in "/sys/fs/cgroup/$c" "/sys/fs/cgroup/$c/docker"; do
        [[ -d "$d" ]] || continue
        case $c in
          cpu) echo "ancestral $d: cpu.cfs_quota_us=$(cat $d/cpu.cfs_quota_us) cpu.cfs_period_us=$(cat $d/cpu.cfs_period_us)" ;;
          memory) echo "ancestral $d: memory.limit_in_bytes=$(cat $d/memory.limit_in_bytes) memsw=$(cat $d/memory.memsw.limit_in_bytes 2>/dev/null || echo indisponivel)" ;;
          pids) echo "ancestral $d: pids.max=$(cat $d/pids.max 2>/dev/null || echo raiz-sem-limite)" ;;
        esac
      done
    done
  fi
  echo
  echo "## Imagem do laboratorio"
  if [[ -n "$IMAGEM_LAB" ]]; then
    echo "IMAGEM_LAB=$IMAGEM_LAB"
    docker image inspect --format 'image_id={{.Id}}
repo_digests={{.RepoDigests}}
repo_tags={{.RepoTags}}
criada={{.Created}}
tamanho_bytes={{.Size}}
comentario={{.Comment}}' "$IMAGEM_LAB" 2>&1
    echo "python_na_imagem=$(docker run --rm --network none "$IMAGEM_LAB" python3 -c 'import platform; print(platform.python_version())' 2>&1)"
    echo "os_na_imagem=$(docker run --rm --network none "$IMAGEM_LAB" sh -c '. /etc/os-release; echo $PRETTY_NAME' 2>&1)"
    echo "kernel_visto_dentro_do_conteiner=$(docker run --rm --network none "$IMAGEM_LAB" uname -r 2>&1)"
    echo "kernel_visto_no_terminal=$(uname -r)"
  else
    echo "IMAGEM_LAB nao definida"
  fi
  echo
  echo "## Codigo"
  echo "commit=$(git -C "$RAIZ" rev-parse --short HEAD 2>/dev/null || echo sem-git)"
  for f in "$AQUI"/*.py "$AQUI"/*.sh; do echo "sha256 $(basename "$f")=$(sha256sum "$f" | cut -d' ' -f1)"; done
} > "$OUT/ambiente.txt"

echo "ambiente salvo em $OUT/ambiente.txt"
cat "$OUT/ambiente.txt"
