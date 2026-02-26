/**
 * PM2 ecosystem file for production.
 * Used by CI/CD to start/restart the backend on EC2.
 */
module.exports = {
  apps: [
    {
      name: "kr-updates-backend",
      cwd: __dirname,
      script: "src/app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
