#!/bin/sh

set -eu

app_image="${RUN_INSIGHT_IMAGE:-iskycc/run-insight:latest}"
database_image="${MARIADB_IMAGE:-mariadb:11.4}"
destination="${1:-run-insight-offline-images.tar}"

case "$destination" in
  /*) ;;
  *) destination="$(pwd)/$destination" ;;
esac

if [ -e "$destination" ] || [ -e "$destination.sha256" ]; then
  echo "目标文件已存在，拒绝覆盖：$destination" >&2
  exit 1
fi

docker image inspect "$app_image" >/dev/null
docker image inspect "$database_image" >/dev/null

echo "正在导出离线运行所需镜像："
echo "  - $app_image"
echo "  - $database_image"
docker save --output "$destination" "$app_image" "$database_image"

(
  cd "$(dirname "$destination")"
  sha256sum "$(basename "$destination")" > "$(basename "$destination").sha256"
)

echo "离线镜像包已生成：$destination"
echo "校验文件已生成：$destination.sha256"
