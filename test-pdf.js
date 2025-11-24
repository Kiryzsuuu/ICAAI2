// Test script untuk memverifikasi PDF reading
const fs = require('fs');
const path = require('path');

async function testPDFReading() {
    try {
        console.log('Testing PDF backend...');
        
        // Test list PDFs
        const listResponse = await fetch('http://127.0.0.1:8003/list-pdfs');
        const listData = await listResponse.json();
        console.log('Available PDFs:', listData);
        
        if (listData.pdfs && listData.pdfs.length > 0) {
            const firstPdf = listData.pdfs[0];
            console.log('Testing with PDF:', firstPdf.filename);
            
            // Test select PDF
            const selectResponse = await fetch('http://127.0.0.1:8003/select-pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pdf_id: firstPdf.id })
            });
            const selectData = await selectResponse.json();
            console.log('Select PDF result:', selectData);
            
            // Test get PDF text
            const textResponse = await fetch('http://127.0.0.1:8003/pdf-text');
            const textData = await textResponse.json();
            console.log('PDF text length:', textData.text ? textData.text.length : 0);
            console.log('PDF text preview:', textData.text ? textData.text.substring(0, 200) + '...' : 'No text');
            
            // Test search
            const searchResponse = await fetch('http://127.0.0.1:8003/search-pdf?q=menu&k=3');
            const searchData = await searchResponse.json();
            console.log('Search results:', searchData);
        } else {
            console.log('No PDFs found. Upload a PDF first.');
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

testPDFReading();