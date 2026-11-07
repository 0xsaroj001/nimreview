import mongoose from 'mongoose';

const venueSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    type: { type: String, enum: ['restaurant', 'cafe', 'hotel'], required: true },
    cuisine: { type: String, trim: true, maxlength: 60, default: '' },
    price: { type: Number, min: 1, max: 3, default: 2 },
    address: { type: String, trim: true, maxlength: 140, required: true },
    lat: { type: Number, min: -90, max: 90, required: true },
    lng: { type: Number, min: -180, max: 180, required: true },
    hours: { type: String, trim: true, maxlength: 40, default: '' },
    img: { type: String, trim: true, maxlength: 500, default: '' },
    menu: { type: [String], default: [] },
    nimAddress: { type: String, required: true },
    // NIM the venue commits per rewarded review (scaled by the genuineness score, never by the stars)
    rewardPerReview: { type: Number, min: 0, max: 1000, default: 10 },
  },
  { timestamps: true },
);

export const Venue = mongoose.models.Venue || mongoose.model('Venue', venueSchema);
