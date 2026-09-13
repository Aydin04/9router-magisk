#!/system/bin/sh
BIN_DIR="${0%/*}"
MOD_DIR="${BIN_DIR%/*}"
export LD_LIBRARY_PATH="$MOD_DIR/lib:$LD_LIBRARY_PATH"
export SSL_CERT_FILE="${SSL_CERT_FILE:-$MOD_DIR/lib/cacert.pem}"
export OPENSSL_CONF="${OPENSSL_CONF:-$MOD_DIR/lib/openssl.cnf}"
if [ -x "$MOD_DIR/bin/node.bin" ]; then
    exec "$MOD_DIR/bin/node.bin" "$@"
else
    exec "$MOD_DIR/bin/node" "$@"
fi
