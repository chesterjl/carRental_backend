const Car = require('../models/Car');
const ApiError = require('../utils/ApiError');
const { uploadBuffer, deleteImage } = require('../utils/CloudinaryUtil');
const { CAR_LISTING_STATUS: STATUS } = require('../config/constants');

const FIELDS = ['name', 'description', 'rentalPrice', 'vehicleType', 'fuelType', 'location', 'seats', 'isAvailable'];
const pick = (obj) => Object.fromEntries(FIELDS.filter((f) => obj[f] !== undefined).map((f) => [f, obj[f]]));

//  owner: create / edit / delete 
// files = req.files from upload.fields([{name:'image'},{name:'registrationImage'}])
const create = async (owner, body, files) => {
  const imageFile = files?.image?.[0];
  const regFile = files?.registrationImage?.[0];
  if (!imageFile) throw new ApiError(400, 'Car image is required (field "image").');
  if (!regFile) throw new ApiError(400, 'Certificate of Registration image is required (field "registrationImage") to prove this car is yours.');
  
  const img = await uploadBuffer(imageFile.buffer, 'carrent/cars');

  let reg;
  try {
    reg = await uploadBuffer(regFile.buffer, 'carrent/car-registrations');
  } catch (err) {
    await deleteImage(img.imagePublicId);
    throw err;
  }

  try {
    return await Car.create({
      ...pick(body),
      owner: owner._id,
      imageUrl: img.imageUrl,
      imagePublicId: img.imagePublicId,
      registrationImageUrl: reg.imageUrl,
      registrationImagePublicId: reg.imagePublicId,
      listingStatus: STATUS.PENDING, // every new listing starts pending -- only an admin can approve it
    });
  } catch (err) {
    await deleteImage(img.imagePublicId);
    await deleteImage(reg.imagePublicId);
    throw err;
  }
};

const getOwned = async (owner, id) => {
  const car = await Car.findById(id);
  if (!car) throw new ApiError(404, 'Car not found.');
  if (car.owner.toString() !== owner._id.toString()) throw new ApiError(403, 'This car does not belong to you.');
  return car;
};

const update = async (owner, id, body, files) => {
  const car = await getOwned(owner, id);
  Object.assign(car, pick(body));

  const imageFile = files?.image?.[0];
  const regFile = files?.registrationImage?.[0];
  const oldImagePublicId = car.imagePublicId;
  const oldRegPublicId = car.registrationImagePublicId;

  if (imageFile) {
    const img = await uploadBuffer(imageFile.buffer, 'carrent/cars');
    car.imageUrl = img.imageUrl;
    car.imagePublicId = img.imagePublicId;
  }
  if (regFile) {
    const reg = await uploadBuffer(regFile.buffer, 'carrent/car-registrations');
    car.registrationImageUrl = reg.imageUrl;
    car.registrationImagePublicId = reg.imagePublicId;
  }

  // Editing a previously rejected listing sends it back for another admin review
  if (car.listingStatus === STATUS.REJECTED) {
    car.listingStatus = STATUS.PENDING;
    car.adminNote = undefined;
  }

  await car.save();
  if (imageFile) await deleteImage(oldImagePublicId);
  if (regFile) await deleteImage(oldRegPublicId);

  return car;
};

const remove = async (owner, id) => {
  const car = await getOwned(owner, id);
  await deleteImage(car.imagePublicId);
  await deleteImage(car.registrationImagePublicId);
  await car.deleteOne();
};

//  browsing 
// Public browsing: only approved AND owner-enabled listings. Filters: ?location=&vehicleType=&fuelType=&seats=&minPrice=&maxPrice=&search=
const list = async (q) => {
  const filter = { isAvailable: true, listingStatus: STATUS.APPROVED };
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

// Owner: every one of their own cars, any listingStatus (so they can see pending/rejected/suspended + adminNote)
const listByOwner = (ownerId) => Car.find({ owner: ownerId }).sort({ createdAt: -1 });

//  admin: review listings 

// Optional status filter, e.g. listForAdmin('pending'). No status = everything.
const listForAdmin = (status) => Car.find({ ...(status && { listingStatus: status }) }).populate('owner', 'name brandName email phone').sort({ createdAt: -1 });

const getAny = async (id) => {
  const car = await Car.findById(id).populate('owner', 'name brandName email phone');
  if (!car) throw new ApiError(404, 'Car not found.');
  return car;
};

const approve = async (id) => {
  const car = await getAny(id);
  if (car.listingStatus === STATUS.APPROVED) throw new ApiError(400, 'Car is already approved.');
  car.listingStatus = STATUS.APPROVED;
  car.adminNote = undefined;
  car.reviewedAt = new Date();
  return car.save();
};

const reject = async (id, reason) => {
  const car = await getAny(id);
  car.listingStatus = STATUS.REJECTED;
  car.adminNote = reason || 'Rejected by admin.';
  car.reviewedAt = new Date();
  return car.save();
};

// Pauses an already-approved listing: it drops off public browsing and can't take NEW requests,
// but a rental already in progress on it is left alone.
const suspend = async (id, reason) => {
  const car = await getAny(id);
  if (car.listingStatus !== STATUS.APPROVED) throw new ApiError(400, 'Only an approved listing can be suspended.');
  car.listingStatus = STATUS.SUSPENDED;
  car.adminNote = reason || 'Suspended by admin.';
  car.reviewedAt = new Date();
  return car.save();
};

const reinstate = async (id) => {
  const car = await getAny(id);
  if (car.listingStatus !== STATUS.SUSPENDED) throw new ApiError(400, 'Only a suspended listing can be reinstated.');
  car.listingStatus = STATUS.APPROVED;
  car.adminNote = undefined;
  car.reviewedAt = new Date();
  return car.save();
};

module.exports = {
  create,
  list,
  getById,
  listByOwner,
  update,
  remove,
  listForAdmin,
  approve,
  reject,
  suspend,
  reinstate,
};