# --- Konfigurasi ---
$RESOURCE_GROUP = "Intern_Batch1"
$FRONTEND_APP_NAME = "icaai-frontend1-fyhugdb9hwbyhebd"
$BACKEND_APP_NAME = "icaai-backend1-c3evfuava8budyhx"

$FRONTEND_ZIP = "frontend-deploy.zip"
$BACKEND_ZIP = "backend-deploy.zip"

Write-Host "--- Memulai Proses Deployment ke Azure ---"

# --- 1. Deployment Frontend (Node.js) ---
Write-Host ""
Write-Host "=> Mengemas Frontend..."
# Mendapatkan semua item di direktori saat ini, kecuali folder yang tidak diinginkan
$frontendFiles = Get-ChildItem -Path . -Recurse -Exclude "backend", ".git", "node_modules"
# Membuat arsip ZIP
Compress-Archive -Path $frontendFiles.FullName -DestinationPath $FRONTEND_ZIP -Force

Write-Host "=> Mendeploy Frontend ke Azure App Service: $FRONTEND_APP_NAME"
# Menggunakan Azure CLI untuk deploy
az webapp deploy --resource-group $RESOURCE_GROUP --name $FRONTEND_APP_NAME --src-path $FRONTEND_ZIP --type zip

Write-Host "=> Mengatur Perintah Startup untuk Frontend..."
# Mengatur perintah startup
az webapp config set --resource-group $RESOURCE_GROUP --name $FRONTEND_APP_NAME --startup-file "node startup.js"

Write-Host "Frontend berhasil di-deploy."


# --- 2. Deployment Backend (Python) ---
Write-Host ""
Write-Host "=> Mengemas Backend..."
# Membuat arsip ZIP untuk folder backend
Compress-Archive -Path "backend\*" -DestinationPath $BACKEND_ZIP -Force

Write-Host "=> Mendeploy Backend ke Azure App Service: $BACKEND_APP_NAME"
# Menggunakan Azure CLI untuk deploy
az webapp deploy --resource-group $RESOURCE_GROUP --name $BACKEND_APP_NAME --src-path $BACKEND_ZIP --type zip

Write-Host "=> Mengatur versi Python untuk Backend..."
# Mengatur versi Python
# Pastikan versi Python sesuai dengan yang Anda gunakan (misal: 3.11)
az webapp config set --resource-group $RESOURCE_GROUP --name $BACKEND_APP_NAME --linux-fx-version 'PYTHON|3.11'

Write-Host "Backend berhasil di-deploy."


# --- 3. Membersihkan File ZIP ---
Write-Host ""
Write-Host "=> Membersihkan file sementara..."
Remove-Item $FRONTEND_ZIP
Remove-Item $BACKEND_ZIP

Write-Host ""
Write-Host "--- Proses Deployment Selesai ---"
