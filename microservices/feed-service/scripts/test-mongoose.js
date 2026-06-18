import mongoose from 'mongoose';

const MONGO_URI = 'mongodb+srv://lakshkyada22:Laksh%401234@cluster0.wch7jc3.mongodb.net/pingup-feed';

const userSchema = new mongoose.Schema({
  _id: { type: mongoose.Schema.Types.ObjectId, auto: true },
  full_name: { type: String, default: '' },
}, { timestamps: true });

const User = mongoose.model('TestUser', userSchema);

async function run() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    for (let i = 0; i < 5; i++) {
      const testId = new mongoose.Types.ObjectId();
      console.log(`\n--- Iteration ${i+1} ---`);
      console.log('Original test ID object:', testId);

      const result = await User.findByIdAndUpdate(
        testId,
        { $setOnInsert: { _id: testId, full_name: 'Test Upsert User' } },
        { upsert: true, new: true }
      );

      console.log('Upserted result _id:', result._id.toString());
      console.log('Did the _id match?', result._id.toString() === testId.toString());

      // Clean up
      await User.findByIdAndDelete(result._id);
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
  }
}

run();
