const User = require('../models/User');
const IdDocumentService = require('./IdDocumentService');
const ApiError = require('../utils/ApiError');
const { ROLES, PUBLIC_ROLES, ID_LIMITS } = require('../config/constants');
const { generateToken } = require('../utils/JwtUtil');

const authResponse = (user) => ({ token: generateToken(user), expiresIn: process.env.JWT_EXPIRES_IN || '1d', user });

// ---------- public: customer / owner self-registration ----------
const register = async (body, files) => {
  const { name, email, password, phone, brandName, idType } = body;
  const role = body.role || ROLES.CUSTOMER;

  // ROLES now also has "admin", so this must stay restricted to what the public can pick for themselves.
  // Admin accounts are created another way (see createAdmin/bootstrapFirstAdmin below), never through this endpoint.
  if (!PUBLIC_ROLES.includes(role)) throw new ApiError(400, 'Role must be "customer" or "owner".');
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

// ---------- self-service: update my own info ----------
// Anyone can change name/phone/email/password. brandName only applies to owners.
// Role is never editable here -- that stays admin territory.
const updateInfo = async (user, body) => {
  const { name, phone, email, password, brandName } = body;

  if (name === undefined && phone === undefined && email === undefined && password === undefined && brandName === undefined) {
    throw new ApiError(400, 'Nothing to update. Provide at least one of: name, phone, email, password, brandName.');
  }

  if (email !== undefined && email.toLowerCase() !== user.email) {
    if (await User.findOne({ email: email.toLowerCase() })) throw new ApiError(409, 'Email is already registered.');
    user.email = email.toLowerCase();
  }

  if (name !== undefined) user.name = name;
  if (phone !== undefined) user.phone = phone;
  if (password !== undefined) user.password = password; // re-hashed by the pre-save hook on User

  if (brandName !== undefined) {
    if (user.role !== ROLES.OWNER) throw new ApiError(400, 'Only car owners have a brand name.');
    user.brandName = brandName;
  }

  await user.save();
  return user;
};

// ---------- admin accounts ----------
// Shared creation logic. No ID upload, no brandName -- admins aren't verified the way owners/customers are.
const buildAdmin = async ({ name, email, password, phone }) => {
  if (!name || !email || !password || !phone) throw new ApiError(400, 'name, email, password and phone are required.');
  if (await User.findOne({ email: email.toLowerCase() })) throw new ApiError(409, 'Email is already registered.');
  return User.create({ name, email, password, phone, role: ROLES.ADMIN });
};

// One-time bootstrap: only works while there is NOT a single admin in the system yet.
// Lets a brand-new deployment create its first admin without already having one to log in as.
// Once an admin exists, this always fails -- use createAdmin (below) instead.
const bootstrapFirstAdmin = async (body) => {
  if (await User.exists({ role: ROLES.ADMIN })) {
    throw new ApiError(403, 'An admin account already exists. Ask an existing admin to create yours.');
  }
  const user = await buildAdmin(body);
  return authResponse(user);
};

// Used once at least one admin exists: that admin creates every other admin from here on.
// Controller must protect this route with authorize('admin').
const createAdmin = async (body) => {
  const user = await buildAdmin(body);
  return { user }; // no token: the creator is logged in as themselves, this new admin logs in separately
};

module.exports = { register, login, updateInfo, bootstrapFirstAdmin, createAdmin };