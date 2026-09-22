const mongoose = require('mongoose');
const { VEHICLE_TYPES, FUEL_TYPES } = require('../config/constants');

const carSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: [true, 'Car name is required'], trim: true },
    description: { type: String, trim: true, default: '' },
    rentalPrice: { type: Number, required: [true, 'Rental price is required'], min: [1, 'Rental price must be greater than 0'] }, // per day
    imageUrl: { type: String, required: [true, 'Car image is required'] },
    imagePublicId: { type: String, required: true },
    vehicleType: { type: String, enum: VEHICLE_TYPES, required: [true, 'Vehicle type is required'] },
    fuelType: { type: String, enum: FUEL_TYPES, required: [true, 'Fuel type is required'] },
    location: { type: String, required: [true, 'Location is required'], trim: true },
    seats: { type: Number, required: [true, 'Number of seats is required'], min: 1 },
    isAvailable: { type: Boolean, default: true }, 
  },
  { timestamps: true }
);

module.exports = mongoose.model('Car', carSchema);
