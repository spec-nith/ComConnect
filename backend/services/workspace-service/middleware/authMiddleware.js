const jwt = require("jsonwebtoken");
const { prisma } = require("../config/db");
const asyncHandler = require("express-async-handler");

const protect = asyncHandler(async (req, res, next) => {
  let token;

  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith("Bearer")
  ) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          name: true,
          email: true,
          pic: true,
          isAdmin: true,
          fcmToken: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      if (!user) {
        res.status(401);
        throw new Error("User not found");
      }

      req.user = user;
      // For compatibility with existing code that uses _id
      req.user._id = user.id;

      next();
    } catch (error) {
      res.status(401);
      throw new Error("Not authorized, token failed");
    }
  }

  if (!token) {
    res.status(401);
    throw new Error("Not authorized, no token");
  }
});

module.exports = { protect };
