const mongoose = require('mongoose');

const phoneLogSchema = new mongoose.Schema({
    student: { // อ้างอิงไปยัง Document ของ Student
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Student',
        required: true,
        unique: false
    },
    status: {
        type: String,
        enum: ['checked-in', 'checked-out'], // สถานะ: ฝากอยู่ หรือ คืนไปแล้ว
        default: 'checked-out' // สถานะเริ่มต้นคือยังไม่ได้ฝาก
    },
    lastCheckInTime: {
        type: Date
    },
    lastCheckOutTime: {
        type: Date
    },
    checkedInBy: { // (Optional) ใครเป็นคนรับฝาก
        type: String
    },
    checkedOutBy: { // (Optional) ใครเป็นคนคืน
        type: String
    }
}, { timestamps: true });

module.exports = mongoose.model('PhoneLog', phoneLogSchema);