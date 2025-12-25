const asyncHandler = require("express-async-handler");
const { prisma } = require("../config/db");
const generateToken = require("../config/generateToken");
const bcrypt = require("bcryptjs");

//@description     Get or Search all users
//@route           GET /api/user?search=
//@access          Public
const allUsers = asyncHandler(async (req, res) => {
  const keyword = req.query.search;
  
  const whereClause = keyword
    ? {
        AND: [
          { id: { not: req.user.id } },
          {
            OR: [
              { name: { contains: keyword, mode: 'insensitive' } },
              { email: { contains: keyword, mode: 'insensitive' } },
            ],
          },
        ],
      }
    : { id: { not: req.user.id } };

  const users = await prisma.user.findMany({
    where: whereClause,
    select: {
      id: true,
      name: true,
      email: true,
      pic: true,
      isAdmin: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  
  res.send(users);
});

//@description     Register new user
//@route           POST /api/user/
//@access          Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, pic } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Please Enter all the Feilds");
  }

  const userExists = await prisma.user.findUnique({
    where: { email },
  });

  if (userExists) {
    res.status(400);
    throw new Error("User already exists");
  }

  // Hash password
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      pic: pic || undefined,
    },
    select: {
      id: true,
      name: true,
      email: true,
      isAdmin: true,
      pic: true,
    },
  });

  if (user) {
    res.status(201).json({
      _id: user.id,
      name: user.name,
      email: user.email,
      isAdmin: user.isAdmin,
      pic: user.pic,
      token: generateToken(user.id),
    });
  } else {
    res.status(400);
    throw new Error("User not found");
  }
});

//@description     Auth the user
//@route           POST /api/users/login
//@access          Public
const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return res.status(401).json({ message: "User not found" });
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    return res.status(401).json({ message: "Invalid password" });
  }

  const token = generateToken(user.id);
  res.json({
    _id: user.id,
    name: user.name,
    email: user.email,
    isAdmin: user.isAdmin,
    pic: user.pic,
    token: token,
  });
});

const deleteAllUsers = asyncHandler(async (req, res) => {
  await prisma.user.deleteMany({});
  res.status(200).json({ message: 'All users have been deleted successfully.' });
});

module.exports = { allUsers, registerUser, authUser, deleteAllUsers };
