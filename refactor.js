
const fs = require('fs');
let code = fs.readFileSync('pages/Assets.tsx', 'utf8');

// 1. Add fields to initial state of formData
code = code.replace(
  ehicleType: 'CAR' as 'CAR' | 'MOTORCYCLE' | 'TRUCK' | 'OTHER',,
  ehicleType: 'CAR' as 'CAR' | 'MOTORCYCLE' | 'TRUCK' | 'OTHER',\n    licensePlate: '',\n    renavam: '',\n    yearModel: '',\n    mileage: '',
);

// 2. Add fields to resetAssetForm
code = code.replace(
  ehicleType: 'CAR',,
  ehicleType: 'CAR',\n      licensePlate: '',\n      renavam: '',\n      yearModel: '',\n      mileage: '',
);

// 3. Add fields to openEditAsset (loading from meta)
code = code.replace(
  ehicleType: meta.vehicleType || 'CAR',,
  ehicleType: meta.vehicleType || 'CAR',\n      licensePlate: meta.licensePlate || '',\n      renavam: meta.renavam || '',\n      yearModel: meta.yearModel || '',\n      mileage: meta.mileage ? String(meta.mileage) : '',
);

// 4. Add fields to handleSaveAsset (saving to metadata)
code = code.replace(
  ehicleType: formData.category === 'VEHICLE' ? formData.vehicleType : undefined,,
  ehicleType: formData.category === 'VEHICLE' ? formData.vehicleType : undefined,\n        licensePlate: formData.category === 'VEHICLE' ? formData.licensePlate : undefined,\n        renavam: formData.category === 'VEHICLE' ? formData.renavam : undefined,\n        yearModel: formData.category === 'VEHICLE' ? formData.yearModel : undefined,\n        mileage: formData.category === 'VEHICLE' ? (parseFloat(formData.mileage) || 0) : undefined,
);

fs.writeFileSync('pages/Assets.tsx', code);

