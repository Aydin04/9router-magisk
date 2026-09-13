#!/system/bin/sh
# 9router AI Gateway background service for Android (Magisk/KernelSU/APatch)
MODDIR=${0%/*}

while [ "$(getprop sys.boot_completed)" != "1" ]; do
    sleep 3
done

export MODDIR
export DATA_DIR="/data/adb/9router-data"
export LOG_FILE="/data/adb/9router-data/service.log"
mkdir -p "$DATA_DIR"
mkdir -p "$DATA_DIR/tmp"

exec >> "$LOG_FILE" 2>&1
echo "=== Starting 9router Service at $(date) ==="

NODE_BIN=""
if [ -x "$MODDIR/bin/node" ]; then
    NODE_BIN="$MODDIR/bin/node"
elif [ -x "/data/data/com.termux/files/usr/bin/node" ]; then
    NODE_BIN="/data/data/com.termux/files/usr/bin/node"
elif which node >/dev/null 2>&1; then
    NODE_BIN="$(which node)"
fi

if [ -z "$NODE_BIN" ]; then
    echo "[ERROR] Node.js binary not found!"
    exit 1
fi

export PORT=20128
export HOME="$DATA_DIR"
export TMPDIR="$DATA_DIR/tmp"
export PATH="$MODDIR/bin:/system/bin:/system/xbin:$PATH"
export LD_LIBRARY_PATH="$MODDIR/lib:$LD_LIBRARY_PATH"

if [ -f "$MODDIR/control-center.cjs" ]; then
    kill $(cat "$DATA_DIR/control_center.pid" 2>/dev/null) 2>/dev/null || true
    DATA_DIR="$DATA_DIR" $NODE_BIN --max-old-space-size=32 "$MODDIR/control-center.cjs" >> "$LOG_FILE" 2>&1 &
    echo $! > "$DATA_DIR/control_center.pid"
fi

export UV_THREADPOOL_SIZE=2
UI_FLAG="$DATA_DIR/enable_ui"
CONFIG_FILE="$DATA_DIR/router_config.env"

cd "$MODDIR/9router" || exit 1

while true; do
    [ -f "$CONFIG_FILE" ] && . "$CONFIG_FILE"
    export HOST="${BIND_HOST:-0.0.0.0}"

    if [ "$REQUIRE_AUTH" = "true" ]; then
        export REQUIRE_API_KEY="true"
        export ROUTER_API_KEY="${CUSTOM_API_KEY:-dsh-local-key}"
        export NINEROUTER_API_KEY="${CUSTOM_API_KEY:-dsh-local-key}"
        if [ -n "$CUSTOM_ADMIN_PASSWORD" ]; then
            export INITIAL_PASSWORD="$CUSTOM_ADMIN_PASSWORD"
        fi
    else
        export REQUIRE_API_KEY="false"
        export ROUTER_API_KEY="dsh-local-key"
        export NINEROUTER_API_KEY="dsh-local-key"
        unset INITIAL_PASSWORD
    fi

    if [ -f "$UI_FLAG" ]; then
        MODE="Dashboard (Full Web UI Active)"
        TARGET_MAX_RAM=300
        export NINEROUTER_ENABLE_LIVE_WS=1
        export DISABLE_DASHBOARD_SSR=0
    else
        MODE="Ultra-Lite Core (Gateway 24/7, Web UI Dormant)"
        TARGET_MAX_RAM=120
        export NINEROUTER_ENABLE_LIVE_WS=0
        export DISABLE_DASHBOARD_SSR=1
    fi

    export NEXT_MANUAL_SIG_HANDLE=true
    V8_FLAGS="--max-old-space-size=512 --max-semi-space-size=2 --optimize-for-size"

    echo "[INFO] Launching 9router in $MODE mode..."
    START_TIME=$(date +%s)
    $NODE_BIN $V8_FLAGS custom-server.js &
    ROUTER_PID=$!
    echo "$ROUTER_PID" > "$DATA_DIR/9router.pid"

    if [ -f "/proc/$ROUTER_PID/oom_score_adj" ]; then
        echo -700 > "/proc/$ROUTER_PID/oom_score_adj" 2>/dev/null
    fi

    wait $ROUTER_PID
    EXIT_CODE=$?
    rm -f "$DATA_DIR/9router.pid"
    UPTIME=$(( $(date +%s) - START_TIME ))
    echo "[INFO] 9router stopped (Exit code: $EXIT_CODE, Uptime: ${UPTIME}s)"
    sleep 1
done