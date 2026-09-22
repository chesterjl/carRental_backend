const Booking = require('../models/Booking');
const Car = require('../models/Car');
const IdDocument = require('../models/IdDocument');
const IdDocumentService = require('./IdDocumentService');
const PaymentService = require('./PaymentService');
const ApiError = require('../utils/ApiError');
const { BOOKING_STATUS: S, BLOCKING_STATUSES, DELIVERY_METHODS } = require('../config/constants');

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (n) => Math.round(n * 100) / 100;

const populate = (q) =>
  q.populate('car', 'name imageUrl rentalPrice location').populate('customer', 'name email phone').populate('owner', 'name brandName phone').populate('idDocument', 'idType imageUrl status');

const findOwn = async (id, field, user) => {
  const booking = await Booking.findById(id);
  if (!booking) throw new ApiError(404, 'Booking not found.');
  if (booking[field].toString() !== user._id.toString()) throw new ApiError(403, 'You are not allowed to access this booking.');
  return booking;
};

const assertStatus = (booking, allowed, action) => {
  if (!allowed.includes(booking.status)) throw new ApiError(400, `Cannot ${action} a booking that is "${booking.status}".`);
};

const hasOverlap = (carId, start, end, excludeId) =>
  Booking.exists({
    car: carId,
    status: { $in: BLOCKING_STATUSES },
    startDate: { $lt: end },
    endDate: { $gt: start },
    ...(excludeId && { _id: { $ne: excludeId } }),
  });

// customer: submit rental request 
const create = async (customer, body, file) => {
  const { carId, startDate, endDate, idType, deliveryMethod } = body;
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (!carId || isNaN(start) || isNaN(end)) throw new ApiError(400, 'carId, startDate and endDate are required.');
  if (end <= start) throw new ApiError(400, 'End date must be after start date.');
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start < today) throw new ApiError(400, 'Start date cannot be in the past.');

  // Delivery: how the car is picked up and returned, as a single value (defaults to the customer doing both themselves)
  if (deliveryMethod && !DELIVERY_METHODS.includes(deliveryMethod)) {
    throw new ApiError(400, `deliveryMethod must be one of: ${DELIVERY_METHODS.join(', ')}`);
  }

  const car = await Car.findById(carId);
  if (!car || !car.isAvailable) throw new ApiError(404, 'Car not found or not available.');
  if (await hasOverlap(car._id, start, end)) throw new ApiError(409, 'Car is already booked for those dates.');

  // Customer ID: upload once, reuse afterwards
  let idDoc = await IdDocument.findOne({ user: customer._id });
  if (!idDoc) {
    if (!file) throw new ApiError(400, 'Please upload your ID (field "idImage") for owner verification.');
    [idDoc] = await IdDocumentService.addDocuments(customer, [file], idType);
  }

  const totalDays = Math.max(1, Math.ceil((end - start) / DAY_MS));
  const totalPrice = round2(totalDays * car.rentalPrice);
  const downAmount = round2((totalPrice * (Number(process.env.DOWNPAYMENT_PERCENT) || 30)) / 100);

  const booking = await Booking.create({
    customer: customer._id,
    owner: car.owner,
    car: car._id,
    idDocument: idDoc._id,
    startDate: start,
    endDate: end,
    totalDays,
    totalPrice,
    deliveryMethod: deliveryMethod || 'self_pickup_self_return',
    downPayment: { amount: downAmount },
    balancePayment: { amount: round2(totalPrice - downAmount) },
  });

  return populate(Booking.findById(booking._id));
};

// customer: lists of booking request
const listForCustomer = (userId) => populate(Booking.find({ customer: userId }).sort({ createdAt: -1 }));

// Owner: requests still waiting for review
const listOwnerPending = (ownerId) => populate(Booking.find({ owner: ownerId, status: S.PENDING }).sort({ createdAt: -1 }));

// Owner: booking history across all their cars. Optional ?status= to narrow it down (e.g. "completed").
const getOwnerHistory = (ownerId, status) => populate(Booking.find({ owner: ownerId, ...(status && { status }) }).sort({ createdAt: -1 }));

const getById = async (user, id) => {
  const booking = await populate(Booking.findById(id));
  if (!booking) throw new ApiError(404, 'Booking not found.');
  const isParty = [booking.customer._id, booking.owner._id].some((x) => x.toString() === user._id.toString());
  if (!isParty) throw new ApiError(403, 'You are not allowed to view this booking.');
  return booking;
};

// owner: review request 
const approve = async (owner, id) => {
  const booking = await findOwn(id, 'owner', owner);
  assertStatus(booking, [S.PENDING], 'approve');
  if (await hasOverlap(booking.car, booking.startDate, booking.endDate, booking._id)) {
    throw new ApiError(409, 'Car was booked by someone else for those dates.');
  }
  booking.status = S.APPROVED;
  await IdDocument.findByIdAndUpdate(booking.idDocument, { status: 'verified' });
  await booking.save();
  return booking;
};

const reject = async (owner, id, reason) => {
  const booking = await findOwn(id, 'owner', owner);
  assertStatus(booking, [S.PENDING], 'reject');
  booking.status = S.REJECTED;
  booking.rejectionReason = reason || 'Verification/approval failed.';
  await booking.save();
  return booking;
};

// customer: cancel (only before downpayment is paid)
const cancel = async (customer, id) => {
  const booking = await findOwn(id, 'customer', customer);
  assertStatus(booking, [S.PENDING, S.APPROVED], 'cancel');
  booking.status = S.CANCELLED;
  await booking.save();
  return booking;
};

// payments
// Flow: owner approves the customer -> customer clicks "Pay downpayment" -> rental confirmed.
//
// TEMPORARY: the payment is auto-approved (PaymentService.pay) so the rental is confirmed instantly.
//
// XENDIT INTEGRATION (uncomment when frontend + backend are ready):
//   replace the `PaymentService.pay(...)` line below with:
//     const { invoiceUrl, amount } = await PaymentService.createInvoice(booking, customer, 'down');
//     return { invoiceUrl, amount };
//   The frontend then redirects the customer to invoiceUrl, and the Xendit webhook
//   (PaymentController) marks the downpayment paid and sets the status to "confirmed".
const payDownPayment = async (customer, id) => {
  const booking = await findOwn(id, 'customer', customer);
  assertStatus(booking, [S.APPROVED], 'pay downpayment for');
  if (booking.downPayment.status === 'paid') throw new ApiError(400, 'Downpayment is already paid.');

  return PaymentService.pay(booking, customer, 'down'); // <-- swap for createInvoice when integrating Xendit
};

// Balance is payable once the owner has verified the returned car (status "completed").
// method: 'online' (auto-paid for now / Xendit later) or 'f2f' (cash, confirmed by the owner - see confirmBalanceF2F below).
const payBalance = async (customer, id, method = 'online') => {
  const booking = await findOwn(id, 'customer', customer);
  assertStatus(booking, [S.COMPLETED], 'pay balance for');
  if (booking.balancePayment.status === 'paid') throw new ApiError(400, 'Balance is already paid.');

  if (method === 'f2f') return PaymentService.requestF2F(booking, 'balance');
  return PaymentService.pay(booking, customer, 'balance'); // <-- swap for createInvoice when integrating Xendit
};

// Owner: confirm the cash amount actually received for a face-to-face balance payment.
const confirmBalanceF2F = async (owner, id, amountReceived) => {
  const booking = await findOwn(id, 'owner', owner);
  assertStatus(booking, [S.COMPLETED], 'confirm balance payment for');

  const amount = Number(amountReceived);
  if (!amount || amount <= 0) throw new ApiError(400, 'amountReceived must be a positive number.');

  return PaymentService.confirmF2F(booking, 'balance', amount);
};

// owner: rental lifecycle 
const markPickedUp = async (owner, id) => {
  const booking = await findOwn(id, 'owner', owner);
  assertStatus(booking, [S.CONFIRMED], 'start rental for');
  booking.status = S.ONGOING;
  await booking.save();
  return booking;
};

const markReturned = async (owner, id, { isGoodCondition, notes }) => {
  const booking = await findOwn(id, 'owner', owner);
  assertStatus(booking, [S.ONGOING], 'return');
  booking.status = S.RETURNED;
  booking.conditionReport = {
    isGoodCondition: isGoodCondition === undefined ? true : String(isGoodCondition) === 'true',
    notes,
    checkedAt: new Date(),
  };
  await booking.save();
  return booking;
};

// Owner verified the car -> Transaction Completed (customer can now pay the balance)
const complete = async (owner, id) => {
  const booking = await findOwn(id, 'owner', owner);
  assertStatus(booking, [S.RETURNED], 'complete');
  booking.status = S.COMPLETED;
  await booking.save();
  return booking;
};

module.exports = {
  create,
  listForCustomer,
  listOwnerPending,
  getOwnerHistory,
  getById,
  approve,
  reject,
  cancel,
  payDownPayment,
  payBalance,
  confirmBalanceF2F,
  markPickedUp,
  markReturned,
  complete,
};