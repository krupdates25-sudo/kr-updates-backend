const mongoose = require("mongoose");
require("dotenv").config();

const BreakingNews = require("./src/models/BreakingNews");
const User = require("./src/models/User");

const pickDbUri = () =>
  process.env.MONGODB_URI ||
  process.env.DATABASE_URL ||
  process.env.MONGODB_URI_PRODUCTION ||
  "mongodb://localhost:27017/news_feed";

const hoursFromNow = (h) => new Date(Date.now() + h * 60 * 60 * 1000);

const samples = (adminId) => [
  {
    title: "Breaking: New exam schedule announced for upcoming sessions",
    excerpt:
      "Education board releases fresh exam schedule. Students are advised to check dates and download the official PDF.",
    content: `
      <p><strong>Update:</strong> The board has published the updated exam schedule for the upcoming sessions.</p>
      <p><strong>What to do:</strong> Verify your class/stream dates, note the reporting time, and keep admit cards ready.</p>
      <p><strong>Tip:</strong> Bookmark the official page and avoid unofficial PDFs.</p>
    `,
    image: {
      url: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?w=1600&auto=format&fit=crop&q=80",
      alt: "Students checking updates",
      caption: "Exam schedule update",
    },
    category: "General",
    tags: ["education", "exam", "schedule"],
    priority: 9,
    isActive: true,
    expiresAt: hoursFromNow(48),
    createdBy: adminId,
  },
  {
    title: "Breaking: Weather alert issued for multiple districts",
    excerpt:
      "Authorities issue a weather alert. Residents should follow official advisories and avoid unnecessary travel.",
    content: `
      <p><strong>Alert:</strong> A weather warning has been issued for multiple districts due to predicted heavy rainfall.</p>
      <p><strong>Advisory:</strong> Stay indoors during peak hours, secure loose items, and keep emergency contacts handy.</p>
    `,
    image: {
      url: "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?w=1600&auto=format&fit=crop&q=80",
      alt: "Rain and storm clouds",
      caption: "Weather alert",
    },
    category: "World",
    tags: ["weather", "alert", "safety"],
    priority: 8,
    isActive: true,
    expiresAt: hoursFromNow(24),
    createdBy: adminId,
  },
  {
    title: "Breaking: Major sports final confirmed this weekend",
    excerpt:
      "The final matchup is set. Ticketing and broadcast details are expected to be released soon.",
    content: `
      <p><strong>Sports:</strong> The tournament final is confirmed for this weekend.</p>
      <p><strong>Details:</strong> Teams, venue and timings will be updated as per official release.</p>
    `,
    image: {
      url: "https://images.unsplash.com/photo-1521412644187-c49fa049e84d?w=1600&auto=format&fit=crop&q=80",
      alt: "Stadium under lights",
      caption: "Final this weekend",
    },
    category: "Sports",
    tags: ["sports", "final", "tickets"],
    priority: 7,
    isActive: true,
    expiresAt: hoursFromNow(36),
    createdBy: adminId,
  },
  {
    title: "Breaking: Health advisory issued as cases rise in several areas",
    excerpt:
      "Officials advise precautions and symptom monitoring. People with vulnerabilities should be extra careful.",
    content: `
      <p><strong>Health:</strong> A health advisory has been issued as cases rise in several areas.</p>
      <p><strong>Precautions:</strong> Maintain hygiene, avoid crowded spaces, and consult a doctor if symptoms appear.</p>
    `,
    image: {
      url: "https://images.unsplash.com/photo-1584036561566-baf8f5f1b144?w=1600&auto=format&fit=crop&q=80",
      alt: "Medical gloves and mask",
      caption: "Health advisory",
    },
    category: "Health",
    tags: ["health", "advisory", "updates"],
    priority: 7,
    isActive: true,
    expiresAt: hoursFromNow(72),
    createdBy: adminId,
  },
  {
    title: "Breaking: New policy update announced for public services",
    excerpt:
      "A new policy update impacts multiple services. Citizens should read the official circular for details.",
    content: `
      <p><strong>Policy:</strong> A new update has been announced affecting public services.</p>
      <p><strong>Next:</strong> Check official circulars for eligibility, timelines, and required documents.</p>
    `,
    image: {
      url: "https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=1600&auto=format&fit=crop&q=80",
      alt: "Documents and pen",
      caption: "Policy update",
    },
    category: "Politics",
    tags: ["policy", "government", "services"],
    priority: 6,
    isActive: true,
    expiresAt: hoursFromNow(48),
    createdBy: adminId,
  },
  {
    title: "Breaking: Technology giant announces major product launch date",
    excerpt:
      "A major product launch is teased. Expect new features and updated pricing details soon.",
    content: `
      <p><strong>Tech:</strong> A major product launch date has been announced.</p>
      <p><strong>What’s next:</strong> Pre-order, pricing, and availability details will follow.</p>
    `,
    image: {
      url: "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1600&auto=format&fit=crop&q=80",
      alt: "Circuit board",
      caption: "Tech launch",
    },
    category: "Technology",
    tags: ["technology", "launch", "update"],
    priority: 6,
    isActive: true,
    expiresAt: hoursFromNow(72),
    createdBy: adminId,
  },
  {
    title: "Breaking: Market sees sharp movement after latest announcement",
    excerpt:
      "Markets react strongly after the latest announcement. Traders watch key levels closely.",
    content: `
      <p><strong>Business:</strong> Markets saw sharp movement after the latest announcement.</p>
      <p><strong>Reminder:</strong> Volatility may remain high; follow reliable sources for updates.</p>
    `,
    image: {
      url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1600&auto=format&fit=crop&q=80",
      alt: "Market charts on screens",
      caption: "Market update",
    },
    category: "Business",
    tags: ["market", "business", "stocks"],
    priority: 5,
    isActive: true,
    expiresAt: hoursFromNow(24),
    createdBy: adminId,
  },
  {
    title: "Breaking: Scientists report new findings in ongoing research",
    excerpt:
      "Researchers share new findings. More peer-reviewed details are expected soon.",
    content: `
      <p><strong>Science:</strong> New findings have been shared by researchers in an ongoing study.</p>
      <p><strong>Next:</strong> Further details will follow after peer review.</p>
    `,
    image: {
      url: "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=1600&auto=format&fit=crop&q=80",
      alt: "Lab research",
      caption: "Research update",
    },
    category: "Science",
    tags: ["science", "research", "update"],
    priority: 5,
    isActive: true,
    expiresAt: hoursFromNow(96),
    createdBy: adminId,
  },
  {
    title: "Breaking: Entertainment event lineup revealed",
    excerpt:
      "Organizers reveal the event lineup. Tickets and timings are now live on the official website.",
    content: `
      <p><strong>Entertainment:</strong> The event lineup has been revealed.</p>
      <p><strong>Tickets:</strong> Check the official site for bookings and schedule.</p>
    `,
    image: {
      url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1600&auto=format&fit=crop&q=80",
      alt: "Concert crowd",
      caption: "Event lineup",
    },
    category: "Entertainment",
    tags: ["entertainment", "event", "tickets"],
    priority: 4,
    isActive: true,
    expiresAt: hoursFromNow(48),
    createdBy: adminId,
  },
  {
    title: "Breaking: Important update for students—admission portal timing changed",
    excerpt:
      "The admission portal timing has changed. Students should complete pending steps before the new cut-off.",
    content: `
      <p><strong>Education:</strong> Admission portal timing has changed.</p>
      <p><strong>Action:</strong> Complete form submission, document upload, and fee payment before the new cut-off.</p>
    `,
    image: {
      url: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=1600&auto=format&fit=crop&q=80",
      alt: "Students working together",
      caption: "Admission portal update",
    },
    category: "General",
    tags: ["education", "admission", "portal"],
    priority: 8,
    isActive: true,
    expiresAt: hoursFromNow(36),
    createdBy: adminId,
  },
];

async function main() {
  const dbUri = pickDbUri();
  await mongoose.connect(dbUri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log("🔗 Connected to MongoDB");

  const adminUser =
    (await User.findOne({ role: "admin" })) ||
    (await User.findOne({ role: "moderator" })) ||
    (await User.findOne({}));

  if (!adminUser) {
    console.error("❌ No users found. Please create an admin user first.");
    process.exit(1);
  }

  console.log(`👤 Using creator: ${adminUser.firstName || ""} ${adminUser.lastName || ""} (${adminUser.role || "user"})`);

  const clean = String(process.env.SEED_CLEAN || "").toLowerCase() === "true";
  if (clean) {
    const del = await BreakingNews.deleteMany({});
    console.log(`🧹 Cleared breaking news: ${del.deletedCount}`);
  }

  const docs = samples(adminUser._id).map((s) => ({
    ...s,
    // ensure unique titles if script is run multiple times
    title: `${s.title} (${new Date().toISOString().slice(0, 16).replace("T", " ")})`,
  }));

  const res = await BreakingNews.insertMany(docs);
  console.log(`✅ Inserted breaking news: ${res.length}`);

  await mongoose.disconnect();
  console.log("✅ Done");
}

main().catch((e) => {
  console.error("❌ Seed failed:", e);
  process.exit(1);
});













