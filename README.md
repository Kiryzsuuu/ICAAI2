# 🤖 ICAAI Realtime Playground

**Interactive Call Agent AI** - Platform percakapan suara dan teks real-time yang dibangun dengan OpenAI Realtime API, dilengkapi dengan sistem retrieval PDF lokal dan avatar yang responsif.

## ✨ Fitur Utama

- 🔐 **Sistem autentikasi lengkap** dengan OAuth (Google/Microsoft) dan email/password
- 👥 **User management lengkap** dengan admin panel, role management, dan export PDF
- 📧 **Email notifications** untuk registrasi dan reset password
- 📋 **Registrasi detail** dengan nama, email, phone, company, dan role/jabatan
- 🎤 **Percakapan suara real-time** dengan OpenAI GPT-4o
- 🤖 **Avatar animasi** dengan gerakan mulut real-time
- 📄 **Knowledge base PDF** dengan embedding lokal
- 🔄 **Agent yang dapat diinterupsi** - bicara untuk memotong respons AI
- 🎨 **UI profesional** dengan branding SoftwareOne Indonesia
- 🔧 **Audio handling canggih** dengan multiple fallback strategies
- 🌐 **Dukungan multi-bahasa** (Indonesia/English)
- 📊 **Dashboard monitoring** real-time dengan stats dan session management
- 💬 **Chat interface** dengan scrolling otomatis
- ⚙️ **Konfigurasi agent** yang dapat disesuaikan

## 🚀 Quick Start

### Opsi 1: Setup Otomatis (Direkomendasikan)

```powershell
# Double-click start.bat atau jalankan di PowerShell:
.\start.ps1
```

### Opsi 2: Setup Manual

1. **Install dependencies Node.js:**
   ```bash
   npm install
   ```

2. **Setup backend Python:**
   ```bash
   cd backend
   python -m venv .venv
   
   # Windows PowerShell:
   .venv\Scripts\Activate.ps1
   # Linux/Mac:
   source .venv/bin/activate
   
   # Upgrade pip dan install dependencies
   pip install --upgrade pip
   pip install -r requirements.txt
   cd ..
   ```
   
   **Catatan:** Pastikan prompt menampilkan `(.venv)` sebelum menjalankan `pip install`

3. **Konfigurasi environment:**
   - Copy file `.env.example` menjadi `.env`:
   ```bash
   # Windows
   copy .env.example .env
   
   # Linux/Mac
   cp .env.example .env
   ```
   - Edit `.env` dan isi minimal:
   ```
   OPENAI_API_KEY=sk-your-key-here
   PORT=4000
   JWT_SECRET=your-random-secret-key
   ```
   - **Opsional** - Untuk email notifications, tambahkan:
   ```
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=your-gmail-app-password
   ```
   Lihat `EMAIL_SETUP.md` untuk panduan setup Gmail App Password

4. **Jalankan services (2 terminal terpisah):**
   
   **Terminal 1 - Backend:**
   ```bash
   cd backend
   
   # Windows:
   .venv\Scripts\Activate.ps1
   # Linux/Mac:
   source .venv/bin/activate
   
   python main.py
   ```
   
   **Terminal 2 - Frontend:**
   ```bash
   node server.js
   ```

5. **Buka browser:** http://localhost:4000

6. **Login atau Register:**
   - Buat akun baru atau login dengan email/password
   - Atau gunakan OAuth (Google/Microsoft) jika sudah dikonfigurasi
   - User pertama otomatis menjadi admin

## 📖 Cara Penggunaan

### Login & Autentikasi
1. **Akses aplikasi** di http://localhost:4000
2. **Register** dengan mengisi:
   - Nama Lengkap
   - Email
   - Nomor Telepon
   - Perusahaan
   - Role/Jabatan (contoh: Manager, Staff, Developer)
   - Password
3. **Login** dengan email/password atau OAuth (Google/Microsoft)
4. **Lupa password?** Gunakan fitur "Lupa Password?" untuk reset via email
5. **User Management** - Admin dapat mengelola user di `/users`

### Penggunaan Dasar
1. **Klik "Connect"** dan izinkan akses microphone
2. **Mulai berbicara** atau ketik pesan
3. **AI agent akan merespons** dengan suara dan teks
4. **Interupsi kapan saja** dengan berbicara saat agent sedang bicara

### Knowledge Base PDF
1. **Upload PDF** menggunakan drag-and-drop di panel kanan
2. **Pilih PDF** dari daftar untuk mengaktifkannya
3. **Tanyakan tentang konten PDF**
4. **Agent akan mereferensikan** informasi relevan dari dokumen

### Konfigurasi
1. **Klik "Configure"** untuk membuka panel pengaturan
2. **Sesuaikan sensitivitas mulut** avatar dan smoothing
3. **Kustomisasi kepribadian** agent, suara, dan instruksi
4. **Lihat info debug** untuk troubleshooting audio

## 🔧 Troubleshooting

### Masalah Python Dependencies

**Error: `ModuleNotFoundError: No module named 'fastapi'`**

1. **Pastikan virtual environment aktif:**
   ```powershell
   # Windows PowerShell
   cd backend
   .venv\Scripts\Activate.ps1
   
   # Cek apakah (.venv) muncul di prompt
   ```

2. **Install ulang dependencies:**
   ```powershell
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

3. **Jika masih error, hapus dan buat ulang venv:**
   ```powershell
   cd backend
   Remove-Item -Recurse -Force .venv
   python -m venv .venv
   .venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

### Troubleshooting Audio

**Jika agent tidak berbicara:**

1. **Periksa izin browser** - izinkan akses microphone
2. **Lihat debug overlay** - menunjukkan status audio real-time
3. **Coba refresh** halaman dan reconnect
4. **Periksa console** (F12) untuk pesan error
5. **Baca TROUBLESHOOTING.md** untuk solusi detail

**Perbaikan umum:**
- **Chrome/Edge bekerja terbaik** untuk kompatibilitas audio
- **Klik "Connect" dulu** - browser memerlukan user interaction untuk audio
- **Periksa koneksi internet** - audio real-time memerlukan koneksi stabil
- **Speech synthesis fallback** - jika audio OpenAI gagal, browser TTS mengambil alih

## 🏗️ Arsitektur Sistem

### Frontend (public/)
- **index.html** - UI utama dengan avatar dan chat interface
- **login.html** - Login page dengan OAuth
- **register.html** - Registration page
- **admin.html** - Admin panel untuk user management
- **forgot-password.html** - Forgot password page
- **reset-password.html** - Reset password page
- **app.js** - Logic client-side, audio handling, WebSocket communication

### Backend (backend/)
- **main.py** - FastAPI service untuk PDF processing dan embeddings
- **requirements.txt** - Python dependencies
- **users.json** - User database

### Server
- **server.js** - Node.js WebSocket server yang terhubung ke OpenAI Realtime API
- **auth.js** - Authentication module dengan Passport.js
- **mailer.js** - Email service dengan nodemailer

## 📊 API Endpoints

### Authentication (Port 4000)
- `POST /auth/register` - Registrasi user baru dengan nama, email, phone, company, role (kirim welcome email)
- `POST /auth/login` - Login dengan email/password (return JWT token)
- `GET /auth/google` - Login dengan Google OAuth
- `GET /auth/microsoft` - Login dengan Microsoft OAuth
- `POST /auth/forgot-password` - Request reset password (kirim email)
- `POST /auth/reset-password` - Reset password dengan token
- `GET /auth/logout` - Logout user
- `GET /api/user` - Get user info (requires JWT)

### User Management (Port 4000)
- `GET /api/admin/users` - List semua users dengan detail lengkap (admin only)
- `GET /api/admin/users/export` - Export users untuk PDF (admin only)
- `DELETE /api/admin/users/:id` - Delete user (admin only)
- `POST /api/admin/toggle` - Toggle admin status (admin only)
- `GET /users` - User management page (admin only)

### Backend (Port 8004)
- `POST /upload-pdf` - Upload file PDF
- `GET /list-pdfs` - Daftar PDF yang diupload
- `POST /select-pdf` - Pilih PDF sebagai knowledge base aktif
- `GET /pdf-text` - Ambil teks PDF yang diekstrak
- `GET /search-pdf?q=...&k=3` - Cari chunk relevan menggunakan embeddings
- `POST /analyze-emotion` - Analisis emosi untuk TTS
- `POST /save-user-prefs` - Simpan preferensi user
- `GET /user-prefs` - Ambil preferensi user
- `GET /call-logs` - List semua call logs
- `GET /call-logs/:sessionId` - Get detail call log
- `POST /log-conversation` - Log conversation message

### Dashboard & Monitoring (Port 4000)
- `GET /dashboard` - Dashboard utama dengan stats dan monitoring (admin only)
- `GET /api/monitoring` - Get monitoring stats real-time (admin only)
- `GET /api/config` - Ambil konfigurasi agent saat ini
- `POST /api/config` - Update konfigurasi agent (admin only)
- `POST /debug/send-greeting` - Debug helper untuk test audio

## 🛠️ Dependencies

### Node.js Dependencies
```json
{
  "express": "^4.18.2",
  "socket.io": "^4.7.2", 
  "ws": "^8.14.2",
  "cors": "^2.8.5",
  "dotenv": "^16.6.1",
  "bcryptjs": "^3.0.3",
  "jsonwebtoken": "^9.0.2",
  "passport": "^0.7.0",
  "passport-google-oauth20": "^2.0.0",
  "passport-azure-ad": "^4.3.5",
  "express-session": "^1.18.2",
  "nodemailer": "^7.0.10",
  "concurrently": "^8.2.2"
}
```

### Python Dependencies
```
fastapi>=0.100.0
uvicorn>=0.20.0
python-multipart>=0.0.6
PyPDF2>=3.0.0
python-dotenv>=1.0.0
requests>=2.31.0
openai>=1.10.0
numpy>=1.24.0
faiss-cpu>=1.7.0
pinecone-client>=2.2.0
pyttsx3>=2.90
```

## 🔧 Konfigurasi Lanjutan

### Environment Variables
```bash
# Required
OPENAI_API_KEY=sk-your-key-here
PORT=4000
JWT_SECRET=your-random-secret-key

# Optional - Email Notifications
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password

# Optional - Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:4000/auth/google/callback

# Optional - Microsoft OAuth
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret
MICROSOFT_CALLBACK_URL=http://localhost:4000/auth/microsoft/callback

# Optional - Pinecone integration
PINECONE_API_KEY=your-pinecone-key
PINECONE_ENV=us-west1-gcp
PINECONE_INDEX=icai-embeddings
```

### Agent Configuration
- **Instructions**: Instruksi sistem untuk AI agent
- **Voice**: Model suara OpenAI (alloy, echo, fable, onyx, nova, shimmer)
- **Temperature**: Kreativitas respons (0.0-1.0)
- **Verbosity**: Tingkat detail respons (concise, balanced, detailed)
- **Persona**: Preset kepribadian (professional, friendly, empathetic, sales)

## 📁 Struktur File

```
ICAAI/
├── public/                 # Frontend files
│   ├── index.html         # Main UI
│   ├── app.js            # Client logic
│   ├── login.html        # Login page
│   ├── register.html     # Registration page (with phone, company, role)
│   ├── users.html        # User management page (admin only)
│   ├── dashboard.html    # Dashboard with monitoring (admin only)
│   ├── admin.html        # Admin panel
│   ├── forgot-password.html  # Forgot password page
│   └── reset-password.html   # Reset password page
├── backend/              # Python FastAPI service
│   ├── main.py          # PDF processing & embeddings
│   ├── requirements.txt # Python dependencies
│   ├── uploaded_pdfs/   # Uploaded PDF storage
│   ├── call_logs/       # Conversation logs
│   └── users.json       # User database
├── auth.js              # Authentication module (Passport.js)
├── mailer.js            # Email service (nodemailer)
├── server.js            # Node.js WebSocket server
├── package.json         # Node.js dependencies
├── .env                 # Environment variables
├── .env.example         # Environment template
├── start.bat           # Windows startup script
├── start.ps1           # PowerShell startup script
├── EMAIL_SETUP.md      # Email configuration guide
└── TROUBLESHOOTING.md  # Detailed troubleshooting
```

## 🚨 Status Analisis Sistem

### ✅ Komponen yang Berfungsi
- ✅ **Authentication system** dengan OAuth dan email/password
- ✅ **User management lengkap** dengan search, filter, make/remove admin, delete user
- ✅ **User registration** dengan field: nama, email, phone, company, role
- ✅ **Email notifications** untuk welcome dan password reset (custom template)
- ✅ **Export PDF** daftar user dengan jsPDF
- ✅ **JWT token management** dan session handling
- ✅ **Dashboard monitoring** real-time dengan Socket.IO
- ✅ **Session management** dengan view detail, dispatch, dan close
- ✅ Audio playback dan speech synthesis
- ✅ Real-time voice conversation
- ✅ Avatar mouth animation
- ✅ PDF upload dan text extraction
- ✅ Configuration panel
- ✅ Debug overlay
- ✅ Chat interface dengan scrolling
- ✅ User preferences persistence

### ⚠️ Komponen yang Perlu Perhatian
- ⚠️ **PDF Search**: Endpoint `/search-pdf` mungkin perlu restart backend
- ⚠️ **STT Display**: Transcript user mungkin tidak selalu muncul di chat
- ⚠️ **Embeddings**: Memerlukan OpenAI API key untuk search semantik

### 🔧 Perbaikan yang Dilakukan
1. **Authentication**: Complete OAuth + email/password system
2. **User Management**: Admin panel dengan role management, search, export PDF
3. **Registration**: Extended form dengan phone, company, dan role fields
4. **Email Service**: Custom welcome email dan password reset templates
5. **Dashboard**: Real-time monitoring dengan Socket.IO (update setiap 2 detik)
6. **Session Management**: View detail, dispatch to human, close session
7. **Security**: JWT tokens, bcrypt password hashing
8. **Audio Player**: Implementasi multiple decoding strategies
9. **Error Handling**: Better fallback ke speech synthesis
10. **User Interaction**: Proper audio context management
11. **Scrolling**: Smooth scrolling di conversation panel
12. **Configuration**: Persistent user preferences

## 💡 Tips Penggunaan Optimal

- **Setup email notifications** untuk pengalaman lengkap (lihat EMAIL_SETUP.md)
- **User pertama otomatis admin** - buat akun pertama untuk akses penuh
- **OAuth opsional** - aplikasi berfungsi penuh dengan email/password
- **Gunakan microphone berkualitas** untuk voice recognition yang lebih baik
- **Koneksi internet stabil** diperlukan untuk audio real-time
- **Izinkan semua permission browser** saat diminta
- **Bicara dengan jelas** - AI dapat memahami Indonesia dan English
- **Coba Configuration panel** untuk menyesuaikan kepribadian agent
- **Upload PDF relevan** untuk memberikan domain knowledge pada agent

## 🔮 Pengembangan Selanjutnya

- ✅ **User Authentication** - SELESAI
- ✅ **Email Notifications** - SELESAI
- ✅ **Admin Panel** - SELESAI
- ✅ **User Management** - SELESAI
- ✅ **Dashboard Monitoring** - SELESAI
- ✅ **Session Management** - SELESAI
- **Admin Takeover** - Fitur untuk admin mengambil alih percakapan
- **Integrasi Vector Database** (Pinecone, Weaviate) untuk PDF processing skala besar
- **Advanced TTS** dengan dukungan SSML untuk suara yang lebih ekspresif
- **Voice Cloning** untuk suara agent yang dipersonalisasi
- **Real-time Translation** untuk percakapan multibahasa
- **User Analytics Dashboard** untuk tracking usage detail

## 🤝 Contributing

Kontribusi sangat diterima! Silakan baca panduan troubleshooting terlebih dahulu jika mengalami masalah.

## 📄 License

MIT License - lihat file LICENSE untuk detail

---

**Butuh bantuan?** Periksa `TROUBLESHOOTING.md` untuk solusi detail masalah umum.

## 🆘 Support

Jika mengalami masalah:
1. Periksa browser console (F12) untuk error messages
2. Lihat debug overlay untuk status audio real-time
3. Baca TROUBLESHOOTING.md untuk solusi spesifik
4. Restart aplikasi menggunakan `start.bat` atau `start.ps1`
5. Pastikan semua dependencies terinstall dengan benar
