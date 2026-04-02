import mongoose from 'mongoose';

const userRelationshipSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
      ref: 'User'
    },
    followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
    following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }],
    connections: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User', default: [] }]
  },
  { timestamps: true, minimize: false }
);

const UserRelationship = mongoose.models.UserRelationship || mongoose.model('UserRelationship', userRelationshipSchema);

export default UserRelationship;