const mongoose = require('mongoose');

const studentSchema = new mongoose.Schema({
    studentId: { // รหัสนักเรียน (ใช้เป็นข้อมูลใน QR Code)
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    firstName: {
        type: String,
        required: true,
        trim: true
    },
    lastName: {
        type: String,
        required: true,
        trim: true
    },
    grade: { // ชั้นเรียน (Optional)
        type: String,
        trim: true
    }
    // เพิ่ม field อื่นๆ ที่ต้องการได้
}, { timestamps: true }); // timestamps จะเพิ่ม createdAt และ updatedAt อัตโนมัติ

module.exports = mongoose.model('Student', studentSchema);