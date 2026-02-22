const mongoose = require('mongoose');
const dotenv = require('dotenv');
const Post = require('./src/models/Post');

dotenv.config();

const locations = [
    'Kishangarh Renwal',
    'Jaipur',
    'Rajasthan',
    'New Delhi',
    'Mumbai',
    'Ahmedabad',
    'Udaipur',
    'Jodhpur',
    'Sikar',
    'Renwal News'
];

const updateLocations = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        const posts = await Post.find({});
        console.log(`Found ${posts.length} posts to update`);

        for (let i = 0; i < posts.length; i++) {
            const randomLocation = locations[Math.floor(Math.random() * locations.length)];
            posts[i].location = randomLocation;
            await posts[i].save({ validateBeforeSave: false });
            console.log(`Updated post ${i + 1}/${posts.length}: ${posts[i].title} -> ${randomLocation}`);
        }

        console.log('Successfully updated all posts with locations');
        process.exit(0);
    } catch (error) {
        console.error('Error updating locations:', error);
        process.exit(1);
    }
};

updateLocations();
