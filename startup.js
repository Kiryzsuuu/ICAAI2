const { exec } = require('child_process');
const path = require('path');

const frontendDir = path.resolve(__dirname);

console.log('Starting frontend installation...');

const installProcess = exec('npm install', { cwd: frontendDir });

installProcess.stdout.on('data', (data) => {
  console.log(`stdout: ${data}`);
});

installProcess.stderr.on('data', (data) => {
  console.error(`stderr: ${data}`);
});

installProcess.on('close', (code) => {
  if (code !== 0) {
    console.error(`npm install process exited with code ${code}`);
    process.exit(1);
  }
  
  console.log('npm install completed. Starting server...');
  require('./server.js');
});
