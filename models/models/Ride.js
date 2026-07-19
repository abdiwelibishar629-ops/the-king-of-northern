const mongoose = require('mongoose');

const RideSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    driverId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    customerName: {
        type: String,
        required: true
    },
    customerPhone: {
        type: String,
        required: true
    },
    pickup: {
        type: String,
        required: true
    },
    destination: {
        type: String,
        required: true
    },
    pickupLat: {
        type: Number,
        default: 0
    },
    pickupLng: {
        type: Number,
        default: 0
    },
    destinationLat: {
        type: Number,
        default: 0
    },
    destinationLng: {
        type: Number,
        default: 0
    },
    vehicleType: {
        type: String,
        default: 'Any'
    },
    status: {
        type: String,
        enum: ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'],
        default: 'pending'
    },
    driverName: {
        type: String,
        default: null
    },
    driverPhone: {
        type: String,
        default: null
    },
    driverPlate: {
        type: String,
        default: null
    },
    driverCar: {
        type: String,
        default: null
    },
    estimatedTime: {
        type: Number,
        default: 0
    },
    distance: {
        type: Number,
        default: 0
    },
    fare: {
        type: Number,
        default: 0
    },
    paymentMethod: {
        type: String,
        enum: ['cash', 'mpesa', 'card'],
        default: 'cash'
    },
    paymentStatus: {
        type: String,
        enum: ['pending', 'paid', 'failed'],
        default: 'pending'
    },
    startedAt: {
        type: Date,
        default: null
    },
    completedAt: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Ride', RideSchema);
