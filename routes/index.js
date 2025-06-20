const express = require("express");
const router = express.Router();
const Student = require("../models/Student");
const PhoneLog = require("../models/PhoneLog");
const fs = require("fs");
const path = require("path");
const iconv = require("iconv-lite");

const logDirectory = path.join(__dirname, "..", "logs"); // สร้างโฟลเดอร์ logs ใน root project
const logFilePath = path.join(logDirectory, "scan_transactions.csv"); // ชื่อไฟล์ log
const csvHeader =
  "Timestamp,StudentID,FirstName,LastName,Phone,Action,ResultingStatus\n"; // หัวข้อคอลัมน์ใน CSV

// --- Function ช่วย Escape ค่าสำหรับ CSV (ป้องกันปัญหาถ้าข้อมูลมี comma หรือ quote) ---
function escapeCsvValue(value) {
  if (value === null || value === undefined) {
    return ""; // คืนค่าว่างถ้าเป็น null/undefined
  }
  const stringValue = String(value); // แปลงเป็น String
  if (
    stringValue.includes(",") ||
    stringValue.includes("\n") ||
    stringValue.includes('"')
  ) {
    const escapedValue = stringValue.replace(/"/g, '""'); // เปลี่ยน double quotes เป็นสองตัว
    return `"${escapedValue}"`; // ครอบด้วย double quotes
  }
  return stringValue;
}

// --- แสดงหน้าหลัก (หน้าสแกน) ---
router.get("/", (req, res) => {
  res.render("index", { title: "หน้าหลัก" });
});

router.get("/status", async (req, res) => {
  try {
    // 1. ดึงข้อมูล Log ทั้งหมดจากฐานข้อมูล
    // 2. ใช้ .populate('student') เพื่อดึงข้อมูลของนักเรียนที่เชื่อมโยงกันมาด้วย (ชื่อ, รหัส)
    // 3. ใช้ .sort({ updatedAt: -1 }) เพื่อเรียงลำดับตามเวลาล่าสุดที่ข้อมูลถูกอัปเดต (แสดงรายการล่าสุดก่อน)
    const logs = await PhoneLog.find()
      .populate("student", "studentId firstName lastName phone") // ดึงเฉพาะ field ที่ต้องการจาก Student
      .sort({ updatedAt: 1 });

    // Render View ใหม่ชื่อ 'status.ejs' พร้อมส่งข้อมูล logs ไปแสดงผล
    res.render("status", {
      title: "ข้อมูลสถานะการฝาก-คืนมือถือ",
      logs: logs,
      currentDate: new Date(), // ส่งวันที่ปัจจุบันไปด้วย (ถ้าต้องการ)
    });
  } catch (err) {
    console.error("Error fetching status logs:", err);
    res.status(500).render("error_page", {
      // (Optional) สร้างหน้า error_page.ejs
      title: "เกิดข้อผิดพลาด",
      message: "ไม่สามารถดึงข้อมูลสถานะการฝาก-คืนได้",
    });
    // หรือส่งข้อความธรรมดา: res.status(500).send("เกิดข้อผิดพลาดในการดึงข้อมูลสถานะ");
  }
});
// --- API Endpoint สำหรับรับข้อมูลจากการสแกน QR Code ---
// ในไฟล์ routes/index.js

router.post("/scan", async (req, res) => {
  const { studentId } = req.body;

  if (!studentId) {
    return res
      .status(400)
      .json({ success: false, message: "ไม่พบข้อมูลรหัสนักเรียน" });
  }

  try {
    // --- ค้นหานักเรียน ---
    const student = await Student.findOne({ studentId: studentId });
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: `ไม่พบนักเรียนรหัส ${studentId}` });
    }

    // --- ค้นหา/สร้าง/อัปเดต PhoneLog ---
    // --- ค้นหา/สร้าง/อัปเดต PhoneLog ---
    let action = "";
    let message = "";
    const now = new Date(); // ใช้เวลาเดียวกันทั้งใน DB และ Log

    let phoneLog = await PhoneLog.findOne({ student: student._id }).sort({
      createdAt: -1,
    }); // เรียงจากล่าสุดไปเก่าสุด

    // ค้นหา PhoneLog ล่าสุดของนักเรียนนี้
    // ถ้าไม่มี PhoneLog ล่าสุด (เช่น นักเรียนนี้ยังไม่เคยฝากมือถือ) จะสร้างใหม่
    // ถ้ามี PhoneLog ล่าสุด จะเช็คสถานะว่า checked-in หรือ checked-out
    // ถ้า checked-in จะทำการ Check-out (คืนมือถือ) และอัปเดตเวลา
    // ถ้า checked-out จะทำการ Check-in (รับฝากมือถือ) และอัปเดตเวลา

    // สร้าง PhoneLog ใหม่ทุกครั้งที่มีการ Check-in หรือ Check-out
    if (phoneLog) {
      if (phoneLog.status === "checked-out") {
        // Check-in
        phoneLog = new PhoneLog({
          student: student._id,
          status: "checked-in",
          lastCheckInTime: now,
          action: "check-in",
        });
        action = "check-in";
        message = `รับฝากมือถือของ ${student.firstName} ${student.lastName} เรียบร้อย`;
      } else {
        // Check-out
        phoneLog = new PhoneLog({
          student: student._id,
          status: "checked-out",
          lastCheckOutTime: now,
          action: "check-out",
        });
        action = "check-out";
        message = `คืนมือถือของ ${student.firstName} ${student.lastName} เรียบร้อย`;
      }
    } else {
      // First check-in
      phoneLog = new PhoneLog({
        student: student._id,
        status: "checked-in",
        lastCheckInTime: now,
        action: "check-in",
      });
      action = "check-in";
      message = `รับฝากมือถือของ ${student.firstName} ${student.lastName} (ครั้งแรก) เรียบร้อย`;
    }

    // --- บันทึกข้อมูลลง MongoDB ---
    await phoneLog.save();

    const finalStatus = phoneLog.status; // เก็บ status ล่าสุดหลัง save

    // --- !!! เพิ่มส่วนการบันทึกลงไฟล์ CSV !!! ---
    try {
      // 1. สร้างข้อมูลสำหรับบันทึก 1 แถว
      const timestampStr = now.toLocaleString("th-TH", {
        timeZone: "Asia/Bangkok",
      }); // เวลาไทย
      const csvRow =
        [
          escapeCsvValue(timestampStr),
          escapeCsvValue(student.studentId),
          escapeCsvValue(student.firstName),
          escapeCsvValue(student.lastName),
          escapeCsvValue(student.phone),
          escapeCsvValue(action), // 'check-in' or 'check-out'
          escapeCsvValue(finalStatus), // สถานะ *หลังจาก* ทำ action นี้
        ].join(",") + "\n"; // รวมเป็น String คั่นด้วย comma และขึ้นบรรทัดใหม่

      const BOM = Buffer.from([0xef, 0xbb, 0xbf]);
      // 2. ตรวจสอบและสร้างโฟลเดอร์ logs ถ้ายังไม่มี
      if (!fs.existsSync(logDirectory)) {
        fs.mkdirSync(logDirectory, { recursive: true });
        console.log(`Created log directory: ${logDirectory}`);
      }

      // 3. ตรวจสอบว่าไฟล์ CSV มีหรือยัง ถ้ายังไม่มี ให้เขียน Header ก่อน
      if (!fs.existsSync(logFilePath)) {
        fs.writeFileSync(
          logFilePath,
          Buffer.concat([BOM, iconv.encode(csvHeader, "utf8")])
        );
        console.log(`CSV Header written to: ${logFilePath}`);
      }

      // 4. เขียนข้อมูลแถวใหม่ต่อท้ายไฟล์ (Append) แบบ Asynchronous
      // เขียนไฟล์ CSV พร้อมเพิ่ม BOM
      fs.appendFile(logFilePath, iconv.encode(csvRow, "utf8"), (err) => {
        if (err) {
          console.error("Error writing transaction to CSV:", err);
        } else {
          console.log("Transaction logged to CSV successfully.");
        }
      });
    } catch (fileError) {
      // จัดการ Error ที่เกี่ยวกับการเขียนไฟล์ (เช่น permission denied)
      console.error("Error during CSV file operation:", fileError);
    }
    // --- !!! จบส่วนการบันทึกลงไฟล์ CSV !!! ---

    // --- ส่ง Response กลับไปให้ Client (เหมือนเดิม) ---
    return res.json({
      success: true,
      message: message,
      studentName: `${student.firstName} ${student.lastName}`,
      action: action,
      status: finalStatus,
      timestamp:
        action === "check-in"
          ? phoneLog.lastCheckInTime
          : phoneLog.lastCheckOutTime,
    });
  } catch (dbError) {
    // เปลี่ยนชื่อ error variable เล็กน้อยเพื่อความชัดเจน
    console.error("Error processing scan (DB operation):", dbError);
    return res.status(500).json({
      success: false,
      message: "เกิดข้อผิดพลาดในระบบขณะประมวลผล (ฐานข้อมูล)",
    });
  }
});

// ---- delete phone log ----
router.get("/delete/:logId", async (req, res) => {
  try {
    const logId = req.params.logId;
    const log = await PhoneLog.findById(logId);
    if (!log) {
      return res.status(404).send("ไม่พบข้อมูลการฝากมือถือ");
    }
    await PhoneLog.deleteOne({ _id: logId });
    res.redirect("/status"); // Redirect ไปหน้าสถานะการฝากมือถือ
  } catch (err) {
    console.error("Error deleting phone log:", err);
    res.status(500).send("เกิดข้อผิดพลาดในการลบข้อมูลการฝากมือถือ");
  }
});


router.get("/download/logs", (req, res) => {
  const filePath = path.join(__dirname, "../logs/scan_transactions.csv");

  res.download(filePath, "scan_transactions.csv", (err) => {
    if (err) {
      console.error("Download error:", err);
      return res.status(500).send("ไม่สามารถดาวน์โหลดไฟล์ได้");
    }

    // ลบไฟล์หลังจากดาวน์โหลดสำเร็จ
    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error("ลบไฟล์ไม่สำเร็จ:", unlinkErr);
      } else {
        console.log("ลบไฟล์หลังดาวน์โหลดแล้วเรียบร้อย");
      }
    });
  });
});

module.exports = router; // อย่าลืม Export router
