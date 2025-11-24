# 🚨 Panduan Mengatasi Error Dashboard "No token provided"

## 📋 Masalah
Ketika membuka dashboard di `http://localhost:4000/dashboard.html`, muncul error:
```json
{"error":"No token provided"}
```

## ✅ Solusi Lengkap

### **1. Login Terlebih Dahulu**

Dashboard memerlukan autentikasi. Anda harus login sebagai **admin** untuk mengakses dashboard.

**Buka halaman login:**
```
http://localhost:4000/login.html
```

### **2. Gunakan Akun Admin**

Sekarang tersedia beberapa akun admin:

**Akun Baru (Direkomendasikan):**
- **Email:** `admin@icaai.com`  
- **Password:** `admin123`

**Akun Existing:**
- **Email:** `maskiryz23@gmail.com`
- **Password:** (password yang sudah Anda set)
- **Email:** `kiryzsu@gmail.com`  
- **Password:** (password yang sudah Anda set)

### **3. Akses Dashboard**

Setelah login berhasil:
1. ✅ Token JWT akan tersimpan otomatis di browser
2. ✅ Anda akan diarahkan ke dashboard
3. ✅ Dashboard akan menampilkan monitoring real-time

**URL Dashboard:**
```
http://localhost:4000/dashboard.html
```

### **4. Fitur Dashboard Admin**

Setelah login sebagai admin, Anda bisa mengakses:

- 📊 **Real-time Monitoring** - Stats live session
- 👥 **User Management** - Kelola user dan admin
- 💬 **Active Sessions** - Lihat percakapan yang sedang berjalan  
- ⚙️ **Configuration** - Setting agent AI
- 📈 **Analytics** - Statistik penggunaan
- 🔧 **System Health** - Status sistem

## 🔧 Troubleshooting

### Jika Masih Error:

**1. Clear Browser Cache:**
```
Ctrl + Shift + Delete (Chrome/Edge)
Cmd + Shift + Delete (Safari)
```

**2. Check Local Storage:**
- Buka Developer Tools (F12)
- Tab Application → Local Storage
- Pastikan ada `icaai_token`

**3. Restart Server:**
```powershell
# Stop server dengan Ctrl+C lalu:
.\start.ps1
```

**4. Reset Admin Password:**
```powershell
node create-admin.js
```

## 🚀 Quick Start

**Langkah Super Cepat:**

1. **Login:** http://localhost:4000/login.html
   - Email: `admin@icaai.com`
   - Password: `admin123`

2. **Dashboard:** Otomatis redirect ke dashboard

3. **Done!** ✨

## 📧 Lupa Password?

Gunakan fitur "Lupa Password" di halaman login untuk reset password via email.

## 🔒 Keamanan

- ⚠️ **Ganti password default** `admin123` setelah login pertama
- 🔐 Token JWT otomatis expired setelah 24 jam
- 👥 Hanya user dengan role admin yang bisa akses dashboard

---

**Need Help?** Check troubleshooting guide atau restart aplikasi dengan `start.ps1`