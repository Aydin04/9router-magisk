#!/bin/sh
# 9router OpenWrt Universal Installer
# Can be run via: sh install.sh or curl -sL ... | sh

set -e

echo "=================================================="
echo "      ⚡ 9router AI Gateway for OpenWrt ⚡         "
echo "  385+ Ported Providers | Low RAM Ultra-Lite Core "
echo "=================================================="

# 1. Architecture & Dependency Check
echo "[1/5] Checking dependencies..."
if ! which node >/dev/null 2>&1; then
    echo "[!] Node.js not found. Attempting to install via opkg..."
    opkg update || true
    if ! opkg install node; then
        echo "[ERROR] Failed to install node. Please install node manually: opkg install node"
        exit 1
    fi
fi

NODE_VERSION=$(node -v 2>/dev/null || echo "unknown")
echo "  -> Detected Node.js: $NODE_VERSION"

# 2. Setup Directories
echo "[2/5] Creating directories..."
INSTALL_DIR="/usr/share/9router"
DATA_DIR="/etc/9router-data"
mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$DATA_DIR/tmp"

# 3. Extract 9router Core
echo "[3/5] Installing 9router core bundle..."
SCRIPT_DIR=$(cd "$(dirname "$0")" 2>/dev/null && pwd || echo "")

if [ -f "$SCRIPT_DIR/9router.tar.gz" ]; then
    tar -xzf "$SCRIPT_DIR/9router.tar.gz" -C "$INSTALL_DIR/"
elif [ -f "/tmp/9router.tar.gz" ]; then
    tar -xzf "/tmp/9router.tar.gz" -C "$INSTALL_DIR/"
else
    echo "  -> Downloading latest 9router core bundle from GitHub Releases..."
    TAR_URL="https://github.com/Aydin04/9router-magisk/releases/latest/download/9router-openwrt.tar.gz"
    wget -qO /tmp/9router-openwrt.tar.gz "$TAR_URL" || curl -sL -o /tmp/9router-openwrt.tar.gz "$TAR_URL"
    tar -xzf /tmp/9router-openwrt.tar.gz -C "$INSTALL_DIR/"
    rm -f /tmp/9router-openwrt.tar.gz
fi

# Ensure correct tree layout
if [ -d "$INSTALL_DIR/9router" ]; then
    cp -rf "$INSTALL_DIR/9router/"* "$INSTALL_DIR/"
    rm -rf "$INSTALL_DIR/9router"
fi

# 4. Install Config and Service
echo "[4/5] Configuring OpenWrt service (procd)..."
if [ -f "$SCRIPT_DIR/9router.config" ]; then
    [ ! -f /etc/config/9router ] && cp -f "$SCRIPT_DIR/9router.config" /etc/config/9router
else
    if [ ! -f /etc/config/9router ]; then
        cat << 'EOF' > /etc/config/9router
config 9router 'config'
	option enabled '1'
	option port '20128'
	option bind_host '0.0.0.0'
	option require_auth '1'
	option api_key 'dsh-local-key'
	option admin_password 'admin123'
	option enable_ui '1'
	option ram_limit '256'
	option data_dir '/etc/9router-data'
EOF
    fi
fi

if [ -f "$SCRIPT_DIR/9router.init" ]; then
    cp -f "$SCRIPT_DIR/9router.init" /etc/init.d/9router
else
    cat << 'EOF' > /etc/init.d/9router
#!/bin/sh /etc/rc.common
START=95
STOP=10
USE_PROCD=1

PROG_DIR="/usr/share/9router"
DATA_DIR="/etc/9router-data"

start_service() {
    config_load 9router

    local enabled port bind_host require_auth api_key admin_password enable_ui ram_limit cfg_data_dir
    config_get_bool enabled config enabled 1
    config_get port config port "20128"
    config_get bind_host config bind_host "0.0.0.0"
    config_get_bool require_auth config require_auth 1
    config_get api_key config api_key "dsh-local-key"
    config_get admin_password config admin_password "admin123"
    config_get_bool enable_ui config enable_ui 1
    config_get ram_limit config ram_limit "256"
    config_get cfg_data_dir config data_dir "$DATA_DIR"

    [ "$enabled" -eq 1 ] || return 0

    local NODE_BIN="$(which node)"
    [ -z "$NODE_BIN" ] && return 1

    mkdir -p "$cfg_data_dir" "$cfg_data_dir/tmp"

    procd_open_instance "9router"
    procd_set_param command "$NODE_BIN" \
        --max-old-space-size="$ram_limit" \
        --max-semi-space-size=2 \
        --optimize-for-size \
        "$PROG_DIR/custom-server.js"

    procd_set_param respawn 3600 5 0
    procd_set_param stdout 1
    procd_set_param stderr 1

    procd_set_param env PORT="$port"
    procd_set_param env HOST="$bind_host"
    procd_set_param env HOME="$cfg_data_dir"
    procd_set_param env TMPDIR="$cfg_data_dir/tmp"
    procd_set_param env DATA_DIR="$cfg_data_dir"
    procd_set_param env UV_THREADPOOL_SIZE=2
    procd_set_param env NEXT_MANUAL_SIG_HANDLE=true

    if [ "$require_auth" -eq 1 ]; then
        procd_set_param env REQUIRE_API_KEY="true"
        procd_set_param env ROUTER_API_KEY="$api_key"
        procd_set_param env NINEROUTER_API_KEY="$api_key"
        procd_set_param env INITIAL_PASSWORD="$admin_password"
    else
        procd_set_param env REQUIRE_API_KEY="false"
        procd_set_param env ROUTER_API_KEY="dsh-local-key"
        procd_set_param env NINEROUTER_API_KEY="dsh-local-key"
    fi

    if [ "$enable_ui" -eq 1 ]; then
        procd_set_param env NINEROUTER_ENABLE_LIVE_WS=1
        procd_set_param env DISABLE_DASHBOARD_SSR=0
    else
        procd_set_param env NINEROUTER_ENABLE_LIVE_WS=0
        procd_set_param env DISABLE_DASHBOARD_SSR=1
    fi

    procd_set_param user root
    procd_close_instance
}

service_triggers() {
    procd_add_reload_trigger "9router"
}
EOF
fi

chmod +x /etc/init.d/9router
chmod -R 0755 "$INSTALL_DIR"

# 5. Install LuCI App (Dashboard & Settings inside LuCI)
echo "[5/6] Installing LuCI App (luci-app-9router)..."
if [ -d "$SCRIPT_DIR/luci-app-9router" ]; then
    cp -rf "$SCRIPT_DIR/luci-app-9router/root/"* / 2>/dev/null || true
    cp -rf "$SCRIPT_DIR/luci-app-9router/htdocs/"* /www/ 2>/dev/null || true
elif [ -d "$INSTALL_DIR/luci-app-9router" ]; then
    cp -rf "$INSTALL_DIR/luci-app-9router/root/"* / 2>/dev/null || true
    cp -rf "$INSTALL_DIR/luci-app-9router/htdocs/"* /www/ 2>/dev/null || true
fi

# Reload LuCI and RPCD ACLs
rm -f /tmp/luci-indexcache /tmp/luci-modulecache/* 2>/dev/null || true
/etc/init.d/rpcd restart 2>/dev/null || true

# 6. Enable & Start Service
echo "[6/6] Enabling and starting 9router service..."
/etc/init.d/9router enable
/etc/init.d/9router restart

LAN_IP=$(uci get network.lan.ipaddr 2>/dev/null || echo '192.168.1.1')
echo "=================================================="
echo " [✓] 9router successfully installed on OpenWrt!"
echo ""
echo " 🌐 LuCI Menu     : Services -> 9router AI"
echo " 🚀 Web Dashboard : http://$LAN_IP:20128"
echo " 🔑 API Key       : $(uci get 9router.config.api_key 2>/dev/null || echo 'dsh-local-key')"
echo " 🔒 Admin Pass    : $(uci get 9router.config.admin_password 2>/dev/null || echo 'admin123')"
echo ""
echo " To manage via terminal:"
echo "   /etc/init.d/9router status"
echo "   /etc/init.d/9router restart"
echo "   Config: /etc/config/9router"
echo "=================================================="
