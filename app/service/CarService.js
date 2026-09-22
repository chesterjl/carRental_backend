const Car = require('../models/Car');
const ApiError = require('../utils/ApiError');
const { uploadBuffer, deleteImage } = require('../utils/CloudinaryUtil');

const FIELDS = ['name', 'description', 'rentalPrice', 'vehicleType', 'fuelType', 'location', 'seats', 'isAvailable'];
const pick = (obj) => Object.fromEntries(FIELDS.filter((f) => obj[f] !== undefined).map((f) => [f, obj[f]]));

const create = async (owner, body, file) => {
  if (!file) throw new ApiError(400, 'Car image is required (field "image").');
  const img = await uploadBuffer(file.buffer, 'carrent/cars');
  try {
    return await Car.create({ ...pick(body), owner: owner._id, ...img });
  } catch (err) {
    await deleteImage(img.imagePublicId);
    throw err;
  }
};

// Public browsing with optional filters: ?location=&vehicleType=&fuelType=&seats=&minPrice=&maxPrice=&search=
const list = async (q) => {
  const filter = { isAvailable: true };
  if (q.location) filter.location = new RegExp(q.location, 'i');
  if (q.vehicleType) filter.vehicleType = q.vehicleType;
  if (q.fuelType) filter.fuelType = q.fuelType;
  if (q.seats) filter.seats = { $gte: Number(q.seats) };
  if (q.search) filter.name = new RegExp(q.search, 'i');
  if (q.minPrice || q.maxPrice) {
    filter.rentalPrice = {};
    if (q.minPrice) filter.rentalPrice.$gte = Number(q.minPrice);
    if (q.maxPrice) filter.rentalPrice.$lte = Number(q.maxPrice);
  }
  return Car.find(filter).populate('owner', 'name brandName').sort({ createdAt: -1 });
};

const getById = async (id) => {
  const car = await Car.findById(id).populate('owner', 'name brandName phone');
  if (!car) throw new ApiError(404, 'Car not found.');
  return car;
};

const listByOwner = (ownerId) => Car.find({ owner: ownerId }).sort({ createdAt: -1 });

const getOwned = async (owner, id) => {
  const car = await Car.findById(id);
  if (!car) throw new ApiError(404, 'Car not found.');
  if (car.owner.toString() !== owner._id.toString()) throw new ApiError(403, 'This car does not belong to you.');
  return car;
};

const update = async (owner, id, body, file) => {
  const car = await getOwned(owner, id);
  Object.assign(car, pick(body));

  if (file) {
    const oldPublicId = car.imagePublicId;
    Object.assign(car, await uploadBuffer(file.buffer, 'carrent/cars'));
    await car.save();
    await deleteImage(oldPublicId);
    return car;
  }
  return car.save();
};

const remove = async (owner, id) => {
  const car = await getOwned(owner, id);
  await deleteImage(car.imagePublicId);
  await car.deleteOne();
};

module.exports = { create, list, getById, listByOwner, update, remove };
