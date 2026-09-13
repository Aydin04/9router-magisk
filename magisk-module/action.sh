#!/system/bin/sh
MODDIR=${0%/*}
DATA_DIR="/data/adb/9router-data"
CTRL_PID=$(cat "$DATA_DIR/control_center.pid" 2>/dev/null)
mkdir -p "$DATA_DIR"
echo "=================================================="
echo "          ⚡ 9ROUTER CONTROL CENTER ⚡            "
echo "=================================================="
NODE_BIN=""
if [ -x "$MODDIR/bin/node" ]; then
    NODE_BIN="$MODDIR/bin/node"
elif [ -x "/data/data/com.termux/files/usr/bin/node" ]; then
    NODE_BIN="/data/data/com.termux/files/usr/bin/node"
elif which node >/dev/null 2>&1; then
    NODE_BIN="$(which node)"
fi
if [ -z "$CTRL_PID" ] || ! kill -0 "$CTRL_PID" 2>/dev/null; then
    echo "[+] Launching Control Center Web UI on port 20129..."
    if [ -n "$NODE_BIN" ] && [ -f "$MODDIR/control-center.cjs" ]; then
        DATA_DIR="$DATA_DIR" $NODE_BIN --max-old-space-size=32 "$MODDIR/control-center.cjs" >> "$DATA_DIR/service.log" 2>&1 &
        echo $! > "$DATA_DIR/control_center.pid"
        sleep 1
    fi
fi
PID=$(cat "$DATA_DIR/9router.pid" 2>/dev/null)
if [ -n "$PID" ] && kill -0 "$PID" 2>/dev/null; then
    RSS_KB=$(grep -i VmRSS "/proc/$PID/status" 2>/dev/null | awk '{print $2}')
    MEM_INFO="$(( RSS_KB / 1024 )) MB RSS"
    STATUS="ACTIVE (PID: $PID, $MEM_INFO)"
else
    STATUS="STANDBY / STOPPED"
fi
if [ -f "$DATA_DIR/enable_ui" ]; then
    DASH="ON (Dashboard Active at http://127.0.0.1:20128)"
else
    DASH="OFF (Ultra-Lite Gateway Mode ~75MB)"
fi
echo " Core Service   : $STATUS"
echo " Web Dashboard  : $DASH"
echo " Control Web UI : http://127.0.0.1:20129"
echo "=================================================="
echo "[+] Membuka Control Center di browser kamu..."
if which am >/dev/null 2>&1; then
    am start -a android.intent.action.VIEW -d "http://127.0.0.1:20129" >/dev/null 2>&1 || true
fi
echo "Selesai! Silakan atur tombol toggle di browser."
exit 0