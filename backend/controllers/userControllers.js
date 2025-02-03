const asyncHandler = require("express-async-handler");
const { UserSQL } = require("../models/userModel");
const generateToken = require("../config/generateToken");

//@description     Get or Search all users
//@route           GET /api/user?search=
//@access          Public
const allUsers = asyncHandler(async (req, res) => {
  const keyword = req.query.search || "";
  const users = await UserSQL.searchUsers(keyword, req.user.id);
  res.send(users);
});

//@description     Register new user
//@route           POST /api/user/
//@access          Public
const registerUser = asyncHandler(async (req, res) => {
  const { name, email, password, pic } = req.body;

  if (!name || !email || !password) {
    res.status(400);
    throw new Error("Please Enter all the Fields");
  }

  try {
    const existingUser = await UserSQL.findByEmail(email);
    if (existingUser) {
      res.status(400);
      throw new Error("User already exists");
    }

    const userId = await UserSQL.create({
      name,
      email,
      password,
      pic,
    });

    const user = await UserSQL.findById(userId);

    res.status(201).json({
      id: user.id,
      uuid: user.uuid,
      name: user.name,
      email: user.email,
      pic: user.pic,
      token: generateToken(user.id),
    });
  } catch (error) {
    res.status(400);
    throw new Error(error.message);
  }
});

//@description     Auth the user
//@route           POST /api/users/login
//@access          Public
const authUser = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await UserSQL.findByEmail(email);
    if (!user) {
      res.status(401);
      throw new Error("Invalid Email or Password");
    }

    const isMatch = await UserSQL.verifyPassword(user.password_hash, password);
    if (!isMatch) {
      res.status(401);
      throw new Error("Invalid Email or Password");
    }

    res.json({
      id: user.id,
      uuid: user.uuid,
      name: user.name,
      email: user.email,
      pic: user.pic,
      token: generateToken(user.id),
    });
  } catch (error) {
    res.status(500);
    throw new Error(error.message);
  }
});

const deleteAllUsers = asyncHandler(async (req, res) => {
 
  await User.deleteMany({});
  res.status(200).json({ message: 'All users have been deleted successfully.' });
});


module.exports = { allUsers, registerUser, authUser, deleteAllUsers };
