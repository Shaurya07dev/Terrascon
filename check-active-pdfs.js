const mongoose = require('mongoose');
const MenuPdf = require('./models/MenuPdf');

async function checkActivePDFs() {
  try {
    await mongoose.connect('mongodb://localhost:27017/terra');

    const allPdfs = await MenuPdf.find({});
    console.log('All PDFs in database:', allPdfs.length);
    allPdfs.forEach(pdf => {
      console.log(`  - ${pdf.title} (Menu: ${pdf.menuTitle}, Active: ${pdf.isActive})`);
    });

    const foodPdfs = await MenuPdf.find({ menuTitle: 'Food Menu' });
    const winePdfs = await MenuPdf.find({ menuTitle: 'Wine Menu' });

    console.log('\nFood Menu PDFs:', foodPdfs.length);
    foodPdfs.forEach(pdf => {
      console.log(`  - ${pdf.title} (Active: ${pdf.isActive})`);
    });

    console.log('Wine Menu PDFs:', winePdfs.length);
    winePdfs.forEach(pdf => {
      console.log(`  - ${pdf.title} (Active: ${pdf.isActive})`);
    });

    await mongoose.connection.close();
  } catch (error) {
    console.error('Error:', error);
  }
}

checkActivePDFs();
