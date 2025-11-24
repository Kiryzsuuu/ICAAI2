# 🔐 Setup OAuth Authentication

Panduan lengkap untuk mengaktifkan login dengan Google dan Microsoft.

## 📋 Daftar Isi

1. [Setup Google OAuth](#setup-google-oauth)
2. [Setup Microsoft OAuth](#setup-microsoft-oauth)
3. [Konfigurasi Environment](#konfigurasi-environment)
4. [Setup Admin Pertama](#setup-admin-pertama)
5. [Testing](#testing)

---

## 🔵 Setup Google OAuth

### 1. Buat Project di Google Cloud Console

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Klik **"Select a project"** → **"New Project"**
3. Beri nama project (contoh: "ICAAI Auth")
4. Klik **"Create"**

### 2. Enable Google+ API

1. Di sidebar, pilih **"APIs & Services"** → **"Library"**
2. Cari **"Google+ API"**
3. Klik dan pilih **"Enable"**

### 3. Buat OAuth Credentials

1. Di sidebar, pilih **"APIs & Services"** → **"Credentials"**
2. Klik **"Create Credentials"** → **"OAuth client ID"**
3. Jika diminta, konfigurasi **OAuth consent screen**:
   - User Type: **External**
   - App name: **ICAAI**
   - User support email: email Anda
   - Developer contact: email Anda
   - Klik **"Save and Continue"**
   - Scopes: skip (klik "Save and Continue")
   - Test users: tambahkan email Anda
   - Klik **"Save and Continue"**

4. Kembali ke **"Credentials"** → **"Create Credentials"** → **"OAuth client ID"**
5. Application type: **Web application**
6. Name: **ICAAI Web Client**
7. Authorized redirect URIs:
   ```
   http://localhost:4000/auth/google/callback
   ```
8. Klik **"Create"**
9. **Copy Client ID dan Client Secret** yang muncul

---

## 🔷 Setup Microsoft OAuth

### 1. Buat App di Azure Portal

1. Buka [Azure Portal](https://portal.azure.com/)
2. Cari **"Azure Active Directory"** atau **"Microsoft Entra ID"**
3. Di sidebar, pilih **"App registrations"**
4. Klik **"New registration"**

### 2. Register Application

1. Name: **ICAAI**
2. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**
3. Redirect URI:
   - Platform: **Web**
   - URI: `http://localhost:4000/auth/microsoft/callback`
4. Klik **"Register"**

### 3. Get Client ID dan Secret

1. Setelah app dibuat, copy **Application (client) ID** dari Overview page
2. Di sidebar, pilih **"Certificates & secrets"**
3. Klik **"New client secret"**
4. Description: **ICAAI Secret**
5. Expires: **24 months** (atau sesuai kebutuhan)
6. Klik **"Add"**
7. **Copy Value** yang muncul (hanya muncul sekali!)

### 4. Configure API Permissions

1. Di sidebar, pilih **"API permissions"**
2. Klik **"Add a permission"**
3. Pilih **"Microsoft Graph"**
4. Pilih **"Delegated permissions"**
5. Centang:
   - `User.Read`
   - `email`
   - `profile`
6. Klik **"Add permissions"**

---

## ⚙️ Konfigurasi Environment

### 1. Copy .env.example ke .env

```bash
copy .env.example .env
```

### 2. Edit file .env

```env
# OpenAI API Key (Required)
OPENAI_API_KEY=sk-your-actual-key-here

# Server Port
PORT=4000

# JWT Secret (Generate random string)
JWT_SECRET=your-random-secret-key-min-32-chars

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id-here
GOOGLE_CLIENT_SECRET=your-google-client-secret-here
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# Microsoft OAuth
MICROSOFT_CLIENT_ID=your-microsoft-client-id-here
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret-here
MICROSOFT_CALLBACK_URL=http://localhost:4000/auth/microsoft/callback
```

### 3. Generate JWT Secret

Gunakan salah satu cara berikut untuk generate random secret:

**PowerShell:**
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | % {[char]$_})
```

**Node.js:**
```javascript
require('crypto').randomBytes(32).toString('hex')
```

---

## 👤 Setup Admin Pertama

### Cara 1: Manual Edit File

1. Jalankan aplikasi sekali untuk generate file `backend/users.json`
2. Login dengan akun Google/Microsoft Anda
3. Stop aplikasi
4. Edit `backend/users.json`:

```json
{
  "users": [
    {
      "id": "...",
      "googleId": "...",
      "email": "your-email@gmail.com",
      "name": "Your Name",
      "provider": "google",
      "createdAt": "..."
    }
  ],
  "admins": [
    "your-email@gmail.com"
  ]
}
```

5. Restart aplikasi

### Cara 2: Via API (Setelah Login)

```javascript
// Di browser console setelah login
fetch('/api/admin/toggle', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    email: 'your-email@gmail.com', 
    makeAdmin: true 
  })
})
```

---

## 🧪 Testing

### 1. Start Server

```bash
npm start
```

### 2. Test Login Flow

1. Buka browser: `http://localhost:4000`
2. Akan redirect ke `/login.html`
3. Klik **"Login dengan Google"** atau **"Login dengan Microsoft"**
4. Authorize aplikasi
5. Setelah berhasil, akan redirect ke homepage

### 3. Test Admin Panel

1. Login sebagai admin
2. Buka: `http://localhost:4000/admin`
3. Anda akan melihat daftar users
4. Toggle admin status untuk user lain

---

## 🔧 Troubleshooting

### Error: "redirect_uri_mismatch"

**Solusi:**
- Pastikan redirect URI di Google/Microsoft console sama persis dengan yang di `.env`
- Cek tidak ada trailing slash (`/`) di akhir URL
- Pastikan menggunakan `http://` bukan `https://` untuk localhost

### Error: "invalid_client"

**Solusi:**
- Pastikan Client ID dan Client Secret benar
- Cek tidak ada spasi di awal/akhir credentials
- Untuk Microsoft: pastikan secret belum expired

### Error: "Cannot read property 'emails' of undefined"

**Solusi:**
- Untuk Google: pastikan Google+ API sudah enabled
- Untuk Microsoft: pastikan API permissions sudah di-grant

### Session tidak persist setelah refresh

**Solusi:**
- Pastikan `JWT_SECRET` sudah diset di `.env`
- Pastikan `express-session` sudah terinstall
- Clear browser cookies dan coba lagi

---

## 🚀 Production Deployment

### Update Redirect URIs

Saat deploy ke production, tambahkan production URLs:

**Google Console:**
```
https://yourdomain.com/auth/google/callback
```

**Azure Portal:**
```
https://yourdomain.com/auth/microsoft/callback
```

### Update .env

```env
GOOGLE_CALLBACK_URL=https://yourdomain.com/auth/google/callback
MICROSOFT_CALLBACK_URL=https://yourdomain.com/auth/microsoft/callback
```

### Security Checklist

- ✅ Generate strong JWT_SECRET (min 32 characters)
- ✅ Enable HTTPS di production
- ✅ Set secure cookie options
- ✅ Whitelist production domain di OAuth console
- ✅ Backup `users.json` secara berkala
- ✅ Monitor admin access logs

---

## 📚 Resources

- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Microsoft Identity Platform](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [Passport.js Documentation](http://www.passportjs.org/)

---

**Butuh bantuan?** Buka issue di repository atau hubungi tim development.
