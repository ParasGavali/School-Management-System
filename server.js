import express from "express";
import session from "express-session";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { MongoClient, ObjectId } from "mongodb";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3000;
const DB_NAME = process.env.DB_NAME || "school_management";
const ANNUAL_FEE = 10000;
const DEFAULT_REGISTRATION_FEE = 200;

const CLASS_PREFIX = {
  Playgroup: "PLY",
  Nursery: "NUR",
  "Jr KG": "JRK",
  "Sr KG": "SRK"
};

const client = new MongoClient(process.env.MONGODB_URI);
await client.connect();
const db = client.db(process.env.DB_NAME || "school_management");

const usersCol = db.collection("users");
const studentsCol = db.collection("students");
const transactionsCol = db.collection("transactions");
const countersCol = db.collection("counters");

await usersCol.createIndex({ username: 1 }, { unique: true });
await studentsCol.createIndex({ studentCode: 1 }, { unique: true });
await transactionsCol.createIndex({ studentId: 1 });
await countersCol.createIndex({ key: 1 }, { unique: true });

async function seedUser(username, password, role, name) {
  const normalizedUsername = String(username || "").trim().toLowerCase();

  const exists = await usersCol.findOne({ username: normalizedUsername });
  if (!exists) {
    const passwordHash = await bcrypt.hash(password, 10);
    await usersCol.insertOne({
      username: normalizedUsername,
      passwordHash,
      role,
      name,
      createdAt: new Date()
    });
  }
}
await seedUser(
  (process.env.ADMIN_USERNAME || "admin").toLowerCase(),
  process.env.ADMIN_PASSWORD || "admin123",
  "Admin",
  process.env.ADMIN_NAME || "Main Admin"
);

await seedUser(
  (process.env.ADMIN2_USERNAME || "rupaligavali").toLowerCase(),
  process.env.ADMIN2_PASSWORD || "Swami2024",
  "Admin",
  process.env.ADMIN2_NAME || "Rupali Gavali"
);

await seedUser(
  (process.env.TEACHER_USERNAME || "teacher").toLowerCase(),
  process.env.TEACHER_PASSWORD || "teacher123",
  "Teacher",
  process.env.TEACHER_NAME || "Main Teacher"
);
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24
    }
  })
);

function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== "Admin") {
    return res.status(403).json({ message: "Admin only" });
  }
  next();
}

function toObjectId(id) {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

function getFullName(student) {
  return `${student.firstName || ""} ${student.lastName || ""}`.trim();
}

function studentTotalFee(student) {
  return (
    Number(student.annualFee || ANNUAL_FEE) +
    Number(student.registrationFee || 0) -
    Number(student.discount || 0)
  );
}

async function getStudentPaid(studentId) {
  const result = await transactionsCol
    .aggregate([
      { $match: { studentId: new ObjectId(studentId) } },
      { $group: { _id: "$studentId", total: { $sum: "$amount" } } }
    ])
    .toArray();

  return result[0]?.total || 0;
}

async function generateStudentCode(className, admissionDate) {
  const year = new Date(admissionDate).getFullYear();
  const prefix = CLASS_PREFIX[className] || "STD";
  const key = `${prefix}-${year}`;

  const result = await countersCol.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: "after" }
  );

  const seq = result.seq || result.value?.seq || 1;
  return `${prefix}${year}${String(seq).padStart(3, "0")}`;
}

app.get("/api/me", (req, res) => {
  res.json({ user: req.session.user || null });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;

  const normalizedUsername = String(username || "").trim().toLowerCase();

  const user = await usersCol.findOne({ username: normalizedUsername });
  if (!user) {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    return res.status(400).json({ message: "Invalid credentials" });
  }

  req.session.user = {
    id: String(user._id),
    username: user.username,
    role: user.role,
    name: user.name
  };

  res.json({ user: req.session.user });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

app.get("/api/dashboard", requireAuth, async (req, res) => {
  const students = await studentsCol.find({}).toArray();
  const transactions = await transactionsCol.find({}).sort({ createdAt: -1 }).limit(5).toArray();

  const activeStudents = students.filter((s) => s.status === "Active");
  let totalPending = 0;
  let totalCollected = 0;

  const classWise = {
    Playgroup: 0,
    Nursery: 0,
    "Jr KG": 0,
    "Sr KG": 0
  };

  for (const s of activeStudents) {
    classWise[s.className] = (classWise[s.className] || 0) + 1;
    const paid = await getStudentPaid(s._id);
    totalCollected += paid;
    totalPending += Math.max(studentTotalFee(s) - paid, 0);
  }

  res.json({
    totalStudents: activeStudents.length,
    classWise,
    totalCollected,
    totalPending,
    recentTransactions: transactions.map((t) => ({
      id: String(t._id),
      studentName: t.studentName,
      studentCode: t.studentCode,
      amount: t.amount,
      paymentMode: t.paymentMode,
      paymentDate: t.paymentDate
    }))
  });
});

app.get("/api/students", requireAuth, async (req, res) => {
  const students = await studentsCol.find({}).sort({ createdAt: -1 }).toArray();
  const result = [];

  for (const s of students) {
    const paid = await getStudentPaid(s._id);
    const pending = s.status === "Active" ? Math.max(studentTotalFee(s) - paid, 0) : 0;

    result.push({
  id: String(s._id),
  studentCode: s.studentCode,
  firstName: s.firstName,
  lastName: s.lastName || "",
  fullName: getFullName(s),
  parentName: s.parentName,
  motherName: s.motherName || "",
  phone: s.phone || "",
  altPhone: s.altPhone || "",
  aadharNumber: s.aadharNumber || "",
  address: s.address || "",
  className: s.className,
  status: s.status,
  admissionDate: s.admissionDate,
  annualFee: s.annualFee,
  registrationFee: s.registrationFee,
  discount: s.discount,
  paid,
  pending,
  documents: {
    birthCertificate: !!s.documents?.birthCertificate,
    aadharXerox: !!s.documents?.aadharXerox
  }
});
  }

  res.json(result);
});

app.get("/api/students/:id", requireAuth, async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid ID" });

  const student = await studentsCol.findOne({ _id: id });
  if (!student) return res.status(404).json({ message: "Student not found" });

  const transactions = await transactionsCol
    .find({ studentId: id })
    .sort({ createdAt: -1 })
    .toArray();

  const paid = await getStudentPaid(id);
  const pending =
    student.status === "Active"
      ? Math.max(studentTotalFee(student) - paid, 0)
      : 0;

  res.json({
    student: {
      id: String(student._id),
      studentCode: student.studentCode,
      firstName: student.firstName || "",
      lastName: student.lastName || "",
      dob: student.dob || "",
      gender: student.gender || "",
      parentName: student.parentName || "",
      motherName: student.motherName || "",
      phone: student.phone || "",
      altPhone: student.altPhone || "",
      aadharNumber: student.aadharNumber || "",
      address: student.address || "",
      className: student.className || "",
      admissionDate: student.admissionDate || "",
      annualFee: Number(student.annualFee || 10000),
      registrationFee: Number(student.registrationFee || 0),
      status: student.status || "Active",
      leftDate: student.leftDate || "",
      documents: {
        birthCertificate: !!student.documents?.birthCertificate,
        aadharXerox: !!student.documents?.aadharXerox
      },
      totalFee: studentTotalFee(student),
      paid,
      pending
    },
    transactions: transactions.map((t) => ({
      id: String(t._id),
      amount: Number(t.amount || 0),
      paymentMode: t.paymentMode || "",
      paymentType: t.paymentType || t.note || "",
      note: t.note || "",
      paymentDate: t.paymentDate || "",
      enteredBy: t.enteredBy || ""
    }))
  });
});

app.post("/api/students", requireAuth, async (req, res) => {
  const {
    firstName,
    lastName,
    dob,
    gender,
    parentName,
    motherName,
    phone,
    altPhone,
    aadharNumber,
    address,
    className,
    admissionDate,
    registrationFee,
    documents
  } = req.body;

  const cleanPhone = String(phone || "").trim();
  const cleanAltPhone = String(altPhone || "").trim();
  const cleanAadhar = String(aadharNumber || "").trim();

  if (!firstName || !parentName || !className || !admissionDate) {
    return res.status(400).json({ message: "Required fields missing" });
  }

  if (cleanPhone && !/^\d{10}$/.test(cleanPhone)) {
    return res.status(400).json({ message: "Primary contact must be exactly 10 digits" });
  }

  if (cleanAltPhone && !/^\d{10}$/.test(cleanAltPhone)) {
    return res.status(400).json({ message: "Alternative contact must be exactly 10 digits" });
  }

  if (cleanAadhar && !/^\d{12}$/.test(cleanAadhar)) {
    return res.status(400).json({ message: "Aadhar number must be exactly 12 digits" });
  }

  const studentCode = await generateStudentCode(className, admissionDate);

  const student = {
    studentCode,
    firstName: firstName || "",
    lastName: lastName || "",
    dob: dob || "",
    gender: gender || "",
    parentName: parentName || "",
    motherName: motherName || "",
    phone: cleanPhone,
    altPhone: cleanAltPhone,
    aadharNumber: cleanAadhar,
    address: address || "",
    className,
    admissionDate,
    annualFee: ANNUAL_FEE,
    registrationFee: Number(registrationFee || DEFAULT_REGISTRATION_FEE),
    status: "Active",
    leftDate: "",
    documents: {
      birthCertificate: !!documents?.birthCertificate,
      aadharXerox: !!documents?.aadharXerox
    },
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const result = await studentsCol.insertOne(student);

  res.json({
    success: true,
    id: String(result.insertedId),
    studentCode
  });
});
app.put("/api/students/:id", requireAuth, async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid ID" });

  const {
    firstName,
    lastName,
    dob,
    gender,
    parentName,
    motherName,
    phone,
    altPhone,
    aadharNumber,
    address,
    className,
    admissionDate,
    registrationFee,
    documents
  } = req.body;

  const cleanPhone = String(phone || "").trim();
  const cleanAltPhone = String(altPhone || "").trim();
  const cleanAadhar = String(aadharNumber || "").trim();

  if (!firstName || !parentName || !className || !admissionDate) {
    return res.status(400).json({ message: "Required fields are missing" });
  }

  if (cleanPhone && !/^\d{10}$/.test(cleanPhone)) {
    return res.status(400).json({ message: "Primary contact must be exactly 10 digits" });
  }

  if (cleanAltPhone && !/^\d{10}$/.test(cleanAltPhone)) {
    return res.status(400).json({ message: "Alternative contact must be exactly 10 digits" });
  }

  if (cleanAadhar && !/^\d{12}$/.test(cleanAadhar)) {
    return res.status(400).json({ message: "Aadhar number must be exactly 12 digits" });
  }

  const result = await studentsCol.updateOne(
    { _id: id },
    {
      $set: {
        firstName: firstName || "",
        lastName: lastName || "",
        dob: dob || "",
        gender: gender || "",
        parentName: parentName || "",
        motherName: motherName || "",
        phone: cleanPhone,
        altPhone: cleanAltPhone,
        aadharNumber: cleanAadhar,
        address: address || "",
        className: className || "",
        admissionDate: admissionDate || "",
        registrationFee: Number(registrationFee || 0),
        documents: {
          birthCertificate: !!documents?.birthCertificate,
          aadharXerox: !!documents?.aadharXerox
        },
        updatedAt: new Date()
      }
    }
  );

  if (result.matchedCount === 0) {
    return res.status(404).json({ message: "Student not found" });
  }

  if (result.modifiedCount === 0) {
    return res.json({ success: true, message: "No changes detected" });
  }

  res.json({ success: true, message: "Student updated successfully" });
});


app.put("/api/students/:id/leave", requireAdmin, async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid ID" });

  await studentsCol.updateOne(
    { _id: id },
    {
      $set: {
        status: "Left",
        leftDate: new Date().toISOString().split("T")[0],
        updatedAt: new Date()
      }
    }
  );

  res.json({ success: true });
});

app.delete("/api/students/:id", requireAdmin, async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid ID" });

  await studentsCol.deleteOne({ _id: id });
  await transactionsCol.deleteMany({ studentId: id });

  res.json({ success: true });
});

app.post("/api/students/:id/payments", requireAdmin, async (req, res) => {
  const id = toObjectId(req.params.id);
  if (!id) return res.status(400).json({ message: "Invalid ID" });

  const student = await studentsCol.findOne({ _id: id });
  if (!student) return res.status(404).json({ message: "Student not found" });

  if (student.status === "Left") {
    return res.status(400).json({ message: "Cannot collect fee for left student" });
  }

  const { amount, paymentMode, paymentType, note, paymentDate } = req.body;
  const numAmount = Number(amount || 0);

  if (numAmount <= 0) {
    return res.status(400).json({ message: "Invalid amount" });
  }

  const paid = await getStudentPaid(id);
  const pending = Math.max(studentTotalFee(student) - paid, 0);

  if (numAmount > pending) {
    return res.status(400).json({ message: "Overpayment not allowed" });
  }

  await transactionsCol.insertOne({
    studentId: id,
    studentCode: student.studentCode,
    studentName: getFullName(student),
    amount: numAmount,
    paymentMode: paymentMode || "Cash",
    paymentType: paymentType || "Tuition Fee",
    note: note || "",
    paymentDate: paymentDate || new Date().toISOString().split("T")[0],
    enteredBy: req.session.user?.name || req.session.user?.username || "Admin",
    createdAt: new Date()
  });

  res.json({ success: true });
});

app.get("/api/transactions", requireAuth, async (req, res) => {
  const txns = await transactionsCol.find({}).sort({ createdAt: -1 }).toArray();

  const studentIds = [
    ...new Set(
      txns
        .map((t) => t.studentId)
        .filter(Boolean)
        .map((id) => String(id))
    )
  ];

  const objectIds = studentIds
    .map((id) => {
      try {
        return new ObjectId(id);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const studentDocs = objectIds.length
    ? await studentsCol.find({ _id: { $in: objectIds } }).toArray()
    : [];

  const studentMap = new Map(studentDocs.map((s) => [String(s._id), s]));

  const rows = txns.map((t) => {
  const student = studentMap.get(String(t.studentId));

  return {
    id: String(t._id),
    studentId: String(t.studentId),
    studentCode: t.studentCode || student?.studentCode || "",
    studentName: t.studentName || getFullName(student || {}),
    className: student?.className || "",
    amount: Number(t.amount || 0),
    paymentMode: t.paymentMode || "",
    note: t.note || "",
    paymentDate: t.paymentDate || "",
    createdAt: t.createdAt || null,
    paymentType: t.paymentType || t.note || "Fee",
    enteredBy: t.enteredBy || "Admin"
  };
});

  res.json(rows);
});

function csvEscape(value) {
  if (value === null || value === undefined) return "";
  const str = String(value).replace(/"/g, '""');
  return `"${str}"`;
}

app.get("/api/export/students.csv", requireAuth, async (req, res) => {
  const students = await studentsCol.find({}).sort({ createdAt: -1 }).toArray();

  let csvHeaders = [
    "Student ID",
    "Student Code",
    "First Name",
    "Last Name",
    "Full Name",
    "Father Name",
    "Mother Name",
    "Primary Contact",
    "Alternative Contact",
    "Aadhar Number",
    "Address",
    "Class",
    "Admission Date",
    "Annual Fee",
    "Registration Fee",
    "Status",
    "Left Date",
    "Birth Certificate Submitted",
    "Aadhar Xerox Submitted",
    "Payment Transaction ID",
    "Payment Date",
    "Payment Mode",
    "Payment Type",
    "Payment Note",
    "Payment Amount",
    "Entered By",
    "Created At"
  ];

  let csv = csvHeaders.map(csvEscape).join(",") + "\n";

  for (const s of students) {
    const txns = await transactionsCol
      .find({ studentId: s._id })
      .sort({ createdAt: -1 })
      .toArray();

    const baseStudentData = [
      String(s._id || ""),
      s.studentCode || "",
      s.firstName || "",
      s.lastName || "",
      getFullName(s),
      s.parentName || "",
      s.motherName || "",
      s.phone || "",
      s.altPhone || "",
      s.aadharNumber || "",
      s.address || "",
      s.className || "",
      s.admissionDate || "",
      Number(s.annualFee || 10000),
      Number(s.registrationFee || 0),
      s.status || "",
      s.leftDate || "",
      s.documents?.birthCertificate ? "Yes" : "No",
      s.documents?.aadharXerox ? "Yes" : "No"
    ];

    if (txns.length === 0) {
      const row = [
        ...baseStudentData,
        "", "", "", "", "", "", s.createdAt || ""
      ];
      csv += row.map(csvEscape).join(",") + "\n";
    } else {
      for (const t of txns) {
        const row = [
          ...baseStudentData,
          String(t._id || ""),
          t.paymentDate || "",
          t.paymentMode || "",
          t.paymentType || "",
          t.note || "",
          Number(t.amount || 0),
          t.enteredBy || "",
          s.createdAt || ""
        ];

        csv += row.map(csvEscape).join(",") + "\n";
      }
    }
  }

  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=students_full_export.csv");
  res.send(csv);
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});