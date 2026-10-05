module.exports = {
  apps: [{
    name: 'support-inbox',
    script: './dist/server/index.js',
    node_args: ['--max-old-space-size=512'],
    max_memory_restart: '1G',
    autorestart: true,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
