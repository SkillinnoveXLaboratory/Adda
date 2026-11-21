// pm2 process file for the VPS:  pm2 start ecosystem.config.cjs && pm2 save
// Secrets come from Backend/.env (see production.env.example); PORT here must match the vhost proxy (3015).
module.exports = {
  apps: [
    {
      name: 'addaapp-api',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', PORT: 3015 },
      max_memory_restart: '512M',
      kill_timeout: 16000,
      time: true,
    },
  ],
};
