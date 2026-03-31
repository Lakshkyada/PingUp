import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    full_name: { type: String },
    username: { type: String },
    profile_picture: { type: String },
  },
  { timestamps: true, minimize: false }
);

const User = mongoose.models.User || mongoose.model("User", userSchema);

export default User;
