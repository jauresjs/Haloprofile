module.exports = {
  apps: [{
    name: 'haloprofile',
    script: 'server/index.js',
    cwd: '/home/tunel/Haloprofile',
    env: {
      PORT: 4000,
      NODE_ENV: 'production'
    },
    // Restart if memory exceeds 500MB
    max_memory_restart: '500M',
    // Log files
    error_file: '/home/tunel/Haloprofile/logs/err.log',
    out_file: '/home/tunel/Haloprofile/logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    // Restart on crash
    autorestart: true,
    // Watch for file changes (off for production)
    watch: false,
  }]
};
