const nodemailer = require('nodemailer');

// Create transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Send welcome email
async function sendWelcomeEmail(to, name) {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: '🎉 Selamat Datang di ICAAI - Interactive Call Agent AI',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="background: #ffffff; padding: 40px 30px; text-align: center; border-bottom: 4px solid #000000;">
          <div style="margin-bottom: 20px;">
            <strong style="font-size: 20px; color: #000000; letter-spacing: 2px;">SOFTWAREONE</strong>
          </div>
          <h1 style="color: #000000; margin: 15px 0 8px 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">ICAAI</h1>
          <p style="color: #666666; margin: 0; font-size: 15px; letter-spacing: 0.5px;">Interactive Call Agent AI</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 40px 30px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 64px; margin-bottom: 20px;"></div>
            <h2 style="color: #000000; margin: 0 0 10px 0; font-size: 28px; font-weight: 700;">Selamat Datang, ${name}!</h2>
            <p style="color: #666666; margin: 0; font-size: 16px;">Akun Anda telah berhasil dibuat</p>
          </div>
          
          <div style="background: #f8f8f8; padding: 25px; border-radius: 12px; border-left: 4px solid #000000; margin: 30px 0;">
            <p style="color: #333333; line-height: 1.8; margin: 0; font-size: 15px; text-align: justify;">
              Terima kasih telah bergabung dengan <strong>ICAAI</strong>, platform percakapan AI real-time dari <strong>Software One Indonesia</strong> yang dirancang untuk menghadirkan komunikasi yang lebih cepat, efisien, dan intuitif. Dengan ICAAI, Anda dapat berinteraksi lewat percakapan suara yang responsif, mengunggah serta menganalisis dokumen PDF secara instan, hingga menikmati pengalaman percakapan yang lebih hidup melalui avatar animasi. Seluruh fitur dapat disesuaikan dengan kebutuhan Anda, memastikan setiap pengguna mendapatkan pengalaman yang personal dan menyenangkan. Selamat menikmati cara baru berkomunikasi dengan teknologi AI!
            </p>
          </div>
          
          <div style="background: #ffffff; padding: 20px; border-radius: 8px; border: 2px solid #e5e5e5; margin: 25px 0;">
            <p style="margin: 0; color: #666666; font-size: 14px;">📧 <strong style="color: #000000;">Email Anda:</strong></p>
            <p style="margin: 8px 0 0 0; color: #000000; font-size: 16px; font-weight: 600;">${to}</p>
          </div>
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="http://localhost:${process.env.PORT || 4000}/login.html" 
               style="display: inline-block; background: #000000; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
               Mulai Sekarang
            </a>
          </div>
          
          <div style="background: #fffbeb; padding: 18px; border-radius: 8px; border-left: 4px solid #fbbf24; margin: 30px 0;">
            <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.6;">
               <strong>Tips:</strong> Pastikan microphone Anda berfungsi dengan baik untuk pengalaman percakapan suara yang optimal.
            </p>
          </div>
          
          <p style="color: #999999; font-size: 13px; margin: 30px 0 0 0; line-height: 1.6; text-align: center;">
            Jika Anda tidak mendaftar akun ini, abaikan email ini.<br>
            Butuh bantuan? Hubungi tim support kami.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background: #000000; padding: 25px 30px; text-align: center;">
          <p style="color: #999999; font-size: 12px; margin: 0 0 8px 0;">
            © 2024 ICAAI - Powered by SoftwareOne
          </p>
          <p style="color: #666666; font-size: 11px; margin: 0;">
            Interactive Call Agent AI Platform
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Welcome email sent to:', to);
  } catch (error) {
    console.error('Error sending welcome email:', error);
  }
}

// Send password reset email
async function sendPasswordResetEmail(to, name, resetToken) {
  const resetUrl = `http://localhost:${process.env.PORT || 4000}/reset-password.html?token=${resetToken}`;
  
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: to,
    subject: '🔐 Reset Password - ICAAI',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
        <!-- Header -->
        <div style="background: #ffffff; padding: 40px 30px; text-align: center; border-bottom: 4px solid #000000;">
          <div style="margin-bottom: 20px;">
            <strong style="font-size: 20px; color: #000000; letter-spacing: 2px;">SOFTWAREONE</strong>
          </div>
          <h1 style="color: #000000; margin: 15px 0 8px 0; font-size: 32px; font-weight: 700; letter-spacing: -0.5px;">ICAAI</h1>
          <p style="color: #666666; margin: 0; font-size: 15px; letter-spacing: 0.5px;">Interactive Call Agent AI</p>
        </div>
        
        <!-- Body -->
        <div style="padding: 40px 30px; background: #ffffff;">
          <div style="text-align: center; margin-bottom: 30px;">
            <div style="font-size: 64px; margin-bottom: 20px;">🔐</div>
            <h2 style="color: #000000; margin: 0 0 10px 0; font-size: 28px; font-weight: 700;">Reset Password</h2>
            <p style="color: #666666; margin: 0; font-size: 16px;">Permintaan reset password untuk akun Anda</p>
          </div>
          
          <div style="background: #f8f8f8; padding: 25px; border-radius: 12px; border-left: 4px solid #000000; margin: 30px 0;">
            <p style="color: #333333; line-height: 1.8; margin: 0; font-size: 15px; text-align: justify;">
              Halo <strong>${name}</strong>, kami telah menerima permintaan untuk mereset password akun ICAAI Anda. Untuk membuat password baru, cukup klik tombol yang tersedia, atau salin dan tempel link berikut ke peramban Anda.
            </p>
          </div>
          
          <div style="text-align: center; margin: 35px 0;">
            <a href="${resetUrl}" 
               style="display: inline-block; background: #000000; color: #ffffff; padding: 16px 40px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; letter-spacing: 0.5px; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
              🔑 Reset Password Sekarang
            </a>
          </div>
          
          <div style="background: #ffffff; padding: 20px; border-radius: 8px; border: 2px solid #e5e5e5; margin: 25px 0;">
            <p style="margin: 0 0 10px 0; color: #666666; font-size: 13px;">Atau copy link berikut ke browser Anda:</p>
            <a href="${resetUrl}" style="color: #000000; word-break: break-all; font-size: 13px; text-decoration: underline;">${resetUrl}</a>
          </div>
          
          <div style="background: #f8f8f8; padding: 25px; border-radius: 12px; border-left: 4px solid #000000; margin: 30px 0;">
            <p style="color: #333333; line-height: 1.8; margin: 0; font-size: 15px; text-align: justify;">
              Perlu diperhatikan bahwa tautan ini hanya berlaku selama <strong>satu jam</strong>, jadi pastikan Anda segera melakukan proses reset demi menjaga keamanan akun. Demi perlindungan yang lebih baik, gunakanlah password yang kuat dengan kombinasi huruf besar, huruf kecil, angka, serta simbol.
            </p>
          </div>
          
          <p style="color: #999999; font-size: 13px; margin: 30px 0 0 0; line-height: 1.6; text-align: center;">
            Jika Anda tidak meminta reset password, abaikan email ini.<br>
            Password Anda tidak akan berubah dan akun Anda tetap aman.
          </p>
        </div>
        
        <!-- Footer -->
        <div style="background: #000000; padding: 25px 30px; text-align: center;">
          <p style="color: #999999; font-size: 12px; margin: 0 0 8px 0;">
            © 2025 ICAAI - Powered by SoftwareOne
          </p>
          <p style="color: #666666; font-size: 11px; margin: 0;">
            Interactive Call Agent AI Platform
          </p>
        </div>
      </div>
    `
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log('Password reset email sent to:', to);
  } catch (error) {
    console.error('Error sending password reset email:', error);
  }
}

module.exports = { sendWelcomeEmail, sendPasswordResetEmail };
