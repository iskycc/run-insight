#!/bin/sh

set -eu

archive="${1:-run-insight-offline-images.tar}"

case "$archive" in
  /*) ;;
  *) archive="$(pwd)/$archive" ;;
esac

if [ ! -f "$archive" ] || [ ! -f "$archive.sha256" ]; then
  echo "镜像包或 SHA-256 校验文件不存在：$archive" >&2
  exit 1
fi

(
  cd "$(dirname "$archive")"
  sha256sum --check "$(basename "$archive").sha256"
)

docker load --input "$archive"
echo "镜像导入完成。可使用 docker-compose.offline.yaml 启动离线环境。"
