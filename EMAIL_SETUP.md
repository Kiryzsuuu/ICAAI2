# 📧 Setup Email untuk ICAAI

Panduan setup email untuk fitur:
- Welcome email saat registrasi
- Reset password via email

## 🔧 Setup Gmail App Password

### 1. Enable 2-Factor Authentication

1. Buka [Google Account Security](https://myaccount.google.com/security)
2. Scroll ke "2-Step Verification"
3. Klik dan ikuti instruksi untuk enable 2FA

### 2. Generate App Password

1. Setelah 2FA aktif, kembali ke [Security Settings](https://myaccount.google.com/security)
2. Scroll ke "2-Step Verification" → klik
3. Scroll ke bawah, cari "App passwords"
4. Klik "App passwords"
5. Pilih:
   - **App:** Mail
   - **Device:** Other (Custom name) → ketik "ICAAI"
6. Klik "Generate"
7. **Copy 16-digit password** yang muncul

### 3. Update .env File

Edit file `.env`:

```env
# Email Configuration
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
```

**Contoh:**
```env
EMAIL_USER=maskiryz23@gmail.com
EMAIL_PASSWORD=abcd efgh ijkl mnop
```

⚠️ **Penting:** Gunakan App Password, BUKAN password Gmail biasa!

## 🧪 Testing

### Test Welcome Email

1. Buka `http://localhost:4001/register.html`
2. Daftar dengan email baru
3. Cek inbox email → seharusnya ada welcome email

### Test Reset Password

1. Buka `http://localhost:4001/login.html`
2. Klik "Lupa Password?"
3. Masukkan email
4. Cek inbox → klik link reset
5. Masukkan password baru

## 🔒 Security Tips

1. **Jangan commit** `.env` ke Git (sudah ada di `.gitignore`)
2. **Gunakan App Password**, bukan password asli
3. **Revoke App Password** jika tidak digunakan lagi
4. **Untuk production**, gunakan email service seperti:
   - SendGrid
   - AWS SES
   - Mailgun
   - Postmark

## 🚫 Troubleshooting

### Error: "Invalid login"

**Solusi:**
- Pastikan 2FA sudah aktif
- Gunakan App Password, bukan password Gmail
- Cek tidak ada spasi di awal/akhir password

### Email tidak terkirim

**Solusi:**
- Cek `EMAIL_USER` dan `EMAIL_PASSWORD` di `.env`
- Restart server setelah update `.env`
- Cek console untuk error message
- Pastikan internet connection stabil

### Email masuk ke Spam

**Solusi:**
- Normal untuk email pertama kali
- Mark as "Not Spam"
- Untuk production, gunakan dedicated email service

## 📝 Email Templates

Email templates ada di `mailer.js`:
- `sendWelcomeEmail()` - Welcome email
- `sendPasswordResetEmail()` - Reset password email

Anda bisa customize HTML template sesuai kebutuhan!

## 🌐 Production Setup

Untuk production, ganti Gmail dengan email service profesional:

### SendGrid Example:

```javascript
const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: process.env.SENDGRID_API_KEY
  }
});
```

### AWS SES Example:

```javascript
const transporter = nodemailer.createTransport({
  host: 'email-smtp.us-east-1.amazonaws.com',
  port: 587,
  auth: {
    user: process.env.AWS_SES_USER,
    pass: process.env.AWS_SES_PASSWORD
  }
});
```

---

**Butuh bantuan?** Buka issue atau hubungi tim development.
