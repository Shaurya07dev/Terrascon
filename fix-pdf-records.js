const mongoose = require('mongoose');
const MenuPdf = require('./models/MenuPdf');
const fs = require('fs');
const path = require('path');

async function fixPDFRecords() {
  try {
    await mongoose.connect('mongodb://localhost:27017/terra');

    console.log('=== FIXING PDF RECORDS ===\n');

    // Check uploads directory
    const uploadsDir = path.join(__dirname, 'uploads');
    const files = fs.readdirSync(uploadsDir).filter(file => file.endsWith('.pdf'));

    console.log(`Found ${files.length} PDF files in uploads directory:`);
    files.forEach(file => {
      console.log(`  - ${file}`);
    });

    // Check existing PDF records
    const existingPdfs = await MenuPdf.find({});
    console.log(`\nExisting PDF records in database: ${existingPdfs.length}`);

    // Create records for files that don't have database entries
    for (const file of files) {
      const existingRecord = existingPdfs.find(pdf => pdf.filename === file);

      if (!existingRecord) {
        console.log(`\nCreating database record for: ${file}`);

        // Determine menu type based on filename or create generic ones
        let menuTitle = 'Food Menu'; // Default to Food Menu

        // You can modify this logic based on your file naming convention
        if (file.toLowerCase().includes('wine')) {
          menuTitle = 'Wine Menu';
        }

        const filePath = path.join(uploadsDir, file);
        const stats = fs.statSync(filePath);

        const pdfRecord = await MenuPdf.create({
          title: file.replace(/-\d+\.pdf$/, '.pdf'), // Clean up the filename
          menuTitle: menuTitle,
          filename: file,
          filePath: filePath,
          fileSize: stats.size,
          mimeType: 'application/pdf',
          uploadedBy: null,
          isActive: true,
        });

        console.log(`✅ Created record for ${menuTitle}: ${pdfRecord.title}`);
      } else {
        console.log(`\nRecord already exists for: ${file} (${existingRecord.menuTitle})`);
      }
    }

    // Verify final state
    const finalPdfs = await MenuPdf.find({});
    console.log(`\nFinal PDF count in database: ${finalPdfs.length}`);

    const foodPdfs = finalPdfs.filter(pdf => pdf.menuTitle === 'Food Menu');
    const winePdfs = finalPdfs.filter(pdf => pdf.menuTitle === 'Wine Menu');

    console.log(`Food Menu PDFs: ${foodPdfs.length} (${foodPdfs.filter(p => p.isActive).length} active)`);
    console.log(`Wine Menu PDFs: ${winePdfs.length} (${winePdfs.filter(p => p.isActive).length} active)`);

    await mongoose.connection.close();
    console.log('\n✅ PDF records fixed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

fixPDFRecords();
