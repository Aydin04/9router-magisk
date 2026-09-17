# ⚡ 9router AI Gateway (Magisk & OpenWrt Edition)

Ultra-Lite 9router AI Gateway background service for **Android (Magisk/KernelSU/APatch)** and **OpenWrt Router** with **385+ Ported Providers**, low RAM footprint (~80-120MB), dynamic live models fetching, and complete security authentication.

---

## 🚀 Fitur Utama

- **385+ AI Providers Bawaan**: Mendukung hampir semua provider AI global (OpenAI, Anthropic Claude, DeepSeek, Cerebras, Groq, xAI Grok, Together, Qwen, Baidu, dll.) dengan logo resmi SVG/PNG dan endpoints valid.
- **Universal API Key Validator & Live Model Fetching**: Otomatis mendeteksi endpoint `/models` upstream untuk mengekstrak model live secara dinamis langsung dari akun provider.
- **Auto-Merge Compatible Custom Providers**: Fitur 1-klik untuk migrasi node custom yang kompatibel ke node resmi.
- **Keamanan & Autentikasi Penuh (Default Aktif)**:
  - Proteksi API Key (`REQUIRE_API_KEY=true`) untuk akses request chat & model.
  - Proteksi Admin Dashboard dengan session cookie JWT dan validasi password.
  - Perlindungan terhadap akses remote tanpa otentikasi.
- **Multi-Platform Support**:
  1. **Android**: Modul Magisk/KernelSU/APatch dengan binary Node.js ARM64 Bionic native bawaan + Control Center port 20129.
  2. **OpenWrt**: Paket native `procd` init script + konfigurasi UCI (`/etc/config/9router`) untuk x86_64, aarch64, arm, mips.

---

## 📦 Cara Install di OpenWrt

### Kompatibilitas Firmware OpenWrt
- **OpenWrt 25.x (Next-Gen)**: Menggunakan package manager `apk` (`apk update && apk add nodejs`).
- **OpenWrt 21.x / 22.x / 23.x / 24.x**: Menggunakan package manager `opkg` (`opkg update && opkg install node`).
- **Arsitektur CPU**: Mendukung semua arsitektur router (x86_64, aarch64, arm_cortex, mips, mipsel).

### 1-Click Auto Install (Auto-Detect apk/opkg & Install LuCI App)
Jalankan satu perintah ini di terminal SSH OpenWrt Anda:

```sh
wget -qO- https://raw.githubusercontent.com/Aydin04/9router-magisk/main/openwrt-package/install.sh | sh
```
Script instalasi akan otomatis:
1. Mendeteksi apakah router menggunakan `apk` (OpenWrt 25+) atau `opkg`.
2. Menjalankan update & upgrade package manager router.
3. Memasang Node.js (`nodejs`/`node`).
4. Mengunduh & mengekstrak bundle 9router core (385+ provider).
5. Memasang **`luci-app-9router`** (Dashboard terintegrasi langsung di menu LuCI **Services -> 9router AI**).

### Konfigurasi UCI (`/etc/config/9router`)
Konfigurasi dapat diubah sewaktu-waktu lewat file `/etc/config/9router` atau perintah `uci`:

```uci
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
```

Ubah password atau API key via UCI:
```sh
uci set 9router.config.api_key='rahasia-saya'
uci set 9router.config.admin_password='password-baru'
uci commit 9router
/etc/init.d/9router restart
```

### Perintah Service OpenWrt
- **Cek Status**: `/etc/init.d/9router status`
- **Restart**: `/etc/init.d/9router restart`
- **Stop**: `/etc/init.d/9router stop`
- **Lihat Log**: `logread -e 9router`

---

## 📱 Cara Install di Android (Magisk / KernelSU / APatch)

1. Download `9router-magisk-module.zip` dari [Releases](https://github.com/Aydin04/9router-magisk/releases/latest).
2. Flash zip di Magisk / KernelSU / APatch.
3. Reboot perangkat.
4. Akses Web UI:
   - **Original Dashboard**: `http://127.0.0.1:20128`
   - **Control Center**: `http://127.0.0.1:20129`
