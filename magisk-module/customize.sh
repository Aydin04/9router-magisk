SKIPUNZIP=0

ui_print "****************************************"
ui_print "    ⚡ 9router AI Gateway Installer ⚡    "
ui_print "****************************************"
ui_print "[+] Extracting 9router module files..."

# Set standard permissions
set_perm_recursive "$MODPATH" 0 0 0755 0644

if [ -d "$MODPATH/bin" ]; then
    set_perm_recursive "$MODPATH/bin" 0 0 0755 0755
fi

if [ -d "$MODPATH/lib" ]; then
    set_perm_recursive "$MODPATH/lib" 0 0 0755 0755
fi

set_perm "$MODPATH/service.sh" 0 0 0755
set_perm "$MODPATH/action.sh" 0 0 0755
set_perm "$MODPATH/control-center.cjs" 0 0 0755

if [ -f "$MODPATH/bin/node" ]; then
    set_perm "$MODPATH/bin/node" 0 0 0755
fi
if [ -f "$MODPATH/bin/node.bin" ]; then
    set_perm "$MODPATH/bin/node.bin" 0 0 0755
fi

mkdir -p /data/adb/9router-data
mkdir -p /data/adb/9router-data/tmp
set_perm_recursive /data/adb/9router-data 0 0 0777 0777

ui_print "[+] Native Android ARM64 Node.js runtime installed!"
ui_print "[+] Installation complete!"
ui_print "[+] 9router will boot automatically on system restart."
