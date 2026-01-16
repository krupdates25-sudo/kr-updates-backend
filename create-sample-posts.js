const mongoose = require("mongoose");
require("dotenv").config();

const Post = require("./src/models/Post");
const User = require("./src/models/User");
const SiteSettings = require("./src/models/SiteSettings");

const pickDbUri = () =>
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  process.env.MONGODB_URI_PRODUCTION ||
  "mongodb://localhost:27017/news_feed";

const nowMinusMinutes = (m) => new Date(Date.now() - m * 60 * 1000);

const samplePosts = (authorId) => [
  // Education (latest / hot)
  {
    title: "RBSE 10th Result 2026: release time, official website, and steps to check",
    category: "education",
    tags: ["education", "rbse", "result", "students"],
    featuredImage: {
      url: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&auto=format&fit=crop&q=80",
      alt: "Students checking results",
      caption: "Result updates",
    },
    status: "published",
    publishedAt: nowMinusMinutes(25),
    excerpt:
      "RBSE 10th Result 2026 is expected soon. Here’s how to check your marks, what to keep ready, and what to do if the website is slow.",
    content: `
      <p><strong>RBSE 10th Result 2026</strong> is expected to be announced shortly. Students should keep their roll number and basic details ready.</p>
      <p><strong>How to check:</strong> Visit the official website, open the results section, enter your roll number, and download the mark sheet.</p>
      <p><strong>Tip:</strong> If the site is slow, refresh after a minute or try an alternate official mirror.</p>
    `,
    author: authorId,
    reporterName: "KRUPDATES Desk",
    isTrending: true,
  },
  {
    title: "CUET 2026 registrations: date window, documents needed, and common mistakes to avoid",
    category: "education",
    tags: ["education", "cuet", "exam", "admission"],
    featuredImage: {
      url: "https://images.unsplash.com/photo-1554774853-b414d2a2f5d3?w=1600&auto=format&fit=crop&q=80",
      alt: "Exam preparation desk",
      caption: "CUET registrations",
    },
    status: "published",
    publishedAt: nowMinusMinutes(55),
    excerpt:
      "CUET 2026 registration is opening this week. Here’s a quick checklist of documents and the most common form errors students make.",
    content: `
      <p><strong>CUET 2026 registration</strong> is opening this week. Candidates should prepare scanned documents (photo, signature) and verify details carefully.</p>
      <p><strong>Common mistakes:</strong> wrong subject selection, mismatched ID details, and poor-quality uploads.</p>
      <p><strong>Pro tip:</strong> Use a stable internet connection and save a PDF copy of the final submission.</p>
    `,
    author: authorId,
    reporterName: "Education Desk",
    isFeatured: true,
  },
  {
    title: "JEE Main 2026: new syllabus notes, expected difficulty, and smart revision plan",
    category: "education",
    tags: ["education", "jee", "engineering", "students"],
    featuredImage: {
      url: "https://images.unsplash.com/photo-1513258496099-48168024aec0?w=1600&auto=format&fit=crop&q=80",
      alt: "Students studying",
      caption: "JEE Main updates",
    },
    status: "published",
    publishedAt: nowMinusMinutes(120),
    excerpt:
      "JEE Main 2026 preparation strategy: what changed, what matters most, and a simple 14-day revision plan that actually works.",
    content: `
      <p>With JEE Main 2026 around the corner, focus on high-weightage chapters and daily mixed practice.</p>
      <p><strong>Revision plan:</strong> two topics/day + one full mock every 3 days + error log review.</p>
      <p>Consistency beats intensity. Track your weak areas and iterate.</p>
    `,
    author: authorId,
    reporterName: "KRUPDATES Desk",
  },
  {
    title: "Scholarship alert: state merit scholarships—eligibility, deadlines, and how to apply",
    category: "education",
    tags: ["education", "scholarship", "students"],
    featuredImage: {
      url: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1600&auto=format&fit=crop&q=80",
      alt: "Scholarship and forms",
      caption: "Scholarship updates",
    },
    status: "published",
    publishedAt: nowMinusMinutes(180),
    excerpt:
      "Merit scholarships can reduce a big portion of your education costs. Check eligibility and apply before the deadline with these steps.",
    content: `
      <p><strong>Merit scholarships</strong> are open for eligible students. Ensure you match the income and marks criteria.</p>
      <p><strong>Documents:</strong> mark sheet, ID proof, bank details, and income certificate (if required).</p>
      <p>Apply early to avoid last-minute portal issues.</p>
    `,
    author: authorId,
    reporterName: "Education Desk",
  },

  // Other sample "blogs/news" to make homepage look rich
  {
    title: "City cleanup drive: volunteers join hands to restore key areas in record time",
    category: "general",
    tags: ["city", "community", "updates"],
    featuredImage: {
      url: "https://images.unsplash.com/photo-1520975958225-67a88d59b3f1?w=1600&auto=format&fit=crop&q=80",
      alt: "Community cleanup drive",
      caption: "Community efforts",
    },
    status: "published",
    publishedAt: nowMinusMinutes(35),
    excerpt:
      "A large volunteer group participated in a cleanup drive today. Here are the key highlights, before/after updates, and what’s next.",
    content: `
      <p>Volunteers across multiple areas participated in a coordinated city cleanup drive.</p>
      <p>Organizers said the goal is to make cleanliness a weekly community habit.</p>
      <p>Next drive is planned for the coming weekend.</p>
    `,
    author: authorId,
    reporterName: "Local Desk",
  },
  {
    title: "Weather update: light rain expected in multiple districts—advisory issued",
    category: "general",
    tags: ["weather", "alert", "rain"],
    featuredImage: {
      url: "https://images.unsplash.com/photo-1527766833261-b09c3163a791?w=1600&auto=format&fit=crop&q=80",
      alt: "Rainy weather",
      caption: "Weather advisory",
    },
    status: "published",
    publishedAt: nowMinusMinutes(90),
    excerpt:
      "Light rain is expected today in multiple districts. Authorities issued an advisory for commuters and farmers—here’s what to know.",
    content: `
      <p>Weather department indicated chances of light rain in several districts.</p>
      <p>Commuters are advised to keep extra travel time and avoid waterlogged routes.</p>
      <p>Farmers should plan irrigation accordingly.</p>
    `,
    author: authorId,
    reporterName: "Weather Desk",
  },
  {
    title: "Tech roundup: 5 practical phone features you should enable right now",
    category: "technology",
    tags: ["tech", "mobile", "tips"],
    featuredImage: {
      url: "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?w=1600&auto=format&fit=crop&q=80",
      alt: "Mobile phone tips",
      caption: "Tech tips",
    },
    status: "published",
    publishedAt: nowMinusMinutes(210),
    excerpt:
      "From security to battery life, these five features make your phone faster and safer. Here’s where to find them on most devices.",
    content: `
      <p>Enable app permissions review, auto-backup, two-factor authentication, battery optimization, and emergency SOS.</p>
      <p>These features improve security and day-to-day usability with minimal effort.</p>
      <p>Check your settings today.</p>
    `,
    author: authorId,
    reporterName: "Tech Desk",
  },
  {
    title: "Health check: simple winter routine to boost immunity without expensive supplements",
    category: "health",
    tags: ["health", "wellness", "tips"],
    featuredImage: {
      url: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?w=1600&auto=format&fit=crop&q=80",
      alt: "Healthy routine",
      caption: "Wellness",
    },
    status: "published",
    publishedAt: nowMinusMinutes(260),
    excerpt:
      "A simple, affordable winter routine: hydration, sunlight, balanced food, and basic movement—here’s a quick checklist for daily use.",
    content: `
      <p>Immunity is built with consistency: hydration, balanced meals, good sleep, and daily movement.</p>
      <p>Focus on whole foods and get sunlight whenever possible.</p>
      <p>Keep it simple, keep it daily.</p>
    `,
    author: authorId,
    reporterName: "Health Desk",
  },
];

const run = async () => {
  const dbUri = pickDbUri();
  console.log("🔗 Connecting to MongoDB:", dbUri.replace(/\/\/.*@/, "//***@"));

  await mongoose.connect(dbUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
  });
  console.log("✅ Connected to MongoDB");

  // Find a staff user to be the author
  let authorUser =
    (await User.findOne({ role: "admin" })) ||
    (await User.findOne({ role: "moderator" })) ||
    (await User.findOne({ role: "author" })) ||
    (await User.findOne({}));

  if (!authorUser) {
    console.log("👤 No users found. Creating a seed admin user...");
    authorUser = await User.create({
      username: "seedadmin",
      email: "seedadmin@example.com",
      password: "Admin@12345",
      firstName: "Seed",
      lastName: "Admin",
      role: "admin",
      isActive: true,
      isEmailVerified: true,
    });
  }

  console.log(
    `👤 Using author: ${authorUser.firstName} ${authorUser.lastName} (${authorUser.role})`
  );

  // Ensure social links exist (used by Dashboard "Follow" section)
  const settings = await SiteSettings.getSettings();
  settings.socialLinks = settings.socialLinks || {};
  if (!settings.socialLinks.youtube) {
    settings.socialLinks.youtube = "https://www.youtube.com/@krupdates";
  }
  if (!settings.socialLinks.facebook) {
    settings.socialLinks.facebook = "https://www.facebook.com/krupdates";
  }
  await settings.save();
  console.log("🔗 Ensured SiteSettings social links (youtube/facebook)");

  const docs = samplePosts(authorUser._id);

  // Insert without deleting existing posts; keep it additive.
  const inserted = [];
  for (const d of docs) {
    const exists = await Post.findOne({ title: d.title });
    if (exists) continue;
    inserted.push(await Post.create(d));
  }

  console.log(`✅ Seeded ${inserted.length} posts (skipped duplicates by title).`);
  inserted.forEach((p, i) => {
    console.log(`  ${i + 1}. [${p.category}] ${p.title}`);
  });
};

run()
  .catch((err) => {
    console.error("❌ Error seeding posts:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch (e) {
      // ignore
    }
    console.log("📴 Disconnected from MongoDB");
  });












