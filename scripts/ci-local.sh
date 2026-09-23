#!/usr/bin/env bash
# Run the repository's CI gates locally and record exactly what was (and was
# not) verified. Missing optional toolchains are reported as SKIP, never PASS.
#
# Examples:
#   scripts/ci-local.sh
#   scripts/ci-local.sh --python .venv/bin/python --only backend-api,backend
#   scripts/ci-local.sh --receipt ci-local-receipt.md

set -uo pipefail

readonly SCRIPT_NAME="${0##*/}"
readonly -a VALID_KEYS=(
  citation-version
  citation-schema
  audit
  lint
  i18n
  build
  frontend
  workers
  backend-api
  backend
  rust
  docker
)

declare -a ONLY_KEYS=()
declare -a ORIGINAL_ARGS=()
PYTHON_ARG=""
RECEIPT=""

usage() {
  cat <<EOF
Usage: $SCRIPT_NAME [options]

Run local equivalents of the repository's CI stages. A missing toolchain marks
its stage SKIP; it is never reported as a pass. Any failed stage makes this
command exit non-zero.

Options:
  --python PATH       Python interpreter containing the editable backend test
                      installs. Defaults to .venv/bin/python when present, then
                      python3/python from PATH.
  --only KEYS         Run only comma-separated stage keys. May be repeated.
  --receipt PATH      Write a Markdown verification receipt.
  --list              Print valid stage keys and exit.
  -h, --help          Show this help.

Backend setup (matching CI):
  python3 -m venv .venv
  .venv/bin/python -m pip install -e 'backend/geolibre_server[test]'
  .venv/bin/python -m pip install -e 'backend/geolibre_server_api[test]'
EOF
}

list_keys() {
  printf '%s\n' "${VALID_KEYS[@]}"
}

is_valid_key() {
  local candidate=$1 key
  for key in "${VALID_KEYS[@]}"; do
    [[ "$candidate" == "$key" ]] && return 0
  done
  return 1
}

add_only_keys() {
  local value=$1 key
  IFS=',' read -r -a parsed <<<"$value"
  for key in "${parsed[@]}"; do
    if [[ -z "$key" ]] || ! is_valid_key "$key"; then
      echo "Unknown stage key: ${key:-<empty>}" >&2
      echo "Valid keys:" >&2
      list_keys >&2
      exit 2
    fi
    ONLY_KEYS+=("$key")
  done
}

while (($#)); do
  case "$1" in
    --python)
      (($# >= 2)) || { echo "--python requires a path" >&2; exit 2; }
      PYTHON_ARG=$2
      shift 2
      ;;
    --only)
      (($# >= 2)) || { echo "--only requires one or more keys" >&2; exit 2; }
      add_only_keys "$2"
      shift 2
      ;;
    --receipt)
      (($# >= 2)) || { echo "--receipt requires a path" >&2; exit 2; }
      RECEIPT=$2
      shift 2
      ;;
    --list)
      list_keys
      exit 0
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

# Always run from the repository root, including when invoked through an
# absolute path or from a subdirectory.
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
REPO_ROOT=$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null) || {
  echo "$SCRIPT_NAME must be run from a Git checkout" >&2
  exit 2
}
cd "$REPO_ROOT"

selected() {
  local candidate=$1 key
  ((${#ONLY_KEYS[@]} == 0)) && return 0
  for key in "${ONLY_KEYS[@]}"; do
    [[ "$candidate" == "$key" ]] && return 0
  done
  return 1
}

find_python() {
  if [[ -n "$PYTHON_ARG" ]]; then
    if [[ ! -x "$PYTHON_ARG" ]]; then
      echo "--python is not executable: $PYTHON_ARG" >&2
      exit 2
    fi
    PYTHON_BIN=$(cd "$(dirname "$PYTHON_ARG")" && pwd)/$(basename "$PYTHON_ARG")
    return
  fi

  local candidate
  for candidate in .venv/bin/python .venv/Scripts/python.exe python3 python; do
    if [[ "$candidate" == */* ]]; then
      if [[ -x "$candidate" ]]; then
        PYTHON_BIN=$(cd "$(dirname "$candidate")" && pwd)/$(basename "$candidate")
        return
      fi
    elif command -v "$candidate" >/dev/null 2>&1; then
      PYTHON_BIN=$(command -v "$candidate")
      return
    fi
  done
  PYTHON_BIN=""
}

find_python

CFFCONVERT=""
if [[ -n "$PYTHON_BIN" ]]; then
  python_scripts_dir=$(dirname "$PYTHON_BIN")
  for candidate in "$python_scripts_dir/cffconvert" "$python_scripts_dir/cffconvert.exe"; do
    if [[ -x "$candidate" ]]; then
      CFFCONVERT=$candidate
      break
    fi
  done
fi
if [[ -z "$CFFCONVERT" ]] && command -v cffconvert >/dev/null 2>&1; then
  CFFCONVERT=$(command -v cffconvert)
fi

declare -a RESULT_KEYS=()
declare -A RESULT_LABEL=()
declare -A RESULT_STATUS=()
declare -A RESULT_DURATION=()
declare -A RESULT_NOTE=()
FAILED=0
SKIP_REASON=""

format_duration() {
  local seconds=$1
  if ((seconds >= 60)); then
    printf '%dm%02ds' "$((seconds / 60))" "$((seconds % 60))"
  else
    printf '%ds' "$seconds"
  fi
}

record_result() {
  local key=$1 label=$2 status=$3 duration=$4 note=${5:-}
  RESULT_KEYS+=("$key")
  RESULT_LABEL["$key"]=$label
  RESULT_STATUS["$key"]=$status
  RESULT_DURATION["$key"]=$duration
  RESULT_NOTE["$key"]=$note
}

run_stage() {
  local key=$1 label=$2 probe=$3 runner=$4
  selected "$key" || return 0

  echo
  echo "==> [$key] $label"
  SKIP_REASON=""
  if ! "$probe"; then
    local reason=${SKIP_REASON:-"required toolchain is unavailable"}
    echo "SKIP: $reason"
    record_result "$key" "$label" "SKIP" "—" "$reason"
    return 0
  fi

  local started=$SECONDS status elapsed duration
  "$runner"
  status=$?
  elapsed=$((SECONDS - started))
  duration=$(format_duration "$elapsed")
  if ((status == 0)); then
    echo "PASS: $label ($duration)"
    record_result "$key" "$label" "PASS" "$duration"
  else
    echo "FAIL: $label ($duration, exit $status)" >&2
    record_result "$key" "$label" "FAIL" "$duration" "exit $status"
    FAILED=1
  fi
}

probe_node() {
  if ! command -v node >/dev/null 2>&1; then
    SKIP_REASON="Node.js is not installed"
    return 1
  fi
}

probe_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    SKIP_REASON="npm is not installed"
    return 1
  fi
  if [[ ! -d node_modules ]]; then
    SKIP_REASON="node_modules is absent; run npm ci"
    return 1
  fi
}

probe_cffconvert() {
  if [[ -z "$CFFCONVERT" ]]; then
    SKIP_REASON="cffconvert is not installed beside the selected Python interpreter or on PATH"
    return 1
  fi
}

python_has_modules() {
  local purpose=$1 install_hint=$2
  shift 2
  if [[ -z "$PYTHON_BIN" ]]; then
    SKIP_REASON="Python is not installed"
    return 1
  fi
  local modules_json missing
  modules_json=$(printf '%s\n' "$@" | "$PYTHON_BIN" -c 'import json,sys; print(json.dumps([line.strip() for line in sys.stdin if line.strip()]))')
  if ! missing=$("$PYTHON_BIN" - "$modules_json" <<'PY'
import importlib.util
import json
import sys

missing = [name for name in json.loads(sys.argv[1]) if importlib.util.find_spec(name) is None]
print(", ".join(missing))
raise SystemExit(bool(missing))
PY
  ); then
    SKIP_REASON="$purpose dependencies are incomplete ($missing); $install_hint"
    return 1
  fi
}

probe_backend_api() {
  python_has_modules \
    "backend API" \
    "$PYTHON_BIN -m pip install -e 'backend/geolibre_server_api[test]'" \
    pytest geolibre_server_api
}

probe_backend() {
  # Checking the optional engines prevents a deceptively green run in which
  # most vector/raster/SQL/ML tests silently skip themselves. PostGIS service
  # tests remain gated on GEOLIBRE_TEST_POSTGIS_DSN, exactly as they are in CI.
  python_has_modules \
    "backend" \
    "$PYTHON_BIN -m pip install -e 'backend/geolibre_server[test]'" \
    pytest pytest_cov geolibre_server duckdb geopandas rasterio shapely httpx sedona psycopg jupyterlab
}

probe_cargo() {
  if ! command -v cargo >/dev/null 2>&1; then
    SKIP_REASON="cargo is not installed"
    return 1
  fi
}

probe_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    SKIP_REASON="docker is not installed"
    return 1
  fi
  if ! docker info >/dev/null 2>&1; then
    SKIP_REASON="the Docker daemon is unavailable"
    return 1
  fi
}

run_citation_version() {
  local cff_version pkg_version
  cff_version=$(sed -n 's/^version: *//p' CITATION.cff | tr -d '"' | head -n1)
  pkg_version=$(node -e 'process.stdout.write(require("./package.json").version)')
  echo "CITATION.cff version: $cff_version"
  echo "package.json version: $pkg_version"
  if [[ "$cff_version" != "$pkg_version" ]]; then
    echo "CITATION.cff version does not match package.json" >&2
    return 1
  fi
}

run_citation_schema() { "$CFFCONVERT" --validate -i CITATION.cff; }
run_audit() { npm run audit:ci; }
run_lint() { npm run lint; }
run_i18n() { npm run i18n:tools:check; }
run_build() { npm run build; }
run_frontend() { npm run test:frontend:coverage; }
run_workers() { npm run test:worker; }
run_backend_api() { "$PYTHON_BIN" -m pytest backend/geolibre_server_api/tests; }
run_backend() {
  "$PYTHON_BIN" -m pytest backend/geolibre_server/tests \
    --cov=geolibre_server \
    --cov-report=term-missing \
    --cov-fail-under=55
}
run_rust() { npm run check:rust; }

DOCKER_CONTAINER=""
cleanup_docker() {
  if [[ -n "$DOCKER_CONTAINER" ]] && command -v docker >/dev/null 2>&1; then
    docker rm -f "$DOCKER_CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup_docker EXIT INT TERM

run_docker() {
  local suffix=$$ collab_image="geospax-collab:ci-$suffix" web_image="geospax-web:ci-$suffix"
  DOCKER_CONTAINER="geospax-collab-ci-$suffix"

  # Mirrors ci.yml's relay build-and-run regression gate.
  docker build -f workers/collab-node/Dockerfile -t "$collab_image" . || return
  docker run -d --name "$DOCKER_CONTAINER" -p 8787:8787 "$collab_image" >/dev/null || return
  if ! node workers/collab-node/scripts/smoke.mjs http://127.0.0.1:8787; then
    docker logs "$DOCKER_CONTAINER" || true
    return 1
  fi
  docker logs "$DOCKER_CONTAINER"
  docker rm -f "$DOCKER_CONTAINER" >/dev/null
  DOCKER_CONTAINER=""

  # Mirrors the pull-request lane in publish-container.yml (single native arch,
  # build only; publishing and multi-arch emulation are release concerns).
  docker build -f Dockerfile -t "$web_image" .
}

run_stage citation-version "citation version match" probe_node run_citation_version
run_stage citation-schema "CITATION.cff schema" probe_cffconvert run_citation_schema
run_stage audit "dependency audit" probe_npm run_audit
run_stage lint "lint" probe_npm run_lint
run_stage i18n "i18n tool catalogs" probe_npm run_i18n
run_stage build "production build" probe_npm run_build
run_stage frontend "frontend tests + coverage" probe_npm run_frontend
run_stage workers "worker typecheck + tests" probe_npm run_workers
run_stage backend-api "backend API tests" probe_backend_api run_backend_api
run_stage backend "backend tests + coverage" probe_backend run_backend
run_stage rust "Rust check" probe_cargo run_rust
run_stage docker "Docker images + relay smoke" probe_docker run_docker

shell_join() {
  local value out=""
  for value in "$@"; do
    printf -v value '%q' "$value"
    out+="${out:+ }$value"
  done
  printf '%s' "$out"
}

version_or_unavailable() {
  local command_name=$1
  shift
  if command -v "$command_name" >/dev/null 2>&1; then
    "$command_name" "$@" 2>/dev/null | head -n1
  else
    printf 'unavailable'
  fi
}

write_receipt() {
  local path=$1 commit branch dirty scope generated invocation key note
  commit=$(git rev-parse HEAD)
  branch=$(git branch --show-current)
  if [[ -n "$(git status --porcelain --untracked-files=normal)" ]]; then
    dirty=yes
    scope="worktree based on \`$commit\` (uncommitted changes were present)"
  else
    dirty=no
    scope="commit \`$commit\`"
  fi
  generated=$(date -u +'%Y-%m-%dT%H:%M:%SZ')
  invocation=$(shell_join "$0" "${ORIGINAL_ARGS[@]}")

  mkdir -p "$(dirname "$path")"
  {
    echo "# Local CI verification receipt"
    echo
    echo "- **Generated:** $generated"
    echo "- **Branch:** \`$branch\`"
    echo "- **Scope:** $scope"
    echo "- **Worktree dirty before receipt:** \`$dirty\`"
    echo "- **Command:** \`$invocation\`"
    echo
    echo "> A **SKIP is not a pass**. It means the named toolchain or dependency"
    echo "> was unavailable, and that stage still requires a capable runner."
    echo
    echo "| Result | Stage | Duration | Note |"
    echo "|---|---|---:|---|"
    for key in "${RESULT_KEYS[@]}"; do
      note=${RESULT_NOTE[$key]:-}
      note=${note//|/\\|}
      echo "| **${RESULT_STATUS[$key]}** | ${RESULT_LABEL[$key]} | ${RESULT_DURATION[$key]} | $note |"
    done
    echo
    echo "## Toolchain"
    echo
    echo '```text'
    echo "Node:   $(version_or_unavailable node --version)"
    echo "npm:    $(version_or_unavailable npm --version)"
    if [[ -n "$PYTHON_BIN" ]]; then
      echo "Python: $($PYTHON_BIN --version 2>&1) ($PYTHON_BIN)"
    else
      echo "Python: unavailable"
    fi
    echo "Rust:   $(version_or_unavailable rustc --version)"
    echo "Cargo:  $(version_or_unavailable cargo --version)"
    echo "Docker: $(version_or_unavailable docker --version)"
    echo '```'
  } >"$path"
  echo
  echo "Receipt written to $path"
}

if [[ -n "$RECEIPT" ]]; then
  # Reconstruct the meaningful options deterministically rather than relying on
  # /proc's NUL-delimited command line (which is not portable to macOS).
  ORIGINAL_ARGS=()
  [[ -n "$PYTHON_ARG" ]] && ORIGINAL_ARGS+=(--python "$PYTHON_ARG")
  if ((${#ONLY_KEYS[@]})); then
    joined=$(IFS=,; echo "${ONLY_KEYS[*]}")
    ORIGINAL_ARGS+=(--only "$joined")
  fi
  ORIGINAL_ARGS+=(--receipt "$RECEIPT")
  write_receipt "$RECEIPT"
fi

echo
echo "==> Local CI summary"
printf '%-6s  %-32s  %8s\n' RESULT STAGE DURATION
for key in "${RESULT_KEYS[@]}"; do
  printf '%-6s  %-32s  %8s\n' \
    "${RESULT_STATUS[$key]}" "${RESULT_LABEL[$key]}" "${RESULT_DURATION[$key]}"
done

if ((FAILED)); then
  exit 1
fi
