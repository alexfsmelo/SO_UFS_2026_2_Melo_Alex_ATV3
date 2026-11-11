#!/usr/bin/env bash
# Imagem alternativa do laboratorio, usada quando o Docker Hub nao esta acessivel
# (foi o caso no ambiente das medicoes deste relatorio).
#
# Constroi um Ubuntu 24.04 minimo com Python 3.12 a partir do repositorio oficial
# do Ubuntu (pacotes verificados pelo apt com a chave ubuntu-archive-keyring) e
# importa no Docker. A imagem fica fixada pelo Image ID (sha256 do conteudo).
#
# Requer root, debootstrap e acesso a archive.ubuntu.com.
# Se o Docker Hub estiver acessivel, prefira o caminho do enunciado:
#   docker pull python:3.12-slim
#   export IMAGEM_LAB="$(docker image inspect --format '{{index .RepoDigests 0}}' python:3.12-slim)"
set -euo pipefail

DESTINO="${DESTINO:-/tmp/lab3_rootfs}"
TAG="${TAG:-lab-so/py312-noble:atv3}"
ESPELHO="${ESPELHO:-http://archive.ubuntu.com/ubuntu/}"

[[ $EUID -eq 0 ]] || { echo "execute como root" >&2; exit 1; }
command -v debootstrap >/dev/null || apt-get install -y debootstrap

rm -rf "$DESTINO"
debootstrap --variant=minbase --include=python3-minimal noble "$DESTINO" "$ESPELHO"

# python3-minimal nao traz a biblioteca padrao completa (falta json, por exemplo);
# a primeira versao da imagem falhou no piloto por isso. Instala o python3 completo:
cp /etc/resolv.conf "$DESTINO/etc/resolv.conf"
mount -t proc proc "$DESTINO/proc"
trap 'umount "$DESTINO/proc" 2>/dev/null || true' EXIT
chroot "$DESTINO" /bin/sh -c 'export DEBIAN_FRONTEND=noninteractive; apt-get update -o Acquire::Languages=none && apt-get install -y --no-install-recommends python3'
umount "$DESTINO/proc"
: > "$DESTINO/etc/resolv.conf"

chroot "$DESTINO" dpkg-query -W -f '${Package}\t${Version}\n' > pacotes_imagem.tsv
rm -rf "$DESTINO"/var/cache/apt/archives/*.deb "$DESTINO"/var/lib/apt/lists/*
tar --numeric-owner --sort=name -C "$DESTINO" -cf rootfs.tar .
sha256sum rootfs.tar | tee rootfs.sha256
docker import --change 'CMD ["python3"]' --change 'ENV PYTHONDONTWRITEBYTECODE=1' \
  --message 'debootstrap minbase noble + python3 (ATV3 SO UFS)' rootfs.tar "$TAG"
echo "IMAGEM_LAB=$(docker image inspect --format '{{.Id}}' "$TAG")"
echo "Obs.: o Image ID depende dos pacotes do dia; o ID usado nas medicoes esta em results/ambiente/ambiente.txt."
