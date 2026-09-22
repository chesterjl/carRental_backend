const User = require('../models/User');
const IdDocumentService = require('./IdDocumentService');
const ApiError = require('../utils/ApiError');
const { ROLES, ID_LIMITS } = require('../config/constants');
const { generateToken } = require('../utils/JwtUtil');

const authResponse = (user) => ({ token: generateToken(user), expiresIn: process.env.JWT_EXPIRES_IN || '1d', user });

const register = async (body, files) => {
  const { name, email, password, phone, brandName, idType } = body;
  const role = body.role || ROLES.CUSTOMER;

  if (!Object.values(ROLES).includes(role)) throw new ApiError(400, 'Role must be "customer" or "owner".');
  if (await User.findOne({ email: (email || '').toLowerCase() })) throw new ApiError(409, 'Email is already registered.');

  const idFiles = files?.idImages || [];
  if (role === ROLES.OWNER) {
    if (idFiles.length < 1) throw new ApiError(400, 'Car owners must upload at least 1 ID (max 2) in "idImages".');
    if (idFiles.length > ID_LIMITS.owner) throw new ApiError(400, `Car owners can upload up to ${ID_LIMITS.owner} IDs.`);
  }

  // Customers upload their ID later, with their first booking request
  const user = await User.create({
    name,
    email,
    password,
    phone,
    role,
    brandName: role === ROLES.OWNER ? brandName || name : undefined, // brand defaults to owner's name
  });

  if (role === ROLES.OWNER) {
    try {
      await IdDocumentService.addDocuments(user, idFiles, idType);
    } catch (err) {
      await User.findByIdAndDelete(user._id); // roll back so they can retry
      throw err;
    }
  }

  return authResponse(user);
};

const login = async ({ email, password }) => {
  if (!email || !password) throw new ApiError(400, 'Email and password are required.');

  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(password))) throw new ApiError(401, 'Invalid email or password.');

  return authResponse(user);
};

module.exports = { register, login };