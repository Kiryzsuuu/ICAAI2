// ICAAI System Health Check Script
const http = require('http');
const https = require('https');

console.log('🔍 ICAAI System Health Check');
console.log('================================');

async function checkEndpoint(url, name) {
    return new Promise((resolve) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.get(url, (res) => {
            const status = res.statusCode === 200 ? '✅' : '❌';
            console.log(`${status} ${name}: ${res.statusCode}`);
            resolve(res.statusCode === 200);
        });
        
        req.on('error', (err) => {
            console.log(`❌ ${name}: ERROR - ${err.message}`);
            resolve(false);
        });
        
        req.setTimeout(5000, () => {
            console.log(`❌ ${name}: TIMEOUT`);
            req.destroy();
            resolve(false);
        });
    });
}

async function runHealthCheck() {
    console.log('\n📊 Checking Services...\n');
    
    // Check Frontend
    const frontendOk = await checkEndpoint('http://localhost:4000', 'Frontend Server');
    
    // Check Backend
    const backendOk = await checkEndpoint('http://localhost:8003/list-pdfs', 'Backend API');
    
    // Check PDF functionality
    const pdfOk = await checkEndpoint('http://localhost:8003/pdf-text', 'PDF Text Endpoint');
    
    // Check search (might fail, that's expected)
    const searchOk = await checkEndpoint('http://localhost:8003/search-pdf?q=test&k=1', 'PDF Search Endpoint');
    
    console.log('\n📋 Health Check Summary');
    console.log('========================');
    console.log(`Frontend Server: ${frontendOk ? '✅ OK' : '❌ FAIL'}`);
    console.log(`Backend API: ${backendOk ? '✅ OK' : '❌ FAIL'}`);
    console.log(`PDF Processing: ${pdfOk ? '✅ OK' : '❌ FAIL'}`);
    console.log(`PDF Search: ${searchOk ? '✅ OK' : '⚠️  NEEDS ATTENTION'}`);
    
    console.log('\n🎯 Recommendations:');
    if (!frontendOk) {
        console.log('- Start frontend: node server.js');
    }
    if (!backendOk) {
        console.log('- Start backend: cd backend && python main.py');
    }
    if (!searchOk) {
        console.log('- Restart backend to fix PDF search endpoint');
        console.log('- Check OpenAI API key for embeddings');
    }
    
    const overallStatus = frontendOk && backendOk && pdfOk;
    console.log(`\n🏁 Overall Status: ${overallStatus ? '🟢 HEALTHY' : '🔴 NEEDS ATTENTION'}`);
    
    if (overallStatus) {
        console.log('\n🚀 System ready! Open http://localhost:4000');
    }
}

runHealthCheck().catch(console.error);