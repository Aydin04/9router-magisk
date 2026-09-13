SKIPUNZIP=1

ui_print "****************************************"
ui_print "    ⚡ 9router AI Gateway Installer ⚡    "
ui_print "****************************************"

ui_print "[1/4] Extracting core module scripts..."
unzip -o -q "$ZIPFILE" 'module.prop' 'service.sh' 'action.sh' 'control-center.cjs' 'update.json' -d "$MODPATH"

ui_print "[2/4] Installing Node.js ARM64 native runtime..."
unzip -o -q "$ZIPFILE" 'bin/*' 'lib/*' -d "$MODPATH"

ui_print "[3/4] Unpacking 9router AI Gateway (Streaming via RAM)..."
TAR_BIN=""
if [ -f "/data/adb/magisk/busybox" ]; then
    TAR_BIN="/data/adb/magisk/busybox tar"
elif [ -f "/data/adb/ksu/bin/busybox" ]; then
    TAR_BIN="/data/adb/ksu/bin/busybox tar"
elif [ -f "/data/adb/ap/bin/busybox" ]; then
    TAR_BIN="/data/adb/ap/bin/busybox tar"
elif which tar >/dev/null 2>&1; then
    TAR_BIN="tar"
elif which busybox >/dev/null 2>&1; then
    TAR_BIN="busybox tar"
fi

if [ -n "$TAR_BIN" ]; then
    # Stream extract tar.gz directly via pipe in RAM without writing temporary file to flash
    unzip -p "$ZIPFILE" 9router.tar.gz | $TAR_BIN -xz -C "$MODPATH/" 2>/dev/null
fi

if [ ! -d "$MODPATH/9router" ]; then
    ui_print "  -> Fallback unpacking method..."
    unzip -o -q "$ZIPFILE" 9router.tar.gz -d "$MODPATH"
    if [ -n "$TAR_BIN" ]; then
        $TAR_BIN -xzf "$MODPATH/9router.tar.gz" -C "$MODPATH/"
    else
        tar -xzf "$MODPATH/9router.tar.gz" -C "$MODPATH/"
    fi
    rm -f "$MODPATH/9router.tar.gz"
fi
ui_print "  -> 9router core unpacked successfully!"

ui_print "[4/4] Setting up permissions..."
set_perm_recursive "$MODPATH/bin" 0 0 0755 0755
set_perm_recursive "$MODPATH/lib" 0 0 0755 0755
set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/action.sh" 0 0 0755
set_perm "$MODPATH/control-center.cjs" 0 0 0755
set_perm "$MODPATH/bin/node" 0 0 0755
set_perm "$MODPATH/bin/node.bin" 0 0 0755

mkdir -p /data/adb/9router-data
mkdir -p /data/adb/9router-data/tmp
set_perm_recursive /data/adb/9router-data 0 0 0777 0777

ui_print "****************************************"
ui_print " [+] Installation completed in seconds!"
ui_print " [+] Web Dashboard  : port 20128"
ui_print " [+] Control Center : port 20129"
ui_print " [+] Reboot your device to activate."
ui_print "****************************************"
