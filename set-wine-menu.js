const mongoose = require('mongoose');
const MenuPdf = require('./models/MenuPdf');

async function setWineMenu() {
  try {
    await mongoose.connect('mongodb://localhost:27017/terra');

    console.log('=== SETTING WINE MENU PDF ===\n');

    // Get all PDFs
    const allPdfs = await MenuPdf.find({});
    console.log(`Found ${allPdfs.length} PDFs in database`);

    if (allPdfs.length >= 2) {
      // Set the second PDF as Wine Menu
      const winePdf = allPdfs[1];
      winePdf.menuTitle = 'Wine Menu';
      await winePdf.save();

      console.log(`✅ Set "${winePdf.title}" as Wine Menu PDF`);
    } else if (allPdfs.length === 1) {
      // If only one PDF, duplicate it for Wine Menu
      const foodPdf = allPdfs[0];
      const winePdf = await MenuPdf.create({
        title: `Wine Menu - ${foodPdf.title}`,
        menuTitle: 'Wine Menu',
        filename: foodPdf.filename,
        filePath: foodPdf.filePath,
        fileSize: foodPdf.fileSize,
        mimeType: foodPdf.mimeType,
        uploadedBy: foodPdf.uploadedBy,
        isActive: true,
      });

      console.log(`✅ Created Wine Menu PDF: ${winePdf.title}`);
    } else {
      console.log('❌ No PDFs found to set as Wine Menu');
    }

    // Verify final state
    const finalPdfs = await MenuPdf.find({});
    const foodPdfs = finalPdfs.filter(pdf => pdf.menuTitle === 'Food Menu');
    const winePdfs = finalPdfs.filter(pdf => pdf.menuTitle === 'Wine Menu');

    console.log(`\nFinal state:`);
    console.log(`Food Menu PDFs: ${foodPdfs.length} (${foodPdfs.filter(p => p.isActive).length} active)`);
    console.log(`Wine Menu PDFs: ${winePdfs.length} (${winePdfs.filter(p => p.isActive).length} active)`);

    await mongoose.connection.close();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

setWineMenu();
