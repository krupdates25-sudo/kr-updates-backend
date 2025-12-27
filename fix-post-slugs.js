/**
 * Migration script to fix malformed post slugs
 * Fixes slugs that start with "--" or are invalid by replacing them with post _id
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Post = require('./src/models/Post');
const config = require('./src/config');

async function fixPostSlugs() {
  try {
    // Connect to database
    const dbUrl = config.MONGODB_URI_PRODUCTION || config.MONGODB_URI || process.env.MONGODB_URI || process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ MongoDB URI not found in config or environment variables');
      process.exit(1);
    }

    await mongoose.connect(dbUrl);
    console.log('✅ Connected to MongoDB');

    // Find all posts with malformed slugs
    const malformedSlugPattern = /^-+$/; // Matches slugs that are only dashes
    const posts = await Post.find({
      $or: [
        { slug: { $regex: /^--/ } }, // Slugs starting with --
        { slug: { $regex: malformedSlugPattern } }, // Slugs that are only dashes
        { slug: { $exists: false } }, // Posts without slugs
        { slug: '' }, // Empty slugs
      ],
    });

    console.log(`\n📊 Found ${posts.length} posts with malformed slugs`);

    if (posts.length === 0) {
      console.log('✅ No posts need fixing!');
      await mongoose.disconnect();
      process.exit(0);
    }

    let fixedCount = 0;
    let errorCount = 0;

    // Fix each post
    for (const post of posts) {
      try {
        const oldSlug = post.slug || '(empty)';
        const newSlug = post._id.toString();

        // Update the slug
        await Post.updateOne(
          { _id: post._id },
          { $set: { slug: newSlug } },
          { runValidators: false }
        );

        console.log(`✅ Fixed: ${post.title.substring(0, 50)}...`);
        console.log(`   Old slug: ${oldSlug}`);
        console.log(`   New slug: ${newSlug}\n`);

        fixedCount++;
      } catch (error) {
        console.error(`❌ Error fixing post ${post._id}:`, error.message);
        errorCount++;
      }
    }

    console.log('\n📈 Summary:');
    console.log(`   ✅ Fixed: ${fixedCount} posts`);
    console.log(`   ❌ Errors: ${errorCount} posts`);

    await mongoose.disconnect();
    console.log('\n✅ Migration completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

// Run the migration
fixPostSlugs();

