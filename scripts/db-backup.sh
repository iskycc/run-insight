#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'
umask 077

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly PROJECT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd -P)"
readonly COMPOSE_FILE="${COMPOSE_FILE:-${PROJECT_DIR}/docker-compose.yaml}"
readonly BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
readonly BACKUP_NAME_PATTERN='^run-insight-db-(pre-restore-)?[0-9]{8}T[0-9]{6}Z\.sql\.gz$'

usage() {
  cat <<'EOF'
Run Insight MariaDB backup utility

Usage:
  scripts/db-backup.sh backup
  scripts/db-backup.sh list
  scripts/db-backup.sh verify BACKUP_FILE
  scripts/db-backup.sh restore BACKUP_FILE [--confirm DATABASE_NAME]
  scripts/db-backup.sh prune
  scripts/db-backup.sh help

Environment:
  BACKUP_DIR             Backup directory (default: <project>/backups)
  BACKUP_RETENTION_DAYS  Age threshold used by prune (default: 30)
  COMPOSE_FILE           Compose file (default: <project>/docker-compose.yaml)

Restore accepts exactly one managed .sql.gz file. Without --confirm, an
interactive terminal must type the current MARIADB_DATABASE name.
EOF
}

die() {
  printf 'Error: %s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "required command not found: $1"
}

validate_retention_days() {
  [[ "${BACKUP_RETENTION_DAYS}" =~ ^[0-9]+$ ]] \
    || die "BACKUP_RETENTION_DAYS must be a non-negative integer"
}

prepare_backup_dir() {
  local requested="${BACKUP_DIR:-${PROJECT_DIR}/backups}"
  local prospective owner_uid permissions mode
  [[ -n "${requested}" ]] || die "BACKUP_DIR must not be empty"
  [[ "${requested}" != *$'\n'* ]] || die "BACKUP_DIR contains an invalid newline"
  require_command realpath
  prospective="$(realpath -m -- "${requested}")"
  [[ "${prospective}" != "/" ]] \
    || die "BACKUP_DIR must not be the filesystem root"
  [[ "${prospective}" != "${PROJECT_DIR}" ]] \
    || die "BACKUP_DIR must not be the project root"
  if [[ -e "${requested}" && -L "${requested}" ]]; then
    die "BACKUP_DIR must not be a symbolic link"
  fi

  if [[ -e "${requested}" ]]; then
    [[ -d "${requested}" ]] || die "BACKUP_DIR must be a directory"
    owner_uid="$(stat -c '%u' -- "${requested}")"
    [[ "${owner_uid}" == "$(id -u)" ]] \
      || die "BACKUP_DIR must be owned by the current user"
    permissions="$(stat -c '%a' -- "${requested}")"
    [[ "${permissions}" =~ ^[0-7]{3,4}$ ]] \
      || die "could not determine BACKUP_DIR permissions"
    mode=$((8#${permissions}))
    (( (mode & 8#077) == 0 )) \
      || die "BACKUP_DIR must not grant group or other permissions"
  else
    install -d -m 700 -- "${requested}"
  fi
  BACKUP_DIR_RESOLVED="$(cd -- "${requested}" && pwd -P)"
  [[ "${BACKUP_DIR_RESOLVED}" == "${prospective}" ]] \
    || die "BACKUP_DIR resolved unexpectedly"
  readonly BACKUP_DIR_RESOLVED
}

compose() {
  docker compose \
    --project-directory "${PROJECT_DIR}" \
    -f "${COMPOSE_FILE}" \
    "$@"
}

require_compose_runtime() {
  require_command docker
  [[ -f "${COMPOSE_FILE}" && ! -L "${COMPOSE_FILE}" ]] \
    || die "Compose file is missing or is a symbolic link: ${COMPOSE_FILE}"
  docker compose version >/dev/null 2>&1 \
    || die "Docker Compose v2 is required"
}

managed_backup_path() {
  local requested="${1:-}"
  [[ -n "${requested}" ]] || die "a backup file must be specified"
  [[ "${requested}" != *[\*\?\[\]]* ]] \
    || die "backup file must not contain glob characters"

  if [[ "${requested}" == */* ]]; then
    local requested_dir
    requested_dir="$(cd -- "$(dirname -- "${requested}")" 2>/dev/null && pwd -P)" \
      || die "backup directory does not exist"
    [[ "${requested_dir}" == "${BACKUP_DIR_RESOLVED}" ]] \
      || die "backup file must be inside BACKUP_DIR"
  fi

  local name path
  name="$(basename -- "${requested}")"
  [[ "${name}" =~ ${BACKUP_NAME_PATTERN} ]] \
    || die "backup filename is not a managed Run Insight backup"
  path="${BACKUP_DIR_RESOLVED}/${name}"
  [[ -f "${path}" && ! -L "${path}" ]] \
    || die "backup file does not exist or is a symbolic link: ${name}"
  printf '%s\n' "${path}"
}

checksum_path_for() {
  printf '%s.sha256\n' "$1"
}

verify_backup() {
  local backup_path="$1"
  local checksum_path checksum_lines expected_hash checksum_name actual_hash
  checksum_path="$(checksum_path_for "${backup_path}")"
  [[ -f "${checksum_path}" && ! -L "${checksum_path}" ]] \
    || die "checksum file is missing or is a symbolic link"

  checksum_lines="$(wc -l < "${checksum_path}")"
  [[ "${checksum_lines}" -eq 1 ]] || die "checksum file must contain exactly one entry"
  IFS=' ' read -r expected_hash checksum_name < "${checksum_path}" \
    || die "checksum file is malformed"
  [[ "${expected_hash}" =~ ^[0-9a-fA-F]{64}$ ]] \
    || die "checksum hash is malformed"
  [[ "${checksum_name}" == "$(basename -- "${backup_path}")" ]] \
    || die "checksum filename does not match the selected backup"

  actual_hash="$(sha256sum -- "${backup_path}")"
  actual_hash="${actual_hash%% *}"
  [[ "${actual_hash,,}" == "${expected_hash,,}" ]] \
    || die "SHA-256 checksum verification failed"
  gzip -t -- "${backup_path}" || die "gzip integrity verification failed"
}

database_name() {
  compose exec -T db sh -eu -c '
    test -n "${MARIADB_DATABASE:-}"
    printf "%s" "$MARIADB_DATABASE"
  '
}

create_backup() {
  local kind="${1:-regular}"
  local timestamp prefix filename final_path temp_path checksum_path checksum_temp
  timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
  prefix="run-insight-db-"
  [[ "${kind}" == "pre-restore" ]] && prefix+="pre-restore-"
  filename="${prefix}${timestamp}.sql.gz"
  final_path="${BACKUP_DIR_RESOLVED}/${filename}"
  temp_path="${final_path}.partial.$$"
  checksum_path="$(checksum_path_for "${final_path}")"
  checksum_temp="${checksum_path}.partial.$$"

  [[ ! -e "${final_path}" && ! -e "${checksum_path}" ]] \
    || die "backup already exists for this timestamp"

  cleanup_partial_backup() {
    rm -f -- \
      "${temp_path}" \
      "${checksum_temp}" \
      "${final_path}" \
      "${checksum_path}"
  }
  trap cleanup_partial_backup EXIT INT TERM HUP

  compose exec -T db sh -eu -c '
    export MYSQL_PWD="${MARIADB_PASSWORD:?MARIADB_PASSWORD is not set}"
    exec mariadb-dump \
      --user="${MARIADB_USER:?MARIADB_USER is not set}" \
      --host=127.0.0.1 \
      --protocol=TCP \
      --single-transaction \
      --quick \
      --skip-lock-tables \
      --routines \
      --events \
      --triggers \
      --hex-blob \
      --default-character-set=utf8mb4 \
      -- "${MARIADB_DATABASE:?MARIADB_DATABASE is not set}"
  ' | gzip -9 > "${temp_path}"

  gzip -t -- "${temp_path}" || die "new backup failed gzip integrity verification"
  chmod 600 -- "${temp_path}"
  mv -- "${temp_path}" "${final_path}"

  local hash
  hash="$(sha256sum -- "${final_path}")"
  hash="${hash%% *}"
  printf '%s  %s\n' "${hash}" "${filename}" > "${checksum_temp}"
  chmod 600 -- "${checksum_temp}"
  mv -- "${checksum_temp}" "${checksum_path}"

  trap - EXIT INT TERM HUP
  printf 'Backup created: %s\n' "${final_path}"
}

list_backups() {
  local found=0 path name size modified
  shopt -s nullglob
  for path in "${BACKUP_DIR_RESOLVED}"/run-insight-db-*.sql.gz; do
    name="$(basename -- "${path}")"
    [[ "${name}" =~ ${BACKUP_NAME_PATTERN} ]] || continue
    [[ -f "${path}" && ! -L "${path}" ]] || continue
    found=1
    size="$(stat -c '%s' -- "${path}")"
    modified="$(date -u -d "@$(stat -c '%Y' -- "${path}")" '+%Y-%m-%dT%H:%M:%SZ')"
    printf '%s\t%s bytes\t%s\n' "${name}" "${size}" "${modified}"
  done
  shopt -u nullglob
  [[ "${found}" -eq 1 ]] || printf 'No managed backups found in %s\n' "${BACKUP_DIR_RESOLVED}"
}

confirm_restore() {
  local expected_database="$1"
  local supplied_confirmation="${2:-}"
  if [[ -n "${supplied_confirmation}" ]]; then
    [[ "${supplied_confirmation}" == "${expected_database}" ]] \
      || die "--confirm must exactly match MARIADB_DATABASE (${expected_database})"
    return
  fi

  [[ -r /dev/tty && -w /dev/tty ]] \
    || die "interactive confirmation unavailable; use --confirm DATABASE_NAME"
  local typed
  printf 'Type database name "%s" to continue: ' "${expected_database}" > /dev/tty
  IFS= read -r typed < /dev/tty || die "confirmation was not provided"
  [[ "${typed}" == "${expected_database}" ]] || die "database name confirmation did not match"
}

restore_backup() {
  local backup_path="$1"
  local confirmation="${2:-}"
  verify_backup "${backup_path}"

  local expected_database
  expected_database="$(database_name)"
  [[ -n "${expected_database}" ]] || die "container database name is empty"
  confirm_restore "${expected_database}" "${confirmation}"

  printf 'Creating mandatory pre-restore backup...\n'
  create_backup "pre-restore"
  printf 'Restoring %s into database %s...\n' \
    "$(basename -- "${backup_path}")" "${expected_database}"

  gzip -dc -- "${backup_path}" | compose exec -T db sh -eu -c '
    export MYSQL_PWD="${MARIADB_PASSWORD:?MARIADB_PASSWORD is not set}"
    exec mariadb \
      --user="${MARIADB_USER:?MARIADB_USER is not set}" \
      --host=127.0.0.1 \
      --protocol=TCP \
      --default-character-set=utf8mb4 \
      -- "${MARIADB_DATABASE:?MARIADB_DATABASE is not set}"
  '
  printf 'Restore completed from: %s\n' "${backup_path}"
}

prune_backups() {
  validate_retention_days
  local now cutoff retention_days path name modified checksum_path removed=0
  now="$(date +%s)"
  retention_days=$((10#${BACKUP_RETENTION_DAYS}))
  cutoff=$((now - retention_days * 86400))

  shopt -s nullglob
  for path in "${BACKUP_DIR_RESOLVED}"/run-insight-db-*.sql.gz; do
    name="$(basename -- "${path}")"
    [[ "${name}" =~ ${BACKUP_NAME_PATTERN} ]] || continue
    [[ -f "${path}" && ! -L "${path}" ]] || continue
    modified="$(stat -c '%Y' -- "${path}")"
    [[ "${modified}" =~ ^[0-9]+$ && "${modified}" -lt "${cutoff}" ]] || continue

    checksum_path="$(checksum_path_for "${path}")"
    rm -f -- "${path}"
    if [[ -f "${checksum_path}" && ! -L "${checksum_path}" ]]; then
      rm -f -- "${checksum_path}"
    fi
    printf 'Removed expired backup: %s\n' "${name}"
    removed=$((removed + 1))
  done
  shopt -u nullglob
  printf 'Prune complete: %d backup(s) removed.\n' "${removed}"
}

main() {
  local command="${1:-help}"
  shift || true

  case "${command}" in
    help|-h|--help)
      [[ "$#" -eq 0 ]] || die "help does not accept arguments"
      usage
      ;;
    backup)
      [[ "$#" -eq 0 ]] || die "backup does not accept arguments"
      require_command gzip
      require_command sha256sum
      require_compose_runtime
      prepare_backup_dir
      create_backup
      ;;
    list)
      [[ "$#" -eq 0 ]] || die "list does not accept arguments"
      require_command stat
      prepare_backup_dir
      list_backups
      ;;
    verify)
      [[ "$#" -eq 1 ]] || die "verify requires exactly one backup file"
      require_command gzip
      require_command sha256sum
      prepare_backup_dir
      verify_backup "$(managed_backup_path "$1")"
      printf 'Backup verified: %s\n' "$(basename -- "$1")"
      ;;
    restore)
      [[ "$#" -ge 1 && "$#" -le 3 ]] \
        || die "restore requires BACKUP_FILE and optional --confirm DATABASE_NAME"
      local requested_backup="$1"
      shift
      local confirmation=""
      if [[ "$#" -gt 0 ]]; then
        [[ "$#" -eq 2 && "$1" == "--confirm" && -n "$2" ]] \
          || die "restore confirmation syntax is --confirm DATABASE_NAME"
        confirmation="$2"
      fi
      require_command gzip
      require_command sha256sum
      require_compose_runtime
      prepare_backup_dir
      restore_backup "$(managed_backup_path "${requested_backup}")" "${confirmation}"
      ;;
    prune)
      [[ "$#" -eq 0 ]] || die "prune does not accept arguments"
      require_command stat
      prepare_backup_dir
      prune_backups
      ;;
    *)
      die "unknown command: ${command}; run with --help"
      ;;
  esac
}

main "$@"
