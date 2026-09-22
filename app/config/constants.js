module.exports = {
  ROLES: { CUSTOMER: 'customer', OWNER: 'owner' },

  // Max number of ID images each role may have on file
  ID_LIMITS: { owner: 2, customer: 1 },
  // Pickup: how the customer gets the car. Return: how the car comes back.
  // Crossed together these give the 4 combinations (self pickup/return, owner delivers/collects, or a mix).
  PICKUP_METHODS: ['self_pickup', 'owner_delivery'],
  RETURN_METHODS: ['self_return', 'owner_pickup'],

  VEHICLE_TYPES: ['sedan', 'suv', 'hatchback', 'van', 'pickup', 'motorcycle', 'other'],
  FUEL_TYPES: ['gasoline', 'diesel', 'electric', 'hybrid'],

  BOOKING_STATUS: {
    PENDING: 'pending',       // request submitted, waiting for owner review
    REJECTED: 'rejected',     // owner rejected request / ID verification failed
    APPROVED: 'approved',     // owner approved, waiting for downpayment
    CONFIRMED: 'confirmed',   // downpayment paid
    ONGOING: 'ongoing',       // vehicle picked up
    RETURNED: 'returned',     // vehicle returned, waiting for owner condition check
    COMPLETED: 'completed',   // owner verified condition -> balance can be paid
    CANCELLED: 'cancelled',
  },

  // Bookings in these statuses block the car for their date range
  BLOCKING_STATUSES: ['approved', 'confirmed', 'ongoing', 'returned'],
};
